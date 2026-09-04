/**
 * Derek: orquesta Lorem, Zorem y Sumrak.
 *
 * Esta clase solo coordina: proyecciones, decisiones sobre gaps, prompts,
 * artefactos y presupuesto viven en `./layered/`. El orden de las etapas y la
 * politica de reparacion son el contrato que se lee aqui.
 */
import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    GenerationPlan,
} from '../contracts';
import {
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
    MAX_LIVE_FEEDBACK_ROUNDS,
    PipelineCacheEntry,
    ROLE_INPUT_FILES,
    ROLE_LAYERS,
    ROLE_OUTPUTS,
    RepairIssue,
} from './layered/roles';
import {
    alignResolutionsWithPlan,
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
    actionInterfaceFingerprint,
    agentCacheRoot,
    artifact,
    memoryIdentity,
    rebindCachedResult,
    filesInside,
    normalizeAutomationResponse,
    normalizeBehaviorResult,
    pipelineCacheFile,
    pipelineFingerprint,
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

export type {
    LayeredGenerationOptions,
    LayeredGenerationResult,
    LayeredResponseValidator,
    RepairIssue,
} from './layered/roles';

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
        const startedAt = new Date().toISOString();
        const stages: LayeredGenerationStageReport[] = [];
        const agentsRoot = path.join(root, 'agents');
        fs.mkdirSync(agentsRoot, { recursive: true });
        const reportFile = path.join(root, 'layered-generation-run.json');
        const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
        fs.rmSync(ownerDirectory, { recursive: true, force: true });
        writeOwnerManifest(agentsRoot, plan, 'running');

        // El borrador acelera la comprensión del caso, pero nunca bloquea la
        // generación: paquetes históricos o incompletos siguen por el flujo
        // de agentes sin conservar un draft obsoleto de otra ejecución.
        const draftFile = path.join(root, 'deterministic-draft.json');
        try {
            this.draftBuilder.build(root);
        } catch {
            fs.rmSync(draftFile, { force: true });
        }

        let repairAttempts = 0;
        try {
            const completeFingerprint = pipelineFingerprint(root, options.model || 'auto');
            const completeCacheFile = pipelineCacheFile(completeFingerprint);
            if (!options.forceRegenerate) {
                let cachedEntry: PipelineCacheEntry | undefined;
                if (fs.existsSync(completeCacheFile)) {
                    cachedEntry = readJsonUtf8<PipelineCacheEntry>(completeCacheFile);
                } else {
                    // Migración transparente: una respuesta oficial existente y
                    // válida pertenece al mismo plan y puede sembrar el caché.
                    const existingResponseFile = path.join(root, 'agent-response.json');
                    if (fs.existsSync(existingResponseFile)) {
                        const response = readJsonUtf8<AutomationAgentResponse>(existingResponseFile);
                        if (normalizeAutomationResponse(response)) {
                            writeJsonUtf8(existingResponseFile, response);
                        }
                        const reviewFile = path.join(root, 'test-design-review.json');
                        cachedEntry = {
                            schemaVersion: 1,
                            fingerprint: completeFingerprint,
                            response,
                            testDesignReview: fs.existsSync(reviewFile)
                                ? readJsonUtf8<unknown>(reviewFile)
                                : undefined,
                        };
                    }
                }
                if (cachedEntry) {
                    rebindCachedResult(cachedEntry.response, plan);
                    normalizeAutomationResponse(cachedEntry.response);
                }
                if (cachedEntry
                    && cachedEntry.fingerprint === completeFingerprint
                    && this.isReusableResponse(root, plan, cachedEntry.response)) {
                    const responseFile = path.join(root, 'agent-response.json');
                    writeJsonUtf8(responseFile, cachedEntry.response);
                    if (cachedEntry.testDesignReview) {
                        writeJsonUtf8(path.join(root, 'test-design-review.json'), cachedEntry.testDesignReview);
                    }
                    fs.mkdirSync(path.dirname(completeCacheFile), { recursive: true });
                    writeJsonUtf8(completeCacheFile, cachedEntry);
                    for (const role of ['behavior-author', 'interaction-author', 'integration-reviewer'] as const) {
                        const stage: LayeredGenerationStageReport = {
                            role,
                            agentName: LAYERED_GENERATION_AGENTS[role].name,
                            sessionName: `${sessionName(plan.recordingId, role)}/pipeline-cache`,
                            attempt: 0,
                            state: 'completed',
                            durationMs: 0,
                            outputFile: 'agent-response.json',
                            execution: 'cache',
                            fingerprint: completeFingerprint,
                            cacheHit: true,
                            contextBytes: 0,
                            contextFiles: 0,
                            assignedLayers: [...ROLE_LAYERS[role]],
                        };
                        stages.push(stage);
                        options.onStageChange?.({ ...stage });
                    }
                    writeOwnerManifest(agentsRoot, plan, 'completed');
                    this.writeReport(reportFile, plan, startedAt, 'completed', stages, 0);
                    return { success: true, responseFile, reportFile };
                }
            }
            const behaviorCache: AuthorCacheTarget = {};
            const interactionCache: AuthorCacheTarget = {};
            const draftContract = options.parallelAuthors === false
                ? undefined
                : writeDraftBehaviorContract(root, agentsRoot, plan);
            let behavior: string;
            let interaction: string;
            if (draftContract) {
                // Zorem no depende de la prosa de Lorem, solo de la interfaz
                // screenMethod/locatorName, y esa ya la fija el borrador. Ambos
                // arrancan a la vez; si Lorem se aparta del contrato, Zorem se
                // sincroniza con el resultado real como en una reparación.
                [behavior, interaction] = await Promise.all([
                    this.runAuthor(
                        root, agentsRoot, plan, 'behavior-author', options, stages, 0,
                        undefined, [], behaviorCache,
                    ),
                    this.runAuthor(
                        root, agentsRoot, plan, 'interaction-author', options, stages, 0,
                        draftContract, [], interactionCache, 'recorder',
                    ),
                ]);
                if (actionInterfaceFingerprint(behavior) !== actionInterfaceFingerprint(draftContract)) {
                    interaction = await this.runAuthor(
                        root, agentsRoot, plan, 'interaction-author', options, stages, 0, behavior,
                        ['Lorem entregó una interfaz actionTrace distinta del contrato provisional; sincroniza únicamente los métodos afectados.'],
                        interactionCache,
                    );
                }
            } else {
                behavior = await this.runAuthor(
                    root, agentsRoot, plan, 'behavior-author', options, stages, 0,
                    undefined, [], behaviorCache,
                );
                interaction = await this.runAuthor(
                    root, agentsRoot, plan, 'interaction-author', options, stages, 0, behavior,
                    [], interactionCache,
                );
            }
            let integrationFeedback: LayeredRepairFeedback | undefined;
            while (true) {
                try {
                    const responseFile = await this.runIntegration(
                        root,
                        agentsRoot,
                        plan,
                        behavior,
                        interaction,
                        options,
                        stages,
                        repairAttempts,
                        integrationFeedback,
                        repairAttempts < MAX_LAYERED_REPAIR_ATTEMPTS,
                    );
                    // Solo una respuesta completa validada promueve sus capas.
                    // Si hubo reparación, estas rutas apuntan al resultado final.
                    promoteAuthorCache(behavior, behaviorCache);
                    promoteAuthorCache(interaction, interactionCache);
                    const response = readJsonUtf8<AutomationAgentResponse>(responseFile);
                    const reviewFile = path.join(root, 'test-design-review.json');
                    const completeEntry: PipelineCacheEntry = {
                        schemaVersion: 1,
                        fingerprint: completeFingerprint,
                        response,
                        testDesignReview: fs.existsSync(reviewFile)
                            ? readJsonUtf8<unknown>(reviewFile)
                            : undefined,
                    };
                    fs.mkdirSync(path.dirname(completeCacheFile), { recursive: true });
                    writeJsonUtf8(completeCacheFile, completeEntry);
                    writeOwnerManifest(agentsRoot, plan, 'completed');
                    this.writeReport(reportFile, plan, startedAt, 'completed', stages, repairAttempts);
                    return { success: true, responseFile, reportFile };
                } catch (error) {
                    if (!(error instanceof LayeredValidationError)
                        || repairAttempts >= MAX_LAYERED_REPAIR_ATTEMPTS) {
                        throw error;
                    }
                    repairAttempts += 1;
                    const feedback = error.feedback;
                    integrationFeedback = feedback;
                    const previousBehaviorInterface = feedback.behavior.length
                        ? actionInterfaceFingerprint(behavior)
                        : undefined;
                    if (feedback.behavior.length) {
                        behavior = await this.runAuthor(
                            root,
                            agentsRoot,
                            plan,
                            'behavior-author',
                            options,
                            stages,
                            repairAttempts,
                            undefined,
                            feedback.behavior,
                            behaviorCache,
                        );
                    }
                    const behaviorInterfaceChanged = previousBehaviorInterface !== undefined
                        && previousBehaviorInterface !== actionInterfaceFingerprint(behavior);
                    // Un ajuste de redacción Gherkin no invalida Screen/Locators.
                    // Zorem se relanza solo con feedback propio o si Lorem cambió
                    // el contrato screenMethod/locatorName que debe implementar.
                    if (feedback.interaction.length || behaviorInterfaceChanged) {
                        interaction = await this.runAuthor(
                            root,
                            agentsRoot,
                            plan,
                            'interaction-author',
                            options,
                            stages,
                            repairAttempts,
                            behavior,
                            feedback.interaction.length
                                ? feedback.interaction
                                : ['Lorem cambió la interfaz actionTrace; sincroniza únicamente los métodos afectados.'],
                            interactionCache,
                        );
                    }
                }
            }
        } catch (error: any) {
            writeOwnerManifest(agentsRoot, plan, 'failed');
            this.writeReport(reportFile, plan, startedAt, 'failed', stages, repairAttempts);
            return { success: false, reportFile, error: error?.message || String(error) };
        }
    }

    private isReusableResponse(
        packageDirectory: string,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
    ): boolean {
        if (response.recordingId !== plan.recordingId || response.planId !== plan.planId) return false;
        const expected = new Map(plan.files.map(file => [file.layer, file.path]));
        const actual = new Map((response.files || []).map(file => [file.layer, file.path]));
        if (actual.size !== expected.size) return false;
        if ([...expected].some(([layer, file]) => actual.get(layer) !== file)) return false;
        const resolved = new Set((response.resolutions || []).map(item => item.gapId));
        if ((plan.unresolvedGapIds || []).some(gapId => !resolved.has(gapId))) return false;
        const validation = this.responseValidator?.(packageDirectory, response);
        return validation ? validation.valid : true;
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
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of ROLE_INPUT_FILES[role]) {
            copyRoleInput(packageDirectory, stageDirectory, file, role, judgment);
        }
        copyRoleBaselines(packageDirectory, stageDirectory, role);
        if (dependencyFile) {
            verifyOutputHandoff(dependencyFile);
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
                artifacts: [artifact(dependencyCopy, stageDirectory)],
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
            model: options.model || 'auto',
            prompt,
            artifacts: inputArtifacts
                // Los handoffs contienen createdAt; su identidad real ya está
                // representada por el hash del resultado al que apuntan.
                .filter(item => !item.path.endsWith('-handoff.json'))
                // Identidad sin recordingId/planId/fechas: el mismo input en
                // otro recording es el mismo trabajo para el agente.
                .map(item => ({ path: item.path, sha256: memoryIdentity(path.join(stageDirectory, item.path)) })),
        });
        // El caché vive en la memoria del recorder (no en el recording): un
        // resultado verificado sirve a cualquier recording con los mismos
        // inputs, y sobrevive a que automation/ se reconstruya.
        const cacheFile = path.join(agentCacheRoot(), role, `${cacheFingerprint}.json`);
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
                const cached = readJsonUtf8<unknown>(outputFile);
                if (typeof cached === 'object' && cached !== null) {
                    rebindCachedResult(cached as { recordingId?: string; planId?: string }, plan);
                    writeJsonUtf8(outputFile, cached);
                }
                if (role === 'behavior-author'
                    && typeof cached === 'object'
                    && cached !== null
                    && normalizeBehaviorResult(cached as LayeredAgentResult)) {
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
        const repairFeedbackFile = path.join(stageDirectory, 'repair-feedback.json');
        const acceptOutput = repairErrors.length > 0
            && this.responseValidator
            ? (output: unknown): boolean => {
                const candidateErrors = authorContractErrors(output, role, plan);
                if (!candidateErrors.length) {
                    try {
                        const priorResponseFile = path.join(packageDirectory, 'agent-response.json');
                        if (fs.existsSync(priorResponseFile)) {
                            const priorResponse = readJsonUtf8<AutomationAgentResponse>(priorResponseFile);
                            const candidate = output as LayeredAgentResult;
                            const behaviorLayers = new Set(['feature', 'steps']);
                            const interactionLayers = new Set(['screen', 'locators']);
                            const files = role === 'behavior-author'
                                ? [
                                    ...candidate.files,
                                    ...priorResponse.files.filter(file => interactionLayers.has(file.layer)),
                                ]
                                : [
                                    ...(dependencyFile
                                        ? readJsonUtf8<LayeredAgentResult>(dependencyFile).files
                                        : priorResponse.files.filter(file => behaviorLayers.has(file.layer))),
                                    ...candidate.files,
                                ];
                            const provisionalResponse: AutomationAgentResponse = {
                                ...priorResponse,
                                resolutions: alignResolutionsWithPlan(
                                    packageDirectory,
                                    plan,
                                    priorResponse.resolutions,
                                ),
                                actionTrace: role === 'behavior-author'
                                    ? candidate.actionTrace
                                    : (dependencyFile
                                        ? readJsonUtf8<LayeredAgentResult>(dependencyFile).actionTrace
                                        : priorResponse.actionTrace),
                                files,
                            };
                            const validation = this.responseValidator!(packageDirectory, provisionalResponse);
                            if (!validation.valid) {
                                const classified = classifyValidationErrors(validation.errors);
                                candidateErrors.push(...classified[role === 'behavior-author'
                                    ? 'behavior'
                                    : 'interaction']);
                            }
                        }
                    } catch (error: any) {
                        candidateErrors.push(error?.message || String(error));
                    }
                }
                const errors = [...new Set(candidateErrors.filter(Boolean))];
                writeJsonUtf8(repairFeedbackFile, {
                    schemaVersion: 1,
                    owner: LAYERED_GENERATION_AGENTS.owner.name,
                    assignee: identity.name,
                    attempt,
                    status: errors.length ? 'correction-required' : 'accepted',
                    errors,
                });
                return errors.length === 0;
            }
            : undefined;
        let feedbackRound = 0;
        let totalDurationMs = 0;
        let run: Awaited<ReturnType<AgentProvider['execute']>>;
        const actualModels = new Set<string>();
        do {
            if (feedbackRound > 0 && fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            run = await this.controlledProvider.execute({
                cwd: stageDirectory,
                prompt,
                timeoutMs: budget.hangStopMs,
                model: options.model,
                agentName: identity.name,
                // Solo Zorem tiene algo que ejecutar (screen-object-contract.js
                // contra su Screen Object). Un shell abierto para Lorem seria
                // la unica via que le queda para explorar el framework.
                allowValidationScripts: role === 'interaction-author',
                sessionName: feedbackRound > 0
                    ? `${namedSession}/feedback-${feedbackRound}`
                    : namedSession,
                traceFile: './agent-execution.log',
                traceLabel: feedbackRound > 0 ? `${role}-feedback-${feedbackRound}` : role,
                stopOnValidatedOutput: {
                    outputFile: `./${ROLE_OUTPUTS[role]}`,
                    schemaFile: './result.schema.json',
                    acceptOutput,
                },
            });
            totalDurationMs += run.durationMs;
            for (const model of run.modelUsage?.actualModels || []) actualModels.add(model);
            if (!run.success || !fs.existsSync(outputFile) || !acceptOutput) break;
            const accepted = acceptOutput(readJsonUtf8<unknown>(outputFile));
            if (accepted) break;
            feedbackRound += 1;
        } while (feedbackRound <= MAX_LIVE_FEEDBACK_ROUNDS);
        report.durationMs = totalDurationMs;
        report.model = [...actualModels][0] || run.modelUsage?.requestedModel;
        report.requestedModel = run.modelUsage?.requestedModel;
        report.actualModels = [...actualModels];
        report.timedOut = Boolean(run.timedOut);
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, totalDurationMs);
        if (!run.success || !fs.existsSync(outputFile)) {
            report.state = 'failed';
            report.error = run.errorMessage || `No se generó ${ROLE_OUTPUTS[role]}.`;
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        if (acceptOutput && !acceptOutput(readJsonUtf8<unknown>(outputFile))) {
            const latestFeedback = fs.existsSync(repairFeedbackFile)
                ? readJsonUtf8<{ errors?: string[] }>(repairFeedbackFile)
                : undefined;
            report.state = 'failed';
            report.error = [
                `${identity.name} no corrigió su capa tras ${MAX_LIVE_FEEDBACK_ROUNDS + 1} rondas de feedback dirigido.`,
                ...(latestFeedback?.errors || []),
            ].join(' | ');
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        const result = readJsonUtf8<unknown>(outputFile);
        if (role === 'behavior-author'
            && typeof result === 'object'
            && result !== null
            && normalizeBehaviorResult(result as LayeredAgentResult)) {
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
                    schemaFile: './agent-response.schema.json',
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
        const proposedResponse = readJsonUtf8<AutomationAgentResponse>(outputFile);
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
        fs.copyFileSync(outputFile, finalResponse);
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
            fileContractErrors.push(...officialValidation.errors.map(error => ({ code: error.code, message: error.message })));
        }
        if (fileContractErrors.length) {
            report.state = allowRepair ? 'repairing' : 'failed';
            report.error = fileContractErrors.map(issue => issue.message).join(' | ');
            options.onStageChange?.({ ...report });
            throw new LayeredValidationError(classifyValidationErrors(fileContractErrors));
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
            stages,
            repairAttempts,
            startedAt,
            completedAt: new Date().toISOString(),
        } satisfies LayeredGenerationRunReport);
    }
}
