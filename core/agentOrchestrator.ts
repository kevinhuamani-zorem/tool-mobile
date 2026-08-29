import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResult,
    AgentContextQueryResults,
    AgentDomainErrorCode,
    AgentExecutionMode,
    AgentOperationalBudgets,
    AutomationGapsProjection,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    DEFAULT_AGENT_EXECUTION_MODE,
    normalizeAgentOperationalBudgets,
    agentBudgetViolations,
} from './automationContracts';
import { AgentRunStore } from './agentRunStore';
import { FrameworkQueryService } from './frameworkQueryService';
import { GapQueryPolicy } from './gapQueryPolicy';
import { AgentProvider } from './agentProvider';
import {
    emptyQueryResults,
    parseAgentContextQueryRequests,
    validateAgentContextQueryResults,
} from './agentQueryContracts';
import {
    canFallbackToManual,
    resolveAgentExecutionMode,
    resolvePackageArtifactPath,
    summarizeAgentProcessOutput,
} from './agentRuntimeGuards';

interface QueryCounters {
    total: number;
    perGap: Record<string, number>;
}

export interface AgentOrchestratorResult {
    success: boolean;
    mode: AgentExecutionMode;
    state: 'completed' | 'failed' | 'timed-out' | 'cancelled' | 'fallback-manual' | 'skipped';
    invocations: number;
    queryCount: number;
    fallback: boolean;
    errorCode?: string;
    error?: string;
    providerSummary?: ReturnType<typeof summarizeAgentProcessOutput>;
}

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function writeJson(file: string, value: unknown): void {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function rejectionCode(reason: string): AgentContextQueryResult['code'] {
    if (reason === 'query-not-allowed') return 'query-not-allowed';
    if (reason === 'no-open-gap' || reason === 'gap-not-found' || reason === 'gap-resolved') return 'no-open-gap';
    if (reason === 'gap-blocking') return 'blocked-qa';
    if (reason === 'duplicate-query') return 'duplicate-query';
    if (reason === 'max-queries-reached') return 'max-queries-exceeded';
    return 'context-budget-exceeded';
}

function increase(counters: QueryCounters, gapId: string): void {
    counters.total += 1;
    counters.perGap[gapId] = (counters.perGap[gapId] || 0) + 1;
}

function budgetError(violations: AgentDomainErrorCode[]): { code: AgentDomainErrorCode; message: string } | null {
    if (!violations.length) return null;
    return {
        code: violations[0],
        message: `Presupuesto excedido: ${violations.join(', ')}`,
    };
}

export class AgentOrchestrator {
    constructor(
        private readonly queryService = new FrameworkQueryService(),
        private readonly provider: AgentProvider,
    ) {}

    async run(
        packageDirectory: string,
        mode: AgentExecutionMode = DEFAULT_AGENT_EXECUTION_MODE,
    ): Promise<AgentOrchestratorResult> {
        const statusFile = path.join(packageDirectory, 'status.json');
        const runStore = new AgentRunStore(packageDirectory);
        const executionMode = resolveAgentExecutionMode(mode);
        runStore.setExecutionMode(executionMode);
        const plan = readJson<{ budgets?: Partial<AgentOperationalBudgets> }>(
            path.join(packageDirectory, 'generation-plan.json')
        );
        const budgets = normalizeAgentOperationalBudgets(plan.budgets || DEFAULT_AGENT_OPERATIONAL_BUDGETS);
        const gaps = readJson<AutomationGapsProjection>(path.join(packageDirectory, 'gaps.json'));
        const openGaps = gaps.gaps.filter(gap => gap.status === 'open' && !gap.blocking);
        const blockedGap = gaps.gaps.find(gap => gap.blocking || gap.status === 'blocked-qa');
        if (!openGaps.length || blockedGap) {
            const nextState = blockedGap ? 'failed' : 'completed';
            writeJson(statusFile, {
                ...readJson<Record<string, unknown>>(statusFile),
                state: nextState,
                agentExecutionMode: executionMode,
                updatedAt: new Date().toISOString(),
            });
            runStore.mark(blockedGap ? 'blocked-qa' : 'deterministic-no-agent', !blockedGap);
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

        const contextBytes = [
            'scenario.json', 'generation-plan.json', 'hints.json', 'gaps.json',
            'reuse-context.json', 'collision-report.json', 'locator-candidates.json',
            'instructions.md',
        ].reduce((total, name) => {
            const file = path.join(packageDirectory, name);
            return total + (fs.existsSync(file) ? fs.statSync(file).size : 0);
        }, 0);
        const preBudget = budgetError(agentBudgetViolations(budgets, { contextBytes }));
        if (preBudget) {
            runStore.mark(preBudget.code, true);
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 0,
                queryCount: 0,
                fallback: false,
                errorCode: preBudget.code,
                error: preBudget.message,
            };
        }

        const version = await this.provider.getVersion();
        runStore.setAgentMetadata(this.provider.name, version || undefined);
        runStore.markAgentStarted();
        runStore.incrementAgentInvocation();
        writeJson(statusFile, {
            ...readJson<Record<string, unknown>>(statusFile),
            state: 'running',
            agentExecutionMode: executionMode,
            updatedAt: new Date().toISOString(),
        });
        const pass1 = await this.provider.execute({
            cwd: packageDirectory,
            prompt:
                'PASS 1: lee gaps.json y escribe query-requests.json versionado. ' +
                'Solo requests autorizados por gap (allowedQueries / maxQueries).',
            timeoutMs: budgets.maxDurationMs,
        });
        runStore.setAgentExitCode(pass1.exitCode);
        if (!pass1.success) {
            runStore.markAgentFinished();
            if (pass1.timedOut) runStore.markAgentTimedOut();
            if (pass1.cancelled) runStore.markAgentCancelled();
            const code = pass1.errorCode || 'AGENT_NON_ZERO_EXIT';
            const fallback = canFallbackToManual(executionMode, code);
            runStore.setFallback(fallback, code);
            runStore.mark(code, !fallback);
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
            ? fs.readFileSync(requestFile, 'utf-8')
            : JSON.stringify({ schemaVersion: '1.0', requests: [] });
        const parsedRequests = parseAgentContextQueryRequests(requestContent, budgets.maxTotalQueries);
        if (!parsedRequests.valid || !parsedRequests.value) {
            runStore.markAgentFinished();
            runStore.mark('SCHEMA_INVALID', true);
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
        const policy = new GapQueryPolicy(gaps, this.queryService, runStore);
        const queryResults: AgentContextQueryResults = emptyQueryResults();
        for (const request of parsedRequests.value.requests) {
            const decision = policy.request(request.gapId, request.query, request.args || {});
            if (!decision.accepted) {
                queryResults.results.push({
                    requestId: request.id,
                    gapId: request.gapId,
                    status: 'rejected',
                    code: rejectionCode(decision.reason),
                    evidence: [decision.reason],
                });
                continue;
            }
            increase(counters, request.gapId);
            if (decision.response?.success) {
                queryResults.results.push({
                    requestId: request.id,
                    gapId: request.gapId,
                    status: decision.response.items.length ? 'resolved' : 'not-found',
                    data: {
                        items: decision.response.items,
                        relations: decision.response.relations,
                        metrics: decision.response.metrics,
                    },
                });
            } else {
                queryResults.results.push({
                    requestId: request.id,
                    gapId: request.gapId,
                    status: 'error',
                    data: {
                        error: decision.response?.error || { code: 'framework-query-failed' },
                    },
                });
            }
        }
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);

        const validatedResults = validateAgentContextQueryResults(
            queryResults,
            new Set(parsedRequests.value.requests.map(request => request.id))
        );
        if (!validatedResults.valid) {
            runStore.markAgentFinished();
            runStore.mark('SCHEMA_INVALID', true);
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

        runStore.incrementAgentInvocation();
        const pass2 = await this.provider.execute({
            cwd: packageDirectory,
            prompt:
                'PASS 2: lee query-results.json y escribe agent-response.json cumpliendo agent-response.schema.json. ' +
                'No cambies rutas ni capas planificadas.',
            timeoutMs: budgets.maxDurationMs,
        });
        runStore.setAgentExitCode(pass2.exitCode);
        runStore.markAgentFinished();
        if (!pass2.success) {
            if (pass2.timedOut) runStore.markAgentTimedOut();
            if (pass2.cancelled) runStore.markAgentCancelled();
            const code = pass2.errorCode || 'AGENT_NON_ZERO_EXIT';
            const fallback = canFallbackToManual(executionMode, code);
            runStore.setFallback(fallback, code);
            runStore.mark(code, !fallback);
            return {
                success: false,
                mode: executionMode,
                state: fallback ? 'fallback-manual' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                invocations: 2,
                queryCount: counters.total,
                fallback,
                errorCode: code,
                error: pass2.errorMessage || 'No se pudo ejecutar PASS 2',
                providerSummary: summarizeAgentProcessOutput(pass2.stdout, pass2.stderr, pass2.exitCode),
            };
        }

        const responseFile = resolvePackageArtifactPath(packageDirectory, 'agent-response.json');
        if (!fs.existsSync(responseFile)) {
            runStore.mark('AGENT_OUTPUT_MISSING', true);
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 2,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'AGENT_OUTPUT_MISSING',
                error: 'agent-response.json no existe después de PASS 2.',
            };
        }

        const responseBytes = fs.statSync(responseFile).size;
        const finalBudget = budgetError(agentBudgetViolations(budgets, {
            responseBytes,
            agentInvocations: 2,
            totalQueries: counters.total,
            queriesPerGap: counters.perGap,
        }));
        if (finalBudget) {
            runStore.mark(finalBudget.code, true);
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 2,
                queryCount: counters.total,
                fallback: false,
                errorCode: finalBudget.code,
                error: finalBudget.message,
            };
        }

        writeJson(statusFile, {
            ...readJson<Record<string, unknown>>(statusFile),
            state: 'completed',
            agentExecutionMode: executionMode,
            updatedAt: new Date().toISOString(),
        });
        runStore.mark('agent-completed');
        return {
            success: true,
            mode: executionMode,
            state: 'completed',
            invocations: 2,
            queryCount: counters.total,
            fallback: false,
            providerSummary: summarizeAgentProcessOutput(
                `${pass1.stdout}\n${pass2.stdout}`,
                `${pass1.stderr}\n${pass2.stderr}`,
                pass2.exitCode
            ),
        };
    }
}
