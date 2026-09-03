import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
    AgentProviderErrorCode,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
} from '../contracts';
import {
    AgentDeniedPathStats,
    AgentProvider,
    AgentProviderRunInput,
    AgentProviderRunResult,
} from '../ports/agentProvider';
import { readJsonUtf8, readUtf8File } from '../../shared';

type SpawnFn = typeof spawn;

function splitArgs(value: string | undefined): string[] {
    if (!value?.trim()) return [];
    return value.trim().split(/\s+/).filter(Boolean);
}

const DEFAULT_COPILOT_CLI_ARGS = '-p --output-format json --allow-tool=write';
const DEFAULT_COPILOT_MODEL = 'auto';

function hasModelArg(args: string[]): boolean {
    return args.some(value =>
        value === '--model'
        || value === '-m'
        || value.startsWith('--model=')
    );
}

function withModelArg(args: string[], model: string): string[] {
    const normalized = String(model || '').trim();
    if (!normalized || hasModelArg(args)) return args;
    return [...args, '--model', normalized];
}

function withPromptArg(args: string[], prompt: string): string[] {
    if (args.some(value => value.includes('{prompt}'))) {
        return args.map(value => value.split('{prompt}').join(prompt));
    }
    const flagIndex = args.findIndex(value =>
        value === '-p'
        || value === '--prompt'
        || value === '-i'
        || value === '--interactive'
    );
    if (flagIndex < 0) return [...args, prompt];
    return [
        ...args.slice(0, flagIndex + 1),
        prompt,
        ...args.slice(flagIndex + 1),
    ];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findCreditsCost(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = findCreditsCost(item);
            if (nested !== undefined) return nested;
        }
        return undefined;
    }
    if (!isObject(value)) return undefined;
    for (const [key, entry] of Object.entries(value)) {
        const lower = key.toLowerCase();
        if (typeof entry === 'number' && Number.isFinite(entry) && lower.includes('credit')) {
            return entry;
        }
        const nested = findCreditsCost(entry);
        if (nested !== undefined) return nested;
    }
    return undefined;
}

export function validateWithSchema(value: unknown, schema: unknown): boolean {
    if (!isObject(schema)) return true;
    if (schema.const !== undefined) return value === schema.const;
    if (Array.isArray(schema.enum)) return schema.enum.includes(value);
    const type = typeof schema.type === 'string' ? schema.type : '';
    if (type === 'string') return typeof value === 'string';
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'array') {
        if (!Array.isArray(value)) return false;
        if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
        if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
        if (schema.items !== undefined) {
            return value.every(item => validateWithSchema(item, schema.items));
        }
        return true;
    }
    if (type === 'object') {
        if (!isObject(value)) return false;
        const required = Array.isArray(schema.required) ? schema.required.filter(key => typeof key === 'string') : [];
        for (const key of required) {
            if (!(key in value)) return false;
        }
        const properties = isObject(schema.properties) ? schema.properties : {};
        for (const [key, propertySchema] of Object.entries(properties)) {
            if (key in value && !validateWithSchema(value[key], propertySchema)) return false;
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) return false;
            }
        }
        return true;
    }
    return true;
}

function isInsideDirectory(candidatePath: string, cwd: string): boolean {
    const relative = path.relative(cwd, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function classifyDeniedPath(deniedPath: string | null, cwd: string): 'inside' | 'outside' | 'unknown' {
    if (!deniedPath || typeof deniedPath !== 'string') return 'unknown';
    try {
        const resolvedRaw = path.isAbsolute(deniedPath)
            ? path.resolve(deniedPath)
            : path.resolve(cwd, deniedPath);
        const cwdVariants = new Set<string>([cwd, path.resolve(cwd)]);
        try { cwdVariants.add(fs.realpathSync.native(cwd)); } catch {}
        const resolvedVariants = new Set<string>([resolvedRaw]);
        try {
            const parent = path.dirname(resolvedRaw);
            const base = path.basename(resolvedRaw);
            const realParent = fs.realpathSync.native(parent);
            resolvedVariants.add(path.join(realParent, base));
        } catch {}
        for (const resolved of resolvedVariants) {
            for (const cwdVariant of cwdVariants) {
                if (isInsideDirectory(resolved, cwdVariant)) return 'inside';
            }
        }
        return 'outside';
    } catch {
        return 'unknown';
    }
}

function sanitizeTrace(text: string): string {
    return String(text || '')
        .replace(/(browserstack[_-]?access[_-]?key|access[_-]?key|token|password|passwd|pin|otp)\s*[:=]\s*[^\s'"]+/ig, '$1=<redacted>')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
}

export class CopilotCliAdapter implements AgentProvider {
    readonly name = 'copilot';
    private active: ChildProcess | null = null;

    constructor(
        private readonly runner: SpawnFn = spawn,
        private readonly command = process.env.RECORDER_COPILOT_CLI_COMMAND || 'copilot',
        private readonly args = splitArgs(process.env.RECORDER_COPILOT_CLI_ARGS || DEFAULT_COPILOT_CLI_ARGS),
        private readonly model = process.env.RECORDER_COPILOT_MODEL || DEFAULT_COPILOT_MODEL,
        private readonly killGraceMs = 5_000,
    ) {}

    private resolveCwd(cwd: string): string {
        try {
            return fs.realpathSync.native(cwd);
        } catch {
            return cwd;
        }
    }

    async getVersion(): Promise<string | null> {
        return new Promise(resolve => {
            const child = this.runner(this.command, ['--version'], {
                cwd: this.resolveCwd(process.cwd()),
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    LANG: process.env.LANG || 'en_US.UTF-8',
                    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
                },
            });
            let output = '';
            child.stdout?.setEncoding?.('utf8');
            child.stdout?.on('data', chunk => { output += String(chunk || ''); });
            child.on('error', () => resolve(null));
            child.on('close', code => {
                resolve(code === 0 ? (output.trim().split('\n')[0] || null) : null);
            });
        });
    }

    cancel(): void {
        if (!this.active) return;
        this.killProcessTree('SIGTERM');
    }

    private killProcessTree(signal: NodeJS.Signals): void {
        const child = this.active;
        if (!child) return;
        this.killPidTree(child.pid, signal);
    }

    private killPidTree(pid: number | undefined, signal: NodeJS.Signals): void {
        if (!pid) {
            return;
        }
        if (process.platform === 'win32') {
            try { process.kill(pid, signal); } catch {}
            return;
        }
        try {
            process.kill(-pid, signal);
        } catch {
            try { process.kill(pid, signal); } catch {}
        }
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
            const effectiveCwd = this.resolveCwd(input.cwd);
            let stdoutBuffer = '';
            const toolCallsById = new Map<string, { name: string; args: Record<string, unknown> }>();
            let creditsCost: number | undefined;
            let timeoutTimer: NodeJS.Timeout | undefined;
            let killEscalationTimer: NodeJS.Timeout | undefined;
            let outputWatchTimer: NodeJS.Timeout | undefined;
            const deniedPathStats: AgentDeniedPathStats = {
                insideCwdCount: 0,
                outsideCwdCount: 0,
            };
            const tracePath = input.traceFile
                ? path.resolve(effectiveCwd, input.traceFile)
                : null;
            const traceLabel = (input.traceLabel || 'agent').trim() || 'agent';
            const appendTrace = (channel: string, payload: string) => {
                if (!tracePath || !isInsideDirectory(tracePath, effectiveCwd)) return;
                const line = `[${new Date().toISOString()}][${traceLabel}][${channel}] ${sanitizeTrace(payload)}`;
                fs.appendFileSync(tracePath, line.endsWith('\n') ? line : `${line}\n`, 'utf-8');
            };
            const deniedToolAttempts: Array<{
                tool: string;
                detail: string;
                pathClass?: 'inside' | 'outside' | 'unknown';
            }> = [];
            const finish = (
                success: boolean,
                exitCode: number | null,
                errorCode?: AgentProviderErrorCode,
                errorMessage?: string,
            ) => {
                if (settled) return;
                settled = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                if (outputWatchTimer) clearInterval(outputWatchTimer);
                this.active = null;
                appendTrace(
                    'result',
                    `success=${success} exitCode=${exitCode ?? 'null'} timedOut=${timedOut} cancelled=${cancelled}` +
                    `${errorCode ? ` errorCode=${errorCode}` : ''}` +
                    `${errorMessage ? ` error=${errorMessage}` : ''}`
                );
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
                    ...(creditsCost !== undefined ? { creditsCost } : {}),
                    deniedPathStats,
                    deniedToolAttempts,
                });
            };
            const args = withPromptArg(withModelArg(this.args, this.model), input.prompt);
            const child = this.runner(this.command, args, {
                cwd: effectiveCwd,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
                env: {
                    ...process.env,
                    LANG: process.env.LANG || 'en_US.UTF-8',
                    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
                },
            });
            // String(Buffer) por chunk corrompe una tilde si sus bytes UTF-8
            // llegan partidos entre eventos. El decoder interno del stream
            // conserva esos bytes hasta completar el carácter.
            child.stdout?.setEncoding?.('utf8');
            child.stderr?.setEncoding?.('utf8');
            appendTrace('start', `command=${this.command} timeoutMs=${timeoutMs}`);
            this.active = child;
            const stopOnValidatedOutput = input.stopOnValidatedOutput;
            if (stopOnValidatedOutput?.outputFile && stopOnValidatedOutput?.schemaFile) {
                const outputPath = path.resolve(effectiveCwd, stopOnValidatedOutput.outputFile);
                const schemaPath = path.resolve(effectiveCwd, stopOnValidatedOutput.schemaFile);
                const pollIntervalMs = Math.max(50, Number(stopOnValidatedOutput.pollIntervalMs || 250));
                let lastEvaluatedOutput: string | null = fs.existsSync(outputPath)
                    ? readUtf8File(outputPath)
                    : null;
                outputWatchTimer = setInterval(() => {
                    if (settled || timedOut) return;
                    if (!fs.existsSync(outputPath) || !fs.existsSync(schemaPath)) return;
                    try {
                        const raw = readUtf8File(outputPath);
                        if (raw === lastEvaluatedOutput) return;
                        const output = readJsonUtf8<unknown>(outputPath);
                        const schema = readJsonUtf8<unknown>(schemaPath);
                        lastEvaluatedOutput = raw;
                        const schemaValid = validateWithSchema(output, schema);
                        if (stopOnValidatedOutput.acceptOutput) {
                            if (!stopOnValidatedOutput.acceptOutput(output)) {
                                appendTrace(
                                    schemaValid ? 'output-rejected' : 'schema-rejected',
                                    'El recorder solicitó una corrección automática.',
                                );
                                return;
                            }
                        } else if (!schemaValid) {
                            appendTrace('schema-rejected', 'La salida no cumple el schema esperado.');
                            return;
                        }
                    } catch {
                        return;
                    }
                    const pid = child.pid;
                    this.killPidTree(pid, 'SIGTERM');
                    killEscalationTimer = setTimeout(() => {
                        this.killPidTree(pid, 'SIGKILL');
                    }, Math.max(1, this.killGraceMs));
                    killEscalationTimer.unref?.();
                    finish(true, null);
                }, pollIntervalMs);
            }
            const toolErrorFromLine = (
                line: string,
            ): {
                code: AgentProviderErrorCode;
                message: string;
                fatal: boolean;
                tool?: string;
                detail?: string;
                pathClass?: 'inside' | 'outside' | 'unknown';
            } | null => {
                let payload: any;
                try {
                    payload = JSON.parse(line);
                } catch {
                    return null;
                }
                if (payload?.type === 'assistant.message') {
                    const toolRequests = payload?.data?.toolRequests;
                    if (Array.isArray(toolRequests)) {
                        for (const request of toolRequests) {
                            const callId = typeof request?.toolCallId === 'string'
                                ? request.toolCallId
                                : null;
                            const toolName = typeof request?.name === 'string'
                                ? request.name
                                : null;
                            if (callId && toolName) {
                                toolCallsById.set(callId, {
                                    name: toolName,
                                    args: request?.arguments && typeof request.arguments === 'object'
                                        ? request.arguments
                                        : {},
                                });
                            }
                        }
                    }
                }
                const deniedFromModelToolExecution = payload?.type === 'model.tool_execution'
                    && payload?.data?.toolResult?.resultType === 'denied';
                const deniedFromToolExecutionComplete = payload?.type === 'tool.execution_complete'
                    && payload?.data?.success === false
                    && payload?.data?.error?.code === 'denied';
                const pathExistsFromToolExecutionComplete = payload?.type === 'tool.execution_complete'
                    && payload?.data?.success === false
                    && payload?.data?.error?.code === 'failure'
                    && payload?.data?.error?.message === 'Path already exists';
                if (!deniedFromModelToolExecution && !deniedFromToolExecutionComplete && !pathExistsFromToolExecutionComplete) {
                    return null;
                }
                const resolvedPathAgainstCwd = deniedFromToolExecutionComplete
                    ? payload?.data?.toolTelemetry?.properties?.resolvedPathAgainstCwd
                    : payload?.data?.toolResult?.toolTelemetry?.properties?.resolvedPathAgainstCwd;
                const callId = typeof payload?.data?.toolCallId === 'string'
                    ? payload.data.toolCallId
                    : null;
                if (callId && toolCallsById.has(callId)) {
                    const known = toolCallsById.get(callId) || { name: `toolCallId:${callId}`, args: {} };
                    const command = typeof known.args.command === 'string' ? known.args.command : null;
                    const baseDetail = command
                        ? `command=${command}`
                        : `args=${JSON.stringify(known.args)}`;
                    const deniedPath = typeof known.args.path === 'string' ? known.args.path : null;
                    const deniedPathClass = resolvedPathAgainstCwd === 'false'
                        ? classifyDeniedPath(deniedPath, effectiveCwd)
                        : 'unknown';
                    if (deniedPathClass === 'inside') deniedPathStats.insideCwdCount += 1;
                    if (deniedPathClass === 'outside') deniedPathStats.outsideCwdCount += 1;
                    const pathDetail = resolvedPathAgainstCwd === 'false'
                        ? `ruta denegada por no resolver contra cwd (path=${deniedPath || 'N/A'}, cwd=${effectiveCwd}, class=${deniedPathClass})`
                        : null;
                    const detail = pathDetail ? `${baseDetail}; ${pathDetail}` : baseDetail;
                    if (pathExistsFromToolExecutionComplete && known.name === 'create') {
                        return {
                            code: 'AGENT_OUTPUT_PATH_EXISTS',
                            message: `La salida del agente ya existe y create no sobrescribe (path=${deniedPath || 'N/A'}).`,
                            fatal: true,
                            tool: known.name,
                            detail,
                            pathClass: deniedPathClass,
                        };
                    }
                    return {
                        code: 'AGENT_TOOL_DENIED',
                        message: `Herramienta denegada: ${known.name} (${detail}).`,
                        fatal: false,
                        tool: known.name,
                        detail,
                        pathClass: deniedPathClass,
                    };
                }
                const fallback = callId ? `toolCallId:${callId}` : 'desconocida';
                if (pathExistsFromToolExecutionComplete) {
                    return {
                        code: 'AGENT_OUTPUT_PATH_EXISTS',
                        message: `La salida del agente ya existe y create no sobrescribe (tool=${fallback}).`,
                        fatal: true,
                        tool: fallback,
                        detail: fallback,
                    };
                }
                return {
                    code: 'AGENT_TOOL_DENIED',
                    message: `Herramienta denegada: ${fallback} (${fallback}).`,
                    fatal: false,
                    tool: fallback,
                    detail: fallback,
                };
            };
            const processStdoutChunk = (chunk: unknown) => {
                const text = String(chunk || '');
                stdout += text;
                stdoutBuffer += text;
                appendTrace('stdout', text);
                let index = stdoutBuffer.indexOf('\n');
                while (index >= 0) {
                    const line = stdoutBuffer.slice(0, index);
                    stdoutBuffer = stdoutBuffer.slice(index + 1);
                    try {
                        const parsed = JSON.parse(line);
                        const credits = findCreditsCost(parsed);
                        if (credits !== undefined) creditsCost = credits;
                    } catch {
                        // ignore non-JSON lines
                    }
                    const toolError = toolErrorFromLine(line);
                    if (toolError && !timedOut && !settled) {
                        deniedToolAttempts.push({
                            tool: toolError.tool || 'desconocida',
                            detail: toolError.detail || toolError.message,
                            ...(toolError.pathClass ? { pathClass: toolError.pathClass } : {}),
                        });
                        if (toolError.fatal) {
                            const pid = child.pid;
                            this.killPidTree(pid, 'SIGTERM');
                            killEscalationTimer = setTimeout(() => {
                                this.killPidTree(pid, 'SIGKILL');
                            }, Math.max(1, this.killGraceMs));
                            killEscalationTimer.unref?.();
                            finish(
                                false,
                                null,
                                toolError.code,
                                toolError.message
                            );
                            return;
                        }
                    }
                    index = stdoutBuffer.indexOf('\n');
                }
            };
            child.stdout?.on('data', processStdoutChunk);
            child.stderr?.on('data', chunk => {
                const text = String(chunk || '');
                stderr += text;
                appendTrace('stderr', text);
            });
            child.on('error', (error: any) => {
                const code: AgentProviderErrorCode = error?.code === 'ENOENT'
                    ? 'AGENT_NOT_INSTALLED'
                    : 'AGENT_UNAVAILABLE';
                finish(false, null, code, String(error?.message || error));
            });
            child.on('close', (code, signal) => {
                if (timedOut) return;
                if (cancelled || signal === 'SIGTERM') return finish(false, code, 'AGENT_CANCELLED');
                if (code !== 0) return finish(false, code, 'AGENT_NON_ZERO_EXIT');
                finish(true, code);
            });
            timeoutTimer = setTimeout(() => {
                timedOut = true;
                const pid = child.pid;
                this.killPidTree(pid, 'SIGTERM');
                killEscalationTimer = setTimeout(() => {
                    this.killPidTree(pid, 'SIGKILL');
                }, Math.max(1, this.killGraceMs));
                killEscalationTimer.unref?.();
                finish(false, null, 'AGENT_TIMEOUT', `Tiempo de espera agotado (${timeoutMs} ms).`);
            }, timeoutMs);
            // Node keeps process alive anyway because child is alive.
            timeoutTimer.unref?.();
            child.once('exit', (_code, signal) => {
                if (signal === 'SIGTERM' && !timedOut) cancelled = true;
            });
        });
    }
}
