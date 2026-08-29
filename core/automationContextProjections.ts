import crypto from 'crypto';
import {
    ActionResolution,
    AutomationGap,
    AutomationGapsProjection,
    AutomationHint,
    AutomationHintsProjection,
    AutomationScenario,
    FrameworkContextQuery,
    GenerationPlan,
    ResolvedContext,
    UnresolvedContext,
    UnresolvedGap,
} from './automationContracts';

export interface ProjectionInput {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    resolvedContext?: ResolvedContext;
    unresolvedContext: UnresolvedContext;
}

export interface ProjectionMetrics {
    initialGapCount: number;
    finalGapCount: number;
    hintsGenerated: number;
    hintsUsed: number;
    gapsResolvedDeterministically: number;
}

const GAP_QUERY_RULES: Record<UnresolvedGap['type'], {
    allowedQueries: FrameworkContextQuery[];
    maxQueries: number;
    evidenceRequired: string[];
}> = {
    'missing-assertion': { allowedQueries: [], maxQueries: 0, evidenceRequired: ['qa-acceptance-criterion'] },
    'missing-selector': { allowedQueries: ['findLocator'], maxQueries: 1, evidenceRequired: ['verified-selector-or-locator'] },
    'missing-intent': { allowedQueries: ['findExistingStep', 'findExistingScreen'], maxQueries: 2, evidenceRequired: ['recorded-action-context'] },
    'test-data': { allowedQueries: ['findExample'], maxQueries: 1, evidenceRequired: ['framework-example'] },
    'test-input': { allowedQueries: ['findExample'], maxQueries: 1, evidenceRequired: ['qa-input-or-framework-example'] },
    'semantic-naming': { allowedQueries: ['findExistingScreen', 'findExistingStep'], maxQueries: 2, evidenceRequired: ['framework-symbol-or-path'] },
    'verification-semantics': { allowedQueries: ['findExistingStep', 'findExample'], maxQueries: 2, evidenceRequired: ['observable-expected-result'] },
    repetition: { allowedQueries: ['findExample'], maxQueries: 1, evidenceRequired: ['recorded-action-sequence'] },
    refinement: { allowedQueries: ['inspectScenario', 'findExistingScreen'], maxQueries: 2, evidenceRequired: ['validated-baseline'] },
    'qa-decision': { allowedQueries: [], maxQueries: 0, evidenceRequired: ['explicit-qa-decision'] },
};

function stableId(prefix: string, values: unknown[]): string {
    return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 12)}`;
}

function confidence(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(1, Number(value.toFixed(4))))
        : undefined;
}

function resolutionHints(resolutions: ActionResolution[]): AutomationHint[] {
    return resolutions.flatMap<AutomationHint>(resolution => {
        const base = {
            intent: resolution.intent,
            evidence: { sequence: resolution.sequence, reason: resolution.reason },
        };
        if (resolution.resolution === 'reuse' && resolution.source && resolution.locatorName) {
            return [{
                id: stableId('hint', ['existing_locator', resolution.source.file, resolution.locatorName]),
                type: 'existing_locator' as const,
                confidence: 1,
                source: 'framework-index' as const,
                symbol: resolution.locatorName,
                path: resolution.source.file,
                relation: 'exact-selector-match',
                ...base,
            }];
        }
        if (resolution.resolution === 'create' && resolution.selector) {
            return [{
                id: stableId('hint', ['verified_selector', resolution.sequence, resolution.locatorName]),
                type: 'verified_selector' as const,
                confidence: 1,
                source: 'qa-recording' as const,
                symbol: resolution.locatorName,
                relation: 'verified-primary-selector',
                ...base,
            }];
        }
        if (resolution.resolution === 'builtin') {
            return [{
                id: stableId('hint', ['builtin_action', resolution.sequence, resolution.action]),
                type: 'builtin_action' as const,
                confidence: 1,
                source: 'deterministic-resolver' as const,
                symbol: resolution.action,
                relation: 'framework-helper-action',
                ...base,
            }];
        }
        return [];
    });
}

function normalizeGap(gap: UnresolvedGap, resolutions: ActionResolution[]): AutomationGap {
    const rule = GAP_QUERY_RULES[gap.type] || {
        allowedQueries: [] as FrameworkContextQuery[],
        maxQueries: 0,
        evidenceRequired: ['legacy-gap-evidence'],
    };
    const linked = resolutions.find(resolution => resolution.gapId === gap.id || (
        gap.sequence !== undefined && resolution.sequence === gap.sequence
    ));
    const blocking = Boolean(gap.blocking);
    const status = gap.status || (blocking ? 'blocked-qa' : 'open');
    return {
        ...gap,
        intent: gap.intent || linked?.intent || gap.description,
        reason: gap.reason || gap.description,
        blocking,
        allowedQueries: blocking ? [] : (gap.allowedQueries || rule.allowedQueries),
        maxQueries: blocking ? 0 : (gap.maxQueries ?? rule.maxQueries),
        expectedAnswerSchema: gap.expectedAnswerSchema || {
            type: 'object',
            required: ['gapId', 'decision'],
            properties: { gapId: { const: gap.id }, decision: { type: 'string' }, reason: { type: 'string' } },
            additionalProperties: false,
        },
        evidenceRequired: gap.evidenceRequired || rule.evidenceRequired,
        resolvedBy: gap.resolvedBy || null,
        status,
    };
}

export function deriveAutomationContextProjections(input: ProjectionInput): {
    hints: AutomationHintsProjection;
    gaps: AutomationGapsProjection;
    metrics: ProjectionMetrics;
} {
    const generatedHints = resolutionHints(input.plan.resolutions);
    const awareness = input.resolvedContext?.frameworkAwareness;
    for (const definition of awareness?.exactStepDefinitions || []) {
        generatedHints.push({
            id: stableId('hint', ['existing_step', definition.file, definition.expression]),
            type: 'existing_step', confidence: 1, source: 'framework-index',
            symbol: definition.expression, path: definition.file, relation: 'exact-gherkin-match',
            evidence: { scope: definition.scope },
        });
    }
    for (const candidate of (awareness?.candidates || []).slice(0, 3)) {
        const candidateConfidence = confidence(candidate.score);
        if (candidateConfidence === undefined) continue;
        generatedHints.push({
            id: stableId('hint', ['existing_scenario', candidate.file, candidate.scenario]),
            type: 'existing_scenario', confidence: candidateConfidence, source: 'framework-index',
            symbol: candidate.scenario, path: candidate.file, relation: 'scenario-similarity',
            evidence: { selectorCoverage: candidate.selectorCoverage, caseId: candidate.caseId },
        });
    }
    if (input.plan.reuseTarget?.screen) {
        const reuseConfidence = confidence(input.plan.reuseTarget.score);
        if (reuseConfidence !== undefined) {
        generatedHints.push({
            id: stableId('hint', ['existing_screen', input.plan.reuseTarget.screen]),
            type: 'existing_screen', confidence: reuseConfidence, source: 'framework-index',
            path: input.plan.reuseTarget.screen, symbol: input.plan.reuseTarget.screen.split('/').pop(),
            relation: 'artifact-bundle-reuse', evidence: { reason: input.plan.reuseTarget.reason },
        });
        }
    }
    if (input.resolvedContext?.frameworkContract) {
        generatedHints.push({
            id: stableId('hint', ['framework_contract', input.resolvedContext.frameworkContract]),
            type: 'framework_contract', confidence: 1, source: 'framework-contract',
            symbol: input.resolvedContext.frameworkContract.baseScreenClass,
            path: input.resolvedContext.frameworkContract.baseScreenImport,
            relation: 'resolved-framework-contract',
            evidence: {
                locatorFactoryImport: input.resolvedContext.frameworkContract.locatorFactoryImport,
                typeLocatorImport: input.resolvedContext.frameworkContract.typeLocatorImport,
            },
        });
    }
    const hints = [...new Map(generatedHints.map(item => [item.id, item])).values()];
    const gaps = input.unresolvedContext.gaps.map(gap => normalizeGap(gap, input.plan.resolutions));
    const finalGapCount = gaps.filter(gap => gap.status !== 'resolved').length;
    return {
        hints: { schemaVersion: 1, recordingId: input.scenario.recordingId, planId: input.plan.planId, hints },
        gaps: { schemaVersion: 1, recordingId: input.scenario.recordingId, planId: input.plan.planId, gaps },
        metrics: {
            initialGapCount: input.unresolvedContext.gaps.length,
            finalGapCount,
            hintsGenerated: hints.length,
            hintsUsed: 0,
            gapsResolvedDeterministically: gaps.filter(gap => gap.status === 'resolved' && gap.resolvedBy === 'deterministic').length,
        },
    };
}

export const automationGapQueryRules = GAP_QUERY_RULES;
