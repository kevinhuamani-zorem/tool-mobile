/**
 * Cobertura de gaps entre pasadas y ejecuciones anidadas: fusión de
 * respuestas por gap, garantía de que cada gap abierto tenga resolución,
 * necesidades de PASS 2 declaradas por el agente y resoluciones que el
 * recorder cierra sin agente (repetición).
 */
import { FRAMEWORK_CONTEXT_QUERIES, GapResolution, GapResolutionFile } from '../../contracts';

const PLANNER_OWNED_VALIDATION_CODES = new Set([
    'generic-template-gherkin',
]);

export function requiresPlannerRegeneration(
    errors: Array<{ code: string; message: string; file?: string }>,
): boolean {
    return errors.some(error => PLANNER_OWNED_VALIDATION_CODES.has(String(error.code || '')));
}

export interface Pass2Need {
    gapId: string;
    query: string;
    args: Record<string, unknown>;
}

export type MultiGapStrategy = 'compact-case' | 'per-gap-parallel';

export function mergeGapResponses(responses: Array<Record<string, any>>): Record<string, any> {
    const first = responses[0];
    const mergedResolutions = new Map<string, any>();
    const mergedTrace = new Map<number, any>();
    for (const response of responses) {
        for (const resolution of response.resolutions || []) {
            if (resolution?.gapId) mergedResolutions.set(resolution.gapId, resolution);
        }
        for (const trace of response.actionTrace || []) {
            if (Number.isInteger(trace?.sequence)) mergedTrace.set(trace.sequence, trace);
        }
    }
    return {
        ...first,
        resolutions: [...mergedResolutions.values()],
        actionTrace: [...mergedTrace.values()].sort((a, b) => a.sequence - b.sequence),
    };
}

const DEFAULT_MULTI_GAP_STRATEGY: MultiGapStrategy = 'compact-case';

export function resolveMultiGapStrategy(raw = process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY): MultiGapStrategy {
    return raw === 'per-gap-parallel' ? 'per-gap-parallel' : DEFAULT_MULTI_GAP_STRATEGY;
}

export function ensureGapResolutionCoverage(
    response: Record<string, any>,
    gapIds: string[],
    reasonsByGap: Record<string, string>,
): Record<string, any> {
    const existing = Array.isArray(response.resolutions) ? response.resolutions : [];
    const byGap = new Map<string, Record<string, any>>();
    for (const item of existing) {
        if (!item || typeof item !== 'object' || typeof item.gapId !== 'string') continue;
        if (!byGap.has(item.gapId)) byGap.set(item.gapId, { ...item });
    }
    const covered = gapIds.map(gapId => {
        const current = byGap.get(gapId);
        if (!current) {
            return {
                gapId,
                decision: 'unresolved',
                reason: reasonsByGap[gapId] || 'Gap no resuelto en esta ejecución.',
            };
        }
        if (current.decision === 'unresolved' && (!current.reason || !String(current.reason).trim())) {
            return {
                ...current,
                reason: reasonsByGap[gapId] || 'Gap no resuelto en esta ejecución.',
            };
        }
        return current;
    });
    const extras = existing.filter((item: any) =>
        item && typeof item.gapId === 'string' && !gapIds.includes(item.gapId)
    );
    return { ...response, resolutions: [...covered, ...extras] };
}

export function resolutionCounts(
    response: Record<string, any> | null,
    openGapIds: string[],
): { resolved: number; unresolved: number } {
    if (!response) return { resolved: 0, unresolved: openGapIds.length };
    const byGap = new Map<string, string>();
    for (const item of response.resolutions || []) {
        if (!item || typeof item !== 'object' || typeof item.gapId !== 'string') continue;
        byGap.set(item.gapId, String(item.decision || ''));
    }
    let resolved = 0;
    for (const gapId of openGapIds) {
        const decision = byGap.get(gapId);
        if (decision && decision !== 'unresolved') resolved += 1;
    }
    return { resolved, unresolved: Math.max(0, openGapIds.length - resolved) };
}

export function unresolvedDecision(decision: unknown): boolean {
    return /^(unresolved|failed|error|blocked|not-resolved)$/i.test(String(decision || '').trim());
}

export function collectPass2Needs(
    response: Record<string, any>,
    openGapIds: Set<string>,
): Pass2Need[] {
    const needs: Pass2Need[] = [];
    const allowed = new Set<string>(FRAMEWORK_CONTEXT_QUERIES);
    for (const resolution of response?.resolutions || []) {
        const gapId = typeof resolution?.gapId === 'string' ? resolution.gapId : '';
        if (!gapId || !openGapIds.has(gapId)) continue;
        if (!unresolvedDecision(resolution.decision)) continue;
        const requested = Array.isArray(resolution.needs) ? resolution.needs : [];
        for (const need of requested) {
            const query = typeof need?.query === 'string' ? need.query : '';
            const args = need?.args && typeof need.args === 'object' && !Array.isArray(need.args)
                ? need.args as Record<string, unknown>
                : {};
            if (!allowed.has(query)) continue;
            needs.push({ gapId, query, args });
        }
    }
    return needs;
}

export function mergeGapResolutionsWithCoverage(
    openGaps: Array<{ id: string; type: string; requiredOutput?: string }>,
    deterministic: GapResolution[],
    semantic?: GapResolutionFile | null,
): GapResolution[] {
    const byGap = new Map<string, GapResolution>();
    for (const resolution of deterministic) byGap.set(resolution.gapId, resolution);
    for (const resolution of semantic?.resolutions || []) byGap.set(resolution.gapId, resolution);
    for (const gap of openGaps) {
        if (byGap.has(gap.id)) continue;
        byGap.set(gap.id, {
            gapId: gap.id,
            decision: 'unresolved',
            reason: gap.requiredOutput || `Gap abierto (${gap.type}) sin resolución semántica.`,
        });
    }
    return openGaps.map(gap => byGap.get(gap.id)!).filter(Boolean);
}

export function deterministicGapResolutions(
    openGaps: Array<{ id: string; type: string; requiredOutput?: string }>,
): GapResolution[] {
    return openGaps
        .filter(gap => gap.type === 'repetition')
        .map(gap => ({
            gapId: gap.id,
            decision: 'resolved' as const,
            reason: 'Gap de repetición resuelto de forma determinística por el recorder.',
        }));
}

