/**
 * Pipeline determinista del AgentOrchestrator: PASS 1 de consultas planificadas
 * por el recorder (sin agente), PASS 2 semántica con Copilot que solo escribe
 * gap-resolutions.json, materialización con DeterministicGenerator y
 * validación con feedback (validation-feedback.json) hasta agotar reparaciones.
 */
import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResults,
    AgentExecutionMode,
    AgentOperationalBudgets,
    AutomationScenario,
    AutomationGapsProjection,
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    GapResolutionFile,
    GenerationPlan,
    TestDesignReview,
    agentBudgetViolations,
} from '../../contracts';
import { FrameworkQueryService } from '../../../workspace';
import { GapQueryPolicy } from '../gapQueryPolicy';
import { AgentProvider } from '../../ports/agentProvider';
import {
    emptyQueryResults,
    parseAgentContextQueryRequests,
} from '../../domain/agentQueryContracts';
import { buildPassContext } from '../agentContextEnvelope';
import {
    canFallbackToManual,
    resolvePackageArtifactPath,
    summarizeAgentProcessOutput,
} from '../agentRuntimeGuards';
import { DeterministicQueryPlanner } from '../../domain/deterministicQueryPlanner';
import { DeterministicGenerator } from '../../../generation';
import { emptyGapResolutions, parseGapResolutions } from '../../domain/gapResolutionContracts';
import { readUtf8File } from '../../../shared';
import { AgentRunStore } from '../agentRunStore';
import {
    AgentOrchestratorResult,
    DeterministicResponseValidationResult,
    DeterministicResponseValidator,
} from './orchestratorContracts';
import {
    readJson,
    writeJson,
    sanitizeAbsolutePathsInText,
    sanitizeArtifactValue,
    updateStatus,
    clearAgentWritableOutputs,
} from './packageArtifacts';
import { QueryCounters, budgetError, appendQueryDecision, recordDeniedToolAttempts } from './queryAccounting';
import {
    MultiGapStrategy,
    requiresPlannerRegeneration,
    resolutionCounts,
    mergeGapResolutionsWithCoverage,
    deterministicGapResolutions,
} from './gapCoverage';
import { semanticPassPrompt } from './prompts';

export interface DeterministicRunDependencies {
    queryService: Pick<FrameworkQueryService, 'execute'>;
    provider: AgentProvider;
    deterministicPlanner: DeterministicQueryPlanner;
    deterministicGenerator: DeterministicGenerator;
    deterministicResponseValidator?: DeterministicResponseValidator;
}

export interface DeterministicRunInput {
    model?: string;
    packageDirectory: string;
    mode: AgentExecutionMode;
    executionMode: AgentExecutionMode;
    statusFile: string;
    runStore: AgentRunStore;
    plan: { budgets?: Partial<AgentOperationalBudgets>; recordingId?: string; planId?: string };
    gaps: AutomationGapsProjection;
    openGaps: AutomationGapsProjection['gaps'];
    budgets: AgentOperationalBudgets;
    hangStopMs: number;
    multiGapStrategy: MultiGapStrategy;
}

export async function runDeterministicPipeline(
    deps: DeterministicRunDependencies,
    input: DeterministicRunInput,
): Promise<AgentOrchestratorResult> {
    const {
        queryService,
        provider,
        deterministicPlanner,
        deterministicGenerator,
        deterministicResponseValidator,
    } = deps;
    const {
        packageDirectory,
        mode,
        executionMode,
        statusFile,
        runStore,
        gaps,
        openGaps,
        budgets,
        hangStopMs,
        multiGapStrategy,
    } = input;
    const scenario = readJson<Record<string, any>>(path.join(packageDirectory, 'scenario.json'));
    const fullPlan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
    const deterministicResolved = deterministicGapResolutions(openGaps);
    const semanticGaps = openGaps.filter(gap => !deterministicResolved.some(item => item.gapId === gap.id));
    const templateRows = (scenario.request?.scenarioRows || [])
        .filter((row: Record<string, unknown>) => row.wording === 'template');
    const requiresSemanticWording = templateRows.length > 0;
    const requiresTestDesignReview = true;

    const pass1Context = buildPassContext(packageDirectory, 'pass1');
    runStore.setPassContext('pass1', pass1Context.breakdown.totalBytes, pass1Context.breakdown);

    const plannedRequests = deterministicPlanner.plan({
        scenario: {
            squad: String(scenario.squad || ''),
            objective: String(scenario.objective || ''),
            acceptanceCriteria: String(scenario.acceptanceCriteria || ''),
        },
        plan: fullPlan,
        gaps: semanticGaps,
        hints: [],
    });
    writeJson(resolvePackageArtifactPath(packageDirectory, 'query-requests.json'), plannedRequests);
    const parsedRequests = parseAgentContextQueryRequests(
        JSON.stringify(plannedRequests),
        budgets.maxTotalQueries
    );
    if (!parsedRequests.valid || !parsedRequests.value) {
        runStore.mark('SCHEMA_INVALID', true);
        updateStatus(statusFile, {
            state: 'failed',
            agentExecutionMode: executionMode,
            errorCode: 'SCHEMA_INVALID',
            error: parsedRequests.errors.map(error => error.message).join(' | '),
        });
        return {
            success: false,
            mode: executionMode,
            state: 'failed',
            invocations: 0,
            queryCount: 0,
            fallback: false,
            errorCode: 'SCHEMA_INVALID',
            error: parsedRequests.errors.map(error => error.message).join(' | '),
        };
    }

    const counters: QueryCounters = { total: 0, perGap: {} };
    const policy = new GapQueryPolicy(gaps, queryService, runStore, {});
    const queryResults: AgentContextQueryResults = emptyQueryResults();
    for (const request of parsedRequests.value.requests) {
        appendQueryDecision(policy, counters, queryResults, request);
    }
    writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);

    let semantic: GapResolutionFile | null = null;
    if (semanticGaps.length > 0 || requiresSemanticWording || requiresTestDesignReview) {
        const version = await provider.getVersion();
        runStore.setAgentMetadata(provider.name, version || undefined);
        runStore.markAgentStarted();
        runStore.incrementAgentInvocation();
        updateStatus(statusFile, {
            state: 'running',
            agentExecutionMode: executionMode,
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
            generationMode: 'deterministic',
        });
        const pass2Context = buildPassContext(packageDirectory, 'pass2', { fullQueryResults: true });
        const filteredGaps = ((pass2Context.context.gaps as any)?.gaps || [])
            .filter((gap: Record<string, unknown>) =>
                semanticGaps.some(open => open.id === String(gap?.id || ''))
            );
        const semanticPrompt = semanticPassPrompt({
            ...pass2Context.context,
            gaps: { gaps: filteredGaps },
            queryContract: {
                schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
                outputFile: 'gap-resolutions.json',
                requiredTopLevel: ['schemaVersion', 'recordingId', 'planId', 'resolutions'],
            },
        });
        runStore.setPassContext('pass2', Buffer.byteLength(semanticPrompt, 'utf-8'), pass2Context.breakdown);
        writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
            schemaVersion: 1,
            pass1: pass1Context.breakdown,
            pass2: pass2Context.breakdown,
        });
        clearAgentWritableOutputs(packageDirectory);
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-requests.json'), plannedRequests);
        const semanticOutput = resolvePackageArtifactPath(packageDirectory, 'gap-resolutions.json');
        if (fs.existsSync(semanticOutput)) fs.unlinkSync(semanticOutput);
        const validationFeedbackFile = path.join(packageDirectory, 'validation-feedback.json');
        const repairContextFile = path.join(packageDirectory, 'repair-context.json');
        let invalidCandidates = 0;
        const semanticTerminal: {
            plannerFailure?: {
                errors: Array<{ code: string; message: string; file?: string }>;
                message: string;
            };
        } = {};
        if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
        writeJson(validationFeedbackFile, {
            schemaVersion: 1,
            status: 'awaiting-output',
            valid: false,
            qaRequired: false,
            automaticRepairAttempts: 0,
            maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
            errors: [],
        });
        const acceptSemanticOutput = (candidate: unknown): boolean => {
            let validation: DeterministicResponseValidationResult;
            let acceptedReview: TestDesignReview | undefined;
            try {
                const parsedCandidate = parseGapResolutions(
                    JSON.stringify(candidate),
                    budgets.maxTotalQueries,
                );
                if (!parsedCandidate.valid || !parsedCandidate.value) {
                    validation = {
                        valid: false,
                        errors: parsedCandidate.errors.map(error => ({
                            code: 'gap-resolution-schema',
                            message: error.message,
                        })),
                    };
                } else {
                    const review = parsedCandidate.value.testDesignReview;
                    const actionSequences = new Set<number>(
                        (scenario.actions || []).map((action: Record<string, unknown>) => Number(action.sequence))
                            .filter((sequence: number) => Number.isInteger(sequence) && sequence > 0),
                    );
                    const invalidReviewSequences = review?.issues.flatMap(issue => issue.actionSequences)
                        .filter(sequence => !actionSequences.has(sequence)) || [];
                    if (review && !invalidReviewSequences.length) {
                        acceptedReview = review;
                        writeJson(path.join(packageDirectory, 'test-design-review.json'), review);
                    }
                    const resolutions = mergeGapResolutionsWithCoverage(
                        openGaps,
                        deterministicResolved,
                        parsedCandidate.value,
                    );
                    const response = deterministicGenerator.generate(
                        packageDirectory,
                        resolutions,
                        parsedCandidate.value.gherkinResolutions || [],
                    );
                    writeJson(
                        resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                        sanitizeArtifactValue(response, packageDirectory),
                    );
                    validation = deterministicResponseValidator
                        ? deterministicResponseValidator(
                            scenario as AutomationScenario,
                            fullPlan,
                            response,
                            invalidCandidates,
                        )
                        : { valid: true, errors: [] };
                }
            } catch (error: any) {
                validation = {
                    valid: false,
                    errors: [{
                        code: 'generation-materialization',
                        message: error?.message || 'No se pudo materializar la propuesta.',
                    }],
                };
            }

            const compactErrors = validation.errors.slice(0, 30).map(error => ({
                code: String(error.code || 'validation').slice(0, 120),
                message: sanitizeAbsolutePathsInText(String(error.message || ''), packageDirectory).slice(0, 1200),
                ...(error.file ? {
                    file: sanitizeAbsolutePathsInText(String(error.file), packageDirectory).slice(0, 500),
                } : {}),
            }));
            if (validation.valid) {
                if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
                writeJson(validationFeedbackFile, {
                    schemaVersion: 1,
                    status: 'valid',
                    valid: true,
                    qaRequired: false,
                    automaticRepairAttempts: invalidCandidates,
                    maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                    errors: [],
                    warnings: (validation.warnings || []).slice(0, 20),
                    ...(acceptedReview ? { testDesignReview: acceptedReview } : {}),
                });
                return true;
            }

            if (requiresPlannerRegeneration(compactErrors) && !requiresSemanticWording) {
                const message =
                    'El Gherkin del plan no puede corregirse mediante gap-resolutions.json. ' +
                    'Regenera el paquete con el recording actual o revisa el borrador generado.';
                semanticTerminal.plannerFailure = { errors: compactErrors, message };
                if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
                writeJson(validationFeedbackFile, {
                    schemaVersion: 1,
                    status: 'planner-regeneration-required',
                    valid: false,
                    qaRequired: true,
                    automaticRepairAttempts: invalidCandidates,
                    maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                    errors: compactErrors,
                    nextAction: 'regenerate-package-or-review-draft',
                });
                // La salida es terminal para esta pasada: pedir otra edición
                // de gap-resolutions.json no puede modificar scenarioRows.
                return true;
            }

            invalidCandidates += 1;
            const automaticRepairAttempts = Math.min(invalidCandidates, budgets.maxRepairAttempts);
            const qaRequired = invalidCandidates > budgets.maxRepairAttempts;
            runStore.setRepairAttempts(automaticRepairAttempts);
            writeJson(repairContextFile, {
                attempt: automaticRepairAttempts,
                errors: compactErrors,
                affectedFiles: [...new Set(compactErrors.map(error => error.file).filter(Boolean))],
                automatic: true,
                writableFile: 'gap-resolutions.json',
                forbiddenDirectEdits: ['agent-response.json'],
            });
            writeJson(validationFeedbackFile, {
                schemaVersion: 1,
                status: qaRequired ? 'qa-required' : 'correction-required',
                valid: false,
                qaRequired,
                automaticRepairAttempts,
                maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                errors: compactErrors,
            });
            return qaRequired;
        };
        const pass2 = await provider.execute({
            model: input.model,
            cwd: packageDirectory,
            prompt: semanticPrompt,
            timeoutMs: hangStopMs,
            traceFile: './agent-execution.log',
            traceLabel: 'deterministic-pass2',
            stopOnValidatedOutput: {
                outputFile: './gap-resolutions.json',
                schemaFile: './gap-resolutions.schema.json',
                acceptOutput: acceptSemanticOutput,
            },
        });
        runStore.addPassDuration('pass2', pass2.durationMs);
        runStore.recordModelUsage('deterministic-pass2', pass2.modelUsage);
        if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass2', pass2.durationMs);
        runStore.recordDeniedPathStats(pass2.deniedPathStats);
        recordDeniedToolAttempts(runStore, pass2.deniedToolAttempts);
        runStore.setAgentExitCode(pass2.exitCode);
        if (typeof pass2.creditsCost === 'number') runStore.setCreditsCost(pass2.creditsCost);
        const plannerRegenerationFailure = semanticTerminal.plannerFailure;
        if (plannerRegenerationFailure) {
            runStore.markAgentFinished();
            runStore.setGapCounts(openGaps.length, 0, openGaps.length);
            runStore.mark('planner-regeneration-required', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'PLANNER_REGENERATION_REQUIRED',
                error: plannerRegenerationFailure.message,
                generationMode: 'deterministic',
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'PLANNER_REGENERATION_REQUIRED',
                error: plannerRegenerationFailure.message,
            };
        }
        if (!pass2.success) {
            runStore.markAgentFinished();
            const code = pass2.errorCode || 'AGENT_NON_ZERO_EXIT';
            const fallback = canFallbackToManual(executionMode, code);
            runStore.setFallback(fallback, code);
            runStore.mark(code, !fallback);
            updateStatus(statusFile, {
                state: fallback ? 'ready-for-agent' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                agentExecutionMode: executionMode,
                errorCode: code,
                error: pass2.errorMessage || 'No se pudo ejecutar PASS 2 semántico',
                generationMode: 'deterministic',
            });
            return {
                success: false,
                mode: executionMode,
                state: fallback ? 'fallback-manual' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                invocations: 1,
                queryCount: counters.total,
                fallback,
                errorCode: code,
                error: pass2.errorMessage || 'No se pudo ejecutar PASS 2 semántico',
                providerSummary: summarizeAgentProcessOutput(pass2.stdout, pass2.stderr, pass2.exitCode),
            };
        }
        runStore.markAgentFinished();
        if (!fs.existsSync(semanticOutput)) {
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'AGENT_OUTPUT_MISSING',
                error: 'gap-resolutions.json no existe después de PASS 2 semántico.',
                generationMode: 'deterministic',
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'AGENT_OUTPUT_MISSING',
                error: 'gap-resolutions.json no existe después de PASS 2 semántico.',
            };
        }
        const parsed = parseGapResolutions(
            readUtf8File(semanticOutput),
            budgets.maxTotalQueries
        );
        if (!parsed.valid || !parsed.value) {
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'SCHEMA_INVALID',
                error: parsed.errors.map(error => error.message).join(' | '),
                generationMode: 'deterministic',
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'SCHEMA_INVALID',
                error: parsed.errors.map(error => error.message).join(' | '),
            };
        }
        semantic = parsed.value;
        if (semantic.testDesignReview) {
            const validSequences = new Set<number>(
                (scenario.actions || []).map((action: Record<string, unknown>) => Number(action.sequence))
                    .filter((sequence: number) => Number.isInteger(sequence) && sequence > 0),
            );
            semantic.testDesignReview = {
                ...semantic.testDesignReview,
                issues: semantic.testDesignReview.issues.map(issue => ({
                    ...issue,
                    actionSequences: issue.actionSequences.filter(sequence => validSequences.has(sequence)),
                })),
            };
            writeJson(path.join(packageDirectory, 'test-design-review.json'), semantic.testDesignReview);
            if (semantic.testDesignReview.status === 'suggestion') {
                runStore.mark('test-design-suggestions', true);
            }
        }
    } else {
        semantic = emptyGapResolutions(fullPlan.recordingId, fullPlan.planId);
    }

    const finalResolutions = mergeGapResolutionsWithCoverage(openGaps, deterministicResolved, semantic);
    writeJson(resolvePackageArtifactPath(packageDirectory, 'gap-resolutions.json'), {
        schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
        recordingId: fullPlan.recordingId,
        planId: fullPlan.planId,
        resolutions: finalResolutions,
        ...(semantic?.gherkinResolutions?.length
            ? { gherkinResolutions: semantic.gherkinResolutions }
            : {}),
        ...(semantic?.testDesignReview
            ? { testDesignReview: semantic.testDesignReview }
            : {}),
    } satisfies GapResolutionFile);
    const response = deterministicGenerator.generate(
        packageDirectory,
        finalResolutions,
        semantic?.gherkinResolutions || [],
    );
    writeJson(
        resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
        sanitizeArtifactValue(response, packageDirectory),
    );
    runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
    const counts = resolutionCounts(response as unknown as Record<string, any>, openGaps.map(gap => gap.id));
    runStore.setGapCounts(openGaps.length, counts.resolved, counts.unresolved);

    const finalBudget = budgetError(agentBudgetViolations(budgets, {
        responseBytes: Buffer.byteLength(JSON.stringify(response), 'utf-8'),
        agentInvocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
        totalQueries: counters.total,
        queriesPerGap: counters.perGap,
    }));
    if (finalBudget) {
        runStore.mark(finalBudget.code, true);
        updateStatus(statusFile, {
            state: 'failed',
            agentExecutionMode: executionMode,
            errorCode: finalBudget.code,
            error: finalBudget.message,
            generationMode: 'deterministic',
        });
        return {
            success: false,
            mode: executionMode,
            state: 'failed',
            invocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
            queryCount: counters.total,
            fallback: false,
            errorCode: finalBudget.code,
            error: finalBudget.message,
        };
    }
    const completedWithSuggestions = semantic?.testDesignReview?.status === 'suggestion';
    runStore.mark(completedWithSuggestions ? 'completed-with-suggestions' : 'agent-completed');
    updateStatus(statusFile, {
        state: 'completed',
        agentExecutionMode: executionMode,
        generationMode: 'deterministic',
        ...(completedWithSuggestions ? { testDesignSuggestions: true } : {}),
        ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
    });
    return {
        success: true,
        mode: mode === 'automatic' ? 'automatic' : 'manual',
        state: 'completed',
        invocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
        queryCount: counters.total,
        fallback: false,
        ...(semantic?.testDesignReview ? { testDesignReview: semantic.testDesignReview } : {}),
    };
}
