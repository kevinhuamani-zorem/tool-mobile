import fs from 'fs';
import path from 'path';
import {
    AgentContextQueryResult,
    AgentContextQueryResults,
    AgentDomainErrorCode,
    AgentExecutionMode,
    AgentOperationalBudgets,
    AutomationAgentResponse,
    AutomationScenario,
    AutomationGapsProjection,
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    GapResolution,
    GapResolutionFile,
    GenerationPlan,
    TestDesignReview,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    DEFAULT_AGENT_EXECUTION_MODE,
    resolveRecorderGenerationMode,
    normalizeAgentOperationalBudgets,
    agentBudgetViolations,
    FRAMEWORK_CONTEXT_QUERIES,
} from '../contracts';
import { AgentRunStore } from './agentRunStore';
import { FrameworkQueryService } from '../../workspace';
import { GapQueryPolicy } from './gapQueryPolicy';
import { AgentProvider } from '../ports/agentProvider';
import {
    emptyQueryResults,
    parseAgentContextQueryRequests,
    validateAgentContextQueryResults,
} from '../domain/agentQueryContracts';
import { buildPassContext } from './agentContextEnvelope';
import {
    canFallbackToManual,
    resolveAgentExecutionMode,
    resolvePackageArtifactPath,
    summarizeAgentProcessOutput,
    resolveAgentHangStopMs,
} from './agentRuntimeGuards';
import { GapExecutionPlanner, partitionGapsById } from '../application/gapExecutionPlanner';
import { DeterministicQueryPlanner } from '../domain/deterministicQueryPlanner';
import { DeterministicGenerator } from '../../generation';
import { emptyGapResolutions, parseGapResolutions } from '../domain/gapResolutionContracts';
import { readJsonUtf8, readUtf8File, writeJsonUtf8 } from '../../shared';

interface QueryCounters {
    total: number;
    perGap: Record<string, number>;
}

interface AgentRunExecutionOverrides {
    model?: string;
    budgetOverride?: Partial<AgentOperationalBudgets>;
}

const PLANNER_OWNED_VALIDATION_CODES = new Set([
    'generic-template-gherkin',
]);

function requiresPlannerRegeneration(
    errors: Array<{ code: string; message: string; file?: string }>,
): boolean {
    return errors.some(error => PLANNER_OWNED_VALIDATION_CODES.has(String(error.code || '')));
}

interface NestedGapExecutionArtifacts {
    gapId: string;
    attempted: boolean;
    gapDirectory: string;
    nested: AgentOrchestratorResult;
    nestedRun: Record<string, any>;
    nestedResponse: Record<string, any> | null;
    nestedQueries: Record<string, any>;
}

interface Pass2Need {
    gapId: string;
    query: string;
    args: Record<string, unknown>;
}

type MultiGapStrategy = 'compact-case' | 'per-gap-parallel';


export interface AgentOrchestratorResult {
    modelUsage?: import('../domain/agentModel').AgentModelUsage | null;
    success: boolean;
    mode: AgentExecutionMode;
    state: 'completed' | 'failed' | 'timed-out' | 'cancelled' | 'fallback-manual' | 'skipped';
    invocations: number;
    queryCount: number;
    fallback: boolean;
    errorCode?: string;
    error?: string;
    providerSummary?: ReturnType<typeof summarizeAgentProcessOutput>;
    testDesignReview?: TestDesignReview;
}

export interface DeterministicResponseValidationResult {
    valid: boolean;
    errors: Array<{ code: string; message: string; file?: string }>;
    warnings?: string[];
}

export type DeterministicResponseValidator = (
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse,
    attempt: number,
) => DeterministicResponseValidationResult;

function readJson<T>(file: string): T {
    return readJsonUtf8<T>(file);
}

function writeJson(file: string, value: unknown): void {
    writeJsonUtf8(file, value);
}

function normalizeDisplayPath(baseDirectory: string, candidate: string): string {
    const resolvedBase = path.resolve(baseDirectory);
    const resolvedCandidate = path.resolve(candidate);
    const relative = path.relative(resolvedBase, resolvedCandidate).replace(/\\/g, '/');
    if (!relative) return '.';
    if (relative.startsWith('.')) return relative;
    return `./${relative}`;
}

function sanitizeAbsolutePathsInText(value: string, baseDirectory: string): string {
    const normalize = (rawPath: string): string => {
        if (!rawPath || !path.isAbsolute(rawPath)) return rawPath;
        return normalizeDisplayPath(baseDirectory, rawPath);
    };
    let sanitized = value;
    sanitized = sanitized.replace(/(["'])(\/[^"'`\n\r]+)\1/g, (_match, quote: string, rawPath: string) =>
        `${quote}${normalize(rawPath)}${quote}`
    );
    sanitized = sanitized.replace(/(^|[\s(=;,])((?:\/[^ \t\n\r"'`;<>()|&]+)+)/g, (_match, prefix: string, rawPath: string) =>
        `${prefix}${normalize(rawPath)}`
    );
    sanitized = sanitized.replace(/(["'])([A-Za-z]:\\[^"'`\n\r]+)\1/g, (_match, quote: string, rawPath: string) =>
        `${quote}${normalize(rawPath)}${quote}`
    );
    sanitized = sanitized.replace(/(^|[\s(=;,])([A-Za-z]:\\[^ \t\n\r"'`;<>()|&]+)/g, (_match, prefix: string, rawPath: string) =>
        `${prefix}${normalize(rawPath)}`
    );
    return sanitized;
}

function sanitizeArtifactValue<T>(
    value: T,
    baseDirectory: string,
    keyPath: string[] = [],
): T {
    const insideGeneratedFileContent = keyPath.length >= 2
        && keyPath[keyPath.length - 2] === 'files'
        && keyPath[keyPath.length - 1] === 'content';
    if (insideGeneratedFileContent) {
        return value;
    }
    if (typeof value === 'string') {
        return sanitizeAbsolutePathsInText(value, baseDirectory) as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map(entry => sanitizeArtifactValue(entry, baseDirectory, keyPath)) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            output[key] = sanitizeArtifactValue(entry, baseDirectory, [...keyPath, key]);
        }
        return output as T;
    }
    return value;
}

function updateStatus(
    statusFile: string,
    patch: Record<string, unknown>,
): void {
    const packageDirectory = path.dirname(statusFile);
    const current = fs.existsSync(statusFile)
        ? readJson<Record<string, unknown>>(statusFile)
        : {};
    writeJson(statusFile, sanitizeArtifactValue({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    }, packageDirectory));
}

function rejectionCode(reason: string): AgentContextQueryResult['code'] {
    if (reason === 'query-not-allowed') return 'query-not-allowed';
    if (reason === 'invalid-args') return 'invalid-args';
    if (reason === 'query-truncated') return 'query-truncated';
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

function safeGapFolderName(gapId: string): string {
    return gapId.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function copyGapWorkspace(packageDirectory: string, gapId: string): string {
    const gapRoot = path.join(packageDirectory, '.gap-runs');
    fs.mkdirSync(gapRoot, { recursive: true });
    const destination = path.join(gapRoot, safeGapFolderName(gapId));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    const entries = fs.readdirSync(packageDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.gap-runs') continue;
        if (entry.name === 'query-requests.json') continue;
        if (entry.name === 'gap-resolutions.json') continue;
        if (entry.name === 'agent-response.json') continue;
        const source = path.join(packageDirectory, entry.name);
        const target = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            fs.cpSync(source, target, { recursive: true });
        } else if (entry.isFile()) {
            fs.copyFileSync(source, target);
        }
    }
    return destination;
}

function clearAgentWritableOutputs(packageDirectory: string): void {
    for (const name of ['query-requests.json', 'gap-resolutions.json', 'agent-response.json', 'test-design-review.json']) {
        const file = path.join(packageDirectory, name);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
}

function writeFailureResponseIfMissing(
    packageDirectory: string,
    plan: { recordingId?: string; planId?: string },
    gaps: AutomationGapsProjection,
    reason: string,
): void {
    const responsePath = path.join(packageDirectory, 'agent-response.json');
    if (fs.existsSync(responsePath)) return;
    const resolutions = gaps.gaps
        .filter(gap => gap.status === 'open' && !gap.blocking)
        .map(gap => ({
            gapId: gap.id,
            decision: 'unresolved' as const,
            reason: sanitizeAbsolutePathsInText(reason, packageDirectory),
        }));
    writeJson(responsePath, sanitizeArtifactValue({
        recordingId: plan.recordingId || gaps.recordingId || '',
        planId: plan.planId || gaps.planId || '',
        resolutions,
        actionTrace: [],
        files: [],
    }, packageDirectory));
}

function mergeGapResponses(responses: Array<Record<string, any>>): Record<string, any> {
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

function resolveMultiGapStrategy(raw = process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY): MultiGapStrategy {
    return raw === 'per-gap-parallel' ? 'per-gap-parallel' : DEFAULT_MULTI_GAP_STRATEGY;
}

function ensureGapResolutionCoverage(
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

function pickMaxBreakdown(
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

function resolutionCounts(
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

function unresolvedDecision(decision: unknown): boolean {
    return /^(unresolved|failed|error|blocked|not-resolved)$/i.test(String(decision || '').trim());
}

function collectPass2Needs(
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

function mergeGapResolutionsWithCoverage(
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

function deterministicGapResolutions(
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

function semanticPassPrompt(context: Record<string, unknown>): string {
    const promptBase = 'PASS 2 (SEMANTIC): genera gap-resolutions.json para cerrar gaps semánticos y redactar únicamente filas Gherkin template.';
    const instructions = [
        'No generes código ni archivos feature/steps/screen/locators.',
        'Puedes ejecutar node, python o python3 solo para validar archivos autorizados de este paquete. Usa herramientas nativas para leer/escribir. No explores el framework ni modifiques archivos inmutables con scripts.',
        'No cambies recordingId ni planId.',
        'Escribe solo gap-resolutions.json con schemaVersion "1.0".',
        'Cada resolución debe incluir gapId, decision y reason cuando aplique.',
        'Si scenario.scenarioRows contiene wording "template", agrega gherkinResolutions. Cada elemento lleva keyword, text declarativo, actionSequences y reason.',
        'Cubre exactamente una vez todas las secuencias de filas template. Puedes consolidar filas template contiguas en un solo step incluyendo todas sus actionSequences.',
        'No reescribas filas domain, qa o reused. No inventes resultados no observados, no menciones clicks, botones, campos, scrolls ni selectores.',
        'Incluye siempre testDesignReview con status, summary e issues. Evalúa diseño funcional, no sintaxis: contrasta objective y acceptanceCriteria con las acciones y verificaciones observadas.',
        'Usa status "suggestion" si observas oportunidades de mejorar el diseño. Son recomendaciones no bloqueantes: no exijas una aserción tras cada interacción, acepta una validación consolidada al final y no inventes requisitos fuera de acceptanceCriteria.',
        'No incluyas roast ni contenido humorístico: esta pasada produce únicamente el diagnóstico funcional. La presentación opcional se genera después en una sesión aislada.',
        'Usa status "pass" cuando no tengas recomendaciones útiles. No decidas si se permite generar: el recorder solo bloquea por errores técnicos.',
        'Los issue.code permitidos son missing-business-assertion, control-existence-only, acceptance-criteria-mismatch, missing-test-oracle, dependent-variants y ambiguous-objective. actionSequences solo puede referenciar acciones reales. Da al QA una recomendación concreta para volver a grabar.',
        'Decisiones canónicas permitidas: "reuse", "replace-existing", "create", "resolved", "qa-required" o "unresolved".',
        'Para gap-extend-existing-artifacts usa "resolved": las rutas update ya están fijadas por generation-plan.json.',
        'Si decision es "reuse", incluye selectedCandidate:{file,module,name} copiando exactamente un candidato del plan o de query-results.json; no uses aliases.',
        'Si el QA autoriza conservar una clave pero reemplazar su selector, usa "replace-existing" con selectedCandidate y replacement:{platform,sequence}; TypeLocator/selector salen del recording.',
        'En modo determinista nunca edites agent-response.json: el recorder lo regenera desde gap-resolutions.json.',
        'Después de escribir gap-resolutions.json, lee validation-feedback.json: el recorder materializa y valida la propuesta con el contrato oficial.',
        'Si validation-feedback.json sigue en "awaiting-output", espera brevemente y vuelve a leerlo. Si tiene status "correction-required", corrige solo gap-resolutions.json y vuelve a leer el feedback. Los estados "valid" y "planner-regeneration-required" son terminales; el último indica que el recorder debe reconstruir el plan y no admite otra corrección semántica.',
        'selectedCandidate siempre identifica un locator autorizado; no coloques ahí métodos de Screen Object.',
        'Si falta contexto para cerrar un gap, usa decision "unresolved" y opcionalmente needs:[{query,args}].',
    ].join(' ');
    return `${promptBase}\n${instructions}\nBEGIN_AGENT_CONTEXT_JSON\n${JSON.stringify(context)}\nEND_AGENT_CONTEXT_JSON\n`;
}

function appendQueryDecision(
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

function recordDeniedToolAttempts(
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

function aggregateNestedRunMetrics(
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

export class AgentOrchestrator {
    constructor(
        private readonly queryService: Pick<FrameworkQueryService, 'execute'>,
        private readonly provider: AgentProvider,
        private readonly deterministicPlanner = new DeterministicQueryPlanner(),
        private readonly deterministicGenerator = new DeterministicGenerator(),
        private readonly deterministicResponseValidator?: DeterministicResponseValidator,
    ) {}

    async run(
        packageDirectory: string,
        mode: AgentExecutionMode = DEFAULT_AGENT_EXECUTION_MODE,
        executionOverrides: AgentRunExecutionOverrides = {},
    ): Promise<AgentOrchestratorResult> {
        const statusFile = path.join(packageDirectory, 'status.json');
        const runStore = new AgentRunStore(packageDirectory);
        const executionMode = resolveAgentExecutionMode(mode);
        runStore.setExecutionMode(executionMode);
        const plan = readJson<{ budgets?: Partial<AgentOperationalBudgets>; recordingId?: string; planId?: string }>(
            path.join(packageDirectory, 'generation-plan.json')
        );
        const planBudgets = normalizeAgentOperationalBudgets(plan.budgets || DEFAULT_AGENT_OPERATIONAL_BUDGETS);
        const budgets = normalizeAgentOperationalBudgets({
            ...planBudgets,
            ...(executionOverrides.budgetOverride || {}),
        });
        const hangStopMs = resolveAgentHangStopMs();
        const multiGapStrategy = resolveMultiGapStrategy();
        const gaps = readJson<AutomationGapsProjection>(path.join(packageDirectory, 'gaps.json'));
        const openGaps = gaps.gaps.filter(gap => gap.status === 'open' && !gap.blocking);
        runStore.setGapCounts(openGaps.length, 0, openGaps.length);
        const blockedGap = gaps.gaps.find(gap => gap.blocking || gap.status === 'blocked-qa');
        if (!openGaps.length || blockedGap) {
            const nextState = blockedGap ? 'failed' : 'completed';
            updateStatus(statusFile, {
                state: nextState,
                agentExecutionMode: executionMode,
                ...(blockedGap ? { errorCode: 'GAP_BLOCKED' } : {}),
            });
            runStore.mark(blockedGap ? 'blocked-qa' : 'deterministic-no-agent', !blockedGap);
            runStore.setGapCounts(openGaps.length, 0, openGaps.length);
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
        const executionTraceFile = './agent-execution.log';
        writeJson(path.join(packageDirectory, executionTraceFile), {
            startedAt: new Date().toISOString(),
            mode: executionMode,
            generationMode: resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE),
            note: 'Live stream del provider (stdout/stderr) en formato línea.',
        });

        const generationMode = resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE);
        if (generationMode === 'deterministic') {
            return this.runDeterministic({
                model: executionOverrides.model,
                packageDirectory,
                mode,
                executionMode,
                statusFile,
                runStore,
                plan,
                gaps,
                openGaps,
                budgets,
                hangStopMs,
                multiGapStrategy,
            });
        }

        if (openGaps.length > 1 && multiGapStrategy === 'per-gap-parallel') {
            const gapIds = partitionGapsById(openGaps);
            const parallelism = Math.max(1, Number(process.env.RECORDER_AGENT_GAP_PARALLELISM || 3));
            const planner = new GapExecutionPlanner({ parallelism });
            updateStatus(statusFile, {
                state: 'running',
                agentExecutionMode: executionMode,
                strategy: 'per-gap-parallel',
                gapCount: gapIds.length,
                parallelism,
            });
            const planned = gapIds.map(gapId => ({
                gapId,
                contextBytes: buildPassContext(packageDirectory, 'pass1', { focusGapId: gapId }).breakdown.totalBytes,
            }));
            const runs = await planner.execute(planned, Number.POSITIVE_INFINITY, async ({ gapId }) => {
                const gapDirectory = copyGapWorkspace(packageDirectory, gapId);
                const singleGapProjection = {
                    ...gaps,
                    gaps: gaps.gaps.filter(gap => gap.id === gapId),
                };
                writeJson(path.join(gapDirectory, 'gaps.json'), singleGapProjection);
                const nested = await this.run(gapDirectory, mode, {
                    model: executionOverrides.model,
                    budgetOverride: { ...budgets },
                });
                const nestedRun = readJson<Record<string, any>>(path.join(gapDirectory, 'agent-run.json'));
                const nestedResponse = fs.existsSync(path.join(gapDirectory, 'agent-response.json'))
                    ? readJson<Record<string, any>>(path.join(gapDirectory, 'agent-response.json'))
                    : null;
                const nestedQueries = fs.existsSync(path.join(gapDirectory, 'query-results.json'))
                    ? readJson<Record<string, any>>(path.join(gapDirectory, 'query-results.json'))
                    : { schemaVersion: '1.0', results: [] };
                return {
                    gapId,
                    attempted: true,
                    gapDirectory,
                    nested,
                    nestedRun,
                    nestedResponse,
                    nestedQueries,
                };
            });
            const report = runs.map(entry => entry.ok
                ? {
                    gapId: entry.gapId,
                    ok: true,
                    attempted: (entry as any).value.attempted,
                    resolved: (entry as any).value.nested.state === 'completed',
                    state: (entry as any).value.nested.state,
                    result: (entry as any).value.nestedRun?.result,
                    invocations: Number((entry as any).value.nestedRun?.agentInvocationCount || 0),
                    contextBytes: Number((entry as any).value.nestedRun?.totalContextBytes
                        || (entry as any).value.nestedRun?.contextBytes || 0),
                    pass1ContextBytes: (entry as any).value.nestedRun?.pass1ContextBytes || 0,
                    pass2ContextBytes: (entry as any).value.nestedRun?.pass2ContextBytes || 0,
                    totalDurationMs: (entry as any).value.nestedRun?.totalDurationMs || 0,
                    agentDurationMs: (entry as any).value.nestedRun?.agentDurationMs || 0,
                    queriesAccepted: (entry as any).value.nestedRun?.queriesAccepted || 0,
                    queriesRejected: (entry as any).value.nestedRun?.queriesRejected || 0,
                }
                : entry
            );
            writeJson(path.join(packageDirectory, 'gap-execution-report.json'), {
                schemaVersion: 1,
                strategy: 'per-gap-parallel',
                parallelism,
                results: report,
            });
            const overflow = runs.find(entry => !entry.ok);
            const successfulEntries = runs.filter(entry => entry.ok).map(entry => (entry as any).value);
            aggregateNestedRunMetrics(
                packageDirectory,
                successfulEntries.map((entry: NestedGapExecutionArtifacts) => entry.nestedRun),
            );
            const failureReasonsByGap = Object.fromEntries(successfulEntries.map((entry: NestedGapExecutionArtifacts) => [
                entry.gapId,
                entry.nested.success
                    ? ''
                    : (entry.nested.error || entry.nested.errorCode || entry.nested.state),
            ])) as Record<string, string>;
            const failedGap = successfulEntries.find((entry: any) => !entry.nested.success);
            if (overflow || failedGap) {
                const errorCode = overflow
                    ? 'GAP_CONTEXT_OVERFLOW'
                    : (failedGap?.nested.errorCode || 'AGENT_TIMEOUT');
                const errorMessage = overflow
                    ? `${overflow.errorCode}: ${overflow.message}`
                    : `Falló gap ${failedGap?.gapId}: ${failedGap?.nested.error || failedGap?.nested.state}`;
                const partialResponses = successfulEntries
                    .map((entry: NestedGapExecutionArtifacts) => entry.nestedResponse)
                    .filter(Boolean) as Array<Record<string, any>>;
                if (partialResponses.length) {
                    const covered = ensureGapResolutionCoverage(
                        mergeGapResponses(partialResponses),
                        gapIds,
                        failureReasonsByGap,
                    );
                    writeJson(
                        resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                        sanitizeArtifactValue(covered, packageDirectory)
                    );
                    const counts = resolutionCounts(covered, gapIds);
                    runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
                }
                if (!partialResponses.length) runStore.setGapCounts(gapIds.length, 0, gapIds.length);
                runStore.mark(errorCode, true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    strategy: 'per-gap-parallel',
                    errorCode,
                    error: errorMessage,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: successfulEntries
                        .reduce((sum: number, entry: NestedGapExecutionArtifacts) =>
                            sum + Number(entry.nestedRun?.agentInvocationCount || 0), 0),
                    queryCount: successfulEntries
                        .reduce((sum: number, entry: NestedGapExecutionArtifacts) =>
                            sum + Number(entry.nestedRun?.queriesAccepted || entry.nested.queryCount || 0), 0),
                    fallback: false,
                    errorCode,
                    error: errorMessage,
                };
            }
            const successful = successfulEntries;
            const responses = successful
                .map(entry => entry.nestedResponse)
                .filter(Boolean) as Array<Record<string, any>>;
            if (!responses.length) {
                runStore.mark('AGENT_OUTPUT_MISSING', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    strategy: 'per-gap-parallel',
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'No se generaron respuestas por gap.',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: successful.length * 2,
                    queryCount: 0,
                    fallback: false,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'No se generaron respuestas por gap.',
                };
            }
            const merged = ensureGapResolutionCoverage(
                mergeGapResponses(responses),
                gapIds,
                {},
            );
            writeJson(
                resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                sanitizeArtifactValue(merged, packageDirectory)
            );
            runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(merged), 'utf-8'));
            {
                const counts = resolutionCounts(merged, gapIds);
                runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
            }
            updateStatus(statusFile, {
                state: 'completed',
                agentExecutionMode: executionMode,
                strategy: 'per-gap-parallel',
                gapCount: gapIds.length,
                parallelism,
            });
            runStore.mark('agent-completed');
            return {
                success: true,
                mode: executionMode,
                state: 'completed',
                invocations: successful
                    .reduce((sum, entry: NestedGapExecutionArtifacts) =>
                        sum + Number(entry.nestedRun?.agentInvocationCount || 0), 0),
                queryCount: successful.reduce((sum, entry) => sum + Number(entry.nestedRun?.queriesAccepted || 0), 0),
                fallback: false,
            };
        }

        const pass1Context = buildPassContext(packageDirectory, 'pass1');
        runStore.setPassContext('pass1', pass1Context.breakdown.totalBytes, pass1Context.breakdown);
        writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
            schemaVersion: 1,
            pass1: pass1Context.breakdown,
            pass2: null,
        });
        writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
            schemaVersion: 1,
            pass1: pass1Context.breakdown,
            pass2: null,
        });
        const version = await this.provider.getVersion();
        runStore.setAgentMetadata(this.provider.name, version || undefined);
        runStore.markAgentStarted();
        runStore.incrementAgentInvocation();
        clearAgentWritableOutputs(packageDirectory);
        updateStatus(statusFile, {
            state: 'running',
            agentExecutionMode: executionMode,
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
        });
        const pass1 = await this.provider.execute({
            model: executionOverrides.model,
            cwd: packageDirectory,
            prompt: pass1Context.prompt,
            timeoutMs: hangStopMs,
            traceFile: executionTraceFile,
            traceLabel: 'pass1',
        });
        runStore.addPassDuration('pass1', pass1.durationMs);
        runStore.recordModelUsage('pass1', pass1.modelUsage);
        if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass1', pass1.durationMs);
        if (typeof pass1.creditsCost === 'number') runStore.setCreditsCost(pass1.creditsCost);
        runStore.recordDeniedPathStats(pass1.deniedPathStats);
        recordDeniedToolAttempts(runStore, pass1.deniedToolAttempts);
        runStore.setAgentExitCode(pass1.exitCode);
        if (!pass1.success) {
            writeFailureResponseIfMissing(
                packageDirectory,
                plan,
                gaps,
                pass1.errorMessage || pass1.errorCode || 'No se pudo ejecutar PASS 1',
            );
            runStore.markAgentFinished();
            if (pass1.timedOut) runStore.markAgentTimedOut();
            if (pass1.cancelled) runStore.markAgentCancelled();
            const code = pass1.errorCode || 'AGENT_NON_ZERO_EXIT';
            runStore.setGapCounts(openGaps.length, 0, openGaps.length);
            const fallback = canFallbackToManual(executionMode, code);
            runStore.setFallback(fallback, code);
            runStore.mark(code, !fallback);
            updateStatus(statusFile, {
                state: fallback ? 'ready-for-agent' : (pass1.timedOut ? 'timed-out' : pass1.cancelled ? 'cancelled' : 'failed'),
                agentExecutionMode: executionMode,
                errorCode: code,
                error: pass1.errorMessage || 'No se pudo ejecutar PASS 1',
            });
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
            ? readUtf8File(requestFile)
            : JSON.stringify({
                schemaVersion: '1.0',
                recordingId: plan.recordingId || gaps.recordingId || '',
                planId: plan.planId || gaps.planId || '',
                requests: [],
            });
        const parsedRequests = parseAgentContextQueryRequests(requestContent, budgets.maxTotalQueries);
        if (!parsedRequests.valid || !parsedRequests.value) {
            runStore.markAgentFinished();
            runStore.mark('SCHEMA_INVALID', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'SCHEMA_INVALID',
                error: parsedRequests.errors.map(error => error.message).join(' | '),
            });
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
        const policy = new GapQueryPolicy(gaps, this.queryService, runStore, {});
        const queryResults: AgentContextQueryResults = emptyQueryResults();
        for (const request of parsedRequests.value.requests) {
            appendQueryDecision(policy, counters, queryResults, request);
        }
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);
        const truncatedRejections = queryResults.results.filter(result =>
            result.status === 'rejected' && result.code === 'query-truncated'
        );
        if (truncatedRejections.length) {
            runStore.markAgentFinished();
            const detail = truncatedRejections
                .map(item => `${item.gapId}:${item.requestId}`)
                .join(', ');
            runStore.mark('QUERY_RESULT_TRUNCATED', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'QUERY_RESULT_TRUNCATED',
                error: `Se detectó truncamiento de query-results (${detail}).`,
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1,
                queryCount: counters.total,
                fallback: false,
                errorCode: 'QUERY_RESULT_TRUNCATED',
                error: `Se detectó truncamiento de query-results (${detail}).`,
            };
        }

        const validatedResults = validateAgentContextQueryResults(
            queryResults,
            new Set(parsedRequests.value.requests.map(request => request.id))
        );
        if (!validatedResults.valid) {
            runStore.markAgentFinished();
            runStore.mark('SCHEMA_INVALID', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'SCHEMA_INVALID',
                error: validatedResults.errors.map(error => error.message).join(' | '),
            });
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
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: queryBudget.code,
                error: queryBudget.message,
            });
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

        const responseFile = resolvePackageArtifactPath(packageDirectory, 'agent-response.json');
        const pass2Stdouts: string[] = [];
        const pass2Stderrs: string[] = [];
        let pass2Invocations = 0;
        let pass2RepairAttempts = 0;
        let lastPass2ExitCode: number | null = null;
        const openGapIds = new Set(openGaps.map(gap => gap.id));
        const requestIds = new Set(parsedRequests.value.requests.map(request => request.id));
        let parsedResponse: Record<string, any> | null = null;
        let responseBytes = 0;
        while (true) {
            const pass2Context = buildPassContext(packageDirectory, 'pass2', { fullQueryResults: true });
            runStore.setPassContext('pass2', pass2Context.breakdown.totalBytes, pass2Context.breakdown);
            writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
                schemaVersion: 1,
                pass1: pass1Context.breakdown,
                pass2: pass2Context.breakdown,
            });
            runStore.incrementAgentInvocation();
            pass2Invocations += 1;
            clearAgentWritableOutputs(packageDirectory);
            const pass2 = await this.provider.execute({
                model: executionOverrides.model,
                cwd: packageDirectory,
                prompt: pass2Context.prompt,
                timeoutMs: hangStopMs,
                traceFile: executionTraceFile,
                traceLabel: `pass2-${pass2Invocations}`,
                stopOnValidatedOutput: {
                    outputFile: './agent-response.json',
                    schemaFile: './agent-response.schema.json',
                },
            });
            pass2Stdouts.push(pass2.stdout);
            runStore.recordModelUsage('pass2', pass2.modelUsage);
            pass2Stderrs.push(pass2.stderr);
            lastPass2ExitCode = pass2.exitCode;
            runStore.addPassDuration('pass2', pass2.durationMs);
            if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass2', pass2.durationMs);
            if (typeof pass2.creditsCost === 'number') runStore.setCreditsCost(pass2.creditsCost);
            runStore.recordDeniedPathStats(pass2.deniedPathStats);
            recordDeniedToolAttempts(runStore, pass2.deniedToolAttempts);
            runStore.setAgentExitCode(pass2.exitCode);
            if (!pass2.success) {
                runStore.markAgentFinished();
                writeFailureResponseIfMissing(
                    packageDirectory,
                    plan,
                    gaps,
                    pass2.errorMessage || pass2.errorCode || 'No se pudo ejecutar PASS 2',
                );
                if (pass2.timedOut) runStore.markAgentTimedOut();
                if (pass2.cancelled) runStore.markAgentCancelled();
                const code = pass2.errorCode || 'AGENT_NON_ZERO_EXIT';
                runStore.setGapCounts(openGaps.length, 0, openGaps.length);
                const fallback = canFallbackToManual(executionMode, code);
                runStore.setFallback(fallback, code);
                runStore.mark(code, !fallback);
                updateStatus(statusFile, {
                    state: fallback ? 'ready-for-agent' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    agentExecutionMode: executionMode,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: fallback ? 'fallback-manual' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2',
                    providerSummary: summarizeAgentProcessOutput(
                        `${pass1.stdout}\n${pass2Stdouts.join('\n')}`,
                        `${pass1.stderr}\n${pass2Stderrs.join('\n')}`,
                        pass2.exitCode
                    ),
                };
            }
            if (!fs.existsSync(responseFile)) {
                runStore.markAgentFinished();
                writeFailureResponseIfMissing(
                    packageDirectory,
                    plan,
                    gaps,
                    'PASS 2 finalizó sin escribir agent-response.json.',
                );
                runStore.mark('AGENT_OUTPUT_MISSING', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'agent-response.json no existe después de PASS 2.',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'agent-response.json no existe después de PASS 2.',
                };
            }
            responseBytes = fs.statSync(responseFile).size;
            runStore.setResponseBytes(responseBytes);
            parsedResponse = readJson<Record<string, any>>(responseFile);
            const needs = pass2RepairAttempts < budgets.maxRepairAttempts
                ? collectPass2Needs(parsedResponse, openGapIds)
                : [];
            if (!needs.length) break;
            pass2RepairAttempts += 1;
            runStore.setRepairAttempts(pass2RepairAttempts);
            for (let index = 0; index < needs.length; index += 1) {
                const need = needs[index];
                const requestId = `p2need-${pass2RepairAttempts}-${index + 1}`;
                requestIds.add(requestId);
                runStore.recordMissingContextRequest({
                    source: 'pass2-needs',
                    gapId: need.gapId,
                    query: need.query,
                    detail: `${need.query} ${JSON.stringify(need.args || {})}`,
                });
                appendQueryDecision(policy, counters, queryResults, {
                    id: requestId,
                    gapId: need.gapId,
                    query: need.query,
                    args: need.args,
                });
            }
            writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);
            const appendedTruncated = queryResults.results.filter(result =>
                result.status === 'rejected' && result.code === 'query-truncated'
            );
            if (appendedTruncated.length) {
                runStore.markAgentFinished();
                const detail = appendedTruncated
                    .map(item => `${item.gapId}:${item.requestId}`)
                    .join(', ');
                runStore.mark('QUERY_RESULT_TRUNCATED', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'QUERY_RESULT_TRUNCATED',
                    error: `Se detectó truncamiento de query-results (${detail}).`,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'QUERY_RESULT_TRUNCATED',
                    error: `Se detectó truncamiento de query-results (${detail}).`,
                };
            }
            const validatedAppended = validateAgentContextQueryResults(queryResults, requestIds);
            if (!validatedAppended.valid) {
                runStore.markAgentFinished();
                runStore.mark('SCHEMA_INVALID', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'SCHEMA_INVALID',
                    error: validatedAppended.errors.map(error => error.message).join(' | '),
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'SCHEMA_INVALID',
                    error: validatedAppended.errors.map(error => error.message).join(' | '),
                };
            }
            const queryBudgetAfterNeeds = budgetError(agentBudgetViolations(budgets, {
                totalQueries: counters.total,
                queriesPerGap: counters.perGap,
                agentInvocations: 1,
            }));
            if (queryBudgetAfterNeeds) {
                runStore.markAgentFinished();
                runStore.mark(queryBudgetAfterNeeds.code, true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: queryBudgetAfterNeeds.code,
                    error: queryBudgetAfterNeeds.message,
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1 + pass2Invocations,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: queryBudgetAfterNeeds.code,
                    error: queryBudgetAfterNeeds.message,
                };
            }
        }
        runStore.markAgentFinished();
        {
            const gapIds = openGaps.map(gap => gap.id);
            const counts = resolutionCounts(parsedResponse || {}, gapIds);
            runStore.setGapCounts(gapIds.length, counts.resolved, counts.unresolved);
        }
        const finalBudget = budgetError(agentBudgetViolations(budgets, {
            responseBytes,
            agentInvocations: 2,
            totalQueries: counters.total,
            queriesPerGap: counters.perGap,
        }));
        if (finalBudget) {
            runStore.mark(finalBudget.code, true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: finalBudget.code,
                error: finalBudget.message,
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 1 + pass2Invocations,
                queryCount: counters.total,
                fallback: false,
                errorCode: finalBudget.code,
                error: finalBudget.message,
            };
        }

        updateStatus(statusFile, {
            state: 'completed',
            agentExecutionMode: executionMode,
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
        });
        runStore.mark('agent-completed');
        return {
            success: true,
            mode: executionMode,
            state: 'completed',
            invocations: 1 + pass2Invocations,
            queryCount: counters.total,
            fallback: false,
            providerSummary: summarizeAgentProcessOutput(
                `${pass1.stdout}\n${pass2Stdouts.join('\n')}`,
                `${pass1.stderr}\n${pass2Stderrs.join('\n')}`,
                lastPass2ExitCode
            ),
        };
    }

    private async runDeterministic(input: {
        model?: string;
        packageDirectory: string;
        mode: AgentExecutionMode;
        executionMode: AgentExecutionMode;
        statusFile: string;
        runStore: AgentRunStore;
        plan: { budgets?: Partial<AgentOperationalBudgets>; recordingId?: string; planId?: string };
        gaps: AutomationGapsProjection;
        openGaps: AutomationGapsProjection['gaps'];
        budgets: AgentOperationalBudgets;
        hangStopMs: number;
        multiGapStrategy: MultiGapStrategy;
    }): Promise<AgentOrchestratorResult> {
        const {
            packageDirectory,
            mode,
            executionMode,
            statusFile,
            runStore,
            gaps,
            openGaps,
            budgets,
            hangStopMs,
            multiGapStrategy,
        } = input;
        const scenario = readJson<Record<string, any>>(path.join(packageDirectory, 'scenario.json'));
        const fullPlan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const deterministicResolved = deterministicGapResolutions(openGaps);
        const semanticGaps = openGaps.filter(gap => !deterministicResolved.some(item => item.gapId === gap.id));
        const templateRows = (scenario.request?.scenarioRows || [])
            .filter((row: Record<string, unknown>) => row.wording === 'template');
        const requiresSemanticWording = templateRows.length > 0;
        const requiresTestDesignReview = true;

        const pass1Context = buildPassContext(packageDirectory, 'pass1');
        runStore.setPassContext('pass1', pass1Context.breakdown.totalBytes, pass1Context.breakdown);

        const plannedRequests = this.deterministicPlanner.plan({
            scenario: {
                squad: String(scenario.squad || ''),
                objective: String(scenario.objective || ''),
                acceptanceCriteria: String(scenario.acceptanceCriteria || ''),
            },
            plan: fullPlan,
            gaps: semanticGaps,
            hints: [],
        });
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-requests.json'), plannedRequests);
        const parsedRequests = parseAgentContextQueryRequests(
            JSON.stringify(plannedRequests),
            budgets.maxTotalQueries
        );
        if (!parsedRequests.valid || !parsedRequests.value) {
            runStore.mark('SCHEMA_INVALID', true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: 'SCHEMA_INVALID',
                error: parsedRequests.errors.map(error => error.message).join(' | '),
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: 0,
                queryCount: 0,
                fallback: false,
                errorCode: 'SCHEMA_INVALID',
                error: parsedRequests.errors.map(error => error.message).join(' | '),
            };
        }

        const counters: QueryCounters = { total: 0, perGap: {} };
        const policy = new GapQueryPolicy(gaps, this.queryService, runStore, {});
        const queryResults: AgentContextQueryResults = emptyQueryResults();
        for (const request of parsedRequests.value.requests) {
            appendQueryDecision(policy, counters, queryResults, request);
        }
        writeJson(resolvePackageArtifactPath(packageDirectory, 'query-results.json'), queryResults);

        let semantic: GapResolutionFile | null = null;
        if (semanticGaps.length > 0 || requiresSemanticWording || requiresTestDesignReview) {
            const version = await this.provider.getVersion();
            runStore.setAgentMetadata(this.provider.name, version || undefined);
            runStore.markAgentStarted();
            runStore.incrementAgentInvocation();
            updateStatus(statusFile, {
                state: 'running',
                agentExecutionMode: executionMode,
                ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
                generationMode: 'deterministic',
            });
            const pass2Context = buildPassContext(packageDirectory, 'pass2', { fullQueryResults: true });
            const filteredGaps = ((pass2Context.context.gaps as any)?.gaps || [])
                .filter((gap: Record<string, unknown>) =>
                    semanticGaps.some(open => open.id === String(gap?.id || ''))
                );
            const semanticPrompt = semanticPassPrompt({
                ...pass2Context.context,
                gaps: { gaps: filteredGaps },
                queryContract: {
                    schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
                    outputFile: 'gap-resolutions.json',
                    requiredTopLevel: ['schemaVersion', 'recordingId', 'planId', 'resolutions'],
                },
            });
            runStore.setPassContext('pass2', Buffer.byteLength(semanticPrompt, 'utf-8'), pass2Context.breakdown);
            writeJson(path.join(packageDirectory, 'context-breakdown.json'), {
                schemaVersion: 1,
                pass1: pass1Context.breakdown,
                pass2: pass2Context.breakdown,
            });
            clearAgentWritableOutputs(packageDirectory);
            writeJson(resolvePackageArtifactPath(packageDirectory, 'query-requests.json'), plannedRequests);
            const semanticOutput = resolvePackageArtifactPath(packageDirectory, 'gap-resolutions.json');
            if (fs.existsSync(semanticOutput)) fs.unlinkSync(semanticOutput);
            const validationFeedbackFile = path.join(packageDirectory, 'validation-feedback.json');
            const repairContextFile = path.join(packageDirectory, 'repair-context.json');
            let invalidCandidates = 0;
            const semanticTerminal: {
                plannerFailure?: {
                    errors: Array<{ code: string; message: string; file?: string }>;
                    message: string;
                };
            } = {};
            if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
            writeJson(validationFeedbackFile, {
                schemaVersion: 1,
                status: 'awaiting-output',
                valid: false,
                qaRequired: false,
                automaticRepairAttempts: 0,
                maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                errors: [],
            });
            const acceptSemanticOutput = (candidate: unknown): boolean => {
                let validation: DeterministicResponseValidationResult;
                let acceptedReview: TestDesignReview | undefined;
                try {
                    const parsedCandidate = parseGapResolutions(
                        JSON.stringify(candidate),
                        budgets.maxTotalQueries,
                    );
                    if (!parsedCandidate.valid || !parsedCandidate.value) {
                        validation = {
                            valid: false,
                            errors: parsedCandidate.errors.map(error => ({
                                code: 'gap-resolution-schema',
                                message: error.message,
                            })),
                        };
                    } else {
                        const review = parsedCandidate.value.testDesignReview;
                        const actionSequences = new Set<number>(
                            (scenario.actions || []).map((action: Record<string, unknown>) => Number(action.sequence))
                                .filter((sequence: number) => Number.isInteger(sequence) && sequence > 0),
                        );
                        const invalidReviewSequences = review?.issues.flatMap(issue => issue.actionSequences)
                            .filter(sequence => !actionSequences.has(sequence)) || [];
                        if (review && !invalidReviewSequences.length) {
                            acceptedReview = review;
                            writeJson(path.join(packageDirectory, 'test-design-review.json'), review);
                        }
                        const resolutions = mergeGapResolutionsWithCoverage(
                            openGaps,
                            deterministicResolved,
                            parsedCandidate.value,
                        );
                        const response = this.deterministicGenerator.generate(
                            packageDirectory,
                            resolutions,
                            parsedCandidate.value.gherkinResolutions || [],
                        );
                        writeJson(
                            resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
                            sanitizeArtifactValue(response, packageDirectory),
                        );
                        validation = this.deterministicResponseValidator
                            ? this.deterministicResponseValidator(
                                scenario as AutomationScenario,
                                fullPlan,
                                response,
                                invalidCandidates,
                            )
                            : { valid: true, errors: [] };
                    }
                } catch (error: any) {
                    validation = {
                        valid: false,
                        errors: [{
                            code: 'generation-materialization',
                            message: error?.message || 'No se pudo materializar la propuesta.',
                        }],
                    };
                }

                const compactErrors = validation.errors.slice(0, 30).map(error => ({
                    code: String(error.code || 'validation').slice(0, 120),
                    message: sanitizeAbsolutePathsInText(String(error.message || ''), packageDirectory).slice(0, 1200),
                    ...(error.file ? {
                        file: sanitizeAbsolutePathsInText(String(error.file), packageDirectory).slice(0, 500),
                    } : {}),
                }));
                if (validation.valid) {
                    if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
                    writeJson(validationFeedbackFile, {
                        schemaVersion: 1,
                        status: 'valid',
                        valid: true,
                        qaRequired: false,
                        automaticRepairAttempts: invalidCandidates,
                        maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                        errors: [],
                        warnings: (validation.warnings || []).slice(0, 20),
                        ...(acceptedReview ? { testDesignReview: acceptedReview } : {}),
                    });
                    return true;
                }

                if (requiresPlannerRegeneration(compactErrors) && !requiresSemanticWording) {
                    const message =
                        'El Gherkin del plan no puede corregirse mediante gap-resolutions.json. ' +
                        'Regenera el paquete con el recording actual o revisa el borrador generado.';
                    semanticTerminal.plannerFailure = { errors: compactErrors, message };
                    if (fs.existsSync(repairContextFile)) fs.unlinkSync(repairContextFile);
                    writeJson(validationFeedbackFile, {
                        schemaVersion: 1,
                        status: 'planner-regeneration-required',
                        valid: false,
                        qaRequired: true,
                        automaticRepairAttempts: invalidCandidates,
                        maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                        errors: compactErrors,
                        nextAction: 'regenerate-package-or-review-draft',
                    });
                    // La salida es terminal para esta pasada: pedir otra edición
                    // de gap-resolutions.json no puede modificar scenarioRows.
                    return true;
                }

                invalidCandidates += 1;
                const automaticRepairAttempts = Math.min(invalidCandidates, budgets.maxRepairAttempts);
                const qaRequired = invalidCandidates > budgets.maxRepairAttempts;
                runStore.setRepairAttempts(automaticRepairAttempts);
                writeJson(repairContextFile, {
                    attempt: automaticRepairAttempts,
                    errors: compactErrors,
                    affectedFiles: [...new Set(compactErrors.map(error => error.file).filter(Boolean))],
                    automatic: true,
                    writableFile: 'gap-resolutions.json',
                    forbiddenDirectEdits: ['agent-response.json'],
                });
                writeJson(validationFeedbackFile, {
                    schemaVersion: 1,
                    status: qaRequired ? 'qa-required' : 'correction-required',
                    valid: false,
                    qaRequired,
                    automaticRepairAttempts,
                    maxAutomaticRepairAttempts: budgets.maxRepairAttempts,
                    errors: compactErrors,
                });
                return qaRequired;
            };
            const pass2 = await this.provider.execute({
                model: input.model,
                cwd: packageDirectory,
                prompt: semanticPrompt,
                timeoutMs: hangStopMs,
                traceFile: './agent-execution.log',
                traceLabel: 'deterministic-pass2',
                stopOnValidatedOutput: {
                    outputFile: './gap-resolutions.json',
                    schemaFile: './gap-resolutions.schema.json',
                    acceptOutput: acceptSemanticOutput,
                },
            });
            runStore.addPassDuration('pass2', pass2.durationMs);
            runStore.recordModelUsage('deterministic-pass2', pass2.modelUsage);
            if (openGaps[0]?.id) runStore.addGapPassDuration(openGaps[0].id, 'pass2', pass2.durationMs);
            runStore.recordDeniedPathStats(pass2.deniedPathStats);
            recordDeniedToolAttempts(runStore, pass2.deniedToolAttempts);
            runStore.setAgentExitCode(pass2.exitCode);
            if (typeof pass2.creditsCost === 'number') runStore.setCreditsCost(pass2.creditsCost);
            const plannerRegenerationFailure = semanticTerminal.plannerFailure;
            if (plannerRegenerationFailure) {
                runStore.markAgentFinished();
                runStore.setGapCounts(openGaps.length, 0, openGaps.length);
                runStore.mark('planner-regeneration-required', true);
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'PLANNER_REGENERATION_REQUIRED',
                    error: plannerRegenerationFailure.message,
                    generationMode: 'deterministic',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'PLANNER_REGENERATION_REQUIRED',
                    error: plannerRegenerationFailure.message,
                };
            }
            if (!pass2.success) {
                runStore.markAgentFinished();
                const code = pass2.errorCode || 'AGENT_NON_ZERO_EXIT';
                const fallback = canFallbackToManual(executionMode, code);
                runStore.setFallback(fallback, code);
                runStore.mark(code, !fallback);
                updateStatus(statusFile, {
                    state: fallback ? 'ready-for-agent' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    agentExecutionMode: executionMode,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2 semántico',
                    generationMode: 'deterministic',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: fallback ? 'fallback-manual' : (pass2.timedOut ? 'timed-out' : pass2.cancelled ? 'cancelled' : 'failed'),
                    invocations: 1,
                    queryCount: counters.total,
                    fallback,
                    errorCode: code,
                    error: pass2.errorMessage || 'No se pudo ejecutar PASS 2 semántico',
                    providerSummary: summarizeAgentProcessOutput(pass2.stdout, pass2.stderr, pass2.exitCode),
                };
            }
            runStore.markAgentFinished();
            if (!fs.existsSync(semanticOutput)) {
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'gap-resolutions.json no existe después de PASS 2 semántico.',
                    generationMode: 'deterministic',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'AGENT_OUTPUT_MISSING',
                    error: 'gap-resolutions.json no existe después de PASS 2 semántico.',
                };
            }
            const parsed = parseGapResolutions(
                readUtf8File(semanticOutput),
                budgets.maxTotalQueries
            );
            if (!parsed.valid || !parsed.value) {
                updateStatus(statusFile, {
                    state: 'failed',
                    agentExecutionMode: executionMode,
                    errorCode: 'SCHEMA_INVALID',
                    error: parsed.errors.map(error => error.message).join(' | '),
                    generationMode: 'deterministic',
                });
                return {
                    success: false,
                    mode: executionMode,
                    state: 'failed',
                    invocations: 1,
                    queryCount: counters.total,
                    fallback: false,
                    errorCode: 'SCHEMA_INVALID',
                    error: parsed.errors.map(error => error.message).join(' | '),
                };
            }
            semantic = parsed.value;
            if (semantic.testDesignReview) {
                const validSequences = new Set<number>(
                    (scenario.actions || []).map((action: Record<string, unknown>) => Number(action.sequence))
                        .filter((sequence: number) => Number.isInteger(sequence) && sequence > 0),
                );
                semantic.testDesignReview = {
                    ...semantic.testDesignReview,
                    issues: semantic.testDesignReview.issues.map(issue => ({
                        ...issue,
                        actionSequences: issue.actionSequences.filter(sequence => validSequences.has(sequence)),
                    })),
                };
                writeJson(path.join(packageDirectory, 'test-design-review.json'), semantic.testDesignReview);
                if (semantic.testDesignReview.status === 'suggestion') {
                    runStore.mark('test-design-suggestions', true);
                }
            }
        } else {
            semantic = emptyGapResolutions(fullPlan.recordingId, fullPlan.planId);
        }

        const finalResolutions = mergeGapResolutionsWithCoverage(openGaps, deterministicResolved, semantic);
        writeJson(resolvePackageArtifactPath(packageDirectory, 'gap-resolutions.json'), {
            schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
            recordingId: fullPlan.recordingId,
            planId: fullPlan.planId,
            resolutions: finalResolutions,
            ...(semantic?.gherkinResolutions?.length
                ? { gherkinResolutions: semantic.gherkinResolutions }
                : {}),
            ...(semantic?.testDesignReview
                ? { testDesignReview: semantic.testDesignReview }
                : {}),
        } satisfies GapResolutionFile);
        const response = this.deterministicGenerator.generate(
            packageDirectory,
            finalResolutions,
            semantic?.gherkinResolutions || [],
        );
        writeJson(
            resolvePackageArtifactPath(packageDirectory, 'agent-response.json'),
            sanitizeArtifactValue(response, packageDirectory),
        );
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        const counts = resolutionCounts(response as unknown as Record<string, any>, openGaps.map(gap => gap.id));
        runStore.setGapCounts(openGaps.length, counts.resolved, counts.unresolved);

        const finalBudget = budgetError(agentBudgetViolations(budgets, {
            responseBytes: Buffer.byteLength(JSON.stringify(response), 'utf-8'),
            agentInvocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
            totalQueries: counters.total,
            queriesPerGap: counters.perGap,
        }));
        if (finalBudget) {
            runStore.mark(finalBudget.code, true);
            updateStatus(statusFile, {
                state: 'failed',
                agentExecutionMode: executionMode,
                errorCode: finalBudget.code,
                error: finalBudget.message,
                generationMode: 'deterministic',
            });
            return {
                success: false,
                mode: executionMode,
                state: 'failed',
                invocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
                queryCount: counters.total,
                fallback: false,
                errorCode: finalBudget.code,
                error: finalBudget.message,
            };
        }
        const completedWithSuggestions = semantic?.testDesignReview?.status === 'suggestion';
        runStore.mark(completedWithSuggestions ? 'completed-with-suggestions' : 'agent-completed');
        updateStatus(statusFile, {
            state: 'completed',
            agentExecutionMode: executionMode,
            generationMode: 'deterministic',
            ...(completedWithSuggestions ? { testDesignSuggestions: true } : {}),
            ...(openGaps.length > 1 ? { strategy: multiGapStrategy } : {}),
        });
        return {
            success: true,
            mode: mode === 'automatic' ? 'automatic' : 'manual',
            state: 'completed',
            invocations: semanticGaps.length || requiresSemanticWording || requiresTestDesignReview ? 1 : 0,
            queryCount: counters.total,
            fallback: false,
            ...(semantic?.testDesignReview ? { testDesignReview: semantic.testDesignReview } : {}),
        };
    }
}
