import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResults,
    AgentExecutionMode,
    AgentOperationalBudgets,
    AutomationGapsProjection,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    DEFAULT_AGENT_EXECUTION_MODE,
    resolveRecorderGenerationMode,
    normalizeAgentOperationalBudgets,
    agentBudgetViolations,
} from '../contracts';
import { AgentRunStore } from './agentRunStore';
import { FrameworkQueryService } from '../../workspace';
import { GapQueryPolicy } from './gapQueryPolicy';
import { AgentProvider } from '../ports/agentProvider';
import {
    emptyQueryResults,
    parseAgentContextQueryRequests,
    validateAgentContextQueryResults,
} from '../domain/agentQueryContracts';
import { buildPassContext } from './agentContextEnvelope';
import {
    canFallbackToManual,
    resolveAgentExecutionMode,
    resolvePackageArtifactPath,
    summarizeAgentProcessOutput,
    resolveAgentHangStopMs,
} from './agentRuntimeGuards';
import { GapExecutionPlanner, partitionGapsById } from '../application/gapExecutionPlanner';
import { DeterministicQueryPlanner } from '../domain/deterministicQueryPlanner';
import { DeterministicGenerator } from '../../generation';
import { readUtf8File } from '../../shared';
import {
    readJson,
    writeJson,
    sanitizeArtifactValue,
    updateStatus,
    copyGapWorkspace,
    clearAgentWritableOutputs,
    writeFailureResponseIfMissing,
} from './agent/packageArtifacts';
import {
    QueryCounters,
    budgetError,
    appendQueryDecision,
    recordDeniedToolAttempts,
} from './agent/queryAccounting';
import {
    mergeGapResponses,
    resolveMultiGapStrategy,
    ensureGapResolutionCoverage,
    resolutionCounts,
    collectPass2Needs,
} from './agent/gapCoverage';
import { aggregateNestedRunMetrics } from './agent/runMetrics';
import { runDeterministicPipeline } from './agent/deterministicRun';

interface AgentRunExecutionOverrides {
    model?: string;
    budgetOverride?: Partial<AgentOperationalBudgets>;
}

interface NestedGapExecutionArtifacts {
    gapId: string;
    attempted: boolean;
    gapDirectory: string;
    nested: AgentOrchestratorResult;
    nestedRun: Record<string, any>;
    nestedResponse: Record<string, any> | null;
    nestedQueries: Record<string, any>;
}

import { AgentOrchestratorResult, DeterministicResponseValidator } from './agent/orchestratorContracts';

export type {
    AgentOrchestratorResult,
    DeterministicResponseValidationResult,
    DeterministicResponseValidator,
} from './agent/orchestratorContracts';

export class AgentOrchestrator {
    constructor(
        private readonly queryService: Pick<FrameworkQueryService, 'execute'>,
        private readonly provider: AgentProvider,
        private readonly deterministicPlanner = new DeterministicQueryPlanner(),
        private readonly deterministicGenerator = new DeterministicGenerator(),
        private readonly deterministicResponseValidator?: DeterministicResponseValidator,
    ) {}

    async run(
        packageDirectory: string,
        mode: AgentExecutionMode = DEFAULT_AGENT_EXECUTION_MODE,
        executionOverrides: AgentRunExecutionOverrides = {},
    ): Promise<AgentOrchestratorResult> {
        const statusFile = path.join(packageDirectory, 'status.json');
        const runStore = new AgentRunStore(packageDirectory);
        const executionMode = resolveAgentExecutionMode(mode);
        runStore.setExecutionMode(executionMode);
        const plan = readJson<{ budgets?: Partial<AgentOperationalBudgets>; recordingId?: string; planId?: string }>(
            path.join(packageDirectory, 'generation-plan.json')
        );
        const planBudgets = normalizeAgentOperationalBudgets(plan.budgets || DEFAULT_AGENT_OPERATIONAL_BUDGETS);
        const budgets = normalizeAgentOperationalBudgets({
            ...planBudgets,
            ...(executionOverrides.budgetOverride || {}),
        });
        const hangStopMs = resolveAgentHangStopMs();
        const multiGapStrategy = resolveMultiGapStrategy();
        const gaps = readJson<AutomationGapsProjection>(path.join(packageDirectory, 'gaps.json'));
        const openGaps = gaps.gaps.filter(gap => gap.status === 'open' && !gap.blocking);
        runStore.setGapCounts(openGaps.length, 0, openGaps.length);
        const blockedGap = gaps.gaps.find(gap => gap.blocking || gap.status === 'blocked-qa');
        if (!openGaps.length || blockedGap) {
            const nextState = blockedGap ? 'failed' : 'completed';
            updateStatus(statusFile, {
                state: nextState,
                agentExecutionMode: executionMode,
                ...(blockedGap ? { errorCode: 'GAP_BLOCKED' } : {}),
            });
            runStore.mark(blockedGap ? 'blocked-qa' : 'deterministic-no-agent', !blockedGap);
            runStore.setGapCounts(openGaps.length, 0, openGaps.length);
            return {
                success: !blockedGap,
                mode: executionMode,
                state: blockedGap ? 'failed' : 'skipped',
                invocations: 0,
                queryCount: 0,
                fallback: false,
                ...(blockedGap
                    ? { errorCode: 'GAP_BLOCKED', error: 'Existe un gap bloqueante QA.' }
                    : {}),
            };
        }
        const executionTraceFile = './agent-execution.log';
        writeJson(path.join(packageDirectory, executionTraceFile), {
            startedAt: new Date().toISOString(),
            mode: executionMode,
            generationMode: resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE),
            note: 'Live stream del provider (stdout/stderr) en formato línea.',
        });

        const generationMode = resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE);
        if (generationMode === 'deterministic') {
            return runDeterministicPipeline({
                queryService: this.queryService,
                provider: this.provider,
                deterministicPlanner: this.deterministicPlanner,
                deterministicGenerator: this.deterministicGenerator,
                deterministicResponseValidator: this.deterministicResponseValidator,
            }, {
                model: executionOverrides.model,
                packageDirectory,
                mode,
                executionMode,
                statusFile,
                runStore,
                plan,
                gaps,
                openGaps,
                budgets,
                hangStopMs,
                multiGapStrategy,
            });
        }

        if (openGaps.length > 1 && multiGapStrategy === 'per-gap-parallel') {
            const gapIds = partitionGapsById(openGaps);
            const parallelism = Math.max(1, Number(process.env.RECORDER_AGENT_GAP_PARALLELISM || 3));
            const planner = new GapExecutionPlanner({ parallelism });
            updateStatus(statusFile, {
                state: 'running',
                agentExecutionMode: executionMode,
                strategy: 'per-gap-parallel',
                gapCount: gapIds.length,
                parallelism,
            });
            const planned = gapIds.map(gapId => ({
                gapId,
                contextBytes: buildPassContext(packageDirectory, 'pass1', { focusGapId: gapId }).breakdown.totalBytes,
            }));
            const runs = await planner.execute(planned, Number.POSITIVE_INFINITY, async ({ gapId }) => {
                const gapDirectory = copyGapWorkspace(packageDirectory, gapId);
                const singleGapProjection = {
                    ...gaps,
                    gaps: gaps.gaps.filter(gap => gap.id === gapId),
                };
                writeJson(path.join(gapDirectory, 'gaps.json'), singleGapProjection);
                const nested = await this.run(gapDirectory, mode, {
                    model: executionOverrides.model,
                    budgetOverride: { ...budgets },
                });
                const nestedRun = readJson<Record<string, any>>(path.join(gapDirectory, 'agent-run.json'));
                const nestedResponse = fs.existsSync(path.join(gapDirectory, 'agent-response.json'))
                    ? readJson<Record<string, any>>(path.join(gapDirectory, 'agent-response.json'))
                    : null;
                const nestedQueries = fs.existsSync(path.join(gapDirectory, 'query-results.json'))
                    ? readJson<Record<string, any>>(path.join(gapDirectory, 'query-results.json'))
                    : { schemaVersion: '1.0', results: [] };
                return {
                    gapId,
                    attempted: true,
                    gapDirectory,
                    nested,
                    nestedRun,
                    nestedResponse,
                    nestedQueries,
                };
            });
            const report = runs.map(entry => entry.ok
                ? {
                    gapId: entry.gapId,
                    ok: true,
                    attempted: (entry as any).value.attempted,
                    resolved: (entry as any).value.nested.state === 'completed',
                    state: (entry as any).value.nested.state,
                    result: (entry as any).value.nestedRun?.result,
                    invocations: Number((entry as any).value.nestedRun?.agentInvocationCount || 0),
                    contextBytes: Number((entry as any).value.nestedRun?.totalContextBytes
                        || (entry as any).value.nestedRun?.contextBytes || 0),
                    pass1ContextBytes: (entry as any).value.nestedRun?.pass1ContextBytes || 0,
                    pass2ContextBytes: (entry as any).value.nestedRun?.pass2ContextBytes || 0,
                    totalDurationMs: (entry as any).value.nestedRun?.totalDurationMs || 0,
                    agentDurationMs: (entry as any).value.nestedRun?.agentDurationMs || 0,
                    queriesAccepted: (entry as any).value.nestedRun?.queriesAccepted || 0,
                    queriesRejected: (entry as any).value.nestedRun?.queriesRejected || 0,
                }
                : entry
            );
            writeJson(path.join(packageDirectory, 'gap-execution-report.json'), {
                schemaVersion: 1,
                strategy: 'per-gap-parallel',
                parallelism,
                results: report,
            });
            const overflow = runs.find(entry => !entry.ok);
            const successfulEntries = runs.filter(entry => entry.ok).map(entry => (entry as any).value);
            aggregateNestedRunMetrics(
                packageDirectory,
                successfulEntries.map((entry: NestedGapExecutionArtifacts) => entry.nestedRun),
            );
            const failureReasonsByGap = Object.fromEntries(successfulEntries.map((entry: NestedGapExecutionArtifacts) => [
                entry.gapId,
                entry.nested.success
                    ? ''
                    : (entry.nested.error || entry.nested.errorCode || entry.nested.state),
            ])) as Record<string, string>;
            const failedGap = successfulEntries.find((entry: any) => !entry.nested.success);
            if (overflow || failedGap) {
                const errorCode = overflow
                    ? 'GAP_CONTEXT_OVERFLOW'
                    : (failedGap?.nested.errorCode || 'AGENT_TIMEOUT');
                const errorMessage = overflow
                    ? `${overflow.errorCode}: ${overflow.message}`
                    : `Falló gap ${failedGap?.gapId}: ${failedGap?.nested.error || failedGap?.nested.state}`;
                const partialResponses = successfulEntries
                    .map((entry: NestedGapExecutionArtifacts) => entry.nestedResponse)
                    .filter(Boolean) as Array<Record<string, any>>;
                if (partialResponses.length) {
                    const covered = ensureGapResolutionCoverage(
                        mergeGapResponses(partialResponses),
                        gapIds,
                        failureReasonsByGap,
                    );
                    writeJson(
                        resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                        sanitizeArtifactValue(covered, packageDirectory)
                    );
                    const counts = resolutionCounts(covered, gapIds);
                    runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
                }
                if (!partialResponses.length) runStore.setGapCounts(gapIds.length, 0, gapIds.length);
                runStore.mark(errorCode, true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    strategy: 'per-gap-parallel',
                    errorCode,
                    error: errorMessage,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: successfulEntries
                        .reduce((sum: number, entry: NestedGapExecutionArtifacts) =>
                            sum + Number(entry.nestedRun?.agentInvocationCount || 0), 0),
                    queryCount: successfulEntries
                        .reduce((sum: number, entry: NestedGapExecutionArtifacts) =>
                            sum + Number(entry.nestedRun?.queriesAccepted || entry.nested.queryCount || 0), 0),
                    fallback: false,
                    errorCode,
                    error: errorMessage,
                };
            }
            const successful = successfulEntries;
            const responses = successful
                .map(entry => entry.nestedResponse)
                .filter(Boolean) as Array<Record<string, any>>;
            if (!responses.length) {
                runStore.mark('AGENT_OUTPUT_MISSING', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    strategy: 'per-gap-parallel',
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'No se generaron respuestas por gap.',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: successful.length * 2,
                    queryCount: 0,
                    fallback: false,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'No se generaron respuestas por gap.',
                };
            }
            const merged = ensureGapResolutionCoverage(
                mergeGapResponses(responses),
                gapIds,
                {},
            );
            writeJson(
                resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                sanitizeArtifactValue(merged, packageDirectory)
            );
            runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(merged), 'utf-8'));
            {
                const counts = resolutionCounts(merged, gapIds);
                runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
            }
            updateStatus(statusFile, {
                state: 'completed',
                agentExecutionMode: executionMode,
                strategy: 'per-gap-parallel',
                gapCount: gapIds.length,
                parallelism,
            });
            runStore.mark('agent-completed');
            return {
                success: true,
                mode: executionMode,
                state: 'completed',
                invocations: successful
                    .reduce((sum, entry: NestedGapExecutionArtifacts) =>
                        sum + Number(entry.nestedRun?.agentInvocationCount || 0), 0),
                queryCount: successful.reduce((sum, entry) => sum + Number(entry.nestedRun?.queriesAccepted || 0), 0),
                fallback: false,
            };
        }

        const pass1Context = buildPassContext(packageDirectory, 'pass1');
        runStore.setPassContext('pass1', pass1Context.breakdown.totalBytes, pass1Context.breakdown);
        writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
            schemaVersion: 1,
            pass1: pass1Context.breakdown,
            pass2: null,
        });
        writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
            schemaVersion: 1,
            pass1: pass1Context.breakdown,
            pass2: null,
        });
        const version = await this.provider.getVersion();
        runStore.setAgentMetadata(this.provider.name, version || undefined);
        runStore.markAgentStarted();
        runStore.incrementAgentInvocation();
        clearAgentWritableOutputs(packageDirectory);
        updateStatus(statusFile, {
            state: 'running',
            agentExecutionMode: executionMode,
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
        });
        const pass1 = await this.provider.execute({
            model: executionOverrides.model,
            cwd: packageDirectory,
            prompt: pass1Context.prompt,
            timeoutMs: hangStopMs,
            traceFile: executionTraceFile,
            traceLabel: 'pass1',
        });
        runStore.addPassDuration('pass1', pass1.durationMs);
        runStore.recordModelUsage('pass1', pass1.modelUsage);
        if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass1', pass1.durationMs);
        if (typeof pass1.creditsCost === 'number') runStore.setCreditsCost(pass1.creditsCost);
        runStore.recordDeniedPathStats(pass1.deniedPathStats);
        recordDeniedToolAttempts(runStore, pass1.deniedToolAttempts);
        runStore.setAgentExitCode(pass1.exitCode);
        if (!pass1.success) {
            writeFailureResponseIfMissing(
                packageDirectory,
                plan,
                gaps,
                pass1.errorMessage || pass1.errorCode || 'No se pudo ejecutar PASS 1',
            );
            runStore.markAgentFinished();
            if (pass1.timedOut) runStore.markAgentTimedOut();
            if (pass1.cancelled) runStore.markAgentCancelled();
            const code = pass1.errorCode || 'AGENT_NON_ZERO_EXIT';
            runStore.setGapCounts(openGaps.length, 0, openGaps.length);
            const fallback = canFallbackToManual(executionMode, code);
            runStore.setFallback(fallback, code);
            runStore.mark(code, !fallback);
            updateStatus(statusFile, {
                state: fallback ? 'ready-for-agent' : (pass1.timedOut ? 'timed-out' : pass1.cancelled ? 'cancelled' : 'failed'),
                agentExecutionMode: executionMode,
                errorCode: code,
                error: pass1.errorMessage || 'No se pudo ejecutar PASS 1',
            });
            return {
                success: false,
                mode: executionMode,
                state: fallback ? 'fallback-manual' : (pass1.timedOut ? 'timed-out' : pass1.cancelled ? 'cancelled' : 'failed'),
                invocations: 1,
                queryCount: 0,
                fallback,
                errorCode: code,
                error: pass1.errorMessage || 'No se pudo ejecutar PASS 1',
                providerSummary: summarizeAgentProcessOutput(pass1.stdout, pass1.stderr, pass1.exitCode),
            };
        }

        const requestFile = resolvePackageArtifactPath(packageDirectory, 'query-requests.json');
        const requestContent = fs.existsSync(requestFile)
            ? readUtf8File(requestFile)
            : JSON.stringify({
                schemaVersion: '1.0',
                recordingId: plan.recordingId || gaps.recordingId || '',
                planId: plan.planId || gaps.planId || '',
                requests: [],
            });
        const parsedRequests = parseAgentContextQueryRequests(requestContent, budgets.maxTotalQueries);
        if (!parsedRequests.valid || !parsedRequests.value) {
            runStore.markAgentFinished();
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
                invocations: 1,
                queryCount: 0,
                fallback: false,
                errorCode: 'SCHEMA_INVALID',
                error: parsedRequests.errors.map(error => error.message).join(' | '),
            };
        }

        const counters: QueryCounters = { total: 0, perGap: {} };
        const policy = new GapQueryPolicy(gaps, this.queryService, runStore, {});
        const queryResults: AgentContextQueryResults = emptyQueryResults();
        for (const request of parsedRequests.value.requests) {
            appendQueryDecision(policy, counters, queryResults, request);
        }
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);
        const truncatedRejections = queryResults.results.filter(result =>
            result.status === 'rejected' && result.code === 'query-truncated'
        );
        if (truncatedRejections.length) {
            runStore.markAgentFinished();
            const detail = truncatedRejections
                .map(item => `${item.gapId}:${item.requestId}`)
                .join(', ');
            runStore.mark('QUERY_RESULT_TRUNCATED', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'QUERY_RESULT_TRUNCATED',
                error: `Se detectó truncamiento de query-results (${detail}).`,
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'QUERY_RESULT_TRUNCATED',
                error: `Se detectó truncamiento de query-results (${detail}).`,
            };
        }

        const validatedResults = validateAgentContextQueryResults(
            queryResults,
            new Set(parsedRequests.value.requests.map(request => request.id))
        );
        if (!validatedResults.valid) {
            runStore.markAgentFinished();
            runStore.mark('SCHEMA_INVALID', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'SCHEMA_INVALID',
                error: validatedResults.errors.map(error => error.message).join(' | '),
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'SCHEMA_INVALID',
                error: validatedResults.errors.map(error => error.message).join(' | '),
            };
        }

        const queryBudget = budgetError(agentBudgetViolations(budgets, {
            totalQueries: counters.total,
            queriesPerGap: counters.perGap,
            agentInvocations: 1,
        }));
        if (queryBudget) {
            runStore.markAgentFinished();
            runStore.mark(queryBudget.code, true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: queryBudget.code,
                error: queryBudget.message,
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: queryBudget.code,
                error: queryBudget.message,
            };
        }

        const responseFile = resolvePackageArtifactPath(packageDirectory, 'agent-response.json');
        const pass2Stdouts: string[] = [];
        const pass2Stderrs: string[] = [];
        let pass2Invocations = 0;
        let pass2RepairAttempts = 0;
        let lastPass2ExitCode: number | null = null;
        const openGapIds = new Set(openGaps.map(gap => gap.id));
        const requestIds = new Set(parsedRequests.value.requests.map(request => request.id));
        let parsedResponse: Record<string, any> | null = null;
        let responseBytes = 0;
        while (true) {
            const pass2Context = buildPassContext(packageDirectory, 'pass2', { fullQueryResults: true });
            runStore.setPassContext('pass2', pass2Context.breakdown.totalBytes, pass2Context.breakdown);
            writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
                schemaVersion: 1,
                pass1: pass1Context.breakdown,
                pass2: pass2Context.breakdown,
            });
            runStore.incrementAgentInvocation();
            pass2Invocations += 1;
            clearAgentWritableOutputs(packageDirectory);
            const pass2 = await this.provider.execute({
                model: executionOverrides.model,
                cwd: packageDirectory,
                prompt: pass2Context.prompt,
                timeoutMs: hangStopMs,
                traceFile: executionTraceFile,
                traceLabel: `pass2-${pass2Invocations}`,
                stopOnValidatedOutput: {
                    outputFile: './agent-response.json',
                    schemaFile: './agent-response.schema.json',
                },
            });
            pass2Stdouts.push(pass2.stdout);
            runStore.recordModelUsage('pass2', pass2.modelUsage);
            pass2Stderrs.push(pass2.stderr);
            lastPass2ExitCode = pass2.exitCode;
            runStore.addPassDuration('pass2', pass2.durationMs);
            if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass2', pass2.durationMs);
            if (typeof pass2.creditsCost === 'number') runStore.setCreditsCost(pass2.creditsCost);
            runStore.recordDeniedPathStats(pass2.deniedPathStats);
            recordDeniedToolAttempts(runStore, pass2.deniedToolAttempts);
            runStore.setAgentExitCode(pass2.exitCode);
            if (!pass2.success) {
                runStore.markAgentFinished();
                writeFailureResponseIfMissing(
                    packageDirectory,
                    plan,
                    gaps,
                    pass2.errorMessage || pass2.errorCode || 'No se pudo ejecutar PASS 2',
                );
                if (pass2.timedOut) runStore.markAgentTimedOut();
                if (pass2.cancelled) runStore.markAgentCancelled();
                const code = pass2.errorCode || 'AGENT_NON_ZERO_EXIT';
                runStore.setGapCounts(openGaps.length, 0, openGaps.length);
                const fallback = canFallbackToManual(executionMode, code);
                runStore.setFallback(fallback, code);
                runStore.mark(code, !fallback);
                updateStatus(statusFile, {
                    state: fallback ? 'ready-for-agent' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    agentExecutionMode: executionMode,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: fallback ? 'fallback-manual' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2',
                    providerSummary: summarizeAgentProcessOutput(
                        `${pass1.stdout}\n${pass2Stdouts.join('\n')}`,
                        `${pass1.stderr}\n${pass2Stderrs.join('\n')}`,
                        pass2.exitCode
                    ),
                };
            }
            if (!fs.existsSync(responseFile)) {
                runStore.markAgentFinished();
                writeFailureResponseIfMissing(
                    packageDirectory,
                    plan,
                    gaps,
                    'PASS 2 finalizó sin escribir agent-response.json.',
                );
                runStore.mark('AGENT_OUTPUT_MISSING', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'agent-response.json no existe después de PASS 2.',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'agent-response.json no existe después de PASS 2.',
                };
            }
            responseBytes = fs.statSync(responseFile).size;
            runStore.setResponseBytes(responseBytes);
            parsedResponse = readJson<Record<string, any>>(responseFile);
            const needs = pass2RepairAttempts < budgets.maxRepairAttempts
                ? collectPass2Needs(parsedResponse, openGapIds)
                : [];
            if (!needs.length) break;
            pass2RepairAttempts += 1;
            runStore.setRepairAttempts(pass2RepairAttempts);
            for (let index = 0; index < needs.length; index += 1) {
                const need = needs[index];
                const requestId = `p2need-${pass2RepairAttempts}-${index + 1}`;
                requestIds.add(requestId);
                runStore.recordMissingContextRequest({
                    source: 'pass2-needs',
                    gapId: need.gapId,
                    query: need.query,
                    detail: `${need.query} ${JSON.stringify(need.args || {})}`,
                });
                appendQueryDecision(policy, counters, queryResults, {
                    id: requestId,
                    gapId: need.gapId,
                    query: need.query,
                    args: need.args,
                });
            }
            writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);
            const appendedTruncated = queryResults.results.filter(result =>
                result.status === 'rejected' && result.code === 'query-truncated'
            );
            if (appendedTruncated.length) {
                runStore.markAgentFinished();
                const detail = appendedTruncated
                    .map(item => `${item.gapId}:${item.requestId}`)
                    .join(', ');
                runStore.mark('QUERY_RESULT_TRUNCATED', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'QUERY_RESULT_TRUNCATED',
                    error: `Se detectó truncamiento de query-results (${detail}).`,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'QUERY_RESULT_TRUNCATED',
                    error: `Se detectó truncamiento de query-results (${detail}).`,
                };
            }
            const validatedAppended = validateAgentContextQueryResults(queryResults, requestIds);
            if (!validatedAppended.valid) {
                runStore.markAgentFinished();
                runStore.mark('SCHEMA_INVALID', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'SCHEMA_INVALID',
                    error: validatedAppended.errors.map(error => error.message).join(' | '),
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'SCHEMA_INVALID',
                    error: validatedAppended.errors.map(error => error.message).join(' | '),
                };
            }
            const queryBudgetAfterNeeds = budgetError(agentBudgetViolations(budgets, {
                totalQueries: counters.total,
                queriesPerGap: counters.perGap,
                agentInvocations: 1,
            }));
            if (queryBudgetAfterNeeds) {
                runStore.markAgentFinished();
                runStore.mark(queryBudgetAfterNeeds.code, true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: queryBudgetAfterNeeds.code,
                    error: queryBudgetAfterNeeds.message,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: queryBudgetAfterNeeds.code,
                    error: queryBudgetAfterNeeds.message,
                };
            }
        }
        runStore.markAgentFinished();
        {
            const gapIds = openGaps.map(gap => gap.id);
            const counts = resolutionCounts(parsedResponse || {}, gapIds);
            runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
        }
        const finalBudget = budgetError(agentBudgetViolations(budgets, {
            responseBytes,
            agentInvocations: 2,
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
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1 + pass2Invocations,
                queryCount: counters.total,
                fallback: false,
                errorCode: finalBudget.code,
                error: finalBudget.message,
            };
        }

        updateStatus(statusFile, {
            state: 'completed',
            agentExecutionMode: executionMode,
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
        });
        runStore.mark('agent-completed');
        return {
            success: true,
            mode: executionMode,
            state: 'completed',
            invocations: 1 + pass2Invocations,
            queryCount: counters.total,
            fallback: false,
            providerSummary: summarizeAgentProcessOutput(
                `${pass1.stdout}\n${pass2Stdouts.join('\n')}`,
                `${pass1.stderr}\n${pass2Stderrs.join('\n')}`,
                lastPass2ExitCode
            ),
        };
    }
}
