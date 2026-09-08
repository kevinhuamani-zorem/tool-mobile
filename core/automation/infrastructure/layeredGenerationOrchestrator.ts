import { AutomationHistoryStore } from './automationHistoryStore';
import { AgentRunStore } from './agentRunStore';
/**
 * Derek: orquesta Lorem, Zorem y Sumrak.
 *
 * Esta clase solo coordina: proyecciones, decisiones sobre gaps, prompts,
 * artefactos y presupuesto viven en `./layered/`. El orden de las etapas y la
 * politica de reparacion son el contrato que se lee aqui.
 */
import fs from 'fs';
import path from 'path';
import { DEFAULT_AGENT_MODEL } from '../domain/agentModel';
import {
    AutomationAgentResponse,
    GenerationPlan,
} from '../contracts';
import { writeInteractionTools } from './layered/checkScript';
import {
    LayeredDraftReport,
    GenerationAgentRole,
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    LayeredGenerationRunReport,
    LayeredGenerationStageReport,
    layeredResultSchema,
} from '../domain/layeredGenerationContracts';
import type {
    AgentProvider,
} from '../ports/agentProvider';
import {
    readJsonUtf8,
    writeJsonUtf8,
} from '../../shared';
import {
    DeterministicDraftBuilder,
} from '../../generation';
import {
    AuthorCacheTarget,
    AuthorRole,
    DELEGATES,
    INPUT_FILES,
    INTEGRATION_INPUT_FILES,
    LAYERED_CACHE_SCHEMA_VERSION,
    LayeredGenerationOptions,
    LayeredGenerationResult,
    LayeredRepairFeedback,
    LayeredResponseValidator,
    LayeredValidationError,
    MAX_LAYERED_REPAIR_ATTEMPTS,
    ROLE_INPUT_FILES,
    ROLE_LAYERS,
    ROLE_OUTPUTS,
    RepairIssue,
} from './layered/roles';
import {
    classifyValidationErrors,
    expectedGapDecisions,
    gapJudgment,
} from './layered/gapJudgment';
import {
    copyIfPresent,
    copyRoleBaselines,
    copyRoleInput,
} from './layered/projections';
import {
    authorContractErrors,
    integrationPrompt,
    partialPrompt,
    writeAgentProfile,
} from './layered/prompts';
import {
    AuthoringNeeds,
    authoringNeeds,
    designReviewErrors,
    designReviewPrompt,
    designReviewSchema,
    inheritedDesignReview,
    writeDeterministicAuthorResult,
} from './layered/memoryReuse';
import {
    actionInterfaceFingerprint,
    agentCacheRoot,
    artifact,
    memoryIdentity,
    rebindCachedResult,
    filesInside,
    normalizeAuthorResult,
    promoteAuthorCache,
    sessionName,
    stableFingerprint,
    verifyOutputHandoff,
    writeDraftBehaviorContract,
    writeHandoff,
    writeOwnerManifest,
} from './layered/artifacts';
import {
    budgetWarnings,
    stageBudget,
    stageContextBytes,
} from './layered/budget';
import { buildScreenApi, validateScreenApi } from './layered/screenApi';
import { assertLayeredEnvelope, readLayeredOutput } from './layered/outputEnvelope';
import { RecoverableDraftStore } from './layered/recoverableDraft';

export type {
    LayeredGenerationOptions,
    LayeredGenerationResult,
    LayeredResponseValidator,
    RepairIssue,
} from './layered/roles';

function scenarioNaming(packageDirectory: string) {
    try {
        const scenario = readJsonUtf8<{ actions?: Array<{ sequence: number; action: string }>; request?: { caseId?: string; pathType?: string; scenarioRows?: Array<{ status: string; text: string }> } }>(
            path.join(packageDirectory, 'scenario.json'),
        );
        if (!scenario.request?.caseId || !scenario.request?.pathType) return undefined;
        return { caseId: scenario.request.caseId, pathType: scenario.request.pathType,
            actions: scenario.actions,
            reusedStepTexts: scenario.request.scenarioRows?.filter(row => row.status === 'reused').map(row => row.text),
        };
    } catch {
        return undefined;
    }
}

export class LayeredGenerationOrchestrator {
    constructor(
        private readonly controlledProvider: AgentProvider,
        private readonly reviewProvider: AgentProvider = controlledProvider,
        private readonly responseValidator?: LayeredResponseValidator,
        private readonly draftBuilder = new DeterministicDraftBuilder(),
    ) {}

    async run(packageDirectory: string, options: LayeredGenerationOptions = {}): Promise<LayeredGenerationResult> {
        const root = path.resolve(packageDirectory);
        const plan = readJsonUtf8<GenerationPlan>(path.join(root, 'generation-plan.json'));
        const history = new AutomationHistoryStore(root);
        const caseId = readJsonUtf8<{ request?: { caseId?: string } }>(path.join(root, 'scenario.json')).request?.caseId;
        history.ensureRevision(plan.recordingId, caseId);
        history.checkpoint('before-layered-execution');
        new AgentRunStore(root).claimExecution(plan.recordingId, plan.planId);
        for (const name of ['agent-response.json', 'layered-draft.json', 'test-design-review.json']) {
            fs.rmSync(path.join(root, name), { force: true });
        }
        const startedAt = new Date().toISOString();
        const stages: LayeredGenerationStageReport[] = [];
        const agentsRoot = path.join(root, 'agents');
        fs.mkdirSync(agentsRoot, { recursive: true });
        const reportFile = path.join(root, 'layered-generation-run.json');
        const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
        fs.rmSync(ownerDirectory, { recursive: true, force: true });

        // El borrador acelera la comprensión del caso, pero nunca bloquea la
        // generación: paquetes históricos o incompletos siguen por el flujo
        // de agentes sin conservar un draft obsoleto de otra ejecución. Lo que
        // sí bloquea es no saber por qué faltó: sin borrador no hay contrato
        // paralelo ni helper de aserciones para Zorem, y el QA solo veía
        // "Zorem tarda" (TC-10239). El motivo se registra y se avisa.
        const draftFile = path.join(root, 'deterministic-draft.json');
        let draft: LayeredDraftReport = { available: true };
        try {
            this.draftBuilder.build(root);
        } catch (error: any) {
            fs.rmSync(draftFile, { force: true });
            draft = { available: false, reason: error?.message || String(error) };
            options.onDraftUnavailable?.(draft.reason!);
        }
        writeOwnerManifest(agentsRoot, plan, 'running', draft);

        // A new QA request owns two passes. No helper/session may open another.
        let repairAttempts = 0;
        const recoverable = new RecoverableDraftStore(root, plan);
        recoverable.capture(draftFile, 'deterministic');
        const claims = new Set<string>();
        const claim = (role: GenerationAgentRole, attempt: number) => {
            const key = `${attempt}:${role}`;
            if (attempt > MAX_LAYERED_REPAIR_ATTEMPTS || claims.has(key)) throw new Error(`Se agotó la pasada ${attempt + 1} para ${role}.`);
            claims.add(key);
        };
        const emptyFeedback = (): LayeredRepairFeedback => ({ all: [], behavior: [], interaction: [], integration: [] });
        const finishFeedback = (next: LayeredRepairFeedback, attempt: number) => {
            for (const [role, key] of [['behavior-author', 'behavior'], ['interaction-author', 'interaction']] as const) {
                const file = path.join(agentsRoot, LAYERED_GENERATION_AGENTS[role].directory, 'repair-feedback.json');
                if (fs.existsSync(file)) writeJsonUtf8(file, {
                    schemaVersion: 1, owner: 'Derek', assignee: LAYERED_GENERATION_AGENTS[role].name,
                    attempt, status: next[key].length ? 'requires-qa' : 'accepted', errors: next[key],
                });
            }
        };
        let feedback = emptyFeedback();
        let behavior: string | undefined;
        let interaction: string | undefined;
        const behaviorCache: AuthorCacheTarget = {};
        const interactionCache: AuthorCacheTarget = {};
        try {
            const draftContract = options.parallelAuthors === false ? undefined : writeDraftBehaviorContract(root, agentsRoot, plan);
            const needs = authoringNeeds(root, plan, options);
            let designReviewFailed = false;
            if (needs.interaction === 'deterministic') {
                interaction = writeDeterministicAuthorResult(root, agentsRoot, plan, 'interaction-author', needs.memoryCases);
                this.pushDeterministicStage(stages, plan, 'interaction-author', needs, options);
                behavior = writeDeterministicAuthorResult(root, agentsRoot, plan, 'behavior-author', needs.memoryCases);
                recoverable.capture(interaction, 'deterministic', 'interaction-author');
                recoverable.capture(behavior, 'deterministic', 'behavior-author');
                if (needs.behavior === 'deterministic') {
                    writeJsonUtf8(path.join(root, 'test-design-review.json'), inheritedDesignReview(needs.memoryCases));
                    this.pushDeterministicStage(stages, plan, 'behavior-author', needs, options);
                } else {
                    claim('behavior-author', 0);
                    try { await this.runDesignReview(root, agentsRoot, plan, options, stages, needs.memoryCases); }
                    catch (error: any) {
                        designReviewFailed = true;
                        behavior = interaction = undefined;
                        feedback = { all: [error.message], behavior: [error.message], interaction: [error.message], integration: [] };
                    }
                }
            }
            for (let attempt = 0; attempt <= MAX_LAYERED_REPAIR_ATTEMPTS; attempt++) {
                repairAttempts = attempt;
                // A failed design review already consumed Lorem's first pass.
                if (attempt === 0 && designReviewFailed) continue;
                const next = emptyFeedback();
                const owned = async (role: AuthorRole, dependency?: string, origin: 'behavior-author' | 'recorder' = 'behavior-author') => {
                    claim(role, attempt);
                    const key = role === 'behavior-author' ? 'behavior' : 'interaction';
                    try {
                        return await this.runAuthor(root, agentsRoot, plan, role, options, stages, attempt,
                            dependency, feedback[key], role === 'behavior-author' ? behaviorCache : interactionCache, origin);
                    } catch (error: any) {
                        const message = `[author-output] ${LAYERED_GENERATION_AGENTS[role].name}: ${error?.message || error}`;
                        next[key].push(message); next.all.push(message);
                        const stage = stages.filter(item => item.role === role && item.attempt === attempt).at(-1);
                        if (stage) { stage.state = 'failed'; stage.error = message; options.onStageChange?.({ ...stage }); }
                        return undefined;
                    } finally {
                        recoverable.capture(path.join(agentsRoot, LAYERED_GENERATION_AGENTS[role].directory, ROLE_OUTPUTS[role]), 'agent', role, attempt === 0 ? 1 : 2);
                    }
                };
                const needsBehavior = !behavior || feedback.behavior.length > 0;
                let needsInteraction = !interaction || feedback.interaction.length > 0;
                if (attempt === 0 && draftContract && needsBehavior && needsInteraction) {
                    // Await both failures too, so the slower author is never discarded.
                    const settled = await Promise.allSettled([
                        owned('behavior-author'), owned('interaction-author', draftContract, 'recorder'),
                    ]);
                    behavior = settled[0].status === 'fulfilled' ? settled[0].value : undefined;
                    interaction = settled[1].status === 'fulfilled' ? settled[1].value : undefined;
                    if (behavior && actionInterfaceFingerprint(behavior) !== actionInterfaceFingerprint(draftContract)) {
                        const message = '[screen-api] Lorem cambió la interfaz provisional; Zorem debe implementar los métodos y firmas entregados.';
                        next.interaction.push(message); next.all.push(message);
                    }
                } else {
                    const previousInterface = behavior ? actionInterfaceFingerprint(behavior) : undefined;
                    if (needsBehavior) behavior = await owned('behavior-author');
                    if (behavior && needsBehavior && interaction && previousInterface !== actionInterfaceFingerprint(behavior)) {
                        needsInteraction = true;
                        feedback.interaction.push('[screen-api] Lorem cambió la interfaz; implementa los métodos y firmas entregados.');
                    }
                    if (needsInteraction) interaction = await owned('interaction-author', behavior);
                }
                if (behavior && interaction) {
                    try {
                        claim('integration-reviewer', attempt);
                        const responseFile = await this.runIntegration(root, agentsRoot, plan, behavior, interaction,
                            options, stages, attempt, attempt > 0 ? feedback : undefined, attempt < MAX_LAYERED_REPAIR_ATTEMPTS);
                        if (!next.all.length) {
                            finishFeedback(next, attempt);
                            promoteAuthorCache(behavior, behaviorCache);
                            promoteAuthorCache(interaction, interactionCache);
                            writeOwnerManifest(agentsRoot, plan, 'completed', draft);
                            this.writeReport(reportFile, plan, startedAt, 'completed', stages, repairAttempts, draft);
                            return { success: true, responseFile, reportFile };
                        }
                    } catch (error: any) {
                        const issues = error instanceof LayeredValidationError ? error.feedback
                            : { all: [error?.message || String(error)], behavior: [], interaction: [], integration: [error?.message || String(error)] };
                        for (const key of ['all', 'behavior', 'interaction', 'integration'] as const) next[key].push(...issues[key]);
                        const stage = stages.filter(item => item.role === 'integration-reviewer' && item.attempt === attempt).at(-1);
                        if (stage) { stage.state = attempt === 0 ? 'repairing' : 'failed'; stage.error = issues.all.join(' | '); options.onStageChange?.({ ...stage }); }
                    }
                }
                feedback = next;
                if (attempt === MAX_LAYERED_REPAIR_ATTEMPTS) finishFeedback(next, attempt);
            }
            throw new Error(`Finalizaron las dos pasadas automáticas. ${feedback.all.join(' | ')}`);
        } catch (error: any) {
            const errorMessage = error?.message || String(error);
            const recoveredDraft = recoverable.save([errorMessage]);
            writeOwnerManifest(agentsRoot, plan, 'failed', draft);
            this.writeReport(reportFile, plan, startedAt, 'failed', stages, repairAttempts, draft);
            return { success: false, reportFile, error: errorMessage, draft: recoveredDraft };
        }
    }

    private pushDeterministicStage(
        stages: LayeredGenerationStageReport[],
        plan: GenerationPlan,
        role: AuthorRole,
        needs: AuthoringNeeds,
        options: LayeredGenerationOptions,
    ): void {
        const identity = LAYERED_GENERATION_AGENTS[role];
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: `${sessionName(plan.recordingId, role)}/framework`,
            attempt: 0,
            state: 'completed',
            durationMs: 0,
            outputFile: `agents/${identity.directory}/${ROLE_OUTPUTS[role]}`,
            execution: 'deterministic',
            cacheHit: false,
            contextBytes: 0,
            contextFiles: 0,
            assignedLayers: [...ROLE_LAYERS[role]],
            budgetWarnings: [],
        };
        stages.push(report);
        options.onStageChange?.({ ...report, error: undefined });
        void needs;
    }

    /**
     * Lorem en modo revisión: Feature y Steps ya están materializados desde
     * reutilización del framework; solo evalúa el diseño de ESTE caso (objetivo y
     * criterio contra lo grabado) con un contexto mínimo. El resultado se
     * conserva únicamente en esta ejecución.
     */
    private async runDesignReview(
        packageDirectory: string,
        agentsRoot: string,
        plan: GenerationPlan,
        options: LayeredGenerationOptions,
        stages: LayeredGenerationStageReport[],
        memoryCases: string[],
    ): Promise<void> {
        const role: AuthorRole = 'behavior-author';
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of ['scenario.json', 'generation-plan.json']) {
            copyRoleInput(packageDirectory, stageDirectory, file, role, judgment);
        }
        const prompt = designReviewPrompt(memoryCases);
        fs.writeFileSync(path.join(stageDirectory, 'agent-task.md'), prompt, 'utf8');
        writeJsonUtf8(path.join(stageDirectory, 'result.schema.json'), designReviewSchema());
        writeAgentProfile(stageDirectory, role, prompt);
        const inputs = ['scenario.json', 'generation-plan.json', 'behavior-result.json']
            .map(file => path.join(stageDirectory, file))
            .filter(file => fs.existsSync(file));
        const inputArtifacts = inputs.map(file => artifact(file, stageDirectory));
        const cacheFingerprint = stableFingerprint({
            schemaVersion: LAYERED_CACHE_SCHEMA_VERSION,
            role: 'design-review',
            model: options.model || DEFAULT_AGENT_MODEL,
            prompt,
            artifacts: inputs.map(file => ({
                path: path.relative(stageDirectory, file),
                sha256: memoryIdentity(file),
            })),
        });
        const cacheFile = path.join(agentCacheRoot(packageDirectory), 'design-review', `${cacheFingerprint}.json`);
        const outputFile = path.join(stageDirectory, 'test-design-review.json');
        const namedSession = `${sessionName(plan.recordingId, role)}/design-review`;
        const budget = stageBudget(plan, options);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt: 0,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
            execution: 'design-review',
            fingerprint: cacheFingerprint,
            cacheHit: false,
            contextBytes: stageContextBytes(stageDirectory),
            contextFiles: inputArtifacts.length,
            evidenceBytes: inputArtifacts.reduce((total, item) => total + item.bytes, 0),
            assignedLayers: [],
            budget,
        };
        stages.push(report);
        options.onStageChange?.({ ...report });
        const accept = (review: unknown): boolean => {
            const errors = designReviewErrors(review);
            if (errors.length) return false;
            writeJsonUtf8(path.join(packageDirectory, 'test-design-review.json'), { ...(review as object), source: 'agent' });
            return true;
        };
        if (fs.existsSync(cacheFile)) {
            try {
                const cached = readJsonUtf8<unknown>(cacheFile);
                if (accept(cached)) {
                    writeJsonUtf8(outputFile, cached);
                    report.state = 'completed';
                    report.execution = 'cache';
                    report.cacheHit = true;
                    options.onStageChange?.({ ...report });
                    return;
                }
            } catch {
                // Un caché ilegible se ignora y se vuelve a revisar.
            }
        }
        const run = await this.controlledProvider.execute({
            cwd: stageDirectory,
            prompt,
            timeoutMs: budget.hangStopMs,
            model: options.model,
            agentName: identity.name,
            allowValidationScripts: false,
            sessionName: namedSession,
            traceFile: './agent-execution.log',
            traceLabel: 'design-review',
            stopOnValidatedOutput: {
                outputFile: './test-design-review.json',
                schemaFile: './result.schema.json', stopAfterFirstOutput: true,
            },
        });
        report.durationMs = run.durationMs;
        report.model = run.modelUsage?.actualModels?.[0] || run.modelUsage?.requestedModel;
        report.requestedModel = run.modelUsage?.requestedModel;
        report.actualModels = run.modelUsage?.actualModels || [];
        report.timedOut = Boolean(run.timedOut);
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, run.durationMs);
        new AutomationHistoryStore(packageDirectory).captureFile(outputFile, 'agent', 'design-review:provider-output', 1);
        const review = run.success && fs.existsSync(outputFile) ? readLayeredOutput(outputFile) : undefined;
        if (!review || !accept(review)) {
            report.state = 'failed';
            report.error = run.errorMessage
                || (review ? designReviewErrors(review).join(' | ') : 'No se generó test-design-review.json.');
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        writeJsonUtf8(cacheFile, review);
        report.state = 'completed';
        options.onStageChange?.({ ...report });
    }

    private async runAuthor(
        packageDirectory: string,
        agentsRoot: string,
        plan: GenerationPlan,
        role: AuthorRole,
        options: LayeredGenerationOptions,
        stages: LayeredGenerationStageReport[],
        attempt = 0,
        dependencyFile?: string,
        repairErrors: string[] = [],
        cacheTarget: AuthorCacheTarget = {},
        dependencyOrigin: 'behavior-author' | 'recorder' = 'behavior-author',
    ): Promise<string> {
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        new AutomationHistoryStore(packageDirectory).captureFile(path.join(stageDirectory, ROLE_OUTPUTS[role]), 'agent', `${role}:before-stage-reset`, attempt === 0 ? 1 : 2);
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of ROLE_INPUT_FILES[role]) {
            copyRoleInput(packageDirectory, stageDirectory, file, role, judgment);
        }
        copyRoleBaselines(packageDirectory, stageDirectory, role);
        // Herramientas del autor (no evidencia): el verificador local con el
        // que Zorem comprueba su Screen Object sin buscar tsc ni node_modules.
        if (role === 'interaction-author') writeInteractionTools(packageDirectory, stageDirectory);
        const apiSource = dependencyFile || path.join(packageDirectory, 'deterministic-draft.json');
        const screenApiFile = path.join(stageDirectory, 'screen-api.json');
        if (fs.existsSync(apiSource)) {
            if (dependencyFile) verifyOutputHandoff(dependencyFile);
            writeJsonUtf8(screenApiFile, buildScreenApi(readJsonUtf8<LayeredAgentResult>(apiSource)));
        }
        if (dependencyFile) {
            const dependencyCopy = path.join(stageDirectory, path.basename(dependencyFile));
            fs.copyFileSync(dependencyFile, dependencyCopy);
            writeHandoff(path.join(stageDirectory, 'lorem-handoff.json'), {
                from: dependencyOrigin,
                to: 'interaction-author',
                fromAgent: dependencyOrigin === 'recorder'
                    ? LAYERED_GENERATION_AGENTS.owner.name
                    : LAYERED_GENERATION_AGENTS['behavior-author'].name,
                toAgent: identity.name,
                recordingId: plan.recordingId,
                planId: plan.planId,
                stage: dependencyOrigin === 'recorder' ? 'draft-contract-to-interaction' : 'behavior-to-interaction',
                status: 'ready',
                artifacts: [artifact(dependencyCopy, stageDirectory), artifact(screenApiFile, stageDirectory)],
                instructions: [dependencyOrigin === 'recorder'
                    ? 'Implementar exactamente los screenMethod del contrato provisional de Derek; Lorem redacta en paralelo sobre esa misma interfaz.'
                    : 'Implementar exactamente los screenMethod requeridos por Lorem.'],
            });
        }
        if (repairErrors.length) {
            writeJsonUtf8(path.join(stageDirectory, 'repair-feedback.json'), {
                schemaVersion: 1,
                owner: LAYERED_GENERATION_AGENTS.owner.name,
                assignee: identity.name,
                attempt,
                status: 'awaiting-output',
                errors: repairErrors,
            });
        }
        const inputArtifacts = [
            ...ROLE_INPUT_FILES[role]
            .map(file => path.join(stageDirectory, file))
            .filter(file => fs.existsSync(file)),
            ...filesInside(path.join(stageDirectory, 'baselines')),
            ...(fs.existsSync(screenApiFile) ? [screenApiFile] : []),
            ...(dependencyFile ? [path.join(stageDirectory, path.basename(dependencyFile))] : []),
            ...(dependencyFile ? [path.join(stageDirectory, 'lorem-handoff.json')] : []),
            ...(repairErrors.length ? [path.join(stageDirectory, 'repair-feedback.json')] : []),
        ]
            .map(file => artifact(file, stageDirectory));
        const contextBytes = inputArtifacts.reduce((total, item) => total + item.bytes, 0);
        const originalContextBytes = INPUT_FILES
            .map(file => path.join(packageDirectory, file))
            .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
            .reduce((total, file) => total + fs.statSync(file).size, 0)
            + filesInside(path.join(packageDirectory, 'baselines'))
                .reduce((total, file) => total + fs.statSync(file).size, 0);
        writeJsonUtf8(path.join(stageDirectory, 'agent-memory.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            agent: LAYERED_GENERATION_AGENTS[role].name,
            role,
            ownership: {
                layers: ROLE_LAYERS[role],
                mayReadOtherAgentOutput: role === 'interaction-author',
                mayWriteOutsideOwnedLayers: false,
            },
            context: {
                files: inputArtifacts.length,
                bytes: contextBytes,
                sourceBytes: originalContextBytes,
                savedBytes: Math.max(0, originalContextBytes - contextBytes),
            },
            artifacts: inputArtifacts.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes })),
        });
        writeJsonUtf8(path.join(stageDirectory, 'input-manifest.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            role,
            artifacts: inputArtifacts,
        });
        writeJsonUtf8(path.join(stageDirectory, 'result.schema.json'), layeredResultSchema(role));
        const prompt = partialPrompt(role, ROLE_OUTPUTS[role], repairErrors.length > 0);
        fs.writeFileSync(path.join(stageDirectory, 'agent-task.md'), prompt, 'utf8');
        writeAgentProfile(stageDirectory, role, prompt);
        writeHandoff(path.join(stageDirectory, 'input-handoff.json'), {
            from: 'recorder',
            to: role,
            fromAgent: LAYERED_GENERATION_AGENTS.owner.name,
            toAgent: identity.name,
            recordingId: plan.recordingId,
            planId: plan.planId,
            stage: role,
            status: 'ready',
            artifacts: inputArtifacts,
            instructions: [`Produce ${ROLE_OUTPUTS[role]} sin salir de esta carpeta.`],
        });
        const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
        const namedSession = sessionName(plan.recordingId, role, attempt);
        const cacheFingerprint = stableFingerprint({
            schemaVersion: LAYERED_CACHE_SCHEMA_VERSION,
            role,
            model: options.model || DEFAULT_AGENT_MODEL,
            prompt,
            artifacts: inputArtifacts
                // Los handoffs contienen createdAt; su identidad real ya está
                // representada por el hash del resultado al que apuntan.
                .filter(item => !item.path.endsWith('-handoff.json'))
                // Identidad sin recordingId/planId/fechas: el mismo input en
                // otro recording es el mismo trabajo para el agente.
                .map(item => ({ path: item.path, sha256: memoryIdentity(path.join(stageDirectory, item.path)) })),
        });
        // El caché pertenece exclusivamente a esta ejecución; nunca recupera
        // propuestas de otro intento sin aprobación del QA.
        const cacheFile = path.join(agentCacheRoot(packageDirectory), role, `${cacheFingerprint}.json`);
        if (attempt === 0 && repairErrors.length === 0) cacheTarget.file = cacheFile;
        const budget = stageBudget(plan, options);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
            execution: 'agent',
            fingerprint: cacheFingerprint,
            cacheHit: false,
            contextBytes: stageContextBytes(stageDirectory),
            contextFiles: inputArtifacts.length,
            evidenceBytes: contextBytes,
            assignedLayers: [...ROLE_LAYERS[role]],
            budget,
        };
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!);
        stages.push(report);
        options.onStageChange?.({ ...report });
        if (attempt === 0 && repairErrors.length === 0 && fs.existsSync(cacheFile)) {
            try {
                fs.copyFileSync(cacheFile, outputFile);
                const cached = readLayeredOutput(outputFile);
                assertLayeredEnvelope(cached);
                if (typeof cached === 'object' && cached !== null) {
                    rebindCachedResult(cached as { recordingId?: string; planId?: string }, plan);
                    normalizeAuthorResult(cached as LayeredAgentResult, role, plan, scenarioNaming(packageDirectory));
                    writeJsonUtf8(outputFile, cached);
                }
                const cacheErrors = authorContractErrors(cached, role, plan);
                if (!cacheErrors.length) {
                    const typedCached = cached as LayeredAgentResult;
                    if (role === 'behavior-author' && typedCached.testDesignReview) {
                        writeJsonUtf8(path.join(packageDirectory, 'test-design-review.json'), typedCached.testDesignReview);
                    }
                    report.state = 'completed';
                    report.execution = 'cache';
                    report.cacheHit = true;
                    options.onStageChange?.({ ...report });
                    writeHandoff(path.join(stageDirectory, 'output-handoff.json'), {
                        from: role,
                        to: 'integration-reviewer',
                        fromAgent: identity.name,
                        toAgent: LAYERED_GENERATION_AGENTS['integration-reviewer'].name,
                        recordingId: plan.recordingId,
                        planId: plan.planId,
                        stage: role,
                        status: 'completed',
                        artifacts: [artifact(outputFile, stageDirectory)],
                        instructions: ['Resultado incremental reutilizado por fingerprint verificado.'],
                    });
                    return outputFile;
                }
                fs.unlinkSync(outputFile);
            } catch {
                try { fs.unlinkSync(outputFile); } catch {}
            }
        }
        // One materialized delivery per pass. Validation happens after the session
        // closes; a rejection is routed by the outer loop to the second pass.
        const run = await this.controlledProvider.execute({
            cwd: stageDirectory, prompt, timeoutMs: budget.hangStopMs, model: options.model,
            agentName: identity.name, allowValidationScripts: role === 'interaction-author',
            sessionName: namedSession, traceFile: './agent-execution.log', traceLabel: role,
            stopOnValidatedOutput: {
                outputFile: `./${ROLE_OUTPUTS[role]}`, schemaFile: './result.schema.json', stopAfterFirstOutput: true,
            },
        });
        report.durationMs = run.durationMs;
        report.model = run.modelUsage?.actualModels?.[0] || run.modelUsage?.requestedModel;
        report.requestedModel = run.modelUsage?.requestedModel;
        report.actualModels = run.modelUsage?.actualModels || [];
        report.timedOut = Boolean(run.timedOut);
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, run.durationMs);
        new AutomationHistoryStore(packageDirectory).captureFile(outputFile, 'agent', `${role}:provider-output`, attempt === 0 ? 1 : 2);
        if (!run.success || !fs.existsSync(outputFile)) {
            report.state = 'failed';
            report.error = run.errorMessage || `No se generó ${ROLE_OUTPUTS[role]}.`;
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        new AutomationHistoryStore(packageDirectory).captureFile(outputFile, 'agent', `${role}:before-normalization`, attempt === 0 ? 1 : 2);
        const result = readLayeredOutput(outputFile);
        assertLayeredEnvelope(result);
        // Derek corrige lo mecanico antes de juzgar: sobre del contrato,
        // campos de mas en actionTrace, keywords e import del Screen Object.
        if (typeof result === 'object' && result !== null
            && normalizeAuthorResult(result as LayeredAgentResult, role, plan, scenarioNaming(packageDirectory))) {
            writeJsonUtf8(outputFile, result);
        }
        const errors = authorContractErrors(result, role, plan);
        if (errors.length) {
            report.state = 'failed';
            report.error = errors.join(' | ');
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        const typedResult = result as LayeredAgentResult;
        if (role === 'behavior-author' && typedResult.testDesignReview) {
            writeJsonUtf8(
                path.join(packageDirectory, 'test-design-review.json'),
                typedResult.testDesignReview,
            );
        }
        report.state = 'completed';
        options.onStageChange?.({ ...report });
        writeHandoff(path.join(stageDirectory, 'output-handoff.json'), {
            from: role,
            to: 'integration-reviewer',
            fromAgent: identity.name,
            toAgent: LAYERED_GENERATION_AGENTS['integration-reviewer'].name,
            recordingId: plan.recordingId,
            planId: plan.planId,
            stage: role,
            status: 'completed',
            artifacts: [artifact(outputFile, stageDirectory)],
            instructions: ['Consumir el resultado por referencia y verificar su hash antes de integrarlo.'],
        });
        return outputFile;
    }

    private async runIntegration(
        packageDirectory: string,
        agentsRoot: string,
        plan: GenerationPlan,
        behaviorFile: string,
        interactionFile: string,
        options: LayeredGenerationOptions,
        stages: LayeredGenerationStageReport[],
        attempt = 0,
        repairFeedback?: LayeredRepairFeedback,
        allowRepair = false,
    ): Promise<string> {
        const role: GenerationAgentRole = 'integration-reviewer';
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        new AutomationHistoryStore(packageDirectory).captureFile(path.join(stageDirectory, ROLE_OUTPUTS[role]), 'agent', `${role}:before-stage-reset`, attempt === 0 ? 1 : 2);
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        verifyOutputHandoff(behaviorFile);
        verifyOutputHandoff(interactionFile);
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of INTEGRATION_INPUT_FILES) {
            copyIfPresent(packageDirectory, stageDirectory, file, judgment);
        }
        for (const source of [behaviorFile, interactionFile]) {
            fs.copyFileSync(source, path.join(stageDirectory, path.basename(source)));
            fs.copyFileSync(
                path.join(path.dirname(source), 'output-handoff.json'),
                path.join(stageDirectory, `${path.basename(path.dirname(source))}-handoff.json`),
            );
        }
        writeJsonUtf8(path.join(stageDirectory, 'screen-api.json'), buildScreenApi(readJsonUtf8<LayeredAgentResult>(behaviorFile)));
        if (repairFeedback) {
            writeJsonUtf8(path.join(stageDirectory, 'integration-feedback.json'), {
                schemaVersion: 1,
                owner: LAYERED_GENERATION_AGENTS.owner.name,
                assignee: identity.name,
                attempt,
                errors: repairFeedback.integration,
                allErrors: repairFeedback.all,
            });
        }
        const prompt = integrationPrompt(Boolean(repairFeedback));
        fs.writeFileSync(path.join(stageDirectory, 'agent-task.md'), prompt, 'utf8');
        writeAgentProfile(stageDirectory, role, prompt);
        const integrationArtifacts = [
            ...INTEGRATION_INPUT_FILES.map(file => path.join(stageDirectory, file)),
            path.join(stageDirectory, path.basename(behaviorFile)),
            path.join(stageDirectory, path.basename(interactionFile)),
            path.join(stageDirectory, 'screen-api.json'),
            ...(repairFeedback ? [path.join(stageDirectory, 'integration-feedback.json')] : []),
        ].filter(file => fs.existsSync(file)).map(file => artifact(file, stageDirectory));
        const contextBytes = integrationArtifacts.reduce((total, item) => total + item.bytes, 0);
        writeJsonUtf8(path.join(stageDirectory, 'agent-memory.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            agent: identity.name,
            role,
            ownership: {
                layers: ROLE_LAYERS[role],
                mayReadOtherAgentOutput: true,
                mayWriteOutsideOwnedLayers: false,
                mayRewriteAuthorFiles: false,
            },
            context: { files: integrationArtifacts.length, bytes: contextBytes },
            artifacts: integrationArtifacts,
        });
        const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
        const namedSession = sessionName(plan.recordingId, role, attempt);
        const budget = stageBudget(plan, options);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
            execution: 'agent',
            cacheHit: false,
            contextBytes: stageContextBytes(stageDirectory),
            contextFiles: integrationArtifacts.length,
            evidenceBytes: contextBytes,
            assignedLayers: [...ROLE_LAYERS[role]],
            budget,
        };
        stages.push(report);
        options.onStageChange?.({ ...report });
        if (judgment.open.length === 0) {
            const behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile);
            const interaction = readJsonUtf8<LayeredAgentResult>(interactionFile);
            writeJsonUtf8(outputFile, {
                schemaVersion: 1,
                recordingId: plan.recordingId,
                planId: plan.planId,
                resolutions: judgment.fixed,
                actionTrace: behavior.actionTrace,
                files: [...behavior.files, ...interaction.files],
                assumptions: [
                    'Integración ensamblada por Derek: todas las decisiones abiertas estaban fijadas por el plan.',
                ],
            } satisfies AutomationAgentResponse);
            report.execution = 'deterministic';
            report.sessionName = `${namedSession}/deterministic`;
        } else {
            report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!);
            const run = await this.reviewProvider.execute({
                cwd: stageDirectory,
                prompt,
                timeoutMs: budget.hangStopMs,
                model: options.model,
                agentName: identity.name,
                allowValidationScripts: false,
                sessionName: namedSession,
                traceFile: './agent-execution.log',
                traceLabel: role,
                stopOnValidatedOutput: {
                    outputFile: './agent-response.json',
                    schemaFile: './agent-response.schema.json', stopAfterFirstOutput: true,
                },
            });
            report.durationMs = run.durationMs;
            report.model = run.modelUsage?.actualModels?.[0] || run.modelUsage?.requestedModel;
            report.requestedModel = run.modelUsage?.requestedModel;
            report.actualModels = run.modelUsage?.actualModels || [];
            report.timedOut = Boolean(run.timedOut);
            report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, run.durationMs);
            if (!run.success || !fs.existsSync(outputFile)) {
                report.state = 'failed';
                report.error = run.errorMessage || 'El integrador no generó agent-response.json.';
                options.onStageChange?.({ ...report });
                throw new Error(report.error);
            }
        }
        new AutomationHistoryStore(packageDirectory).captureFile(outputFile, report.execution === 'deterministic' ? 'recorder' : 'agent', 'integration:before-assembly', attempt === 0 ? 1 : 2);
        const proposed = readLayeredOutput(outputFile);
        assertLayeredEnvelope(proposed, true);
        const proposedResponse = proposed as AutomationAgentResponse;
        const behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile);
        const interaction = readJsonUtf8<LayeredAgentResult>(interactionFile);
        // Los autores son propietarios exclusivos del código. El integrador
        // decide resoluciones y trazabilidad, pero no puede reescribir una capa
        // ya entregada y protegida por handoff. Las resoluciones que el plan ya
        // fijó las firma Derek: Sumrak solo aporta las de los gaps abiertos.
        const fixedGapIds = new Set(judgment.fixed.map(resolution => resolution.gapId));
        const response: AutomationAgentResponse = {
            ...proposedResponse,
            resolutions: [
                ...judgment.fixed,
                ...(proposedResponse.resolutions || []).filter(resolution => !fixedGapIds.has(resolution.gapId)),
            ],
            files: [...behavior.files, ...interaction.files],
        };
        writeJsonUtf8(outputFile, response);
        if (response.recordingId !== plan.recordingId || response.planId !== plan.planId) {
            report.state = 'failed';
            report.error = 'La respuesta integrada no corresponde al recording/plan actual.';
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        // Conserva el borrador del integrador aunque la validación posterior
        // encuentre observaciones. El importador oficial decide si puede
        // aplicarse; el QA siempre puede verlo y corregirlo.
        const finalResponse = path.join(packageDirectory, 'agent-response.json');
        const history = new AutomationHistoryStore(packageDirectory);
        history.captureFile(finalResponse, 'recorder', 'integration:before-replacement');
        fs.copyFileSync(outputFile, finalResponse);
        history.captureFile(finalResponse, 'recorder', 'integration:assembled', attempt === 0 ? 1 : 2);
        const expectedFiles = new Map(plan.files.map(file => [file.layer, file.path]));
        const integratedFiles = new Map(response.files.map(file => [file.layer, file.path]));
        const fileContractErrors: RepairIssue[] = [...expectedFiles].flatMap(([layer, expectedPath]) =>
            integratedFiles.get(layer) === expectedPath
                ? []
                : [{
                    code: layer === 'feature' || layer === 'steps' ? 'behavior-path' : 'interaction-path',
                    message: `La capa ${layer} debe conservar la ruta ${expectedPath}.`,
                }]
        );
        fileContractErrors.push(...validateScreenApi(behavior, interaction));
        if (response.files.length !== integratedFiles.size) {
            fileContractErrors.push({ code: 'duplicate-layer', message: 'La respuesta integrada contiene capas duplicadas.' });
        }
        if (integratedFiles.size !== expectedFiles.size) {
            fileContractErrors.push({ code: 'missing-layer', message: 'La respuesta integrada debe contener exactamente las capas del plan.' });
        }
        const resolvedGapIds = new Set((response.resolutions || []).map(resolution => resolution.gapId));
        for (const gapId of plan.unresolvedGapIds || []) {
            if (!resolvedGapIds.has(gapId)) {
                fileContractErrors.push({ code: 'missing-gap-resolution', message: `Falta resolución para gap abierto: ${gapId}` });
            }
        }
        for (const gapId of resolvedGapIds) {
            if (!(plan.unresolvedGapIds || []).includes(gapId)) {
                fileContractErrors.push({ code: 'missing-gap-resolution', message: `Resolución no autorizada para gap inexistente: ${gapId}` });
            }
        }
        const expectedDecisions = expectedGapDecisions(packageDirectory, plan);
        for (const resolution of response.resolutions || []) {
            const expected = expectedDecisions.get(resolution.gapId);
            if (expected && resolution.decision !== expected) {
                fileContractErrors.push({
                    code: 'gap-resolution-decision',
                    message: `La resolución ${resolution.gapId} debe conservar decision ${expected} del plan; recibió ${resolution.decision}.`,
                });
            }
        }
        const officialValidation = this.responseValidator?.(packageDirectory, response);
        if (officialValidation && !officialValidation.valid) {
            fileContractErrors.push(...officialValidation.errors.map(error => ({ code: error.code, message: error.message, file: error.file })));
        }
        if (fileContractErrors.length) {
            report.state = allowRepair ? 'repairing' : 'failed';
            report.error = fileContractErrors.map(issue => issue.message).join(' | ');
            options.onStageChange?.({ ...report });
            throw new LayeredValidationError(classifyValidationErrors(fileContractErrors, plan));
        }
        report.state = 'completed';
        options.onStageChange?.({ ...report });
        return finalResponse;
    }

    private writeReport(
        reportFile: string,
        plan: GenerationPlan,
        startedAt: string,
        state: LayeredGenerationRunReport['state'],
        stages: LayeredGenerationStageReport[],
        repairAttempts: number,
        draft?: LayeredDraftReport,
    ): void {
        writeJsonUtf8(reportFile, {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            state,
            owner: {
                name: LAYERED_GENERATION_AGENTS.owner.name,
                role: LAYERED_GENERATION_AGENTS.owner.role,
                state: state === 'completed' ? 'completed' : 'failed',
                delegates: DELEGATES,
            },
            ...(draft ? { draft } : {}),
            stages,
            repairAttempts,
            startedAt,
            completedAt: new Date().toISOString(),
        } satisfies LayeredGenerationRunReport);
        const history = new AutomationHistoryStore(path.dirname(reportFile));
        const identity = history.identity();
        if (identity) history.append({ ...identity, kind: 'generation-result', origin: 'recorder', stage: 'layered-result', result: state === 'completed' ? 'passed' : 'failed' }, [
            { name: 'layered-generation-run.json', content: fs.readFileSync(reportFile) },
        ]);
        history.checkpoint('layered-finished');
    }
}
