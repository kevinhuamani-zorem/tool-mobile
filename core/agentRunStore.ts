import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { CodeGraphBuildMetrics } from './codeGraph';
import type { FrameworkQueryMetrics } from './frameworkQueryService';
import type { ProjectionMetrics } from './automationContextProjections';
import { AgentExecutionMode } from './automationContracts';

export interface AgentRunArtifact {
    schemaVersion: 1;
    runId: string;
    recordingId: string;
    planId?: string;
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    totalDurationMs: number;
    resolverDurationMs: number;
    indexDurationMs: number;
    agentDurationMs: number;
    validatorDurationMs: number;
    repairDurationMs: number;
    queryCount: number;
    filesRead: number;
    bytesRead: number;
    contextBytes: number;
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
    agentProvider: string | null;
    agentVersion: string | null;
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
            resolverDurationMs: 0,
            indexDurationMs: 0,
            agentDurationMs: 0,
            validatorDurationMs: 0,
            repairDurationMs: 0,
            queryCount: 0,
            filesRead: 0,
            bytesRead: 0,
            contextBytes: 0,
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
            agentProvider: null,
            agentVersion: null,
            agentExecutionMode: 'manual',
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
                agentProvider: parsed.agentProvider || null,
                agentVersion: parsed.agentVersion || null,
                agentExecutionMode: parsed.agentExecutionMode === 'automatic' ? 'automatic' : 'manual',
                agentInvocationCount: parsed.agentInvocationCount || 0,
                agentExitCode: Number.isInteger(parsed.agentExitCode) ? parsed.agentExitCode : null,
                agentTimedOut: Boolean(parsed.agentTimedOut),
                agentCancelled: Boolean(parsed.agentCancelled),
                fallbackUsed: Boolean(parsed.fallbackUsed),
                fallbackReason: parsed.fallbackReason || null,
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
        this.update(run => ({ ...run, contextBytes: Math.max(0, contextBytes) }));
    }
    setResponseBytes(responseBytes: number): void {
        this.update(run => ({ ...run, responseBytes: Math.max(0, responseBytes) }));
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
    recordGapResolved(resolvedBy: 'qa' | 'deterministic' | 'agent'): void {
        if (resolvedBy !== 'deterministic') return;
        this.update(run => ({
            ...run,
            gapsResolvedDeterministically: run.gapsResolvedDeterministically + 1,
        }));
    }
    recordGapQuery(
        decision: 'accepted' | 'no-open-gap' | 'gap-not-found' | 'gap-blocking'
            | 'gap-resolved' | 'query-not-allowed' | 'duplicate-query' | 'max-queries-reached',
        metrics?: FrameworkQueryMetrics,
    ): void {
        this.update(run => ({
            ...run,
            queriesRequested: run.queriesRequested + 1,
            queriesAccepted: run.queriesAccepted + (decision === 'accepted' ? 1 : 0),
            queriesRejected: run.queriesRejected + (decision === 'accepted' ? 0 : 1),
            duplicateQueriesAvoided: run.duplicateQueriesAvoided + (decision === 'duplicate-query' ? 1 : 0),
            queriesAvoidedNoGap: run.queriesAvoidedNoGap + (decision === 'no-open-gap' ? 1 : 0),
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
        };
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(persisted, null, 2) + '\n');
        fs.renameSync(temporary, this.file);
    }
}
