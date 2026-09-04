import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import {
    AutomationAgentLauncher,
    DEFAULT_AGENT_EXECUTION_MODE,
    AgentExecutionMode,
    AgentRunStore,
    AgentOrchestrator,
    LayeredGenerationOrchestrator,
    resolveAgentExecutionMode,
    QaRoastGenerationService,
    TestDesignReview,
    normalizeAgentModel,
    CopilotModelEvents,
} from '../../../../core/automation';
import { readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
import { RecorderRuntimeState } from '../runtimeState';
import { AutomationProgressEmitter, ProductStage } from './progress';
import { AutomationResponseImporter } from './responseImport';

export interface LaunchAutomationAgentInput {
    mode?: string;
    autorun?: boolean;
    qaRoastMode?: boolean;
    model?: string;
    pipeline?: 'layered' | 'deterministic';
}

export interface AutomationAgentLaunchDependencies {
    state: RecorderRuntimeState;
    automationAgentLauncher: AutomationAgentLauncher;
    agentOrchestrator: AgentOrchestrator;
    layeredGenerationOrchestrator: LayeredGenerationOrchestrator;
    qaRoastGenerator: QaRoastGenerationService;
    responseImporter: AutomationResponseImporter;
    emitProgress: AutomationProgressEmitter;
}

interface ManualModelSession {
    packageDirectory: string;
    runId?: string;
    sessionId: string;
    model: string;
    events: CopilotModelEvents;
}

/**
 * Lanza el agente sobre el paquete activo: modo `manual` (Terminal con
 * handoff), pipeline por capas (Derek → Lorem ∥ Zorem → Sumrak) o pipeline
 * determinista (AgentOrchestrator), y traduce cada etapa a las fases de
 * producto que muestra el wizard. Conserva la sesión manual para atribuir
 * el modelo real usado en correcciones manuales.
 */
export class AutomationAgentLaunchService {
    private manualModelSession: ManualModelSession | null = null;

    constructor(private readonly deps: AutomationAgentLaunchDependencies) {}

    currentModelUsage() {
        const { state } = this.deps;
        if (!state.activeAutomationPackage) return null;
        const store = new AgentRunStore(state.activeAutomationPackage);
        const run = store.read();
        if (this.manualModelSession?.packageDirectory === state.activeAutomationPackage
            && this.manualModelSession.runId === run?.runId) {
            const usage = {
                requestedModel: this.manualModelSession.model,
                actualModels: this.manualModelSession.events.read(),
            };
            store.recordModelUsage('manual-correction', usage, this.manualModelSession.sessionId);
            return usage;
        }
        return run?.agentModelUsage || null;
    }

    async launch(input?: LaunchAutomationAgentInput): Promise<Record<string, any>> {
        const {
            state,
            automationAgentLauncher,
            agentOrchestrator,
            layeredGenerationOrchestrator,
            qaRoastGenerator,
            responseImporter,
            emitProgress: emitAutomationProgress,
        } = this.deps;
        const importAutomationResponseFromPackage = responseImporter.importFromPackage.bind(responseImporter);
        const currentModelUsage = () => this.currentModelUsage();
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
                    this.manualModelSession = {
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
            this.manualModelSession = null;
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
                            const acceleratedDetail = stage.execution === 'cache'
                                ? `${stage.agentName} reutilizó una salida verificada: los inputs no cambiaron.`
                                : stage.execution === 'deterministic'
                                    ? 'Derek ensambló y validó las capas sin otra llamada a Copilot.'
                                    : undefined;
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
                                    detail: stage.error || acceleratedDetail || progress.detail,
                                    role: stage.role,
                                    agentName: stage.agentName,
                                    sessionName: stage.sessionName,
                                    roleState: stage.state,
                                    execution: stage.execution,
                                    cacheHit: stage.cacheHit,
                                    contextBytes: stage.contextBytes,
                                    contextFiles: stage.contextFiles,
                                    evidenceBytes: stage.evidenceBytes,
                                    budgetWarnings: stage.budgetWarnings,
                                    timedOut: stage.timedOut,
                                    assignedLayers: stage.assignedLayers,
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
                            contextBytes?: number;
                            contextFiles?: number;
                            assignedLayers?: string[];
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
    }
}
