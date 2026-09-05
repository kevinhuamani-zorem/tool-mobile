import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import { withGeneratedResponseMetadata } from '../../../../core/generation';
import {
    GeneratedFileRegistry,
    AutomationPackageBuilder,
    PackagedAutomationScenario,
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
    parseGapResolutions,
    AgentRunStore,
    normalizeAgentResponseEnglishIdentifiers,
    inheritedIdentifiersOf,
    enforceAgentResponsePlatformTags,
    AutomationApplicationReceipt,
    planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles,
    QaObservationsArtifact,
    analyzeScenarioUiTextQuality,
} from '../../../../core/automation';
import { AutomationResponseValidator } from '../../../../core/validation';
import { DeterministicGenerator } from '../../../../core/generation';
import { normalizeJsonUnicode, readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
import { RecorderRuntimeState } from '../runtimeState';
import { AutomationProgressEmitter } from './progress';

const DIRECT_AGENT_RESPONSE_EDIT_ERROR =
    'Copilot modificó agent-response.json directamente, pero en modo determinista ese archivo '
    + 'lo genera el recorder. Corrige únicamente gap-resolutions.json; para conservar una clave '
    + 'existente cambiando su selector usa decision "replace-existing", selectedCandidate y '
    + 'replacement { platform, sequence }. Luego vuelve a reimportar para regenerar la propuesta.';

export function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export interface ImportAutomationResponseOptions {
    reviewedContents?: Record<string, string>;
    trackRepair?: boolean;
    manualCorrection?: boolean;
}

export interface AutomationResponseImporterDependencies {
    state: RecorderRuntimeState;
    automationPackageBuilder: AutomationPackageBuilder;
    automationResponseValidator: AutomationResponseValidator;
    generatedFileRegistry: GeneratedFileRegistry;
    deterministicGenerator: DeterministicGenerator;
    emitProgress: AutomationProgressEmitter;
}

/**
 * Lee `agent-response.json` de un paquete, lo normaliza (Unicode, ES→EN,
 * tags de plataforma), lo valida y deja la propuesta lista para revisión
 * (`state.automationPreview`) o el contexto de reparación cuando falla.
 * También rematerializa la respuesta desde `gap-resolutions.json` en modo
 * determinista, protegiendo `agent-response.json` de ediciones directas.
 */
export class AutomationResponseImporter {
    constructor(private readonly deps: AutomationResponseImporterDependencies) {}

    async importFromPackage(
        packageDirectory: string,
        options: ImportAutomationResponseOptions = {},
    ): Promise<Record<string, any>> {
        const {
            state,
            automationPackageBuilder,
            automationResponseValidator,
            generatedFileRegistry,
            emitProgress: emitAutomationProgress,
        } = this.deps;
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
        const asDelivered = response;
        // Los identificadores que ya viven en el framework (baselines de los
        // archivos update) no se traducen: renombrar `titleVentas` a
        // `salesTitle` destruia una clave existente y el validador lo
        // rechazaba como API eliminada + selector inventado.
        const inheritedIdentifiers = inheritedIdentifiersOf(
            plan.files
                .filter(file => file.operation === 'update')
                .map(file => ({ layer: file.layer, absolute: path.join(projectPaths.frameworkRoot, file.path) }))
                .filter(file => fs.existsSync(file.absolute))
                .map(file => ({ layer: file.layer, content: fs.readFileSync(file.absolute, 'utf-8') })),
        );
        const normalized = normalizeAgentResponseEnglishIdentifiers(response, { inheritedIdentifiers });
        response = withGeneratedResponseMetadata(normalized.response, scenario.createdAt);
        const tagged = enforceAgentResponsePlatformTags(response, scenario.platform);
        response = withGeneratedResponseMetadata(tagged.response, scenario.createdAt);
        // Red de seguridad general: el importador nunca convierte una
        // respuesta valida en invalida. Si tras normalizar (ES→EN, tags) el
        // validador rechaza lo que tal cual llego si pasaba, se conserva lo
        // entregado y se deja constancia de que fue la normalizacion.
        let normalizationReverted: string | undefined;
        if (Object.keys(normalized.renamed).length || tagged.added.length) {
            const afterNormalization = automationResponseValidator.validate(scenario, plan, response, 0);
            if (!afterNormalization.valid) {
                const delivered = withGeneratedResponseMetadata(asDelivered, scenario.createdAt);
                const beforeNormalization = automationResponseValidator.validate(scenario, plan, delivered, 0);
                if (beforeNormalization.valid) {
                    normalizationReverted = 'La normalización del importador (ES→EN: '
                        + `${Object.keys(normalized.renamed).join(', ') || 'ninguno'}; tags: `
                        + `${tagged.added.map(platform => `@${platform}`).join(', ') || 'ninguno'}) invalidaba una `
                        + 'respuesta correcta y se descartó. Revisa el normalizador: '
                        + afterNormalization.errors.map(error => error.message).join(' | ');
                    response = delivered;
                }
            }
        }
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
        if (normalizationReverted) {
            validation.warnings.push(normalizationReverted);
            runStore.recordMissingContextRequest({ source: 'importer', detail: normalizationReverted });
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

    rematerializeGapResolutions(packageDirectory: string): boolean {
        const { deterministicGenerator } = this.deps;
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
}
