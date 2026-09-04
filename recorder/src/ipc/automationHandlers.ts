import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ipcMain } from 'electron';
import { projectPaths } from '../../../core/workspace';
import { GenerationRequest, GeneratedPreview, FwkMobileGenerator } from '../../../core/generation';
import { withGeneratedResponseMetadata } from '../../../core/generation';
import { frameworkLocator } from '../../../core/indexing';
import {
    GeneratedFileRegistry,
    AutomationRecordingStore,
    AutomationPackageBuilder,
    PackagedAutomationScenario,
    AutomationAgentLauncher,
    AutomationMemory,
    AutomationPatchWriter,
    featureAdditions,
    locatorAdditions,
    screenAdditions,
    stepsAdditions,
    AutomationAgentResponse,
    AutomationScenario,
    DEFAULT_AGENT_EXECUTION_MODE,
    GenerationPlan,
    AgentExecutionMode,
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    GapResolution,
    parseGapResolutions,
    AgentRunStore,
    AgentOrchestrator,
    LayeredGenerationOrchestrator,
    resolveAgentExecutionMode,
    normalizeAgentResponseEnglishIdentifiers,
    enforceAgentResponsePlatformTags,
    AutomationApplicationReceipt,
    createAutomationApplicationReceipt,
    planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles,
    restoreUpdateBaselinesForCorrection,
    rollbackCorrectionBaselines,
    QaObservationsArtifact,
    analyzeScenarioUiTextQuality,
    QaRoastGenerationService,
    TestDesignReview,
    normalizeAgentModel,
    CopilotModelEvents,
} from '../../../core/automation';
import { RecordingCoverageAnalyzer } from '../../../core/coverage';
import { AutomationResponseValidator } from '../../../core/validation';
import { DeterministicGenerator } from '../../../core/generation';
import {
    normalizeJsonUnicode,
    readJsonUtf8,
    writeJsonUtf8,
} from '../../../core/shared';
import { RecorderRuntimeState } from './runtimeState';

type ProductStage =
    | 'ANALYZING'
    | 'RESOLVING_CONTEXT'
    | 'RESOLVING_DECISIONS'
    | 'WAITING_FOR_QA'
    | 'GENERATING'
    | 'VALIDATING'
    | 'READY_FOR_REVIEW'
    | 'APPLYING'
    | 'COMPLETED'
    | 'FAILED';

interface QaDecisionOption {
    optionId: string;
    title: string;
    reason: string;
    decision: 'reuse' | 'create';
    symbol?: string;
    candidate?: { file: string; module: string; name: string };
}

interface QaDecisionPrompt {
    gapId: string;
    title: string;
    description: string;
    requiredOutput: string;
    options: QaDecisionOption[];
}

const DIRECT_AGENT_RESPONSE_EDIT_ERROR =
    'Copilot modificó agent-response.json directamente, pero en modo determinista ese archivo '
    + 'lo genera el recorder. Corrige únicamente gap-resolutions.json; para conservar una clave '
    + 'existente cambiando su selector usa decision "replace-existing", selectedCandidate y '
    + 'replacement { platform, sequence }. Luego vuelve a reimportar para regenerar la propuesta.';

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function qaDecisionPromptsFromPlan(plan: GenerationPlan, packageDirectory: string): QaDecisionPrompt[] {
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const unresolved = fs.existsSync(unresolvedFile)
        ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf-8')) as { gaps?: Array<any> }
        : { gaps: [] };
    const gaps = (unresolved.gaps || []).filter(gap =>
        gap && typeof gap.id === 'string' && (gap.blocking || gap.status === 'blocked-qa' || gap.type === 'qa-decision')
    );
    return gaps.map(gap => {
        const resolution = plan.resolutions.find(entry => entry.gapId === gap.id);
        const candidates = (resolution?.reuseCandidates || []).map((candidate: any) => ({
            optionId: `reuse:${candidate.module}.${candidate.name}`,
            title: `Reutilizar ${candidate.module}.${candidate.name}`,
            reason: `Componente existente en ${candidate.file}`,
            decision: 'reuse' as const,
            symbol: `${candidate.module}.${candidate.name}`,
            candidate: {
                file: candidate.file,
                module: candidate.module,
                name: candidate.name,
            },
        }));
        return {
            gapId: gap.id,
            title: gap.intent || gap.description || 'Decisión pendiente',
            description: gap.description || 'Se requiere confirmación para continuar.',
            requiredOutput: gap.requiredOutput || '',
            options: [
                ...candidates,
                {
                    optionId: 'create:new',
                    title: 'Crear componente nuevo',
                    reason: 'No reutilizar un candidato existente para este caso.',
                    decision: 'create',
                },
            ],
        } satisfies QaDecisionPrompt;
    });
}

function mergedResolutionsWithQa(
    plan: GenerationPlan,
    qaResolutions: GapResolution[],
    packageDirectory: string,
): GapResolution[] {
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const unresolved = fs.existsSync(unresolvedFile)
        ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf-8')) as { gaps?: Array<any> }
        : { gaps: [] };
    const byGap = new Map<string, GapResolution>(qaResolutions.map(item => [item.gapId, item]));
    const fromDeterministic = plan.resolutions
        .filter(item => item.gapId && item.resolution !== 'unresolved')
        .map(item => ({
            gapId: item.gapId!,
            decision: item.resolution === 'builtin' ? 'resolved' : item.resolution,
            reason: item.reason,
        } as GapResolution));
    for (const item of fromDeterministic) {
        if (!byGap.has(item.gapId)) byGap.set(item.gapId, item);
    }
    for (const gapId of plan.unresolvedGapIds || []) {
        if (byGap.has(gapId)) continue;
        const gap = (unresolved.gaps || []).find((entry: any) => entry?.id === gapId);
        byGap.set(gapId, {
            gapId,
            decision: 'unresolved',
            reason: gap?.requiredOutput || 'Gap abierto sin resolución explícita.',
        });
    }
    return [...byGap.values()];
}

/**
 * Dependencias del pipeline de automatización: preparar el paquete, resolver
 * decisiones de QA, lanzar/importar la respuesta del agente, validar,
 * aplicar sobre el framework y promocionar memoria. Es la familia más grande
 * porque el flujo completo del wizard (Evidencia → Análisis → Generación →
 * Revisión) es un solo caso de uso con muchos pasos, no varios handlers
 * independientes.
 */
export interface AutomationHandlersContext {
    state: RecorderRuntimeState;
    automationRecordingStore: AutomationRecordingStore;
    recordingCoverageAnalyzer: RecordingCoverageAnalyzer;
    automationPackageBuilder: AutomationPackageBuilder;
    automationAgentLauncher: AutomationAgentLauncher;
    agentOrchestrator: AgentOrchestrator;
    layeredGenerationOrchestrator: LayeredGenerationOrchestrator;
    qaRoastGenerator: QaRoastGenerationService;
    deterministicGenerator: DeterministicGenerator;
    automationResponseValidator: AutomationResponseValidator;
    automationMemory: AutomationMemory;
    automationPatchWriter: AutomationPatchWriter;
    generatedFileRegistry: GeneratedFileRegistry;
    fwkMobileGenerator: FwkMobileGenerator;
    syncRecording: () => void;
}

export function registerAutomationHandlers(context: AutomationHandlersContext): void {
    const {
        state,
        automationRecordingStore,
        recordingCoverageAnalyzer,
        automationPackageBuilder,
        automationAgentLauncher,
        agentOrchestrator,
        layeredGenerationOrchestrator,
        qaRoastGenerator,
        deterministicGenerator,
        automationResponseValidator,
        automationMemory,
        automationPatchWriter,
        generatedFileRegistry,
        fwkMobileGenerator,
        syncRecording,
    } = context;

    function emitAutomationProgress(
        stage: ProductStage,
        message: string,
        completed: number,
        total: number,
        meta?: Record<string, unknown>,
    ): void {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
        state.mainWindow.webContents.send('automation-progress', {
            stage,
            message,
            completed,
            total,
            ...(meta || {}),
        });
    }

    /**
     * Convierte las capas planificadas como `update` en un patch aditivo.
     *
     * El contenido propuesto (por el resolver o por el agente) trae el archivo
     * completo; aquí se compara contra el que está en disco y solo se insertan los
     * símbolos nuevos, con su comentario de trazabilidad. Devuelve además las rutas
     * absolutas ya atendidas para que la escritura de archivos completos las omita.
     */
    function applyAdditiveUpdates(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        updates: Map<string, string>
    ): { outcomes: ReturnType<AutomationPatchWriter['apply']>; absolute: Set<string> } {
        const absolute = new Set<string>();
        const contentOf = (layer: string) => response.files.find(file => file.layer === layer)?.content;
        const read = (relative: string) => fs.readFileSync(path.join(projectPaths.frameworkRoot, relative), 'utf-8');
        const createdAt = new Date().toISOString();
        const input: any = { recordingId: scenario.recordingId, createdAt };

        // Rellenos de claves existentes. El valor NUNCA sale de la respuesta: se
        // copia del selector que el QA verifico en esa accion de la grabacion, asi
        // que por esta via no puede entrar un selector inventado.
        const completionsByFile = new Map<
            string,
            { name: string; platform: 'android' | 'ios'; block: string; value: string }[]
        >();
        for (const completion of response.completions || []) {
            const targets = plan.resolutions
                .find(resolution => resolution.sequence === completion.sequence)
                ?.completionTargets?.filter(candidate =>
                    candidate.file === completion.file
                    && candidate.name === completion.name
                    && candidate.platform === completion.platform
                    && candidate.block.toLowerCase().endsWith(completion.platform)
                ) || [];
            const target = targets.length === 1 ? targets[0] : undefined;
            if (!target) {
                throw new Error(`Completion no autorizado para ${completion.file}#${completion.name}.`);
            }
            const action = scenario.actions.find(step => step.sequence === completion.sequence);
            const value = action?.locatorValue
                || (action?.selector ? frameworkLocator(action.selector, completion.platform).value : '');
            if (!value) {
                throw new Error(`La acción ${completion.sequence} no contiene un locator primario aplicable.`);
            }
            const bucket = completionsByFile.get(completion.file) || [];
            bucket.push({
                name: completion.name,
                platform: completion.platform,
                block: target.block,
                value,
            });
            completionsByFile.set(completion.file, bucket);
        }

        const locatorsPath = updates.get('locators');
        const locatorsProposed = contentOf('locators');
        if (locatorsPath && locatorsProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, locatorsPath))) {
            input.locators = {
                file: locatorsPath,
                additions: locatorAdditions(read(locatorsPath), locatorsProposed),
                completions: completionsByFile.get(locatorsPath) || [],
            };
            completionsByFile.delete(locatorsPath);
        }
        const screenPath = updates.get('screen');
        const screenProposed = contentOf('screen');
        if (screenPath && screenProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, screenPath))) {
            input.screen = { file: screenPath, ...screenAdditions(read(screenPath), screenProposed) };
        }
        const stepsPath = updates.get('steps');
        const stepsProposed = contentOf('steps');
        if (stepsPath && stepsProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, stepsPath))) {
            const { definitions, imports } = stepsAdditions(read(stepsPath), stepsProposed);
            input.steps = { file: stepsPath, definitions, screenImport: imports[0] };
        }
        const featurePath = updates.get('feature');
        const featureProposed = contentOf('feature');
        if (featurePath && featureProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, featurePath))) {
            const scenarioBlock = featureAdditions(read(featurePath), featureProposed);
            if (scenarioBlock) input.feature = { file: featurePath, scenario: scenarioBlock };
        }

        const outcomes = automationPatchWriter.apply(input, projectPaths.frameworkRoot);
        // Un relleno puede caer en un modulo que este caso no escribe —el clasico es
        // grabar en Android sobre un modulo que se hizo grabando en iOS—, asi que va
        // en su propia pasada sobre ese archivo.
        for (const [file, completions] of completionsByFile) {
            if (!fs.existsSync(path.join(projectPaths.frameworkRoot, file))) {
                throw new Error(`No existe el archivo externo autorizado para completion: ${file}`);
            }
            outcomes.push(...automationPatchWriter.apply(
                { recordingId: scenario.recordingId, createdAt, locators: { file, additions: [], completions } },
                projectPaths.frameworkRoot
            ));
        }
        for (const outcome of outcomes) absolute.add(path.join(projectPaths.frameworkRoot, outcome.file));
        return { outcomes, absolute };
    }

    async function importAutomationResponseFromPackage(
        packageDirectory: string,
        options: {
            reviewedContents?: Record<string, string>;
            trackRepair?: boolean;
            manualCorrection?: boolean;
        } = {},
    ): Promise<Record<string, any>> {
        const runStore = new AgentRunStore(packageDirectory);
        runStore.markAgentFinished();
        runStore.markRepairFinished();
        const read = <T>(name: string): T => readJsonUtf8<T>(path.join(packageDirectory, name));
        const packagedScenario = read<PackagedAutomationScenario>('scenario.json');
        const recordingScenarioFile = path.resolve(packageDirectory, '..', '..', 'scenario.json');
        if (!fs.existsSync(recordingScenarioFile)) {
            throw new Error('No se encontró la grabación original para validar scenario.json');
        }
        const recordingScenario = readJsonUtf8<AutomationScenario>(recordingScenarioFile);
        const trustedPackagedScenario = automationPackageBuilder.requireTrustedScenarioPackage(
            recordingScenario,
            packagedScenario,
            packageDirectory,
        );
        const scenario = trustedPackagedScenario;
        const effectivePlanFile = path.join(packageDirectory, 'effective-generation-plan.json');
        let plan = fs.existsSync(effectivePlanFile)
            ? readJsonUtf8<GenerationPlan>(effectivePlanFile)
            : read<GenerationPlan>('generation-plan.json');
        const receiptFile = path.join(packageDirectory, 'application-receipt.json');
        const applicationReceipt = fs.existsSync(receiptFile)
            ? readJsonUtf8<AutomationApplicationReceipt>(receiptFile)
            : undefined;
        if (applicationReceipt) {
            requireUnchangedAppliedFiles(
                projectPaths.frameworkRoot,
                applicationReceipt,
                scenario.recordingId,
                plan.planId,
            );
            // Un update ya aplicado dejó de coincidir con el baseHash original del
            // plan. Para una corrección legítima, su nueva base es exactamente el
            // afterHash persistido y verificado en el recibo de aplicación.
            plan = planAgainstApplicationReceipt(plan, applicationReceipt);
        }
        const responsePath = path.join(packageDirectory, 'agent-response.json');
        if (!fs.existsSync(responsePath)) {
            throw new Error(
                'Aún no existe agent-response.json en el paquete. ' +
                'Si abriste ejecución manual, completa el proveedor y luego usa "Importar resultado manual".'
            );
        }
        let response = withGeneratedResponseMetadata(
            readJsonUtf8<AutomationAgentResponse>(responsePath),
            scenario.createdAt
        );
        if (options.reviewedContents) {
            response = {
                ...response,
                files: response.files.map(file => ({
                    ...file,
                    content: options.reviewedContents?.[
                        path.join(projectPaths.frameworkRoot, file.path)
                    ] ?? file.content,
                })),
            };
        }
        response = normalizeJsonUnicode(response);
        const normalized = normalizeAgentResponseEnglishIdentifiers(response);
        response = withGeneratedResponseMetadata(normalized.response, scenario.createdAt);
        const tagged = enforceAgentResponsePlatformTags(response, scenario.platform);
        response = withGeneratedResponseMetadata(tagged.response, scenario.createdAt);
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        writeJsonUtf8(path.join(packageDirectory, 'agent-response.json'), response);
        const statusFile = path.join(packageDirectory, 'status.json');
        const status = fs.existsSync(statusFile) ? read<any>('status.json') : {};
        if (options.manualCorrection) {
            status.manualCorrectionAttempts = Number(status.manualCorrectionAttempts || 0) + 1;
            status.state = 'manual-correction-validation';
            status.updatedAt = new Date().toISOString();
        }
        const deterministicMode = status.generationMode !== 'layered' && (
            status.generationMode === 'deterministic'
            || fs.existsSync(path.join(packageDirectory, 'gap-resolutions.json'))
        );
        const repairAttempts = Number(status.repairAttempts || 0);
        const responseHash = crypto.createHash('sha256')
            .update(JSON.stringify(response))
            .digest('hex');
        status.lastMaterializedAgentResponseHash = sha256File(responsePath);
        writeJsonUtf8(statusFile, status);
        const previousInvalidHash = typeof status.lastInvalidResponseHash === 'string'
            ? status.lastInvalidResponseHash
            : '';
        const validatorStarted = process.hrtime.bigint();
        emitAutomationProgress('VALIDATING', 'Validando resultado', 5, 6);
        const validation = automationResponseValidator.validate(scenario, plan, response, repairAttempts);
        if (Object.keys(normalized.renamed).length > 0 || normalized.skipped.length > 0) {
            validation.warnings.push(
                `Normalización de identificadores ES→EN aplicada: ${Object.keys(normalized.renamed).length}; ` +
                `omitida: ${normalized.skipped.length}.`
            );
        }
        if (tagged.added.length > 0) {
            validation.warnings.push(
                `Tags de plataforma autoagregados en Feature: ${tagged.added.map(platform => `@${platform}`).join(', ')}.`
            );
        }
        runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
        writeJsonUtf8(path.join(packageDirectory, 'validation.json'), validation);
        const draftPreview = Array.isArray(response.files) &&
            response.files.some(file =>
                file?.layer === 'feature' &&
                typeof file.path === 'string' &&
                typeof file.content === 'string'
            ) &&
            response.files.every(file =>
                file &&
                typeof file.path === 'string' &&
                typeof file.content === 'string'
            )
            ? automationResponseValidator.toPreview(response)
            : null;
        const draftPayload = draftPreview
            ? { draft: { preview: draftPreview, validation } }
            : {};
        if (!validation.valid) {
            if (options.trackRepair === false) {
                return {
                    success: false,
                    failureKind: 'generated-output-validation',
                    validation,
                    repairAvailable: true,
                    error: validation.errors.map(item => item.message).join(' | '),
                    ...draftPayload,
                };
            }
            const existingAutomation = validation.errors.find(item => item.code === 'existing-automation');
            if (existingAutomation) {
                writeJsonUtf8(statusFile, {
                    ...status,
                    state: 'existing-automation',
                    updatedAt: new Date().toISOString(),
                });
                runStore.mark('existing-automation', true);
                return {
                    success: false,
                    failureKind: 'generated-output-validation',
                    validation,
                    repairAvailable: false,
                    error: existingAutomation.message,
                    ...draftPayload,
                };
            }
            const isRepairSubmission = Boolean(previousInvalidHash);
            const changedByRepair = isRepairSubmission && previousInvalidHash !== responseHash;
            if (isRepairSubmission && !changedByRepair) {
                writeJsonUtf8(statusFile, {
                    ...status,
                    state: 'repair-no-change',
                    lastInvalidResponseHash: responseHash,
                    unchangedRepairOutputs: Number(status.unchangedRepairOutputs || 0) + 1,
                    updatedAt: new Date().toISOString(),
                });
                runStore.setRepairAttempts(repairAttempts);
                runStore.mark('repair-output-unchanged', true);
                return {
                    success: false,
                    failureKind: 'generated-output-validation',
                    validation,
                    repairAvailable: false,
                    error: deterministicMode
                        ? 'El agente no cambió gap-resolutions.json. En modo determinista corrige ese archivo y vuelve a reimportar.'
                        : 'El agente terminó sin modificar agent-response.json. Corrige el archivo y usa Reimportar corrección.',
                    ...draftPayload,
                };
            }
            const effectiveRepairAttempts = repairAttempts + (changedByRepair ? 1 : 0);
            if (effectiveRepairAttempts >= plan.budgets.maxRepairAttempts && isRepairSubmission) {
                writeJsonUtf8(statusFile, {
                    ...status,
                    state: 'repair-exhausted',
                    repairAttempts: effectiveRepairAttempts,
                    lastInvalidResponseHash: responseHash,
                    updatedAt: new Date().toISOString(),
                });
                runStore.setRepairAttempts(effectiveRepairAttempts);
                runStore.mark('repair-exhausted', true);
                return {
                    success: false,
                    failureKind: 'generated-output-validation',
                    validation,
                    error: 'Se agotó la única reparación permitida: ' + validation.errors.map(item => item.message).join(' | '),
                    ...draftPayload,
                };
            }
            writeJsonUtf8(
                path.join(packageDirectory, 'repair-context.json'),
                deterministicMode ? {
                    ...validation.repairContext,
                    correctionContract: {
                        writableFile: 'gap-resolutions.json',
                        generatedFile: 'agent-response.json',
                        forbiddenDirectEdits: ['agent-response.json'],
                        replacementDecision: {
                            decision: 'replace-existing',
                            required: ['selectedCandidate', 'replacement.platform', 'replacement.sequence'],
                            selectorSource: 'recording',
                        },
                    },
                } : validation.repairContext,
            );
            writeJsonUtf8(statusFile, {
                ...status,
                state: 'targeted-repair',
                repairAttempts: effectiveRepairAttempts,
                lastInvalidResponseHash: responseHash,
                unchangedRepairOutputs: 0,
                updatedAt: new Date().toISOString(),
            });
            runStore.setRepairAttempts(effectiveRepairAttempts);
            runStore.markRepairStarted();
            return {
                success: false,
                failureKind: 'generated-output-validation',
                validation,
                repairAvailable: true,
                error: validation.errors.map(item => item.message).join(' | '),
                ...draftPayload,
            };
        }
        const preview = automationResponseValidator.toPreview(response);
        const observationsFile = path.join(packageDirectory, 'qa-observations.json');
        const observationsArtifact = fs.existsSync(observationsFile)
            ? readJsonUtf8<QaObservationsArtifact>(observationsFile)
            : analyzeScenarioUiTextQuality(scenario);
        if (!fs.existsSync(observationsFile)) {
            writeJsonUtf8(observationsFile, observationsArtifact);
        }
        const qaObservations = observationsArtifact.observations;
        const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
        const token = crypto.randomUUID();
        state.automationPreview = { token, scenario, plan, response };
        runStore.mark('ready-for-review');
        emitAutomationProgress('READY_FOR_REVIEW', 'Validación completa', 6, 6);
        return {
            success: true,
            preview,
            validation,
            previewToken: token,
            conflicts: managed.conflicts,
            qaObservations,
        };
    }

    function rematerializeGapResolutions(packageDirectory: string): boolean {
        const resolutionsFile = path.join(packageDirectory, 'gap-resolutions.json');
        if (!fs.existsSync(resolutionsFile)) return false;
        const statusFile = path.join(packageDirectory, 'status.json');
        const status = fs.existsSync(statusFile) ? readJsonUtf8<Record<string, unknown>>(statusFile) : {};
        if (status.generationMode === 'layered') return false;
        const raw = fs.readFileSync(resolutionsFile);
        const hash = crypto.createHash('sha256').update(raw).digest('hex');
        const responseFile = path.join(packageDirectory, 'agent-response.json');
        if (status.lastMaterializedGapResolutionsHash === hash
            && fs.existsSync(responseFile)) {
            const currentResponseHash = sha256File(responseFile);
            const materializedResponseHash = typeof status.lastMaterializedAgentResponseHash === 'string'
                ? status.lastMaterializedAgentResponseHash
                : '';
            if (materializedResponseHash && materializedResponseHash !== currentResponseHash) {
                throw new Error(DIRECT_AGENT_RESPONSE_EDIT_ERROR);
            }
            if (!materializedResponseHash && typeof status.materializedAt === 'string') {
                const materializedAt = Date.parse(status.materializedAt);
                const responseModifiedAt = fs.statSync(responseFile).mtimeMs;
                if (Number.isFinite(materializedAt) && responseModifiedAt > materializedAt + 250) {
                    throw new Error(DIRECT_AGENT_RESPONSE_EDIT_ERROR);
                }
            }
            if (!materializedResponseHash) {
                writeJsonUtf8(statusFile, {
                    ...status,
                    lastMaterializedAgentResponseHash: currentResponseHash,
                });
            }
            return false;
        }
        const plan = readJsonUtf8<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const parsed = parseGapResolutions(
            raw.toString('utf-8'),
            Math.max(plan.budgets?.maxTotalQueries || 0, plan.unresolvedGapIds?.length || 0, 1),
        );
        if (!parsed.valid || !parsed.value) {
            throw new Error(
                'gap-resolutions.json no cumple el contrato: '
                + parsed.errors.map(error => error.message).join(' | '),
            );
        }
        if (parsed.value.recordingId !== plan.recordingId || parsed.value.planId !== plan.planId) {
            throw new Error(
                'gap-resolutions.json pertenece a otra grabación o a otra versión del plan.',
            );
        }
        if (parsed.value.testDesignReview) {
            writeJsonUtf8(
                path.join(packageDirectory, 'test-design-review.json'),
                parsed.value.testDesignReview,
            );
        }
        const response = deterministicGenerator.generate(
            packageDirectory,
            parsed.value.resolutions,
            parsed.value.gherkinResolutions || [],
        );
        writeJsonUtf8(responseFile, response);
        writeJsonUtf8(statusFile, {
            ...status,
            lastMaterializedGapResolutionsHash: hash,
            lastMaterializedAgentResponseHash: sha256File(responseFile),
            materializedAt: new Date().toISOString(),
        });
        return true;
    }

    ipcMain.handle('resume-recording', async (_, input: {
        recordingId: string;
        squad?: string;
    }) => {
        try {
            if (!state.sessionActive) throw new Error('Conecta el dispositivo antes de continuar la grabación');
            const squad = input.squad || state.activeSquad;
            const directory = recordingCoverageAnalyzer.findRecordingDirectory(
                squad,
                input.recordingId,
                state.activeEnvironment
            );
            const resumed = automationRecordingStore.resume(directory);
            if (resumed.manifest.platform !== state.recordingPlatform) {
                throw new Error(
                    `La grabación es de ${resumed.manifest.platform.toUpperCase()} y la sesión actual es ` +
                    `${state.recordingPlatform.toUpperCase()}: conecta un dispositivo ${resumed.manifest.platform.toUpperCase()} ` +
                    'para seguir grabando pasos, o usa la opción de completar locators.'
                );
            }
            state.activeSquad = squad;
            state.recordedSteps = resumed.actions.map(step => ({ ...step }));
            state.activeAutomationPackage = '';
            state.automationPreview = null;
            // Deja el manifest consistente con lo que acabamos de cargar: si el
            // proceso muere aqui, la grabacion sigue siendo la misma, no una vacia.
            syncRecording();
            return {
                success: true,
                steps: state.recordedSteps,
                recordingId: resumed.manifest.recordingId,
                scenario: resumed.scenario,
                hasAssertion: state.recordedSteps.some(step => /^VERIFICAR_/.test(String(step.action))),
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('prepare-automation-package', async (_, input: {
        request: Omit<GenerationRequest, 'platform'>;
        objective: string;
        acceptanceCriteria: string;
    }) => {
        try {
            emitAutomationProgress('ANALYZING', 'Analizando grabación', 1, 6);
            if (!state.recordedSteps.length) throw new Error('No hay acciones grabadas');
            if (!input.objective?.trim()) throw new Error('Describe el objetivo funcional del caso');
            if (!input.acceptanceCriteria?.trim()) throw new Error('Define el resultado esperado');
            const request = state.withPlatform(input.request);
            const { scenario, directory } = automationRecordingStore.buildScenario({
                request,
                actions: state.recordedSteps,
                objective: input.objective,
                acceptanceCriteria: input.acceptanceCriteria,
                environment: state.activeEnvironment,
            });
            const result = automationPackageBuilder.prepare(scenario, directory);
            emitAutomationProgress('RESOLVING_CONTEXT', 'Preparando estructura de automatización', 2, 6);
            state.activeAutomationPackage = result.packageDirectory;
            state.automationPreview = null;
            const handoff = automationAgentLauncher.describe(
                projectPaths.automationAgent,
                result.packageDirectory
            );
            emitAutomationProgress(
                result.agentRequired ? 'RESOLVING_DECISIONS' : 'GENERATING',
                result.agentRequired ? 'Resolviendo decisiones pendientes' : 'Generando automatización',
                result.agentRequired ? 3 : 4,
                6,
            );
            return { success: true, result, handoff };
        } catch (e: any) {
            emitAutomationProgress('FAILED', 'No pudimos analizar la grabación', 0, 6, { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('prepare-automation-regeneration', async (_, input: {
        recordingId: string;
        squad?: string;
        refinement: string;
        cleanPackage?: boolean;
    }) => {
        try {
            const squad = input.squad || state.activeSquad;
            const directory = recordingCoverageAnalyzer.findRecordingDirectory(
                squad,
                input.recordingId,
                state.activeEnvironment
            );
            const info = recordingCoverageAnalyzer.getRecordingInfo(
                squad,
                input.recordingId,
                state.activeEnvironment
            );
            const mode = info.canRegenerate && !input.cleanPackage
                ? 'refinement'
                : 'reprocess';
            const result = mode === 'refinement'
                ? automationPackageBuilder.prepareRegeneration(directory, input.refinement)
                : automationPackageBuilder.prepareRecordedScenario(directory, Boolean(input.cleanPackage));
            state.activeAutomationPackage = result.packageDirectory;
            state.automationPreview = null;
            const handoff = automationAgentLauncher.describe(
                projectPaths.automationAgent,
                result.packageDirectory
            );
            return { success: true, result, handoff, mode };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    let manualModelSession: {
        packageDirectory: string; runId?: string; sessionId: string;
        model: string; events: CopilotModelEvents;
    } | null = null;
    const currentModelUsage = () => {
        if (!state.activeAutomationPackage) return null;
        const store = new AgentRunStore(state.activeAutomationPackage);
        const run = store.read();
        if (manualModelSession?.packageDirectory === state.activeAutomationPackage
            && manualModelSession.runId === run?.runId) {
            const usage = { requestedModel: manualModelSession.model, actualModels: manualModelSession.events.read() };
            store.recordModelUsage('manual-correction', usage, manualModelSession.sessionId);
            return usage;
        }
        return run?.agentModelUsage || null;
    };
    ipcMain.handle('get-automation-model-usage', () => currentModelUsage());

    ipcMain.handle('launch-automation-agent', async (_, input?: {
        mode?: string;
        autorun?: boolean;
        qaRoastMode?: boolean;
        model?: string;
        pipeline?: 'layered' | 'deterministic';
    }) => {
        try {
            if (!state.activeAutomationPackage) throw new Error('Primero prepara el paquete');
            const model = normalizeAgentModel(input?.model);
            emitAutomationProgress(
                'RESOLVING_DECISIONS',
                'Resolviendo decisiones pendientes',
                3,
                6,
                {
                    detail: 'Copilot está trabajando. Si solicita permiso para leer o escribir el paquete, autorízalo en su ventana.',
                },
            );
            const mode: AgentExecutionMode = resolveAgentExecutionMode(
                input?.mode || process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE
            );
            if (mode === 'manual') {
                new AgentRunStore(state.activeAutomationPackage).markAgentStarted();
                const launch = input?.autorun
                    ? automationAgentLauncher.openTerminalWithPrompt(
                        projectPaths.automationAgent,
                        state.activeAutomationPackage,
                        model,
                    )
                    : automationAgentLauncher.openTerminal(
                        projectPaths.automationAgent,
                        state.activeAutomationPackage
                    );
                if (launch.sessionId) {
                    manualModelSession = {
                        packageDirectory: state.activeAutomationPackage,
                        runId: new AgentRunStore(state.activeAutomationPackage).read()?.runId,
                        sessionId: launch.sessionId,
                        model,
                        events: CopilotModelEvents.forSession(launch.sessionId),
                    };
                }
                return {
                    success: true,
                    mode,
                    automatic: false,
                    launch,
                };
            }
            manualModelSession = null;
            const pipeline = input?.pipeline
                || (process.env.RECORDER_AGENT_PIPELINE === 'deterministic' ? 'deterministic' : 'layered');
            if (pipeline === 'layered') {
                const layeredStatusFile = path.join(state.activeAutomationPackage, 'status.json');
                const layeredStatus = fs.existsSync(layeredStatusFile)
                    ? readJsonUtf8<Record<string, unknown>>(layeredStatusFile)
                    : {};
                writeJsonUtf8(layeredStatusFile, {
                    ...layeredStatus,
                    generationMode: 'layered',
                    pipeline: 'derek-lorem-zorem-sumrak',
                    ownerAgent: 'Derek',
                    updatedAt: new Date().toISOString(),
                });
                emitAutomationProgress(
                    'ANALYZING',
                    'Derek coordina la generación',
                    2,
                    6,
                    { detail: 'Derek delegará en orden a Lorem, Zorem y Sumrak mediante handoffs verificados.' },
                );
                const layered = await layeredGenerationOrchestrator.run(
                    state.activeAutomationPackage,
                    {
                        model,
                        onStageChange(stage) {
                            const progress = stage.role === 'behavior-author'
                                ? {
                                    productStage: 'RESOLVING_DECISIONS' as ProductStage,
                                    message: 'Lorem redacta Feature y Steps',
                                    completed: stage.state === 'completed' ? 3 : 2,
                                    detail: 'Derek delegó a Lorem únicamente el comportamiento declarativo y su trazabilidad.',
                                }
                                : stage.role === 'interaction-author'
                                    ? {
                                        productStage: 'GENERATING' as ProductStage,
                                        message: 'Zorem construye Screen Object y Locators',
                                        completed: stage.state === 'completed' ? 4 : 3,
                                        detail: 'Derek delegó a Zorem la reutilización autorizada y los selectores grabados.',
                                    }
                                    : {
                                    productStage: 'VALIDATING' as ProductStage,
                                    message: 'Sumrak integra y revisa la automatización',
                                    completed: stage.state === 'completed' ? 5 : 4,
                                    detail: 'Sumrak revisa en headless sin poder reescribir las capas de Lorem y Zorem.',
                                };
                            emitAutomationProgress(
                                stage.state === 'failed' ? 'FAILED' : progress.productStage,
                                stage.state === 'failed' ? `Falló ${stage.agentName}` : progress.message,
                                progress.completed,
                                6,
                                {
                                    detail: stage.error || progress.detail,
                                    role: stage.role,
                                    agentName: stage.agentName,
                                    sessionName: stage.sessionName,
                                    roleState: stage.state,
                                },
                            );
                        },
                    },
                );
                if (fs.existsSync(layered.reportFile)) {
                    const layeredReport = readJsonUtf8<{
                        stages?: Array<{
                            role: string;
                            agentName?: string;
                            requestedModel?: string;
                            actualModels?: string[];
                        }>;
                    }>(layered.reportFile);
                    const layeredRunStore = new AgentRunStore(state.activeAutomationPackage);
                    for (const stage of layeredReport.stages || []) {
                        if (!stage.requestedModel) continue;
                        layeredRunStore.recordModelUsage(`${stage.agentName || stage.role}:${stage.role}`, {
                            requestedModel: stage.requestedModel,
                            actualModels: stage.actualModels || [],
                        });
                    }
                }
                if (!layered.success) {
                    const layeredResponseFile = path.join(
                        state.activeAutomationPackage,
                        'agent-response.json',
                    );
                    const inspected = fs.existsSync(layeredResponseFile)
                        ? await importAutomationResponseFromPackage(
                            state.activeAutomationPackage,
                            { trackRepair: false },
                        )
                        : { success: false, validation: undefined, draft: undefined };
                    return {
                        success: false,
                        mode,
                        automatic: true,
                        pipeline,
                        layeredRun: layered,
                        error: layered.error || 'El pipeline por capas no pudo completar la integración.',
                        failureKind: 'layered-generation',
                        validation: inspected.validation,
                        draft: inspected.draft,
                        repairAvailable: Boolean(inspected.draft),
                    };
                }
                const layeredReviewFile = path.join(
                    state.activeAutomationPackage,
                    'test-design-review.json',
                );
                const testDesignReview = fs.existsSync(layeredReviewFile)
                    ? readJsonUtf8<TestDesignReview>(layeredReviewFile)
                    : undefined;
                const imported = await importAutomationResponseFromPackage(state.activeAutomationPackage);
                if (imported.success) {
                    emitAutomationProgress('READY_FOR_REVIEW', 'Listo para revisión', 6, 6);
                }
                return {
                    success: imported.success,
                    mode,
                    automatic: true,
                    pipeline,
                    layeredRun: layered,
                    ...(testDesignReview ? { testDesignReview } : {}),
                    ...(imported.success
                        ? { imported }
                        : {
                            error: imported.error,
                            failureKind: imported.failureKind || 'generated-output-validation',
                            validation: imported.validation,
                            repairAvailable: imported.repairAvailable,
                            draft: imported.draft,
                        }),
                };
            }
            const run = await agentOrchestrator.run(state.activeAutomationPackage, mode, { model });
            run.modelUsage = currentModelUsage();
            if (run.success) {
                let testDesignReview = run.testDesignReview;
                let roastGeneration;
                if (testDesignReview?.status === 'suggestion' && input?.qaRoastMode) {
                    emitAutomationProgress(
                        'RESOLVING_DECISIONS',
                        'Preparando una sugerencia para QA',
                        3,
                        6,
                    );
                    try {
                        roastGeneration = await qaRoastGenerator.generate(
                            state.activeAutomationPackage,
                            testDesignReview,
                        );
                        if (roastGeneration.success && roastGeneration.roast) {
                            testDesignReview = { ...testDesignReview, roast: roastGeneration.roast };
                            writeJsonUtf8(
                                path.join(state.activeAutomationPackage, 'test-design-review.json'),
                                testDesignReview,
                            );
                        }
                    } catch (error: any) {
                        roastGeneration = {
                            success: false,
                            attempts: 0,
                            repairAttempts: 0,
                            durationMs: 0,
                            responseBytes: 0,
                            result: 'provider-failed' as const,
                            error: String(error?.message || error || 'No se pudo generar el roast.'),
                        };
                    }
                }
                emitAutomationProgress('GENERATING', 'Generando automatización', 4, 6);
                const imported = await importAutomationResponseFromPackage(state.activeAutomationPackage);
                if (imported.success) {
                    emitAutomationProgress('READY_FOR_REVIEW', 'Listo para revisión', 6, 6);
                }
                return {
                    success: imported.success,
                    mode,
                    automatic: true,
                    run,
                    ...(testDesignReview ? { testDesignReview } : {}),
                    ...(roastGeneration ? { roastGeneration } : {}),
                    ...(imported.success
                        ? { imported }
                        : {
                            error: imported.error,
                            failureKind: imported.failureKind || 'generated-output-validation',
                            validation: imported.validation,
                            repairAvailable: imported.repairAvailable,
                            draft: imported.draft,
                    }),
                };
            }
            if (run.errorCode === 'PLANNER_REGENERATION_REQUIRED') {
                const inspected = await importAutomationResponseFromPackage(
                    state.activeAutomationPackage,
                    { trackRepair: false },
                );
                emitAutomationProgress(
                    'VALIDATING',
                    'El plan necesita regenerarse o revisarse',
                    4,
                    6,
                    {
                        error: run.error,
                        regenerationRequired: true,
                    },
                );
                return {
                    success: false,
                    mode,
                    automatic: true,
                    run,
                    errorCode: run.errorCode,
                    error: run.error,
                    failureKind: 'planner-regeneration-required',
                    regenerationRequired: true,
                    validation: inspected.validation,
                    draft: inspected.draft,
                    repairAvailable: false,
                };
            }
            if (run.fallback) {
                const handoff = automationAgentLauncher.describe(
                    projectPaths.automationAgent,
                    state.activeAutomationPackage
                );
                emitAutomationProgress(
                    'FAILED',
                    'No pudimos completar la resolución automática',
                    0,
                    6,
                    { error: run.error || run.errorCode || 'Proveedor no disponible' }
                );
                return {
                    success: false,
                    mode,
                    automatic: true,
                    fallbackSuggested: true,
                    fallbackReason: run.errorCode,
                    handoff,
                    error: run.error || 'La ejecución automática no está disponible en este momento.',
                };
            }
            return {
                success: false,
                mode,
                automatic: true,
                error: run.error || run.errorCode || 'La ejecución automática falló',
                run,
            };
        } catch (e: any) {
            const materializationFailure = String(e.message || '').startsWith('GENERATION_MATERIALIZATION_ERROR:');
            emitAutomationProgress('FAILED', materializationFailure
                ? 'No pudimos materializar la automatización'
                : 'No pudimos resolver decisiones automáticamente', 0, 6, {
                error: e.message,
            });
            if (state.activeAutomationPackage) {
                const run = new AgentRunStore(state.activeAutomationPackage);
                run.markAgentFinished();
                run.mark('agent-launch-failed');
            }
            return {
                success: false,
                failureKind: materializationFailure ? 'generation-materialization' : 'agent-resolution',
                error: e.message,
            };
        }
    });

    ipcMain.handle('import-automation-response', async (
        _,
        input?: { manualCorrection?: boolean; reviewOnly?: boolean },
    ) => {
        try {
            if (!state.activeAutomationPackage) throw new Error('Primero prepara el paquete');
            rematerializeGapResolutions(state.activeAutomationPackage);
            currentModelUsage();
            const manualCorrection = input?.manualCorrection === true;
            const reviewOnly = input?.reviewOnly !== false;
            return await importAutomationResponseFromPackage(state.activeAutomationPackage, {
                ...(reviewOnly || manualCorrection ? {
                    trackRepair: false,
                } : {}),
                ...(manualCorrection ? {
                    manualCorrection: true,
                } : {}),
            });
        } catch (e: any) {
            if (state.activeAutomationPackage) new AgentRunStore(state.activeAutomationPackage).mark('import-failed', true);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('revalidate-automation-response', async (
        _,
        reviewedContents: Record<string, string>,
    ) => {
        try {
            if (!state.activeAutomationPackage) throw new Error('Primero prepara el paquete');
            if (!reviewedContents || typeof reviewedContents !== 'object' || Array.isArray(reviewedContents)) {
                throw new Error('No se recibieron archivos revisados para validar.');
            }
            const rematerialized = rematerializeGapResolutions(state.activeAutomationPackage);
            return await importAutomationResponseFromPackage(state.activeAutomationPackage, {
                ...(rematerialized ? {} : { reviewedContents }),
                trackRepair: false,
            });
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-automation-qa-decisions', async () => {
        try {
            if (!state.activeAutomationPackage) throw new Error('Primero prepara el paquete');
            const plan = JSON.parse(
                fs.readFileSync(path.join(state.activeAutomationPackage, 'generation-plan.json'), 'utf-8')
            ) as GenerationPlan;
            const decisions = qaDecisionPromptsFromPlan(plan, state.activeAutomationPackage);
            if (decisions.length) {
                emitAutomationProgress('WAITING_FOR_QA', 'Se requiere confirmación de QA', 3, 6);
            }
            return {
                success: true,
                required: decisions.length > 0,
                recordingId: plan.recordingId,
                planId: plan.planId,
                decisions,
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('resolve-automation-qa-decisions', async (_, input: {
        decisions: Array<{ gapId: string; optionId: string }>;
    }) => {
        try {
            if (!state.activeAutomationPackage) throw new Error('Primero prepara el paquete');
            emitAutomationProgress('RESOLVING_DECISIONS', 'Aplicando decisiones de QA', 3, 6);
            const plan = JSON.parse(
                fs.readFileSync(path.join(state.activeAutomationPackage, 'generation-plan.json'), 'utf-8')
            ) as GenerationPlan;
            const prompts = qaDecisionPromptsFromPlan(plan, state.activeAutomationPackage);
            if (!prompts.length) throw new Error('No hay decisiones QA pendientes.');
            const selectedByGap = new Map<string, string>();
            for (const entry of input?.decisions || []) {
                if (!entry?.gapId || !entry?.optionId) continue;
                if (selectedByGap.has(entry.gapId)) {
                    throw new Error(`La decisión para ${entry.gapId} está duplicada.`);
                }
                selectedByGap.set(entry.gapId, entry.optionId);
            }
            const qaResolutions: GapResolution[] = [];
            for (const prompt of prompts) {
                const optionId = selectedByGap.get(prompt.gapId);
                if (!optionId) throw new Error(`Falta confirmar una decisión de QA.`);
                const option = prompt.options.find(entry => entry.optionId === optionId);
                if (!option) throw new Error('La decisión seleccionada no es válida para este gap.');
                qaResolutions.push({
                    gapId: prompt.gapId,
                    decision: option.decision,
                    reason: `${option.reason} (confirmado por QA)`,
                    ...(option.symbol ? { symbol: option.symbol } : {}),
                    ...(option.candidate ? { evidence: [option.candidate.file] } : {}),
                });
                const target = plan.resolutions.find(resolution => resolution.gapId === prompt.gapId);
                if (target && option.decision === 'reuse' && option.candidate) {
                    target.resolution = 'reuse';
                    target.locatorName = option.candidate.name;
                    target.source = {
                        file: option.candidate.file,
                        module: option.candidate.module,
                        scope: target.source?.scope || 'squad',
                    };
                    target.reason = `${target.reason} QA confirmó reutilización ${option.candidate.module}.${option.candidate.name}.`;
                }
                if (target && option.decision === 'create') {
                    target.resolution = 'create';
                    target.reason = `${target.reason} QA confirmó crear componente nuevo.`;
                }
            }
            writeJsonUtf8(path.join(state.activeAutomationPackage, 'generation-plan.json'), plan);
            const finalResolutions = mergedResolutionsWithQa(plan, qaResolutions, state.activeAutomationPackage);
            writeJsonUtf8(
                path.join(state.activeAutomationPackage, 'gap-resolutions.json'),
                {
                    schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
                    recordingId: plan.recordingId,
                    planId: plan.planId,
                    resolutions: finalResolutions,
                },
            );
            const response = deterministicGenerator.generate(state.activeAutomationPackage, finalResolutions);
            emitAutomationProgress('GENERATING', 'Generando automatización', 4, 6);
            writeJsonUtf8(path.join(state.activeAutomationPackage, 'agent-response.json'), response);
            const imported = await importAutomationResponseFromPackage(state.activeAutomationPackage);
            if (imported.success) emitAutomationProgress('READY_FOR_REVIEW', 'Listo para revisión', 6, 6);
            return {
                success: imported.success,
                ...(imported.success ? { imported } : { error: imported.error, validation: imported.validation }),
            };
        } catch (e: any) {
            emitAutomationProgress('FAILED', 'No pudimos aplicar la decisión de QA', 0, 6, { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('generate-automation-response', async (
        _,
        previewToken: string,
        reviewedContents?: Record<string, string>
    ) => {
        let runStore: AgentRunStore | undefined;
        let correctionBackups = new Map<string, string>();
        try {
            if (!state.automationPreview || state.automationPreview.token !== previewToken) {
                throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
            }
            emitAutomationProgress('APPLYING', 'Aplicando automatización', 1, 2);
            const { scenario, plan } = state.automationPreview;
            runStore = new AgentRunStore(state.activeAutomationPackage);
            const response: AutomationAgentResponse = normalizeJsonUnicode({
                ...state.automationPreview.response,
                files: state.automationPreview.response.files.map(file => ({
                    ...file,
                    content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
                })),
            });
            const validatorStarted = process.hrtime.bigint();
            const validation = automationResponseValidator.validate(scenario, plan, response);
            runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
            runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
            if (!validation.valid) throw new Error(validation.errors.map(item => item.message).join(' | '));
            const preview = automationResponseValidator.toPreview(response);
            const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
            if (managed.conflicts.length) {
                throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
            }
            const receiptFile = path.join(state.activeAutomationPackage, 'application-receipt.json');
            if (fs.existsSync(receiptFile)) {
                const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
                requireUnchangedAppliedFiles(
                    projectPaths.frameworkRoot,
                    receipt,
                    scenario.recordingId,
                    plan.planId,
                );
                correctionBackups = restoreUpdateBaselinesForCorrection(
                    state.activeAutomationPackage,
                    projectPaths.frameworkRoot,
                    plan,
                );
            }
            // Los `update` se amplían con un patch aditivo en vez de reescribirse: el
            // archivo puede ser ajeno y solo debe recibir los símbolos nuevos.
            const updates = new Map(plan.files
                .filter(file => file.operation === 'update')
                .map(file => [file.layer, file.path]));
            const patched = applyAdditiveUpdates(scenario, plan, response, updates);
            const createOnly: GeneratedPreview = {
                ...preview,
                files: preview.files.filter(file => !patched.absolute.has(file)),
            };
            const generated = fwkMobileGenerator.writePreview(
                createOnly,
                new Set([...managed.writable].filter(file => !patched.absolute.has(file)))
            );
            generatedFileRegistry.register(generated, scenario.squad, plan.files);
            for (const outcome of patched.outcomes) {
                if (!outcome.added.length) continue;
                generatedFileRegistry.registerPatch(
                    path.join(projectPaths.frameworkRoot, outcome.file),
                    scenario.squad,
                    scenario.recordingId,
                    outcome.added
                );
            }
            const memoryEntry = automationMemory.promote(scenario, plan, response, validation);
            writeJsonUtf8(path.join(state.activeAutomationPackage, 'agent-response.json'), response);
            writeJsonUtf8(path.join(state.activeAutomationPackage, 'validation.json'), validation);
            const applicationReceipt = createAutomationApplicationReceipt(
                projectPaths.frameworkRoot,
                scenario,
                plan,
                response,
            );
            writeJsonUtf8(
                path.join(state.activeAutomationPackage, 'application-receipt.json'),
                applicationReceipt,
            );
            const statusFile = path.join(state.activeAutomationPackage, 'status.json');
            let status: Record<string, any> = {};
            try { status = readJsonUtf8<Record<string, any>>(statusFile); } catch { status = {}; }
            writeJsonUtf8(statusFile, {
                ...status,
                recordingId: scenario.recordingId,
                planId: plan.planId,
                state: 'generated',
                generatedAt: new Date().toISOString(),
                memoryVersion: memoryEntry.version,
            });
            state.automationPreview = null;
            runStore.mark('generated', true);
            emitAutomationProgress('COMPLETED', 'Automatización aplicada correctamente', 2, 2);
            return { success: true, generated, validation, memoryVersion: memoryEntry.version, patched: patched.outcomes };
        } catch (e: any) {
            if (correctionBackups.size) rollbackCorrectionBaselines(correctionBackups);
            emitAutomationProgress('FAILED', 'No pudimos aplicar la automatización', 0, 2, {
                error: e.message,
            });
            runStore?.mark('generation-failed', true);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-automation-memory-stats', async () => ({
        success: true,
        stats: automationMemory.stats(),
    }));
}
