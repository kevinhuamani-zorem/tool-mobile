import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { CodeGraphBuildMetrics } from '../../indexing';
import type { FrameworkQueryMetrics } from '../../workspace';
import type { ProjectionMetrics } from '../domain/automationContextProjections';
import { AgentExecutionMode, DEFAULT_AGENT_EXECUTION_MODE, GapResolver } from '../contracts';
import type { ContextBreakdown } from './agentContextEnvelope';
import type { AgentModelUsage } from '../domain/agentModel';

export interface AgentRunArtifact {
    schemaVersion: 1;
    runId: string;
    recordingId: string;
    planId?: string;
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    totalDurationMs: number;
    caseDurationMs: number;
    resolverDurationMs: number;
    indexDurationMs: number;
    agentDurationMs: number;
    validatorDurationMs: number;
    repairDurationMs: number;
    queryCount: number;
    filesRead: number;
    bytesRead: number;
    /** Máximo contexto usado por una invocación individual (PASS 1 o PASS 2). */
    contextBytes: number;
    /** Suma real de contexto leído por todas las invocaciones del agente. */
    totalContextBytes: number;
    /** Alias explícito del agregado pass1+pass2 para telemetría y reportes. */
    aggregatedContextBytes: number;
    pass1DurationMs: number;
    pass2DurationMs: number;
    gapDurationsMs: Record<string, { pass1Ms: number; pass2Ms: number; totalMs: number; invocations: number }>;
    pass1ContextBytes: number;
    pass2ContextBytes: number;
    pass1ContextBreakdown: ContextBreakdown | null;
    pass2ContextBreakdown: ContextBreakdown | null;
    responseBytes: number;
    tokensInput: number | null;
    tokensOutput: number | null;
    repairAttempts: number;
    result: string;
    cacheHits: number;
    initialGapCount: number;
    finalGapCount: number;
    hintsGenerated: number;
    hintsUsed: number;
    gapsResolvedDeterministically: number;
    queriesRequested: number;
    queriesAccepted: number;
    queriesRejected: number;
    duplicateQueriesAvoided: number;
    queriesAvoidedNoGap: number;
    invalidArgsRejected: number;
    queryTruncatedRejected: number;
    openGapCount: number;
    resolvedGapCount: number;
    unresolvedGapCount: number;
    deniedPathInsideCwdCount: number;
    deniedPathOutsideCwdCount: number;
    missingContextRequests: Array<{
        source: 'pass2-needs' | 'denied-tool' | 'importer';
        gapId?: string;
        query?: string;
        detail: string;
    }>;
    creditsCost: number | null;
    agentProvider: string | null;
    agentVersion: string | null;
    agentModelUsage?: AgentModelUsage | null;
    agentModelInvocations?: Array<AgentModelUsage & { stage: string; sessionId?: string }>;
    agentExecutionMode: AgentExecutionMode;
    agentInvocationCount: number;
    agentExitCode: number | null;
    agentTimedOut: boolean;
    agentCancelled: boolean;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    /** Marcas internas numéricas; nunca contienen prompts, selectores ni evidencia. */
    timers?: { agentStartedAtMs?: number; repairStartedAtMs?: number };
}

type DurationField = 'resolverDurationMs' | 'indexDurationMs' | 'agentDurationMs'
    | 'validatorDurationMs' | 'repairDurationMs';

export class AgentRunStore {
    readonly file: string;

    constructor(
        packageDirectory: string,
        private readonly now: () => number = Date.now,
    ) {
        this.file = path.join(packageDirectory, 'agent-run.json');
    }

    start(recordingId: string, planId?: string): AgentRunArtifact {
        const now = this.now();
        const run: AgentRunArtifact = {
            schemaVersion: 1,
            runId: `run-${crypto.randomUUID()}`,
            recordingId,
            ...(planId ? { planId } : {}),
            startedAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            totalDurationMs: 0,
            caseDurationMs: 0,
            resolverDurationMs: 0,
            indexDurationMs: 0,
            agentDurationMs: 0,
            validatorDurationMs: 0,
            repairDurationMs: 0,
            queryCount: 0,
            filesRead: 0,
            bytesRead: 0,
            contextBytes: 0,
            totalContextBytes: 0,
            aggregatedContextBytes: 0,
            pass1DurationMs: 0,
            pass2DurationMs: 0,
            gapDurationsMs: {},
            pass1ContextBytes: 0,
            pass2ContextBytes: 0,
            pass1ContextBreakdown: null,
            pass2ContextBreakdown: null,
            responseBytes: 0,
            tokensInput: null,
            tokensOutput: null,
            repairAttempts: 0,
            result: 'running',
            cacheHits: 0,
            initialGapCount: 0,
            finalGapCount: 0,
            hintsGenerated: 0,
            hintsUsed: 0,
            gapsResolvedDeterministically: 0,
            queriesRequested: 0,
            queriesAccepted: 0,
            queriesRejected: 0,
            duplicateQueriesAvoided: 0,
            queriesAvoidedNoGap: 0,
            invalidArgsRejected: 0,
            queryTruncatedRejected: 0,
            openGapCount: 0,
            resolvedGapCount: 0,
            unresolvedGapCount: 0,
            deniedPathInsideCwdCount: 0,
            deniedPathOutsideCwdCount: 0,
            missingContextRequests: [],
            creditsCost: null,
            agentProvider: null,
            agentVersion: null,
            agentModelUsage: null,
            agentModelInvocations: [],
            agentExecutionMode: DEFAULT_AGENT_EXECUTION_MODE,
            agentInvocationCount: 0,
            agentExitCode: null,
            agentTimedOut: false,
            agentCancelled: false,
            fallbackUsed: false,
            fallbackReason: null,
        };
        this.write(run);
        return run;
    }

    read(): AgentRunArtifact | undefined {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as AgentRunArtifact;
            if (parsed?.schemaVersion !== 1) return undefined;
            return {
                ...parsed,
                initialGapCount: parsed.initialGapCount || 0,
                finalGapCount: parsed.finalGapCount || 0,
                hintsGenerated: parsed.hintsGenerated || 0,
                hintsUsed: parsed.hintsUsed || 0,
                gapsResolvedDeterministically: parsed.gapsResolvedDeterministically || 0,
                queriesRequested: parsed.queriesRequested || 0,
                queriesAccepted: parsed.queriesAccepted || 0,
                queriesRejected: parsed.queriesRejected || 0,
                duplicateQueriesAvoided: parsed.duplicateQueriesAvoided || 0,
                queriesAvoidedNoGap: parsed.queriesAvoidedNoGap || 0,
                invalidArgsRejected: parsed.invalidArgsRejected || 0,
                queryTruncatedRejected: parsed.queryTruncatedRejected || 0,
                openGapCount: parsed.openGapCount || 0,
                resolvedGapCount: parsed.resolvedGapCount || 0,
                unresolvedGapCount: parsed.unresolvedGapCount || 0,
                deniedPathInsideCwdCount: parsed.deniedPathInsideCwdCount || 0,
                deniedPathOutsideCwdCount: parsed.deniedPathOutsideCwdCount || 0,
                missingContextRequests: Array.isArray((parsed as any).missingContextRequests)
                    ? (parsed as any).missingContextRequests
                    : [],
                creditsCost: Number.isFinite(parsed.creditsCost as number) ? Number(parsed.creditsCost) : null,
                agentProvider: parsed.agentProvider || null,
                agentVersion: parsed.agentVersion || null,
                agentExecutionMode: parsed.agentExecutionMode === 'manual' ? 'manual' : 'automatic',
                agentInvocationCount: parsed.agentInvocationCount || 0,
                pass1ContextBytes: parsed.pass1ContextBytes || 0,
                pass2ContextBytes: parsed.pass2ContextBytes || 0,
                pass1ContextBreakdown: parsed.pass1ContextBreakdown || null,
                pass2ContextBreakdown: parsed.pass2ContextBreakdown || null,
                agentExitCode: Number.isInteger(parsed.agentExitCode) ? parsed.agentExitCode : null,
                agentTimedOut: Boolean(parsed.agentTimedOut),
                agentCancelled: Boolean(parsed.agentCancelled),
                fallbackUsed: Boolean(parsed.fallbackUsed),
                fallbackReason: parsed.fallbackReason || null,
                totalContextBytes: Number.isFinite(parsed.totalContextBytes)
                    ? Math.max(0, Number(parsed.totalContextBytes))
                    : (Number(parsed.pass1ContextBytes || 0) + Number(parsed.pass2ContextBytes || 0)) || Number(parsed.contextBytes || 0),
                aggregatedContextBytes: Number.isFinite((parsed as any).aggregatedContextBytes)
                    ? Math.max(0, Number((parsed as any).aggregatedContextBytes))
                    : (Number.isFinite(parsed.totalContextBytes)
                        ? Math.max(0, Number(parsed.totalContextBytes))
                        : (Number(parsed.pass1ContextBytes || 0) + Number(parsed.pass2ContextBytes || 0)) || Number(parsed.contextBytes || 0)),
                caseDurationMs: Number.isFinite((parsed as any).caseDurationMs)
                    ? Math.max(0, Number((parsed as any).caseDurationMs))
                    : Math.max(0, Number(parsed.totalDurationMs || 0)),
                pass1DurationMs: Number.isFinite((parsed as any).pass1DurationMs)
                    ? Math.max(0, Number((parsed as any).pass1DurationMs))
                    : 0,
                pass2DurationMs: Number.isFinite((parsed as any).pass2DurationMs)
                    ? Math.max(0, Number((parsed as any).pass2DurationMs))
                    : 0,
                gapDurationsMs: (parsed as any).gapDurationsMs && typeof (parsed as any).gapDurationsMs === 'object'
                    ? (parsed as any).gapDurationsMs
                    : {},
            };
        } catch {
            return undefined;
        }
    }

    setPlan(planId: string): void { this.update(run => ({ ...run, planId })); }
    addDuration(field: DurationField, durationMs: number): void {
        this.update(run => ({ ...run, [field]: run[field] + Math.max(0, durationMs) }));
    }
    recordFrameworkAccess(metrics?: (CodeGraphBuildMetrics & { queryCount?: number })): void {
        if (!metrics) return;
        this.update(run => ({
            ...run,
            indexDurationMs: run.indexDurationMs + Math.max(0, metrics.indexDurationMs),
            queryCount: run.queryCount + Math.max(0, metrics.queryCount || 0),
            filesRead: run.filesRead + Math.max(0, metrics.filesRead),
            bytesRead: run.bytesRead + Math.max(0, metrics.bytesRead),
            cacheHits: run.cacheHits + (metrics.cacheHit ? 1 : 0),
        }));
    }
    setContextBytes(contextBytes: number): void {
        this.update(run => ({
            ...run,
            contextBytes: Math.max(0, contextBytes),
        }));
    }
    setPassContext(pass: 'pass1' | 'pass2', contextBytes: number, breakdown: ContextBreakdown): void {
        this.update(run => ({
            ...run,
            ...(pass === 'pass1'
                ? { pass1ContextBytes: Math.max(0, contextBytes), pass1ContextBreakdown: breakdown }
                : { pass2ContextBytes: Math.max(0, contextBytes), pass2ContextBreakdown: breakdown }),
            contextBytes: Math.max(0, Math.max(
                pass === 'pass1' ? contextBytes : run.pass1ContextBytes || 0,
                pass === 'pass2' ? contextBytes : run.pass2ContextBytes || 0,
            )),
            totalContextBytes: Math.max(0,
                (pass === 'pass1' ? contextBytes : run.pass1ContextBytes || 0)
                + (pass === 'pass2' ? contextBytes : run.pass2ContextBytes || 0)
            ),
            aggregatedContextBytes: Math.max(0,
                (pass === 'pass1' ? contextBytes : run.pass1ContextBytes || 0)
                + (pass === 'pass2' ? contextBytes : run.pass2ContextBytes || 0)
            ),
        }));
    }
    setResponseBytes(responseBytes: number): void {
        this.update(run => ({ ...run, responseBytes: Math.max(0, responseBytes) }));
    }
    addPassDuration(pass: 'pass1' | 'pass2', durationMs: number): void {
        this.update(run => ({
            ...run,
            ...(pass === 'pass1'
                ? { pass1DurationMs: run.pass1DurationMs + Math.max(0, durationMs) }
                : { pass2DurationMs: run.pass2DurationMs + Math.max(0, durationMs) }),
        }));
    }
    addGapPassDuration(gapId: string, pass: 'pass1' | 'pass2', durationMs: number): void {
        if (!gapId) return;
        this.update(run => {
            const current = run.gapDurationsMs?.[gapId] || { pass1Ms: 0, pass2Ms: 0, totalMs: 0, invocations: 0 };
            const safeDuration = Math.max(0, durationMs);
            const next = {
                pass1Ms: current.pass1Ms + (pass === 'pass1' ? safeDuration : 0),
                pass2Ms: current.pass2Ms + (pass === 'pass2' ? safeDuration : 0),
                totalMs: current.totalMs + safeDuration,
                invocations: current.invocations + 1,
            };
            return {
                ...run,
                gapDurationsMs: {
                    ...run.gapDurationsMs,
                    [gapId]: next,
                },
            };
        });
    }
    setGapCounts(openGapCount: number, resolvedGapCount: number, unresolvedGapCount: number): void {
        this.update(run => ({
            ...run,
            openGapCount: Math.max(0, openGapCount),
            resolvedGapCount: Math.max(0, resolvedGapCount),
            unresolvedGapCount: Math.max(0, unresolvedGapCount),
        }));
    }
    recordDeniedPathStats(stats?: { insideCwdCount?: number; outsideCwdCount?: number } | null): void {
        if (!stats) return;
        this.update(run => ({
            ...run,
            deniedPathInsideCwdCount: run.deniedPathInsideCwdCount + Math.max(0, Number(stats.insideCwdCount || 0)),
            deniedPathOutsideCwdCount: run.deniedPathOutsideCwdCount + Math.max(0, Number(stats.outsideCwdCount || 0)),
        }));
    }
    recordMissingContextRequest(request: {
        source: 'pass2-needs' | 'denied-tool' | 'importer';
        gapId?: string;
        query?: string;
        detail: string;
    }): void {
        if (!request?.detail) return;
        this.update(run => {
            const existing = Array.isArray(run.missingContextRequests) ? run.missingContextRequests : [];
            const next = [...existing, request].slice(-200);
            return { ...run, missingContextRequests: next };
        });
    }
    setCreditsCost(creditsCost: number): void {
        this.update(run => ({
            ...run,
            creditsCost: Number.isFinite(creditsCost)
                ? (run.creditsCost == null ? creditsCost : run.creditsCost + creditsCost)
                : run.creditsCost,
        }));
    }
    setRepairAttempts(repairAttempts: number): void {
        this.update(run => ({ ...run, repairAttempts: Math.max(0, repairAttempts) }));
    }
    setAgentMetadata(provider: string, version?: string): void {
        this.update(run => ({
            ...run,
            agentProvider: provider || null,
            agentVersion: version || null,
        }));
    }
    recordModelUsage(stage: string, usage?: AgentModelUsage, sessionId?: string): void {
        if (!usage) return;
        this.update(run => ({
            ...run,
            agentModelUsage: {
                requestedModel: usage.requestedModel,
                actualModels: [...new Set([...(run.agentModelUsage?.actualModels || []), ...usage.actualModels])],
            },
            agentModelInvocations: [
                ...(run.agentModelInvocations || []).filter(entry => !sessionId || entry.sessionId !== sessionId),
                { stage, requestedModel: usage.requestedModel, actualModels: usage.actualModels, ...(sessionId ? { sessionId } : {}) },
            ],
        }));
    }
    setExecutionMode(mode: AgentExecutionMode): void {
        this.update(run => ({
            ...run,
            agentExecutionMode: mode === 'automatic' ? 'automatic' : 'manual',
        }));
    }
    incrementAgentInvocation(): void {
        this.update(run => ({
            ...run,
            agentInvocationCount: run.agentInvocationCount + 1,
        }));
    }
    setAgentExitCode(exitCode: number | null): void {
        this.update(run => ({
            ...run,
            agentExitCode: Number.isInteger(exitCode) ? exitCode : null,
        }));
    }
    markAgentTimedOut(): void {
        this.update(run => ({ ...run, agentTimedOut: true }));
    }
    markAgentCancelled(): void {
        this.update(run => ({ ...run, agentCancelled: true }));
    }
    setFallback(used: boolean, reason?: string): void {
        this.update(run => ({
            ...run,
            fallbackUsed: Boolean(used),
            fallbackReason: used ? (reason || 'unspecified') : null,
        }));
    }
    recordProjectionMetrics(metrics: ProjectionMetrics): void {
        this.update(run => ({
            ...run,
            initialGapCount: Math.max(0, metrics.initialGapCount),
            finalGapCount: Math.max(0, metrics.finalGapCount),
            hintsGenerated: Math.max(0, metrics.hintsGenerated),
            hintsUsed: Math.max(0, metrics.hintsUsed),
            gapsResolvedDeterministically: Math.max(0, metrics.gapsResolvedDeterministically),
        }));
    }
    setFinalGapCount(finalGapCount: number): void {
        this.update(run => ({ ...run, finalGapCount: Math.max(0, finalGapCount) }));
    }
    recordGapResolved(resolvedBy: GapResolver): void {
        if (resolvedBy !== 'deterministic') return;
        this.update(run => ({
            ...run,
            gapsResolvedDeterministically: run.gapsResolvedDeterministically + 1,
        }));
    }
    recordGapQuery(
        decision: 'accepted' | 'no-open-gap' | 'gap-not-found' | 'gap-blocking'
            | 'gap-resolved' | 'query-not-allowed' | 'invalid-args' | 'query-truncated'
            | 'duplicate-query' | 'max-queries-reached',
        metrics?: FrameworkQueryMetrics,
    ): void {
        this.update(run => ({
            ...run,
            queriesRequested: run.queriesRequested + 1,
            queriesAccepted: run.queriesAccepted + (decision === 'accepted' ? 1 : 0),
            queriesRejected: run.queriesRejected + (decision === 'accepted' ? 0 : 1),
            duplicateQueriesAvoided: run.duplicateQueriesAvoided + (decision === 'duplicate-query' ? 1 : 0),
            queriesAvoidedNoGap: run.queriesAvoidedNoGap + (decision === 'no-open-gap' ? 1 : 0),
            invalidArgsRejected: run.invalidArgsRejected + (decision === 'invalid-args' ? 1 : 0),
            queryTruncatedRejected: run.queryTruncatedRejected + (decision === 'query-truncated' ? 1 : 0),
            queryCount: run.queryCount + (decision === 'accepted' ? 1 : 0),
            indexDurationMs: run.indexDurationMs + Math.max(0, metrics?.indexDurationMs || 0),
            filesRead: run.filesRead + Math.max(0, metrics?.filesRead || 0),
            bytesRead: run.bytesRead + Math.max(0, metrics?.bytesRead || 0),
            cacheHits: run.cacheHits + (metrics?.cacheHit ? 1 : 0),
        }));
    }
    markAgentStarted(): void {
        this.update(run => ({
            ...run,
            timers: { ...run.timers, agentStartedAtMs: run.timers?.agentStartedAtMs ?? this.now() },
            result: 'agent-running',
        }));
    }
    markAgentFinished(): void {
        this.finishTimer('agentStartedAtMs', 'agentDurationMs');
    }
    markRepairStarted(): void {
        this.update(run => ({
            ...run,
            timers: { ...run.timers, repairStartedAtMs: run.timers?.repairStartedAtMs ?? this.now() },
            result: 'targeted-repair',
        }));
    }
    markRepairFinished(): void {
        this.finishTimer('repairStartedAtMs', 'repairDurationMs');
    }
    mark(result: string, terminal = false): void {
        this.update(run => ({
            ...run,
            result,
            ...(terminal ? { finishedAt: new Date(this.now()).toISOString() } : {}),
        }));
    }

    private finishTimer(timer: 'agentStartedAtMs' | 'repairStartedAtMs', field: DurationField): void {
        this.update(run => {
            const started = run.timers?.[timer];
            if (started === undefined) return run;
            const timers = { ...run.timers };
            delete timers[timer];
            return { ...run, [field]: run[field] + Math.max(0, this.now() - started), timers };
        });
    }

    private update(mutate: (run: AgentRunArtifact) => AgentRunArtifact): void {
        const current = this.read();
        if (!current) return;
        this.write(mutate(current));
    }

    private write(run: AgentRunArtifact): void {
        const now = this.now();
        const started = Date.parse(run.startedAt);
        const persisted: AgentRunArtifact = {
            ...run,
            updatedAt: new Date(now).toISOString(),
            totalDurationMs: Math.max(0, (run.finishedAt ? Date.parse(run.finishedAt) : now) - started),
            caseDurationMs: Math.max(0, (run.finishedAt ? Date.parse(run.finishedAt) : now) - started),
        };
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(persisted, null, 2) + '\n');
        fs.renameSync(temporary, this.file);
    }
}
