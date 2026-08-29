import { AgentProviderErrorCode } from './automationContracts';

export interface AgentProviderRunInput {
    cwd: string;
    prompt: string;
    timeoutMs: number;
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
}

export interface AgentProvider {
    readonly name: string;
    execute(input: AgentProviderRunInput): Promise<AgentProviderRunResult>;
    cancel(): void;
    getVersion(): Promise<string | null>;
}
