import {
    AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
    AgentContextQueryRequest,
    AgentContextQueryRequests,
    AutomationGap,
    AutomationHint,
    AutomationScenario,
    FrameworkContextQuery,
    GenerationPlan,
} from '../contracts';

export interface DeterministicQueryPlannerInput {
    scenario: Pick<AutomationScenario, 'squad' | 'objective' | 'acceptanceCriteria'>;
    plan: Pick<GenerationPlan, 'recordingId' | 'planId' | 'resolutions' | 'budgets'>;
    gaps: AutomationGap[];
    hints?: AutomationHint[];
}

function safeText(value: unknown): string {
    return String(value || '').trim();
}

function coalesceTerm(...values: unknown[]): string {
    for (const value of values) {
        const text = safeText(value);
        if (text) return text;
    }
    return '';
}

function allowed(gap: AutomationGap, query: FrameworkContextQuery): boolean {
    return Array.isArray(gap.allowedQueries) && gap.allowedQueries.includes(query);
}

export class DeterministicQueryPlanner {
    plan(input: DeterministicQueryPlannerInput): AgentContextQueryRequests {
        const requests: AgentContextQueryRequest[] = [];
        const maxGlobal = Math.max(1, Number(input.plan.budgets?.maxTotalQueries || 1));
        for (const gap of input.gaps) {
            if (gap.status !== 'open' || gap.blocking) continue;
            const maxPerGap = Math.max(0, Number(gap.maxQueries || 0));
            if (maxPerGap <= 0) continue;
            const base = input.plan.resolutions.find(item =>
                item.gapId === gap.id
                || (Number.isInteger(gap.sequence) && item.sequence === gap.sequence)
            );
            const term = coalesceTerm(
                gap.intent,
                base?.intent,
                base?.locatorName,
                gap.description,
                input.scenario.objective,
                input.scenario.acceptanceCriteria,
            );
            const push = (query: FrameworkContextQuery, args: Record<string, unknown>): void => {
                if (!allowed(gap, query)) return;
                const gapCount = requests.filter(item => item.gapId === gap.id).length;
                if (gapCount >= maxPerGap || requests.length >= maxGlobal) return;
                requests.push({
                    id: `q-${gap.id}-${gapCount + 1}`,
                    gapId: gap.id,
                    query,
                    args: {
                        squad: input.scenario.squad,
                        ...args,
                    },
                });
            };

            if ((gap.type === 'semantic-naming' || gap.type === 'verification-semantics') && term) {
                push('findExistingScreen', { term, limit: 5 });
                push('findExistingStep', { term, limit: 5 });
                push('findLocator', { term, symbol: safeText(base?.locatorName), limit: 5 });
            }
            if (gap.type === 'verification-semantics') {
                push('findExample', { term: coalesceTerm(gap.requiredOutput, term), intent: term, limit: 3 });
            }
            if (gap.type === 'missing-intent' || gap.type === 'refinement') {
                push('inspectScenario', { term, intent: term, limit: 5 });
            }
            if (requests.filter(item => item.gapId === gap.id).length === 0 && term) {
                push('findExample', { term, intent: term, limit: 3 });
            }
        }
        return {
            schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
            recordingId: input.plan.recordingId,
            planId: input.plan.planId,
            requests,
        };
    }
}
