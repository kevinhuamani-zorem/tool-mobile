import fs from 'fs';
import path from 'path';
import { AutomationGap, AutomationGapsProjection, AutomationHint, GenerationPlan } from '../contracts';

export type AgentPass = 'pass1' | 'pass2';

export interface ContextBreakdown {
    promptBaseBytes: number;
    instructionsBytes: number;
    scenarioBytes: number;
    generationPlanBytes: number;
    hintsBytes: number;
    gapsBytes: number;
    frameworkApiBytes: number;
    reuseContextBytes: number;
    resolvedContextBytes: number;
    unresolvedContextBytes: number;
    collisionReportBytes: number;
    queryRequestsBytes: number;
    queryResultsBytes: number;
    queryContractBytes: number;
    wrapperBytes: number;
    totalBytes: number;
}

export interface AgentPassContextEnvelope {
    pass: AgentPass;
    prompt: string;
    breakdown: ContextBreakdown;
    context: {
        scenario: Record<string, unknown>;
        generationPlan: Record<string, unknown>;
        hints: Record<string, unknown>;
        gaps: Record<string, unknown>;
        queryContract: Record<string, unknown>;
        validationContract?: Record<string, unknown>;
        frameworkApi?: Record<string, unknown>;
        reuseContext?: Record<string, unknown>;
        collisionReport?: Record<string, unknown>;
        queryResults?: Record<string, unknown>;
    };
}

export interface AgentPassContextOptions {
    focusGapId?: string;
    fullQueryResults?: boolean;
}

const QUERY_RESULTS_STRING_LIMIT = Number.isFinite(Number(process.env.RECORDER_AGENT_QUERY_RESULT_MAX_STRING))
    ? Number(process.env.RECORDER_AGENT_QUERY_RESULT_MAX_STRING)
    : 320;
const QUERY_RESULTS_ARRAY_LIMIT = Number.isFinite(Number(process.env.RECORDER_AGENT_QUERY_RESULT_MAX_ITEMS))
    ? Number(process.env.RECORDER_AGENT_QUERY_RESULT_MAX_ITEMS)
    : 12;
const SAFE_QUERY_RESULTS_STRING_LIMIT = Math.max(80, Math.floor(QUERY_RESULTS_STRING_LIMIT));
const SAFE_QUERY_RESULTS_ARRAY_LIMIT = Math.max(3, Math.floor(QUERY_RESULTS_ARRAY_LIMIT));

function readJson<T>(file: string): T | undefined {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function bytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

function textBytes(value: string): number {
    return Buffer.byteLength(value, 'utf-8');
}

function safeText(value: unknown, max = 140): string {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

function tokens(value: unknown): Set<string> {
    return new Set(
        String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter(token => token.length >= 3)
    );
}

function overlap(a: Set<string>, b: Set<string>): boolean {
    for (const token of a) if (b.has(token)) return true;
    return false;
}

function openGapsOnly(gaps?: AutomationGapsProjection, focusGapId?: string): AutomationGap[] {
    const open = (gaps?.gaps || []).filter(gap => gap.status === 'open' && !gap.blocking);
    if (!focusGapId) return open;
    return open.filter(gap => gap.id === focusGapId);
}

function relatedSequences(plan: GenerationPlan | undefined, openGapIds: Set<string>, direct: Set<number>): Set<number> {
    const related = new Set<number>(direct);
    for (const resolution of plan?.resolutions || []) {
        if (resolution.sequence === undefined) continue;
        if (resolution.gapId && openGapIds.has(resolution.gapId)) related.add(resolution.sequence);
    }
    return related;
}

function compactHints(
    hints: AutomationHint[],
    relevantTokens: Set<string>,
    sequences: Set<number>,
    queryFamilies: Set<'screen' | 'step' | 'locator' | 'example' | 'contract'>,
): AutomationHint[] {
    const selected = hints
        .map(hint => {
            const hintTokens = new Set<string>([
                ...tokens(hint.intent),
                ...tokens(hint.symbol),
                ...tokens(hint.relation),
            ]);
            const seq = Number((hint.evidence as Record<string, unknown> | undefined)?.sequence);
            let score = 0;
            if (Number.isInteger(seq) && sequences.has(seq)) score += 6;
            if (overlap(hintTokens, relevantTokens)) score += 3;
            if (hint.type === 'framework_contract') score += 2;
            if (
                (queryFamilies.has('screen') && hint.type === 'existing_screen')
                || (queryFamilies.has('step') && hint.type === 'existing_step')
                || (queryFamilies.has('locator') && (hint.type === 'existing_locator' || hint.type === 'verified_selector'))
                || (queryFamilies.has('example') && hint.type === 'existing_scenario')
            ) score += 2;
            return { hint, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.hint.id.localeCompare(b.hint.id))
        .slice(0, 12)
        .map(item => ({
            id: item.hint.id,
            type: item.hint.type,
            confidence: item.hint.confidence,
            source: item.hint.source,
            symbol: item.hint.symbol,
            path: item.hint.path,
            intent: item.hint.intent,
            relation: item.hint.relation,
            evidence: {
                sequence: (item.hint.evidence as Record<string, unknown> | undefined)?.sequence,
                reason: (item.hint.evidence as Record<string, unknown> | undefined)?.reason,
                scope: (item.hint.evidence as Record<string, unknown> | undefined)?.scope,
                caseId: (item.hint.evidence as Record<string, unknown> | undefined)?.caseId,
            },
        }));
    return selected;
}

function compactScenario(
    scenario: Record<string, any> | undefined,
    plan: GenerationPlan | undefined,
    sequences: Set<number>,
    pass: AgentPass,
): Record<string, unknown> {
    const actions = Array.isArray(scenario?.actions) ? scenario.actions : [];
    const scenarioRows = Array.isArray(scenario?.request?.scenarioRows) ? scenario.request.scenarioRows : [];
    const actionFilter = pass === 'pass1'
        ? new Set([...sequences, ...[...sequences].map(value => value - 1), ...[...sequences].map(value => value + 1)])
        : null;
    const compactActions = actions
        .filter((action: Record<string, unknown>) =>
            actionFilter ? actionFilter.has(Number(action.sequence)) : true
        )
        .slice(0, pass === 'pass1' ? 20 : 50)
        .map((action: Record<string, unknown>) => ({
            sequence: action.sequence,
            action: action.action,
            description: safeText(action.description || action.contextHint || action.elementIntent, 120),
            hasSelector: Boolean(action.selector || action.locatorValue),
        }));
    const compactRows = scenarioRows
        .filter((row: Record<string, unknown>) => {
            if (pass !== 'pass1') return true;
            const rowActions = Array.isArray(row.actions) ? row.actions : [];
            return rowActions.some((entry: Record<string, unknown>) => sequences.has(Number(entry.sequence)));
        })
        .slice(0, pass === 'pass1' ? 12 : 40)
        .map((row: Record<string, unknown>) => ({
            keyword: row.keyword,
            text: safeText(row.text, 180),
            status: row.status,
            wording: row.wording,
            actionSequences: (Array.isArray(row.actions) ? row.actions : [])
                .map((entry: Record<string, unknown>) => entry.sequence)
                .filter((seq: unknown) => Number.isInteger(seq)),
        }));
    return {
        recordingId: scenario?.recordingId,
        planId: plan?.planId || scenario?.planId,
        platform: scenario?.platform,
        squad: scenario?.squad,
        objective: safeText(scenario?.objective, 200),
        acceptanceCriteria: safeText(scenario?.acceptanceCriteria, 220),
        actionCount: actions.length,
        scenarioRowCount: scenarioRows.length,
        actions: compactActions,
        scenarioRows: compactRows,
    };
}

function compactPlan(plan: GenerationPlan | undefined, openGapIds: Set<string>): Record<string, unknown> {
    return {
        schemaVersion: plan?.schemaVersion,
        pipelineVersion: plan?.pipelineVersion,
        planId: plan?.planId,
        recordingId: plan?.recordingId,
        status: plan?.status,
        files: (plan?.files || []).map(file => ({
            layer: file.layer,
            operation: file.operation,
            path: file.path,
        })),
        unresolvedGapIds: plan?.unresolvedGapIds || [],
        unresolvedResolutions: (plan?.resolutions || [])
            .filter(resolution => resolution.gapId && openGapIds.has(resolution.gapId))
            .map(resolution => ({
                gapId: resolution.gapId,
                sequence: resolution.sequence,
                action: resolution.action,
                intent: resolution.intent,
                resolution: resolution.resolution,
                locatorName: resolution.locatorName,
                reason: safeText(resolution.reason, 180),
                source: resolution.source
                    ? {
                        file: resolution.source.file,
                        module: resolution.source.module,
                        scope: resolution.source.scope,
                    }
                    : undefined,
            })),
        constraints: {
            maxAgentInvocations: plan?.budgets?.maxAgentInvocations,
            maxTotalQueries: plan?.budgets?.maxTotalQueries,
            maxQueriesPerGap: plan?.budgets?.maxQueriesPerGap,
        },
    };
}

function compactGaps(gaps: AutomationGap[]): Record<string, unknown> {
    return {
        gaps: gaps.map(gap => ({
            id: gap.id,
            type: gap.type,
            sequence: gap.sequence,
            description: safeText(gap.description, 220),
            requiredOutput: safeText(gap.requiredOutput, 220),
            intent: safeText(gap.intent, 180),
            reason: safeText(gap.reason, 220),
            allowedQueries: gap.allowedQueries,
            allowedQueryArgsSchemas: gap.allowedQueryArgsSchemas || {},
            maxQueries: gap.maxQueries,
            evidenceRequired: gap.evidenceRequired || [],
            expectedAnswerSchema: gap.expectedAnswerSchema || {},
            status: gap.status,
        })),
    };
}

function compactFrameworkApi(document: Record<string, any> | undefined): Record<string, unknown> {
    return {
        helpers: (document?.helpers || []).map((helper: Record<string, unknown>) => ({
            property: helper.property,
            methods: (Array.isArray(helper.methods) ? helper.methods : []).map((method: Record<string, unknown>) => ({
                name: method.name,
                signature: method.signature,
            })),
        })),
        screenObjects: (document?.screenObjects || []).map((entry: Record<string, unknown>) => ({
            path: entry.path,
            className: entry.className,
            instanceName: entry.instanceName,
            importSource: entry.importSource,
        })),
        locatorContract: document?.locatorContract
            ? {
                typeLocator: {
                    symbol: (document.locatorContract as Record<string, any>)?.typeLocator?.symbol,
                    import: (document.locatorContract as Record<string, any>)?.typeLocator?.import,
                    exportKind: (document.locatorContract as Record<string, any>)?.typeLocator?.exportKind,
                    members: (document.locatorContract as Record<string, any>)?.typeLocator?.members || [],
                },
                locatorProvider: {
                    symbol: (document.locatorContract as Record<string, any>)?.locatorProvider?.symbol,
                    import: (document.locatorContract as Record<string, any>)?.locatorProvider?.import,
                },
                getElement: {
                    parameterCount: (document.locatorContract as Record<string, any>)?.getElement?.parameterCount,
                    platformOrder: (document.locatorContract as Record<string, any>)?.getElement?.platformOrder || [],
                    signature: (document.locatorContract as Record<string, any>)?.getElement?.signature,
                },
                constantsPrefixes: (document.locatorContract as Record<string, any>)?.constantsPrefixes || {},
                locatorComposition: (document.locatorContract as Record<string, any>)?.locatorComposition || {},
            }
            : undefined,
    };
}

function compactReuseContext(document: Record<string, any> | undefined): Record<string, unknown> {
    const candidates = Array.isArray(document?.candidates) ? document.candidates : [];
    const elements = Array.isArray(document?.elements) ? document.elements : [];
    return {
        decision: document?.decision,
        existingCase: document?.existingCase
            ? {
                feature: document.existingCase.feature,
                scenario: document.existingCase.scenario,
                paths: document.existingCase.paths,
            }
            : undefined,
        reuseTarget: document?.reuseTarget,
        updateBaselines: (document?.updateBaselines || []).map((item: Record<string, unknown>) => ({
            layer: item.layer,
            path: item.path,
            baseHash: item.baseHash,
            preserveCount: Number((item.preserve as Record<string, unknown> | undefined)?.count || 0),
        })),
        candidateSummary: candidates.slice(0, 5).map((item: Record<string, unknown>) => ({
            feature: item.feature,
            scenario: item.scenario,
            score: item.score,
            file: item.file,
        })),
        elementSummary: {
            count: elements.length,
            modules: elements
                .slice(0, 15)
                .map((item: Record<string, unknown>) => item.module)
                .filter(Boolean),
        },
    };
}

function compactCollisionReport(document: Record<string, any> | undefined): Record<string, unknown> {
    return {
        requiresReuse: Boolean(document?.requiresReuse),
        blocking: Boolean(document?.blocking),
        reservedStepExpressions: (document?.reservedStepExpressions || []).slice(0, 20).map((item: Record<string, unknown>) => ({
            expression: item.expression,
            canonical: item.canonical,
            file: item.file,
            scope: item.scope,
        })),
        exactStepDefinitions: (document?.exactStepDefinitions || []).slice(0, 10).map((item: Record<string, unknown>) => ({
            expression: item.expression,
            file: item.file,
            scope: item.scope,
        })),
        selectorCollisions: (document?.selectorCollisions || []).slice(0, 20).map((item: Record<string, unknown>) => ({
            sequence: item.sequence,
            locatorName: item.locatorName,
            file: item.file,
            module: item.module,
            scope: item.scope,
        })),
    };
}

function compactQueryResults(document: Record<string, any> | undefined, focusGapId?: string): Record<string, unknown> {
    const source = (document?.results || []).filter((item: Record<string, unknown>) =>
        !focusGapId || item.gapId === focusGapId
    );
    return {
        schemaVersion: document?.schemaVersion,
        results: source.map((item: Record<string, unknown>) => ({
            requestId: item.requestId,
            gapId: item.gapId,
            status: item.status,
            code: item.code,
            dataSummary: item.data
                ? {
                    itemCount: Array.isArray((item.data as Record<string, unknown>).items)
                        ? ((item.data as Record<string, unknown>).items as unknown[]).length
                        : undefined,
                    hasError: Boolean((item.data as Record<string, unknown>).error),
                }
                : undefined,
        })),
    };
}

function compactPromptValue(value: unknown, depth = 0): unknown {
    if (depth > 7) return value;
    if (typeof value === 'string') {
        return value.length > SAFE_QUERY_RESULTS_STRING_LIMIT
            ? `${value.slice(0, SAFE_QUERY_RESULTS_STRING_LIMIT - 1)}…`
            : value;
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, SAFE_QUERY_RESULTS_ARRAY_LIMIT)
            .map(item => compactPromptValue(item, depth + 1));
    }
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .map(([key, entry]) => [key, compactPromptValue(entry, depth + 1)])
    );
}

export function buildPassContext(
    packageDirectory: string,
    pass: AgentPass,
    options: AgentPassContextOptions = {},
): AgentPassContextEnvelope {
    const scenario = readJson<Record<string, unknown>>(path.join(packageDirectory, 'scenario.json'));
    const plan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
    const hintsDoc = readJson<{ hints?: AutomationHint[] }>(path.join(packageDirectory, 'hints.json'));
    const gapsDoc = readJson<AutomationGapsProjection>(path.join(packageDirectory, 'gaps.json'));
    const frameworkApi = readJson<Record<string, unknown>>(path.join(packageDirectory, 'framework-api.json'));
    const validationContract = readJson<Record<string, unknown>>(path.join(packageDirectory, 'validation-contract.json'));
    const reuseContext = readJson<Record<string, unknown>>(path.join(packageDirectory, 'reuse-context.json'));
    const collisionReport = readJson<Record<string, unknown>>(path.join(packageDirectory, 'collision-report.json'));
    const queryResults = readJson<Record<string, unknown>>(path.join(packageDirectory, 'query-results.json'));

    const openGaps = openGapsOnly(gapsDoc, options.focusGapId);
    const openGapIds = new Set(openGaps.map(gap => gap.id));
    const directSequences = new Set(
        openGaps
            .map(gap => gap.sequence)
            .filter((value): value is number => Number.isInteger(value))
    );
    const sequences = relatedSequences(plan, openGapIds, directSequences);
    const relevantTokens = new Set<string>();
    for (const gap of openGaps) {
        for (const token of tokens(gap.intent)) relevantTokens.add(token);
        for (const token of tokens(gap.reason)) relevantTokens.add(token);
        for (const token of tokens(gap.description)) relevantTokens.add(token);
        for (const token of tokens(gap.requiredOutput)) relevantTokens.add(token);
    }
    const queryFamilies = new Set<'screen' | 'step' | 'locator' | 'example' | 'contract'>();
    for (const gap of openGaps) {
        for (const query of gap.allowedQueries) {
            if (query === 'findExistingScreen') queryFamilies.add('screen');
            if (query === 'findExistingStep') queryFamilies.add('step');
            if (query === 'findLocator') queryFamilies.add('locator');
            if (query === 'findExample' || query === 'inspectScenario') queryFamilies.add('example');
            if (query === 'getContract' || query === 'getHelperApi' || query === 'validateImports') {
                queryFamilies.add('contract');
            }
        }
    }

    const compactedHints = compactHints(hintsDoc?.hints || [], relevantTokens, sequences, queryFamilies);
    const compactedScenario = compactScenario(scenario as Record<string, any> | undefined, plan, sequences, pass);
    const compactedPlan = compactPlan(plan, openGapIds);
    const compactedGaps = compactGaps(openGaps);
    const compactedFrameworkApi = compactFrameworkApi(frameworkApi as Record<string, any> | undefined);
    const compactedReuse = compactReuseContext(reuseContext as Record<string, any> | undefined);
    const compactedCollision = compactCollisionReport(collisionReport as Record<string, any> | undefined);
    const compactedQueryResults = options.fullQueryResults
        ? {
            schemaVersion: (queryResults as Record<string, any> | undefined)?.schemaVersion,
            results: ((queryResults as Record<string, any> | undefined)?.results || [])
                .filter((item: Record<string, unknown>) =>
                    !options.focusGapId || item.gapId === options.focusGapId
                )
                .map((item: Record<string, unknown>) => compactPromptValue(item)),
        }
        : compactQueryResults(
            queryResults as Record<string, any> | undefined,
            options.focusGapId
        );

    const queryContract = pass === 'pass1'
        ? {
            schemaVersion: '1.0',
            outputFile: 'query-requests.json',
            requiredTopLevel: ['schemaVersion', 'recordingId', 'planId', 'requests'],
            itemShape: { id: 'string', gapId: 'string', query: 'allowedQueries', args: '{}' },
            example: {
                schemaVersion: '1.0',
                recordingId: compactedPlan.recordingId || '<recordingId>',
                planId: compactedPlan.planId || '<planId>',
                requests: [
                    { id: 'q-gap-1', gapId: '<gapId-open>', query: '<allowedQuery>', args: {} },
                    { id: 'q-gap-2', gapId: '<gapId-open>', query: '<allowedQuery>', args: { limit: 3 } },
                ],
            },
            rules: [
                'Solo requests para gaps open',
                'Respetar allowedQueries y maxQueries por gap',
                'args debe usar únicamente campos definidos en allowedQueryArgsSchemas[query]',
                'No repetir request equivalente',
            ],
        }
        : {
            schemaVersion: '1.0',
            outputFile: 'agent-response.json',
            requires: [
                'recordingId y planId exactos',
                'files incluye exactamente feature/steps/screen/locators',
                'resolutions cubre unresolvedGapIds',
                'actionTrace incluye todas las secuencias del scenario',
                'Feature incluye tags de plataforma (@android/@ios) según cobertura real de locators',
                'No usar step definitions reservadas/equivalentes de collisionReport.reservedStepExpressions (DataTable no desambigua)',
                'si un gap queda unresolved y falta contexto, declara needs:[{query,args}] en esa resolución',
            ],
        };

    const context = {
        scenario: compactedScenario,
        generationPlan: compactedPlan,
        hints: { hints: compactedHints },
        gaps: compactedGaps,
        queryContract,
        ...(pass === 'pass2'
            ? {
                frameworkApi: compactedFrameworkApi,
                validationContract: validationContract || {},
                reuseContext: compactedReuse,
                collisionReport: compactedCollision,
                queryResults: compactedQueryResults,
            }
            : {}),
    };

    const promptBase = pass === 'pass1'
        ? 'PASS 1: genera query-requests.json válido para cerrar gaps abiertos.'
        : 'PASS 2: genera agent-response.json válido usando query-results.json y el plan.';
    const instructions = pass === 'pass1'
        ? 'Responde solo con escritura de query-requests.json. No inventes queries fuera de allowedQueries ni campos fuera de allowedQueryArgsSchemas.'
        : 'No cambies rutas ni capas del plan. Usa imports/aliases del contrato y cumple el schema.';
    const wrapperOpen = 'BEGIN_AGENT_CONTEXT_JSON';
    const wrapperClose = 'END_AGENT_CONTEXT_JSON';
    const contextPayload = JSON.stringify(context);
    const prompt = `${promptBase}\n${instructions}\n${wrapperOpen}\n${contextPayload}\n${wrapperClose}\n`;

    const componentBytes = {
        promptBaseBytes: textBytes(promptBase),
        instructionsBytes: textBytes(instructions),
        scenarioBytes: bytes(context.scenario),
        generationPlanBytes: bytes(context.generationPlan),
        hintsBytes: bytes(context.hints),
        gapsBytes: bytes(context.gaps),
        frameworkApiBytes: pass === 'pass2' ? bytes(context.frameworkApi || {}) : 0,
        reuseContextBytes: pass === 'pass2' ? bytes(context.reuseContext || {}) : 0,
        resolvedContextBytes: 0,
        unresolvedContextBytes: 0,
        collisionReportBytes: pass === 'pass2' ? bytes(context.collisionReport || {}) : 0,
        queryRequestsBytes: 0,
        queryResultsBytes: pass === 'pass2' ? bytes(context.queryResults || {}) : 0,
        queryContractBytes: bytes(context.queryContract),
    };
    const totalBytes = textBytes(prompt);
    const explained = Object.values(componentBytes).reduce((sum, value) => sum + value, 0);
    const breakdown: ContextBreakdown = {
        ...componentBytes,
        wrapperBytes: Math.max(0, totalBytes - explained),
        totalBytes,
    };

    return {
        pass,
        prompt,
        breakdown,
        context,
    };
}
