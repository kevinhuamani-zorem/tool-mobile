import { spawn, ChildProcess } from 'child_process';
import {
    AgentProviderErrorCode,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
} from './automationContracts';
import {
    AgentProvider,
    AgentProviderRunInput,
    AgentProviderRunResult,
} from './agentProvider';

type SpawnFn = typeof spawn;

function splitArgs(value: string | undefined): string[] {
    if (!value?.trim()) return [];
    return value.trim().split(/\s+/).filter(Boolean);
}

export class CopilotCliAdapter implements AgentProvider {
    readonly name = 'copilot';
    private active: ChildProcess | null = null;

    constructor(
        private readonly runner: SpawnFn = spawn,
        private readonly command = process.env.RECORDER_COPILOT_CLI_COMMAND || 'copilot',
        private readonly args = splitArgs(process.env.RECORDER_COPILOT_CLI_ARGS || '--ask'),
    ) {}

    async getVersion(): Promise<string | null> {
        return new Promise(resolve => {
            const child = this.runner(this.command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            child.stdout?.on('data', chunk => { output += String(chunk || ''); });
            child.on('error', () => resolve(null));
            child.on('close', code => {
                resolve(code === 0 ? (output.trim().split('\n')[0] || null) : null);
            });
        });
    }

    cancel(): void {
        if (!this.active) return;
        this.active.kill('SIGTERM');
    }

    async execute(input: AgentProviderRunInput): Promise<AgentProviderRunResult> {
        const timeoutMs = Math.max(1, input.timeoutMs || DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxDurationMs);
        const started = process.hrtime.bigint();
        return new Promise(resolve => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let cancelled = false;
            let settled = false;
            let timer: NodeJS.Timeout | undefined;
            const finish = (
                success: boolean,
                exitCode: number | null,
                errorCode?: AgentProviderErrorCode,
                errorMessage?: string,
            ) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                this.active = null;
                resolve({
                    success,
                    exitCode,
                    stdout,
                    stderr,
                    durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
                    timedOut,
                    cancelled,
                    ...(errorCode ? { errorCode } : {}),
                    ...(errorMessage ? { errorMessage } : {}),
                });
            };
            const child = this.runner(this.command, this.args, {
                cwd: input.cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.active = child;
            child.stdout?.on('data', chunk => { stdout += String(chunk || ''); });
            child.stderr?.on('data', chunk => { stderr += String(chunk || ''); });
            child.on('error', (error: any) => {
                const code: AgentProviderErrorCode = error?.code === 'ENOENT'
                    ? 'AGENT_NOT_INSTALLED'
                    : 'AGENT_UNAVAILABLE';
                finish(false, null, code, String(error?.message || error));
            });
            child.on('close', (code, signal) => {
                if (timedOut) return finish(false, code, 'AGENT_TIMEOUT');
                if (cancelled || signal === 'SIGTERM') return finish(false, code, 'AGENT_CANCELLED');
                if (code !== 0) return finish(false, code, 'AGENT_NON_ZERO_EXIT');
                finish(true, code);
            });
            child.stdin?.write(input.prompt);
            child.stdin?.end();
            timer = setTimeout(() => {
                timedOut = true;
                this.cancel();
            }, timeoutMs);
            // Node keeps process alive anyway because child is alive.
            timer.unref?.();
            child.once('exit', (_code, signal) => {
                if (signal === 'SIGTERM' && !timedOut) cancelled = true;
            });
        });
    }
}
