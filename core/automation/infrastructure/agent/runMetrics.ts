/**
 * Métricas de ejecuciones anidadas (una por gap en modo per-gap-parallel):
 * se agregan sobre agent-run.json del paquete padre sumando contadores,
 * tomando el máximo de contextos y fusionando duraciones por gap.
 */
import fs from 'fs';
import path from 'path';
import { readJson, writeJson } from './packageArtifacts';

export function pickMaxBreakdown(
    runs: Array<Record<string, any>>,
    field: 'pass1ContextBreakdown' | 'pass2ContextBreakdown',
): Record<string, any> | null {
    let picked: Record<string, any> | null = null;
    for (const run of runs) {
        const candidate = run?.[field];
        if (!candidate || typeof candidate !== 'object') continue;
        const pickedTotal = Number(picked?.totalBytes || 0);
        const candidateTotal = Number(candidate.totalBytes || 0);
        if (!picked || candidateTotal > pickedTotal) picked = candidate;
    }
    return picked;
}


export function aggregateNestedRunMetrics(
    packageDirectory: string,
    nestedRuns: Array<Record<string, any>>,
): void {
    const file = path.join(packageDirectory, 'agent-run.json');
    if (!fs.existsSync(file)) return;
    const parent = readJson<Record<string, any>>(file);
    const sum = (field: string) => nestedRuns.reduce((acc, run) => acc + Math.max(0, Number(run?.[field] || 0)), 0);
    const max = (field: string) => nestedRuns.reduce((acc, run) => Math.max(acc, Math.max(0, Number(run?.[field] || 0))), 0);
    const firstProvider = nestedRuns.find(run => run?.agentProvider || run?.agentVersion);
    const mergedGapDurations = nestedRuns.reduce((acc, run) => {
        const current = run?.gapDurationsMs;
        if (!current || typeof current !== 'object') return acc;
        for (const [gapId, entry] of Object.entries(current as Record<string, any>)) {
            const previous = acc[gapId] || { pass1Ms: 0, pass2Ms: 0, totalMs: 0, invocations: 0 };
            acc[gapId] = {
                pass1Ms: previous.pass1Ms + Math.max(0, Number((entry as any)?.pass1Ms || 0)),
                pass2Ms: previous.pass2Ms + Math.max(0, Number((entry as any)?.pass2Ms || 0)),
                totalMs: previous.totalMs + Math.max(0, Number((entry as any)?.totalMs || 0)),
                invocations: previous.invocations + Math.max(0, Number((entry as any)?.invocations || 0)),
            };
        }
        return acc;
    }, {} as Record<string, { pass1Ms: number; pass2Ms: number; totalMs: number; invocations: number }>);
    const merged = {
        ...parent,
        agentModelInvocations: nestedRuns.flatMap(run => run.agentModelInvocations || []),
        agentModelUsage: nestedRuns.some(run => run.agentModelUsage) ? {
            requestedModel: nestedRuns.find(run => run.agentModelUsage)?.agentModelUsage.requestedModel,
            actualModels: [...new Set(nestedRuns.flatMap(run => run.agentModelUsage?.actualModels || []))],
        } : null,
        agentInvocationCount: sum('agentInvocationCount'),
        agentDurationMs: sum('agentDurationMs'),
        pass1DurationMs: sum('pass1DurationMs'),
        pass2DurationMs: sum('pass2DurationMs'),
        queryCount: sum('queryCount'),
        queriesRequested: sum('queriesRequested'),
        queriesAccepted: sum('queriesAccepted'),
        queriesRejected: sum('queriesRejected'),
        invalidArgsRejected: sum('invalidArgsRejected'),
        queryTruncatedRejected: sum('queryTruncatedRejected'),
        duplicateQueriesAvoided: sum('duplicateQueriesAvoided'),
        queriesAvoidedNoGap: sum('queriesAvoidedNoGap'),
        filesRead: sum('filesRead'),
        bytesRead: sum('bytesRead'),
        cacheHits: sum('cacheHits'),
        indexDurationMs: sum('indexDurationMs'),
        pass1ContextBytes: max('pass1ContextBytes'),
        pass2ContextBytes: max('pass2ContextBytes'),
        contextBytes: max('contextBytes'),
        totalContextBytes: sum('totalContextBytes'),
        aggregatedContextBytes: sum('aggregatedContextBytes') || sum('totalContextBytes'),
        deniedPathInsideCwdCount: sum('deniedPathInsideCwdCount'),
        deniedPathOutsideCwdCount: sum('deniedPathOutsideCwdCount'),
        missingContextRequests: nestedRuns
            .flatMap(run => Array.isArray(run?.missingContextRequests) ? run.missingContextRequests : [])
            .slice(-200),
        gapDurationsMs: mergedGapDurations,
        pass1ContextBreakdown: pickMaxBreakdown(nestedRuns, 'pass1ContextBreakdown'),
        pass2ContextBreakdown: pickMaxBreakdown(nestedRuns, 'pass2ContextBreakdown'),
        openGapCount: sum('openGapCount'),
        resolvedGapCount: sum('resolvedGapCount'),
        unresolvedGapCount: sum('unresolvedGapCount'),
        creditsCost: sum('creditsCost') || null,
        agentTimedOut: nestedRuns.some(run => Boolean(run?.agentTimedOut)),
        agentCancelled: nestedRuns.some(run => Boolean(run?.agentCancelled)),
        ...(firstProvider?.agentProvider ? { agentProvider: firstProvider.agentProvider } : {}),
        ...(firstProvider?.agentVersion ? { agentVersion: firstProvider.agentVersion } : {}),
    };
    writeJson(file, merged);
}
