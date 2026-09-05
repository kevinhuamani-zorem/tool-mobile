/**
 * Contratos y constantes del pipeline por capas: roles, archivos de entrada por rol, capas, presupuestos de reintento y tipos publicos.
 */
import {
    AutomationAgentResponse,
} from '../../contracts';
import {
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    LayeredGenerationStageReport,
} from '../../domain/layeredGenerationContracts';

export const INPUT_FILES = [
    'scenario.json',
    'generation-plan.json',
    'gaps.json',
    'hints.json',
    'query-results.json',
    'reuse-context.json',
    'resolved-context.json',
    'unresolved-context.json',
    'framework-api.json',
    'english-vocabulary.json',
    'validation-contract.json',
    'screen-object-contract.js',
    'deterministic-draft.json',
];

export const ROLE_INPUT_FILES: Record<AuthorRole, string[]> = {
    'behavior-author': [
        'scenario.json',
        'generation-plan.json',
        'gaps.json',
        'hints.json',
        'query-results.json',
        'reuse-context.json',
        'english-vocabulary.json',
        'validation-contract.json',
        'deterministic-draft.json',
    ],
    'interaction-author': [
        'scenario.json',
        'generation-plan.json',
        'gaps.json',
        'query-results.json',
        'reuse-context.json',
        'framework-api.json',
        'english-vocabulary.json',
        'validation-contract.json',
        'screen-object-contract.js',
        'deterministic-draft.json',
    ],
};

export const INTEGRATION_INPUT_FILES = [
    'scenario.json',
    'generation-plan.json',
    'gaps.json',
    'query-results.json',
    'reuse-context.json',
    'validation-contract.json',
    'agent-response.schema.json',
];

export const ROLE_LAYERS = {
    'behavior-author': ['feature', 'steps'] as const,
    'interaction-author': ['screen', 'locators'] as const,
    'integration-reviewer': ['feature', 'steps', 'screen', 'locators'] as const,
};

export const ROLE_OUTPUTS = {
    'behavior-author': 'behavior-result.json',
    'interaction-author': 'interaction-result.json',
    'integration-reviewer': 'agent-response.json',
} as const;

export const DELEGATES = [
    { name: LAYERED_GENERATION_AGENTS['behavior-author'].name, role: 'behavior-author' as const },
    { name: LAYERED_GENERATION_AGENTS['interaction-author'].name, role: 'interaction-author' as const },
    { name: LAYERED_GENERATION_AGENTS['integration-reviewer'].name, role: 'integration-reviewer' as const },
];

export const MAX_LAYERED_REPAIR_ATTEMPTS = 1;

export const MAX_LIVE_FEEDBACK_ROUNDS = 2;

export const LAYERED_CACHE_SCHEMA_VERSION = 3;

export type AuthorRole = LayeredAgentResult['role'];

export interface LayeredRepairFeedback {
    all: string[];
    behavior: string[];
    interaction: string[];
    integration: string[];
}

export interface AuthorCacheTarget {
    file?: string;
}

export class LayeredValidationError extends Error {
    constructor(
        readonly feedback: LayeredRepairFeedback,
    ) {
        super(feedback.all.join(' | '));
        this.name = 'LayeredValidationError';
    }
}

export interface LayeredGenerationOptions {
    /**
     * Lorem y Zorem en paralelo usando el `actionTrace` del borrador
     * determinista como contrato de interfaz. Si Lorem cambia esa interfaz,
     * Zorem se relanza con el resultado real. Activo por defecto cuando existe
     * el borrador; `false` fuerza la secuencia Lorem -> Zorem.
     */
    parallelAuthors?: boolean;
    /**
     * Cuando todo el caso viene de memoria o del framework y no hay gaps
     * abiertos, Zorem no corre y Lorem solo revisa el diseño. Con `true` el
     * QA hereda además esa revisión de los casos de origen y ningún autor
     * corre: la decisión es suya, nunca del recorder por defecto.
     */
    inheritDesignReview?: boolean;
    model?: string;
    timeoutMs?: number;
    forceRegenerate?: boolean;
    onStageChange?: (stage: LayeredGenerationStageReport) => void;
}

export interface LayeredGenerationResult {
    success: boolean;
    responseFile?: string;
    reportFile: string;
    error?: string;
}

export type LayeredResponseValidator = (
    packageDirectory: string,
    response: AutomationAgentResponse,
) => { valid: boolean; errors: Array<{ code?: string; message: string; file?: string }> };

export interface RepairIssue {
    code?: string;
    message: string;
    /** Archivo del plan al que apunta el error (ruta relativa al framework). */
    file?: string;
}

export interface PipelineCacheEntry {
    schemaVersion: 1;
    fingerprint: string;
    response: AutomationAgentResponse;
    testDesignReview?: unknown;
}
