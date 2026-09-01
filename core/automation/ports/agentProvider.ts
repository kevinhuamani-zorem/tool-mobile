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
