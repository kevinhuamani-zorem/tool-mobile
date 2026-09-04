/**
 * Contabilidad de consultas al framework durante la pasada semántica: cada
 * petición pasa por GapQueryPolicy y queda registrada en query-results.json
 * con su decisión (aceptada, rechazada y por qué, o error del proveedor).
 */
import {
    AgentContextQueryResult,
    AgentContextQueryResults,
    AgentDomainErrorCode,
} from '../../contracts';
import { AgentRunStore } from '../agentRunStore';
import { GapQueryPolicy } from '../gapQueryPolicy';

export interface QueryCounters {
    total: number;
    perGap: Record<string, number>;
}

export function rejectionCode(reason: string): AgentContextQueryResult['code'] {
    if (reason === 'query-not-allowed') return 'query-not-allowed';
    if (reason === 'invalid-args') return 'invalid-args';
    if (reason === 'query-truncated') return 'query-truncated';
    if (reason === 'no-open-gap' || reason === 'gap-not-found' || reason === 'gap-resolved') return 'no-open-gap';
    if (reason === 'gap-blocking') return 'blocked-qa';
    if (reason === 'duplicate-query') return 'duplicate-query';
    if (reason === 'max-queries-reached') return 'max-queries-exceeded';
    return 'context-budget-exceeded';
}

export function increase(counters: QueryCounters, gapId: string): void {
    counters.total += 1;
    counters.perGap[gapId] = (counters.perGap[gapId] || 0) + 1;
}

export function budgetError(violations: AgentDomainErrorCode[]): { code: AgentDomainErrorCode; message: string } | null {
    if (!violations.length) return null;
    return {
        code: violations[0],
        message: `Presupuesto excedido: ${violations.join(', ')}`,
    };
}

export function appendQueryDecision(
    policy: GapQueryPolicy,
    counters: QueryCounters,
    queryResults: AgentContextQueryResults,
    request: { id: string; gapId: string; query: string; args: Record<string, unknown> },
): void {
    const decision = policy.request(request.gapId, request.query as any, { ...(request.args || {}) });
    if (!decision.accepted) {
        queryResults.results.push({
            requestId: request.id,
            gapId: request.gapId,
            status: 'rejected',
            code: rejectionCode(decision.reason),
            evidence: [decision.reason, decision.message].filter(Boolean) as string[],
        });
        return;
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

export function recordDeniedToolAttempts(
    runStore: AgentRunStore,
    attempts: Array<{ tool?: string; detail?: string }> | undefined,
): void {
    for (const attempt of attempts || []) {
        const detail = String(attempt?.detail || '').trim();
        if (!detail) continue;
        runStore.recordMissingContextRequest({
            source: 'denied-tool',
            detail: `${attempt?.tool || 'unknown'}: ${detail}`,
        });
    }
}
