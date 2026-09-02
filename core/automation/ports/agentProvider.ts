import { AgentProviderErrorCode } from '../contracts';

export interface AgentProviderRunInput {
    cwd: string;
    prompt: string;
    timeoutMs: number;
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
         * watcher activo hasta que el agente escriba una versión distinta.
         */
        acceptOutput?: (output: unknown) => boolean;
    };
}

export interface AgentDeniedPathStats {
    insideCwdCount: number;
    outsideCwdCount: number;
}

export interface AgentProviderRunResult {
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
