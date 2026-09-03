import fs from 'fs';
import path from 'path';
import { AgentProvider, AgentProviderRunInput, AgentProviderRunResult } from '../ports/agentProvider';
import { AutomationAgentLauncher } from './automationAgentLauncher';
import { validateWithSchema } from './copilotCliAdapter';
import { readJsonUtf8, readUtf8File } from '../../shared';

interface ActiveInteractiveRun {
    cancelled: boolean;
    finish?: (result: AgentProviderRunResult) => void;
}

function emptyPathStats() {
    return { insideCwdCount: 0, outsideCwdCount: 0 };
}

function isInsideDirectory(candidate: string, root: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Conserva PASS 1 en el adapter controlado y muestra únicamente la pasada que
 * materializa la salida. Copilot trabaja en su TUI; el recorder observa el
 * artefacto validado, nunca el contenido de la conversación.
 */
export class VisibleCopilotProvider implements AgentProvider {
    readonly name: string;
    private active: ActiveInteractiveRun | null = null;

    constructor(
        private readonly delegate: AgentProvider,
        private readonly launcher = new AutomationAgentLauncher(),
        private readonly platform = process.platform,
        private readonly pollIntervalMs = 250,
    ) {
        this.name = delegate.name;
    }

    getVersion(): Promise<string | null> {
        return this.delegate.getVersion();
    }

    cancel(): void {
        this.delegate.cancel();
        if (!this.active) return;
        this.active.cancelled = true;
    }

    async execute(input: AgentProviderRunInput): Promise<AgentProviderRunResult> {
        if (this.platform !== 'darwin' || !input.stopOnValidatedOutput) {
            return this.delegate.execute(input);
        }

        const outputPath = path.resolve(input.cwd, input.stopOnValidatedOutput.outputFile);
        const schemaPath = path.resolve(input.cwd, input.stopOnValidatedOutput.schemaFile);
        if (!isInsideDirectory(outputPath, input.cwd) || !isInsideDirectory(schemaPath, input.cwd)) {
            return {
                success: false,
                exitCode: null,
                stdout: '',
                stderr: '',
                durationMs: 0,
                timedOut: false,
                cancelled: false,
                errorCode: 'AGENT_OUTPUT_MISSING',
                errorMessage: 'La salida interactiva debe permanecer dentro del paquete.',
                deniedPathStats: emptyPathStats(),
                deniedToolAttempts: [],
            };
        }

        const startedAt = Date.now();
        const previousOutput = fs.existsSync(outputPath)
            ? readUtf8File(outputPath)
            : null;
        let lastEvaluatedOutput = previousOutput;
        const tracePath = input.traceFile ? path.resolve(input.cwd, input.traceFile) : null;
        const appendTrace = (event: string) => {
            if (!tracePath || !isInsideDirectory(tracePath, input.cwd)) return;
            fs.appendFileSync(
                tracePath,
                `[${new Date().toISOString()}][${input.traceLabel || 'interactive'}][${event}] visible-terminal\n`,
                'utf-8',
            );
        };

        try {
            this.launcher.openInteractiveTerminalWithPrompt('copilot', input.cwd, input.prompt);
            appendTrace('start');
        } catch (error: any) {
            return {
                success: false,
                exitCode: null,
                stdout: '',
                stderr: '',
                durationMs: Date.now() - startedAt,
                timedOut: false,
                cancelled: false,
                errorCode: 'AGENT_UNAVAILABLE',
                errorMessage: error?.message || 'No se pudo abrir Copilot en Terminal.',
                deniedPathStats: emptyPathStats(),
                deniedToolAttempts: [],
            };
        }

        return new Promise(resolve => {
            let timer: NodeJS.Timeout | null = null;
            let timeout: NodeJS.Timeout | null = null;
            const active: ActiveInteractiveRun = { cancelled: false };
            this.active = active;
            const finish = (result: AgentProviderRunResult) => {
                if (timer) clearInterval(timer);
                if (timeout) clearTimeout(timeout);
                if (this.active === active) this.active = null;
                appendTrace(result.success ? 'validated-output' : result.cancelled ? 'cancelled' : 'timeout');
                resolve(result);
            };
            active.finish = finish;
            const result = (
                success: boolean,
                extra: Partial<AgentProviderRunResult> = {},
            ): AgentProviderRunResult => ({
                success,
                exitCode: null,
                stdout: '',
                stderr: '',
                durationMs: Date.now() - startedAt,
                timedOut: false,
                cancelled: false,
                deniedPathStats: emptyPathStats(),
                deniedToolAttempts: [],
                ...extra,
            });
            timer = setInterval(() => {
                if (active.cancelled) {
                    finish(result(false, {
                        cancelled: true,
                        errorCode: 'AGENT_CANCELLED',
                        errorMessage: 'La espera de Copilot fue cancelada.',
                    }));
                    return;
                }
                if (!fs.existsSync(outputPath) || !fs.existsSync(schemaPath)) return;
                try {
                    const raw = readUtf8File(outputPath);
                    if (raw === lastEvaluatedOutput) return;
                    const output = readJsonUtf8<unknown>(outputPath);
                    const schema = readJsonUtf8<unknown>(schemaPath);
                    lastEvaluatedOutput = raw;
                    const schemaValid = validateWithSchema(output, schema);
                    if (input.stopOnValidatedOutput?.acceptOutput) {
                        if (!input.stopOnValidatedOutput.acceptOutput(output)) {
                            appendTrace(schemaValid ? 'output-rejected' : 'schema-rejected');
                            return;
                        }
                    } else if (!schemaValid) {
                        appendTrace('schema-rejected');
                        return;
                    }
                    finish(result(true));
                } catch {
                    // Copilot puede estar escribiendo el archivo; se reintenta.
                }
            }, Math.max(50, this.pollIntervalMs));
            timeout = setTimeout(() => {
                finish(result(false, {
                    timedOut: true,
                    errorCode: 'AGENT_TIMEOUT',
                    errorMessage: 'Copilot no generó una respuesta válida dentro del tiempo permitido.',
                }));
            }, Math.max(1, input.timeoutMs));
        });
    }
}
