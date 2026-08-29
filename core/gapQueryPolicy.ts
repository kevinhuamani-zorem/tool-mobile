import {
    AutomationGap,
    AutomationGapsProjection,
    FrameworkContextQuery,
    GapResolver,
} from './automationContracts';
import { AgentRunStore } from './agentRunStore';
import {
    FrameworkQueryInput,
    FrameworkQueryResponse,
    FrameworkQueryService,
} from './frameworkQueryService';

export type GapQueryRejection =
    | 'no-open-gap'
    | 'gap-not-found'
    | 'gap-blocking'
    | 'gap-resolved'
    | 'query-not-allowed'
    | 'duplicate-query'
    | 'max-queries-reached';

export interface GapQueryDecision {
    schemaVersion: 1;
    accepted: boolean;
    gapId: string;
    query: FrameworkContextQuery;
    reason: 'accepted' | GapQueryRejection;
    response?: FrameworkQueryResponse;
}

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
    return JSON.stringify(value);
}

export class GapQueryPolicy {
    private readonly gaps = new Map<string, AutomationGap>();
    private readonly acceptedPerGap = new Map<string, number>();
    private readonly executed = new Set<string>();

    constructor(
        projection: AutomationGapsProjection,
        private readonly service: Pick<FrameworkQueryService, 'execute'>,
        private readonly telemetry?: AgentRunStore,
    ) {
        for (const gap of projection.gaps) this.gaps.set(gap.id, gap);
        this.telemetry?.setFinalGapCount(this.openGapCount());
    }

    request(gapId: string, query: FrameworkContextQuery, input: FrameworkQueryInput = {}): GapQueryDecision {
        const gap = this.gaps.get(gapId);
        if (gap?.blocking || gap?.status === 'blocked-qa') return this.reject(gapId, query, 'gap-blocking');
        if (gap?.status === 'resolved') return this.reject(gapId, query, 'gap-resolved');
        const open = [...this.gaps.values()].filter(candidate => candidate.status === 'open' && !candidate.blocking);
        if (!open.length) return this.reject(gapId, query, 'no-open-gap');
        if (!gap) return this.reject(gapId, query, 'gap-not-found');
        if (!gap.allowedQueries.includes(query)) return this.reject(gapId, query, 'query-not-allowed');
        const fingerprint = `${gapId}:${query}:${stable(input)}`;
        if (this.executed.has(fingerprint)) return this.reject(gapId, query, 'duplicate-query');
        if ((this.acceptedPerGap.get(gapId) || 0) >= gap.maxQueries) {
            return this.reject(gapId, query, 'max-queries-reached');
        }
        this.executed.add(fingerprint);
        this.acceptedPerGap.set(gapId, (this.acceptedPerGap.get(gapId) || 0) + 1);
        const response = this.service.execute(query, input);
        this.telemetry?.recordGapQuery('accepted', response.metrics);
        return { schemaVersion: 1, accepted: true, gapId, query, reason: 'accepted', response };
    }

    resolve(gapId: string, resolvedBy: GapResolver): AutomationGap | undefined {
        const gap = this.gaps.get(gapId);
        if (!gap) return undefined;
        gap.status = 'resolved';
        gap.resolvedBy = resolvedBy;
        this.telemetry?.recordGapResolved(resolvedBy);
        this.telemetry?.setFinalGapCount(this.openGapCount());
        return gap;
    }

    snapshot(): AutomationGap[] {
        return [...this.gaps.values()].map(gap => ({ ...gap }));
    }

    private openGapCount(): number {
        return [...this.gaps.values()].filter(gap => gap.status !== 'resolved').length;
    }

    private reject(gapId: string, query: FrameworkContextQuery, reason: GapQueryRejection): GapQueryDecision {
        this.telemetry?.recordGapQuery(reason);
        return { schemaVersion: 1, accepted: false, gapId, query, reason };
    }
}
