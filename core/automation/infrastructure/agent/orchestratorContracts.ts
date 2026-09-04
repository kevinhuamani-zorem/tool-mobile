/**
 * Contratos públicos del AgentOrchestrator compartidos con sus módulos
 * (`deterministicRun`), sin dependencia circular con la clase.
 */
import { AgentExecutionMode, AutomationAgentResponse, AutomationScenario, GenerationPlan, TestDesignReview } from '../../contracts';
import { summarizeAgentProcessOutput } from '../agentRuntimeGuards';

export interface AgentOrchestratorResult {
    modelUsage?: import('../../domain/agentModel').AgentModelUsage | null;
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
