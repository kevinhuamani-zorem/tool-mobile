import fs from 'fs';
import os from 'os';
import { ApprovedGoldenStore, goldenDatasetRoot } from '../../../core/automation';
import path from 'path';
import { ipcMain } from 'electron';
import { projectPaths } from '../../../core/workspace';
import { GenerationRequest, FwkMobileGenerator } from '../../../core/generation';
import {
    GeneratedFileRegistry,
    AutomationRecordingStore,
    AutomationPackageBuilder,
    AutomationAgentLauncher,
    AutomationMemory,
    AutomationPatchWriter,
    AutomationApplier,
    GenerationPlan,
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    AgentRunStore,
    AgentOrchestrator,
    LayeredGenerationOrchestrator,
} from '../../../core/automation';
import { RecordingCoverageAnalyzer } from '../../../core/coverage';
import { AutomationResponseValidator } from '../../../core/validation';
import { DeterministicGenerator } from '../../../core/generation';
import { writeJsonUtf8 } from '../../../core/shared';
import { RecorderRuntimeState } from './runtimeState';
import { createAutomationProgressEmitter } from './automation/progress';
import { qaDecisionPromptsFromPlan, mergedResolutionsWithQa, applyQaDecisionsToPlan } from './automation/qaDecisions';
import { AutomationResponseImporter } from './automation/responseImport';
import { AutomationAgentLaunchService, LaunchAutomationAgentInput } from './automation/agentLaunch';
import { applyReviewedAutomation } from './automation/applyAutomation';
import { GoldenCaseController, SaveGoldenCaseRequest } from './automation/goldenCase';
import { ReuseAnalyzer } from '../../../core/indexing';
import { FrameworkRecoveryController } from './automation/frameworkRecovery';
import type { FrameworkRecoveryRequest } from '../../../core/automation';

/**
 * Dependencias del pipeline de automatización: preparar el paquete, resolver
 * decisiones de QA, lanzar/importar la respuesta del agente, validar,
 * aplicar sobre el framework y promocionar memoria. Es la familia más grande
 * porque el flujo completo del wizard (Evidencia → Análisis → Generación →
 * Revisión) es un solo caso de uso con muchos pasos, no varios handlers
 * independientes. Este archivo solo registra canales; cada paso vive en
 * `ipc/automation/`.
 */
export interface AutomationHandlersContext {
    state: RecorderRuntimeState;
    automationRecordingStore: AutomationRecordingStore;
    recordingCoverageAnalyzer: RecordingCoverageAnalyzer;
    automationPackageBuilder: AutomationPackageBuilder;
    automationAgentLauncher: AutomationAgentLauncher;
    agentOrchestrator: AgentOrchestrator;
    layeredGenerationOrchestrator: LayeredGenerationOrchestrator;
    deterministicGenerator: DeterministicGenerator;
    automationResponseValidator: AutomationResponseValidator;
    automationMemory: AutomationMemory;
    automationPatchWriter: AutomationPatchWriter;
    automationApplier: AutomationApplier;
    generatedFileRegistry: GeneratedFileRegistry;
    fwkMobileGenerator: FwkMobileGenerator;
    reuseAnalyzer: ReuseAnalyzer;
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
        deterministicGenerator,
        automationResponseValidator,
        automationMemory,
        automationApplier,
        generatedFileRegistry,
        reuseAnalyzer,
        syncRecording,
    } = context;

    const recovery = new FrameworkRecoveryController(context);
    ipcMain.handle('preview-framework-recovery', async (_, input?: FrameworkRecoveryRequest) => {
        try { return recovery.prepare(input); } catch (error: any) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('save-framework-recovery', async (_, token: string) => {
        try { return recovery.save(token); } catch (error: any) { return { success: false, error: error.message }; }
    });
    const emitAutomationProgress = createAutomationProgressEmitter(state);
    const responseImporter = new AutomationResponseImporter({
        automationApplier,
        state,
        automationPackageBuilder,
        automationResponseValidator,
        generatedFileRegistry,
        deterministicGenerator,
        emitProgress: emitAutomationProgress,
    });
    const launchService = new AutomationAgentLaunchService({
        state,
        automationAgentLauncher,
        agentOrchestrator,
        layeredGenerationOrchestrator,
        responseImporter,
        emitProgress: emitAutomationProgress,
    });
    const importAutomationResponseFromPackage = responseImporter.importFromPackage.bind(responseImporter);
    const rematerializeGapResolutions = responseImporter.rematerializeGapResolutions.bind(responseImporter);
    const currentModelUsage = () => launchService.currentModelUsage();
    const readPlan = (): GenerationPlan => JSON.parse(
        fs.readFileSync(path.join(state.activeAutomationPackage, 'generation-plan.json'), 'utf-8')
    ) as GenerationPlan;

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

    ipcMain.handle('get-automation-model-usage', () => currentModelUsage());

    ipcMain.handle('launch-automation-agent', async (_, input?: LaunchAutomationAgentInput) =>
        launchService.launch(input));

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
            // A recovered draft can be reviewed/exported without a complete agent-response.json.
            const rematerialized = state.automationPreview?.generationDiagnostics ? false
                : rematerializeGapResolutions(state.activeAutomationPackage);
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
            const plan = readPlan();
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
            const plan = readPlan();
            const prompts = qaDecisionPromptsFromPlan(plan, state.activeAutomationPackage);
            if (!prompts.length) throw new Error('No hay decisiones QA pendientes.');
            const qaResolutions = applyQaDecisionsToPlan(plan, prompts, input?.decisions || []);
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
    ) => applyReviewedAutomation({
        state,
        automationResponseValidator,
        generatedFileRegistry,
        automationApplier,
        automationMemory,
        emitProgress: emitAutomationProgress,
    }, previewToken, reviewedContents));

    ipcMain.handle('get-automation-memory-stats', async () => ({
        success: true,
        stats: new ApprovedGoldenStore(goldenDatasetRoot()).stats(),
    }));

    const golden = new GoldenCaseController(context);
    ipcMain.handle('preview-golden-case', async (_, input: SaveGoldenCaseRequest) => {
        try { return golden.prepare(input); } catch (error: any) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('save-golden-case', async (_, input: SaveGoldenCaseRequest) => {
        try { return golden.save(input); } catch (error: any) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('list-golden-cases', async () => {
        try { return golden.list(); } catch (error: any) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('rebuild-golden-index', async () => {
        try { return { success: true, index: new ApprovedGoldenStore(goldenDatasetRoot()).rebuildIndex() }; }
        catch (error: any) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('revoke-golden-case', async (_, input: { goldenId: string; versionHash: string }) => {
        try { return { success: true, ...new ApprovedGoldenStore(goldenDatasetRoot()).revoke(input.goldenId, input.versionHash, os.userInfo().username) }; }
        catch (error: any) { return { success: false, error: error.message }; }
    });
}
