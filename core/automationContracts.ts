import { GenerationRequest, MobilePlatform } from './fwkMobileGenerator';
import { RecordedStep } from './models';

export const AUTOMATION_SCHEMA_VERSION = 1;
export const AUTOMATION_PIPELINE_VERSION = '1.0.0';
export const AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION = 1;
export const AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION = '1.0';
export const AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION = '1.0';
export const AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION = '1.0';

export type AgentExecutionMode = 'manual' | 'automatic';
export const DEFAULT_AGENT_EXECUTION_MODE: AgentExecutionMode = 'automatic';

export type RecorderGenerationMode = 'legacy' | 'deterministic';
export const DEFAULT_RECORDER_GENERATION_MODE: RecorderGenerationMode = 'deterministic';

export function resolveRecorderGenerationMode(value?: string | null): RecorderGenerationMode {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'legacy') return 'legacy';
    if (normalized === 'deterministic') return 'deterministic';
    return DEFAULT_RECORDER_GENERATION_MODE;
}

export type AgentExecutionState =
    | 'prepared'
    | 'running'
    | 'completed'
    | 'failed'
    | 'timed-out'
    | 'cancelled';

export type AgentDomainErrorCode =
    | 'QUERY_NOT_ALLOWED'
    | 'NO_OPEN_GAP'
    | 'GAP_BLOCKED'
    | 'MAX_QUERIES_EXCEEDED'
    | 'DUPLICATE_QUERY'
    | 'QUERY_POLICY_VIOLATION'
    | 'SCHEMA_INVALID'
    | 'GAP_CONTEXT_OVERFLOW'
    | 'QUERY_RESULT_TRUNCATED'
    | 'DURATION_BUDGET_EXCEEDED'
    | 'CONTEXT_BUDGET_EXCEEDED'
    | 'RESPONSE_BUDGET_EXCEEDED'
    | 'AGENT_INVOCATION_BUDGET_EXCEEDED'
    | 'TOTAL_QUERY_BUDGET_EXCEEDED';

export type AgentProviderErrorCode =
    | 'AGENT_NOT_INSTALLED'
    | 'AGENT_UNAVAILABLE'
    | 'AGENT_TOOL_DENIED'
    | 'AGENT_OUTPUT_PATH_EXISTS'
    | 'AGENT_TIMEOUT'
    | 'AGENT_CANCELLED'
    | 'AGENT_NON_ZERO_EXIT'
    | 'AGENT_OUTPUT_MISSING';

export type AgentErrorCode = AgentDomainErrorCode | AgentProviderErrorCode;

export type AgentFallbackPolicy = Record<AgentErrorCode, boolean>;

export const DEFAULT_AGENT_FALLBACK_POLICY: AgentFallbackPolicy = {
    QUERY_NOT_ALLOWED: false,
    NO_OPEN_GAP: false,
    GAP_BLOCKED: false,
    MAX_QUERIES_EXCEEDED: false,
    DUPLICATE_QUERY: false,
    QUERY_POLICY_VIOLATION: false,
    SCHEMA_INVALID: false,
    GAP_CONTEXT_OVERFLOW: false,
    QUERY_RESULT_TRUNCATED: false,
    DURATION_BUDGET_EXCEEDED: false,
    CONTEXT_BUDGET_EXCEEDED: false,
    RESPONSE_BUDGET_EXCEEDED: false,
    AGENT_INVOCATION_BUDGET_EXCEEDED: false,
    TOTAL_QUERY_BUDGET_EXCEEDED: false,
    AGENT_NOT_INSTALLED: true,
    AGENT_UNAVAILABLE: true,
    AGENT_TOOL_DENIED: false,
    AGENT_OUTPUT_PATH_EXISTS: false,
    AGENT_TIMEOUT: false,
    AGENT_CANCELLED: false,
    AGENT_NON_ZERO_EXIT: false,
    AGENT_OUTPUT_MISSING: false,
};

export function isAgentFallbackAllowed(
    code: AgentErrorCode,
    policy: AgentFallbackPolicy = DEFAULT_AGENT_FALLBACK_POLICY,
): boolean {
    return Boolean(policy[code]);
}

export interface AgentOperationalBudgets {
    maxDurationMs: number;
    maxContextBytes: number;
    maxResponseBytes: number;
    maxAgentInvocations: number;
    maxTotalQueries: number;
    maxQueriesPerGap: number;
    maxRepairAttempts: number;
}

export const DEFAULT_AGENT_OPERATIONAL_BUDGETS: AgentOperationalBudgets = {
    maxDurationMs: 300_000,
    maxContextBytes: 20_000,
    maxResponseBytes: 400_000,
    maxAgentInvocations: 2,
    maxTotalQueries: 24,
    maxQueriesPerGap: 6,
    maxRepairAttempts: 1,
};

function clampBudget(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.floor(value));
}

export function normalizeAgentOperationalBudgets(
    budgets?: Partial<AgentOperationalBudgets> | null,
): AgentOperationalBudgets {
    return {
        maxDurationMs: clampBudget(
            budgets?.maxDurationMs,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxDurationMs
        ),
        maxContextBytes: clampBudget(
            budgets?.maxContextBytes,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxContextBytes
        ),
        maxResponseBytes: clampBudget(
            budgets?.maxResponseBytes,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxResponseBytes
        ),
        maxAgentInvocations: clampBudget(
            budgets?.maxAgentInvocations,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxAgentInvocations
        ),
        maxTotalQueries: clampBudget(
            budgets?.maxTotalQueries,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxTotalQueries
        ),
        maxQueriesPerGap: clampBudget(
            budgets?.maxQueriesPerGap,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxQueriesPerGap
        ),
        maxRepairAttempts: clampBudget(
            budgets?.maxRepairAttempts,
            DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxRepairAttempts
        ),
    };
}

export interface AgentBudgetUsage {
    totalDurationMs?: number;
    contextBytes?: number;
    responseBytes?: number;
    agentInvocations?: number;
    totalQueries?: number;
    queriesPerGap?: Record<string, number>;
}

export function agentBudgetViolations(
    budgets: AgentOperationalBudgets,
    usage: AgentBudgetUsage,
): AgentDomainErrorCode[] {
    const violations: AgentDomainErrorCode[] = [];
    if ((usage.responseBytes || 0) > budgets.maxResponseBytes) violations.push('RESPONSE_BUDGET_EXCEEDED');
    if ((usage.agentInvocations || 0) > budgets.maxAgentInvocations) {
        violations.push('AGENT_INVOCATION_BUDGET_EXCEEDED');
    }
    if ((usage.totalQueries || 0) > budgets.maxTotalQueries) violations.push('TOTAL_QUERY_BUDGET_EXCEEDED');
    if (usage.queriesPerGap) {
        const exceeded = Object.values(usage.queriesPerGap)
            .some(value => value > budgets.maxQueriesPerGap);
        if (exceeded) violations.push('MAX_QUERIES_EXCEEDED');
    }
    return [...new Set(violations)];
}

export interface AutomationScenario {
    schemaVersion: number;
    pipelineVersion: string;
    recordingId: string;
    revision: number;
    fingerprint: string;
    createdAt: string;
    squad: string;
    platform: MobilePlatform;
    environment: string;
    objective: string;
    acceptanceCriteria: string;
    request: GenerationRequest;
    actions: Array<RecordedStep & { sequence: number }>;
}

export type ResolutionKind = 'reuse' | 'create' | 'builtin' | 'unresolved';

export interface ActionResolution {
    sequence: number;
    action: RecordedStep['action'];
    intent: string;
    resolution: ResolutionKind;
    locatorName?: string;
    selector?: string;
    /** Candidato verificado que justificó reuse; audita alternativas sin escribirlas. */
    matchedCandidateId?: string;
    matchedPrimaryCandidate?: boolean;
    /**
     * Locators existentes que el gap de duplicado ofrecio para esta accion.
     *
     * El gap invita a reutilizar uno en vez de crear; sin esta lista el
     * validador seguia exigiendo el `locatorName` del plan y rechazaba al
     * agente por hacer justo lo que el gap le pedia. Adoptar uno de estos
     * nombres esta autorizado; cualquier otro, no.
     */
    reuseCandidates?: Array<{
        file: string;
        module: string;
        name: string;
    }>;
    /** Huecos existentes que esta accion puede completar sin elegir otra key. */
    completionTargets?: Array<{
        file: string;
        module: string;
        name: string;
        platform: MobilePlatform;
        block: string;
    }>;
    source?: {
        file: string;
        module: string;
        scope: 'squad' | 'home';
    };
    confidence: number;
    gapId?: string;
    reason: string;
    /** Método del módulo target que ya cubre esta intención, si lo hay. */
    existingMethod?: {
        name: string;
        signature: string;
        file: string;
        locatorKeys: string[];
        score: number;
    };
}

export interface PlannedFile {
    layer: 'feature' | 'steps' | 'screen' | 'locators';
    path: string;
    operation: 'create' | 'update';
    /** Hash del archivo conocido al preparar el plan; protege updates contra cambios externos. */
    baseHash?: string;
}

export interface RepetitionProposal {
    startSequence: number;
    length: number;
    repetitions: number;
    varyingOffset: number;
    values: string[];
    parameter: string;
    sequences: number[][];
}

export interface GenerationPlan {
    schemaVersion: number;
    pipelineVersion: string;
    planId: string;
    recordingId: string;
    fingerprint: string;
    deterministicCoverage: number;
    status: 'deterministic' | 'needs-agent' | 'memory-hit' | 'regeneration';
    resolutions: ActionResolution[];
    files: PlannedFile[];
    unresolvedGapIds: string[];
    existingCase?: ExistingAutomationCandidate;
    /** Ciclo repetido detectado; el QA decide si se convierte en Examples. */
    repetition?: RepetitionProposal;
    reuseTarget?: {
        reason: string;
        score: number;
        steps?: string;
        screen?: string;
        locators?: string;
    };
    budgets: AgentOperationalBudgets;
}

export interface ExistingAutomationCandidate {
    feature: string;
    scenario: string;
    caseId?: string;
    score: number;
    selectorCoverage: number;
    paths: {
        feature: string;
        steps: string;
        screen: string;
        locators: string;
    };
}

export interface FrameworkReuseCandidate {
    feature: string;
    scenario: string;
    caseId?: string;
    file: string;
    score: number;
    selectorCoverage: number;
    matchedSteps: string[];
    paths?: ExistingAutomationCandidate['paths'];
    relatedPaths?: {
        steps: string[];
        screens: string[];
        locators: string[];
    };
}

export interface ResolvedContext {
    schemaVersion: number;
    recordingId: string;
    planId: string;
    reusedLocators: ActionResolution[];
    /**
     * [visual-recorder] TODOS los elementos ya existentes que el caso toca, con
     * su tipo, bloque, valor y la expresión exacta para referenciarlos.
     * Agrupados por módulo para no repetir import e identificador en cada uno.
     * Sin esto el agente sabe que debe reutilizar pero no puede escribir el
     * getter; y omitir uno lo lleva a duplicar, así que nunca se recorta.
     */
    elementDeclarations?: unknown[];
    frameworkAwareness?: {
        candidates: FrameworkReuseCandidate[];
        exactStepDefinitions: Array<{
            expression: string;
            file: string;
            scope: 'squad' | 'commons';
        }>;
        selectorCollisions: Array<{
            sequence: number;
            locatorName: string;
            file: string;
            module: string;
            scope: 'squad' | 'home';
        }>;
        decision: 'create-new' | 'reuse-existing' | 'extend-existing';
        reuseTarget?: GenerationPlan['reuseTarget'];
    };
    frameworkContract: {
        stepsOnlyOrchestrate: true;
        screenExtendsBaseScreen: true;
        sharedLocatorNameAcrossPlatforms: true;
        allowedScopes: ['squad', 'home'];
        /**
         * [visual-recorder] Anclajes resueltos del framework en esta grabacion.
         * Viajan como dato para que el agente use la ruta real y no una
         * convencion memorizada, y para que un movimiento del framework se vea
         * en el paquete en vez de descubrirse al ejecutar wdio.
         */
        baseScreenClass: string;
        baseScreenImport: string;
        locatorFactoryImport: string;
        typeLocatorImport: string;
    };
}

export interface UnresolvedGap {
    id: string;
    sequence?: number;
    type: 'missing-assertion' | 'missing-selector' | 'missing-intent' | 'test-data' | 'test-input' | 'semantic-naming' | 'verification-semantics' | 'repetition' | 'refinement' | 'qa-decision';
    description: string;
    requiredOutput: string;
    /**
     * [visual-recorder] Gap bloqueante: no es algo que el agente pueda resolver
     * con mas contexto, sino un defecto de la grabacion que solo el QA puede
     * corregir. El paquete no se arma y el agente nunca arranca.
     */
    blocking?: boolean;
    /** Campos opcionales de Fase 3; recordings anteriores siguen siendo válidos. */
    intent?: string;
    reason?: string;
    allowedQueries?: FrameworkContextQuery[];
    allowedQueryArgsSchemas?: Partial<Record<FrameworkContextQuery, Record<string, string>>>;
    maxQueries?: number;
    expectedAnswerSchema?: Record<string, unknown>;
    evidenceRequired?: string[];
    resolvedBy?: GapResolver;
    status?: GapStatus;
}

export type FrameworkContextQuery =
    | 'inspectScenario'
    | 'findExistingScreen'
    | 'findExistingStep'
    | 'findExample'
    | 'findLocator'
    | 'getContract'
    | 'getHelperApi'
    | 'validateImports';

export const FRAMEWORK_CONTEXT_QUERIES: FrameworkContextQuery[] = [
    'inspectScenario',
    'findExistingScreen',
    'findExistingStep',
    'findExample',
    'findLocator',
    'getContract',
    'getHelperApi',
    'validateImports',
];

export type GapResolver = 'qa' | 'deterministic' | 'agent';
export type GapStatus = 'open' | 'resolved' | 'blocked-qa';

export type AutomationHintType =
    | 'verified_selector'
    | 'existing_locator'
    | 'builtin_action'
    | 'existing_scenario'
    | 'existing_step'
    | 'existing_screen'
    | 'framework_contract';

export interface AutomationHint {
    id: string;
    type: AutomationHintType;
    confidence: number;
    source: 'qa-recording' | 'deterministic-resolver' | 'framework-index' | 'framework-contract';
    symbol?: string;
    path?: string;
    intent?: string;
    relation?: string;
    evidence?: Record<string, unknown>;
}

export interface AutomationHintsProjection {
    schemaVersion: 1;
    recordingId: string;
    planId: string;
    hints: AutomationHint[];
}

export interface AutomationGap extends Omit<UnresolvedGap, 'resolvedBy'> {
    intent: string;
    reason: string;
    blocking: boolean;
    allowedQueries: FrameworkContextQuery[];
    allowedQueryArgsSchemas: Partial<Record<FrameworkContextQuery, Record<string, string>>>;
    maxQueries: number;
    expectedAnswerSchema: Record<string, unknown>;
    evidenceRequired: string[];
    resolvedBy: GapResolver | null;
    status: GapStatus;
}

export interface AutomationGapsProjection {
    schemaVersion: 1;
    recordingId: string;
    planId: string;
    gaps: AutomationGap[];
}

export interface AgentContextQueryRequest {
    id: string;
    gapId: string;
    query: FrameworkContextQuery;
    args: Record<string, unknown>;
}

export interface AgentContextQueryRequests {
    schemaVersion: typeof AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION;
    recordingId: string;
    planId: string;
    requests: AgentContextQueryRequest[];
}

export type AgentContextQueryResultStatus = 'resolved' | 'rejected' | 'not-found' | 'error';

export type AgentContextQueryRejectionCode =
    | 'query-not-allowed'
    | 'invalid-args'
    | 'query-truncated'
    | 'no-open-gap'
    | 'max-queries-exceeded'
    | 'duplicate-query'
    | 'blocked-qa'
    | 'context-budget-exceeded';

export interface AgentContextQueryResult {
    requestId: string;
    gapId: string;
    status: AgentContextQueryResultStatus;
    code?: AgentContextQueryRejectionCode;
    data?: Record<string, unknown>;
    evidence?: string[];
}

export interface AgentContextQueryResults {
    schemaVersion: typeof AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION;
    results: AgentContextQueryResult[];
}

export interface UnresolvedContext {
    schemaVersion: number;
    recordingId: string;
    planId: string;
    gaps: UnresolvedGap[];
}

export interface AgentGeneratedFile {
    layer: PlannedFile['layer'];
    path: string;
    content: string;
}

export interface AgentUnresolvedNeed {
    query: FrameworkContextQuery;
    args: Record<string, unknown>;
}

export type GapResolutionDecision = 'reuse' | 'create' | 'resolved' | 'qa-required' | 'unresolved';

export interface GapResolution {
    gapId: string;
    decision: GapResolutionDecision;
    reason?: string;
    symbol?: string;
    /**
     * Candidato exacto elegido de los ofrecidos por el plan o por findLocator.
     * `symbol` se conserva para respuestas antiguas, pero no es suficiente para
     * materializar reuse sin volver a interpretar texto libre.
     */
    selectedCandidate?: {
        file: string;
        module: string;
        name: string;
    };
    evidence?: string[];
    needs?: AgentUnresolvedNeed[];
}

export interface GapResolutionFile {
    schemaVersion: typeof AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION;
    recordingId: string;
    planId: string;
    resolutions: GapResolution[];
}

export interface AutomationAgentResponse {
    /** Backward compatible: respuestas viejas podían omitirlo; se asume v1. */
    schemaVersion?: number;
    recordingId: string;
    planId: string;
    resolutions: Array<{ gapId: string; decision: string; reason?: string; needs?: AgentUnresolvedNeed[] }>;
    actionTrace: Array<{
        sequence: number;
        gherkinStep: string;
        screenMethod?: string;
        locatorName?: string;
    }>;
    files: AgentGeneratedFile[];
    /**
     * Locators existentes cuyo hueco de la plataforma grabada se rellena con el
     * selector de una accion de la grabacion.
     *
     * El agente NO escribe el selector: solo dice que clave adopta y de que
     * accion sale el valor. El recorder lo copia de `actions[sequence]`, asi que
     * un selector inventado no puede entrar por aqui.
     */
    completions?: LocatorCompletion[];
    assumptions?: string[];
}

export interface LocatorCompletion {
    /** Archivo de locators, relativo al framework. */
    file: string;
    /** Clave existente que se adopta; tiene que estar ya en el bloque destino. */
    name: string;
    platform: 'android' | 'ios';
    /** Accion de la grabacion que aporta el selector verificado. */
    sequence: number;
}

export interface AutomationValidation {
    valid: boolean;
    qualityScore: number;
    errors: Array<{ code: string; message: string; file?: string }>;
    warnings: string[];
    repairContext?: {
        attempt: number;
        errors: Array<{ code: string; message: string; file?: string }>;
        affectedFiles: string[];
        groups?: Array<{
            code: string;
            file?: string;
            count: number;
            messages: string[];
        }>;
    };
}

export interface AutomationPackageResult {
    packageDirectory: string;
    recordingId: string;
    planId: string;
    status: GenerationPlan['status'];
    deterministicCoverage: number;
    unresolvedGaps: number;
    memoryVersion?: number;
    agentRequired: boolean;
    responseAvailable: boolean;
    validation?: AutomationValidation;
    /** Bytes del contexto mínimo y aviso si supera el objetivo (no bloquea). */
    contextBytes?: number;
    contextWarning?: string;
    /**
     * [visual-recorder] Anclajes del framework (BaseScreen, LocatorFactory,
     * TypeLocator) que no se pudieron resolver y quedaron en su valor por
     * convención. Si aparecen, el import generado puede no existir.
     */
    frameworkWarnings?: string[];
}
