import { reconcileRecordedLocatorTypes } from '../../../../core/validation';
import { loadFrameworkBaseline, planForReconciliation } from '../../../../core/automation';
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
    AutomationHistoryStore,
    readLayeredOutput,
    assertLayeredEnvelope,
    RecoverableDraftStore,
    normalizeAgentResponseEnglishIdentifiers,
    normalizeGeneratedGherkinKeywords,
    inheritedIdentifiersOf,
    enforceAgentResponsePlatformTags,
    AutomationApplicationReceipt,
    planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles,
    AutomationApplier,
    PreparedAutomation,
    loadUpdateBaselinesForCorrection,
} from '../../../../core/automation';
import { AutomationResponseValidator, FrameworkCompilationValidator, includeFrameworkCompilation, refreshAssessmentStatic } from '../../../../core/validation';
import { DeterministicGenerator } from '../../../../core/generation';
import { normalizeJsonUnicode, readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
import { RecorderRuntimeState } from '../runtimeState';
import { AutomationProgressEmitter } from './progress';
import { prepareRecoveredExport } from './draftExport';
import { loadReviewDiagnostics, loadQaObservations } from './reviewContext';
import type { AutomationExportReadiness } from '../../automationExportContracts';
import type { LayeredGenerationResult } from '../../../../core/automation';

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
    automationApplier?: AutomationApplier;
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

    prepareRecoveredDraft(packageDirectory: string, draft: NonNullable<LayeredGenerationResult['draft']>) {
        return prepareRecoveredExport(this.deps, packageDirectory, draft);
    }

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
        const current = state.automationPreview;
        if (options.reviewedContents && current?.generationDiagnostics && current.packageDirectory === packageDirectory) {
            const draft = prepareRecoveredExport(this.deps, packageDirectory, {
                ...current.recoveredDraft,
                files: current.recoveredDraft?.files || current.response.files.map(file => ({ ...file, origin: 'agent' as const })),
                missingLayers: current.plan.files.filter(file => !current.response.files.some(item => item.layer === file.layer)).map(file => file.layer),
                diagnostics: current.generationDiagnostics,
            }, options.reviewedContents);
            return { success: false, failureKind: 'generated-output-validation', draft, validation: draft.validation,
                error: draft.validation.errors.map(item => item.message).join(' | '), repairAvailable: true };
        }
        state.automationPreview = null;
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
        const frameworkBaseline = loadFrameworkBaseline(packageDirectory, plan);
        if (applicationReceipt && !frameworkBaseline) {
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
        plan = planForReconciliation(projectPaths.frameworkRoot, plan, frameworkBaseline);
        if (frameworkBaseline && options.reviewedContents) {
            if (!current?.prepared || current.packageDirectory !== packageDirectory) throw new Error('Reimporta antes de resolver el conflicto o editar la propuesta.');
            (this.deps.automationApplier || new AutomationApplier()).requireUnchanged(current.prepared);
            for (const file of Object.keys(options.reviewedContents)) if (!current.prepared.files.some(item => path.join(projectPaths.frameworkRoot, item.path) === file)) throw new Error('Edición fuera del preview.');
        }
        const responsePath = path.join(packageDirectory, 'agent-response.json');
        if (!fs.existsSync(responsePath)) {
            throw new Error(
                'Aún no existe agent-response.json en el paquete. ' +
                'Si abriste ejecución manual, completa el proveedor y luego usa "Importar resultado manual".'
            );
        }
        const history = new AutomationHistoryStore(packageDirectory);
        history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
        history.captureFile(responsePath, options.manualCorrection ? 'qa' : 'agent', 'import:original');
        let delivered: unknown;
        try {
            delivered = readLayeredOutput(responsePath, Boolean(frameworkBaseline));
            assertLayeredEnvelope(delivered, true);
        } catch (error: any) {
            const recovery = new RecoverableDraftStore(packageDirectory, plan);
            recovery.capture(path.join(packageDirectory, 'deterministic-draft.json'), 'deterministic');
            recovery.capture(responsePath, options.manualCorrection ? 'qa' : 'agent');
            const draft = this.prepareRecoveredDraft(packageDirectory, recovery.save([error.message]));
            history.append({ ...history.identity()!, kind: options.manualCorrection ? 'qa-validation-result' : 'generation-result',
                origin: 'recorder', stage: 'import-envelope', result: 'failed' }, [
                { name: 'validation.json', content: JSON.stringify(draft.validation) },
            ]);
            return { success: false, failureKind: 'generated-output-validation', error: error.message,
                validation: draft.validation, draft, repairAvailable: true };
        }
        let response = frameworkBaseline ? delivered as AutomationAgentResponse : withGeneratedResponseMetadata(
            delivered as AutomationAgentResponse, scenario.createdAt);
        const beforeQaEdit = JSON.stringify(response);
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
        if (options.manualCorrection || (options.reviewedContents && JSON.stringify(response) !== beforeQaEdit)) {
            history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId, source: 'qa-edit' }, [
                { name: 'agent-response.json', content: JSON.stringify(response, null, 2) + '\n' },
            ]);
        }
        if (!frameworkBaseline) response = normalizeJsonUnicode(response);
        if (!frameworkBaseline && !options.manualCorrection && !options.reviewedContents) {
            const corrected = reconcileRecordedLocatorTypes(scenario, plan, response);
            const report = { ...corrected.audit, corrections: corrected.corrections, corrected: corrected.changed };
            history.capture('locator-fidelity.json', JSON.stringify(report), 'recorder', 'import:locator-fidelity');
            writeJsonUtf8(path.join(packageDirectory, 'locator-fidelity.json'), report);
            response = corrected.response;
        }
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
        const normalized = frameworkBaseline ? { response, renamed: {}, skipped: [] }
            : normalizeAgentResponseEnglishIdentifiers(response, { inheritedIdentifiers });
        response = withGeneratedResponseMetadata(normalized.response, scenario.createdAt);
        const tagged = frameworkBaseline ? { response, added: [] } : enforceAgentResponsePlatformTags(response, scenario.platform);
        response = withGeneratedResponseMetadata(tagged.response, scenario.createdAt);
        const keywords = frameworkBaseline ? { response, changed: 0 } : normalizeGeneratedGherkinKeywords(response, {
            actions: scenario.actions,
            reusedStepTexts: scenario.request.scenarioRows?.filter(row => row.status === 'reused').map(row => row.text),
        });
        response = keywords.response;
        // Red de seguridad general: el importador nunca convierte una
        // respuesta valida en invalida. Si tras normalizar (ES→EN, tags) el
        // validador rechaza lo que tal cual llego si pasaba, se conserva lo
        // entregado y se deja constancia de que fue la normalizacion.
        let normalizationReverted: string | undefined;
        if (Object.keys(normalized.renamed).length || tagged.added.length || keywords.changed) {
            const afterNormalization = automationResponseValidator.validate(scenario, plan, response, 0);
            if (!afterNormalization.valid) {
                const delivered = withGeneratedResponseMetadata(asDelivered, scenario.createdAt);
                const beforeNormalization = automationResponseValidator.validate(scenario, plan, delivered, 0);
                if (beforeNormalization.valid) {
                    normalizationReverted = 'La normalización del importador (ES→EN: '
                        + `${Object.keys(normalized.renamed).join(', ') || 'ninguno'}; tags: `
                        + `${tagged.added.map(platform => `@${platform}`).join(', ') || 'ninguno'}; keywords: ${keywords.changed}) invalidaba una `
                        + 'respuesta correcta y se descartó. Revisa el normalizador: '
                        + afterNormalization.errors.map(error => error.message).join(' | ');
                    response = delivered;
                }
            }
        }
        if (frameworkBaseline) response = asDelivered;
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        if (frameworkBaseline) fs.writeFileSync(path.join(packageDirectory, 'agent-response.json'), JSON.stringify(response, null, 2) + '\n', 'utf8');
        else writeJsonUtf8(path.join(packageDirectory, 'agent-response.json'), response);
        history.captureFile(responsePath, 'recorder', 'import:normalized');
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
        let prepared: PreparedAutomation | undefined;
        let preparationError: string | undefined;
        let correctionBaselines = new Map<string, string>();
        try {
            if (applicationReceipt && !frameworkBaseline) correctionBaselines = loadUpdateBaselinesForCorrection(packageDirectory, projectPaths.frameworkRoot, plan);
            prepared = (this.deps.automationApplier || new AutomationApplier()).prepare(
                scenario, plan, response, automationResponseValidator.toPreview(response), correctionBaselines,
                frameworkBaseline ? { baseline: frameworkBaseline, reviewed: Boolean(options.reviewedContents) } : undefined,
            );
            response = prepared.response;
        } catch (error: any) {
            preparationError = error.message;
        }
        emitAutomationProgress('VALIDATING', 'Validando resultado', 5, 6);
        const validation = automationResponseValidator.validate(scenario, plan, response, repairAttempts);
        if (prepared) {
            validation.warnings.push(...(prepared.diagnostics || []).map(item => item.message));
            const compilation = new FrameworkCompilationValidator().validate(projectPaths.frameworkRoot, prepared.files);
            includeFrameworkCompilation(validation, compilation);
            writeJsonUtf8(path.join(packageDirectory, 'framework-compilation.json'), compilation);
        }
        if (prepared?.conflicts?.length) preparationError = prepared.conflicts.join(' | ');
        if (preparationError) {
            validation.valid = false;
            validation.qualityScore = 0;
            validation.errors.push({ code: 'application-preview', message: preparationError });
        }
        if (Object.keys(normalized.renamed).length > 0 || normalized.skipped.length > 0) {
            validation.warnings.push(
                `Normalización de identificadores ES→EN aplicada: ${Object.keys(normalized.renamed).length}; ` +
                `omitida: ${normalized.skipped.length}.`
            );
        }
        if (!frameworkBaseline && !options.manualCorrection && !options.reviewedContents) {
            const reports = [path.join(packageDirectory, 'locator-fidelity.json'), path.join(packageDirectory, 'agents/zorem/locator-fidelity.json')];
            const corrections = reports.filter(file => fs.existsSync(file)).flatMap(file => {
                try { const report = readJsonUtf8<any>(file); return report.corrected && report.planId === plan.planId ? report.corrections || [] : []; } catch { return []; }
            });
            const getters = [...new Set(corrections.map((entry: any) => `${entry.getter} (${entry.platform}: ${entry.actual} → ${entry.expected})`))];
            if (getters.length) validation.warnings.push(`El Recorder corrigió TypeLocator según la grabación: ${getters.join(', ')}. La salida original se conserva en el historial.`);
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
        refreshAssessmentStatic(validation);
        writeJsonUtf8(path.join(packageDirectory, 'validation.json'), validation);
        history.append({ ...history.identity()!, kind: options.manualCorrection || options.reviewedContents ? 'qa-validation-result' : 'generation-result', origin: 'recorder', stage: options.manualCorrection || options.reviewedContents ? 'qa-validation' : 'import-validation', result: validation.valid ? 'passed' : 'failed' }, [
            { name: 'validation.json', content: JSON.stringify(validation, null, 2) + '\n' },
            { name: 'prepared-response.json', content: JSON.stringify(response, null, 2) + '\n' },
        ]);
        const preview = prepared?.preview || automationResponseValidator.toPreview(response);
        const exportBlockers = preparationError ? [preparationError]
            : generatedFileRegistry.assess(preview, scenario.squad, plan.files).conflicts;
        const token = prepared && !exportBlockers.length ? crypto.randomUUID() : '';
        if (prepared) state.automationPreview = { token, scenario, plan, response, prepared, correctionBaselines, packageDirectory };
        const exportFields: AutomationExportReadiness = { previewToken: token, exportReady: Boolean(token), exportBlockers,
            missingLayers: plan.files.filter(file => !response.files.some(item => item.layer === file.layer)).map(file => file.layer) };
        const observationsArtifact = loadQaObservations(packageDirectory, scenario);
        const qaObservations = observationsArtifact.observations;
        const reviewDiagnostics = loadReviewDiagnostics(packageDirectory, validation, scenario, plan, qaObservations);
        const draftPayload = { ...exportFields, reviewDiagnostics,
            draft: { preview, validation, reviewDiagnostics, ...exportFields } };
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
        const observationsFile = path.join(packageDirectory, 'qa-observations.json');

        if (!fs.existsSync(observationsFile)) {
            writeJsonUtf8(observationsFile, observationsArtifact);
        }
        runStore.mark('ready-for-review');
        emitAutomationProgress('READY_FOR_REVIEW', 'Validación completa', 6, 6);
        return {
            success: true,
            preview,
            validation,
            ...exportFields,
            conflicts: exportBlockers,
            qaObservations,
            reviewDiagnostics,
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
