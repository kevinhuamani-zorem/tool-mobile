import { AgentProviderErrorCode } from '../contracts';
import { AgentModelUsage } from '../domain/agentModel';

export interface AgentProviderRunInput {
    cwd: string;
    prompt: string;
    timeoutMs: number;
    model?: string;
    /** Perfil custom-agent cargado desde `.github/agents` para esta ejecución. */
    agentName?: string;
    /** Nombre humano y estable de la sesión de Copilot. */
    sessionName?: string;
    /** Disable interpreter approvals for sessions that only read and write (Lorem, Sumrak). */
    allowValidationScripts?: boolean;
    traceFile?: string;
    traceLabel?: string;
    stopOnValidatedOutput?: {
        outputFile: string;
        schemaFile: string;
        pollIntervalMs?: number;
        /**
         * Permite al recorder validar el artefacto materializado con su contrato
         * oficial antes de cerrar la sesión del agente. `true` significa que la
         * salida puede aceptarse (válida o derivada a QA); `false` mantiene el
         * watcher activo hasta que el agente escriba una versión distinta;
         * `'stuck'` indica que la versión nueva repite exactamente los errores
         * de la anterior (no converge) y la sesión se corta con
         * `AGENT_FEEDBACK_STUCK` sin esperar más correcciones.
         */
        acceptOutput?: (output: unknown) => boolean | 'stuck';
        /**
         * Tras rechazar una salida (`acceptOutput` false), plazo para que el
         * agente escriba una versión distinta; agotado, la sesión termina con
         * `AGENT_FEEDBACK_IDLE`. `undefined` usa el valor del entorno; 0 desactiva.
         */
        feedbackIdleMs?: number;
    };
    /** Silencio máximo sin eventos antes de cortar con `AGENT_IDLE`; 0 desactiva. */
    idleStopMs?: number;
}

export interface AgentDeniedPathStats {
    insideCwdCount: number;
    outsideCwdCount: number;
}

export interface AgentProviderRunResult {
    modelUsage?: AgentModelUsage;
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    cancelled: boolean;
    errorCode?: AgentProviderErrorCode;
    errorMessage?: string;
    creditsCost?: number;
    deniedPathStats?: AgentDeniedPathStats;
    deniedToolAttempts?: Array<{
        tool: string;
        detail: string;
        pathClass?: 'inside' | 'outside' | 'unknown';
    }>;
}

export interface AgentProvider {
    readonly name: string;
    execute(input: AgentProviderRunInput): Promise<AgentProviderRunResult>;
    cancel(): void;
    getVersion(): Promise<string | null>;
}
