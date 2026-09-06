import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { normalizeAgentModel } from '../domain/agentModel';
import { copilotPermissionArgs } from './copilotPermissions';
import {
    configuredDisabledMcpServers,
    copilotIsolationEnabled,
    DISABLE_BUILTIN_MCPS_FLAG,
    DISABLE_MCP_SERVER_FLAG,
    normalizeServerNames,
    readRememberedMcpServers,
} from './copilotIsolation';
import { spawn } from 'child_process';
import { AutomationAgent } from '../../workspace';
import { resolveRecorderGenerationMode } from '../contracts';

export interface LaunchResult {
    provider: AutomationAgent;
    packageDirectory: string;
    prompt: string;
    sessionId?: string;
    requestedModel?: string;
}

export interface AutomationAgentLauncherOptions {
    /** Mismo archivo que usa CopilotCliAdapter para recordar MCP personales. */
    mcpServersFile?: string;
}

/** Solo nombres que viajan seguros sin comillas dentro del script de zsh. */
const SHELL_SAFE_SERVER_NAME = /^[\w.@:-]+$/;

export class AutomationAgentLauncher {
    constructor(
        private readonly runner: typeof spawn = spawn,
        private readonly options: AutomationAgentLauncherOptions = {},
    ) {}

    private shellQuote(value: string): string {
        return `'${String(value).replace(/'/g, `'\\''`)}'`;
    }

    private splitArgs(value: string | undefined): string[] {
        if (!value?.trim()) return [];
        return value.trim().split(/\s+/).filter(Boolean);
    }

    private withPromptArg(args: string[], prompt: string): string[] {
        const flagIndex = args.findIndex(value =>
            value === '-p' || value === '--prompt' || value === '-i' || value === '--interactive'
        );
        if (flagIndex < 0) return [...args, prompt];
        return [...args.slice(0, flagIndex + 1), prompt, ...args.slice(flagIndex + 1)];
    }

    /**
     * Lineas de zsh que anaden los flags de aislamiento MCP solo si el CLI
     * instalado los anuncia en `--help`; asi el modo visible aisla igual que
     * el headless sin bloquear el proceso principal con una sonda sincrona.
     */
    private isolationScriptLines(command: string): { lines: string[]; expansion: string } {
        if (!copilotIsolationEnabled()) return { lines: [], expansion: '' };
        const servers = normalizeServerNames([
            ...configuredDisabledMcpServers(),
            ...readRememberedMcpServers(this.options.mcpServersFile),
        ]).filter(server => SHELL_SAFE_SERVER_NAME.test(server));
        const lines = [
            `copilot_help="$(${this.shellQuote(command)} --help 2>&1 || true)"`,
            'isolation=""',
            `case "$copilot_help" in *${DISABLE_BUILTIN_MCPS_FLAG}*) isolation="${DISABLE_BUILTIN_MCPS_FLAG}";; esac`,
        ];
        if (servers.length > 0) {
            const flags = servers.map(server => `${DISABLE_MCP_SERVER_FLAG}=${server}`).join(' ');
            lines.push(`case "$copilot_help" in *${DISABLE_MCP_SERVER_FLAG}*) isolation="$isolation ${flags}";; esac`);
        }
        return { lines, expansion: ' ${=isolation}' };
    }

    private withModelArg(args: string[]): string[] {
        if (args.some(value => value === '--model' || value === '-m' || value.startsWith('--model='))) {
            return args;
        }
        return [...args, '--model', normalizeAgentModel(process.env.RECORDER_COPILOT_MODEL)];
    }

    initialPrompt(packageDirectory: string): string {
        const repair = fs.existsSync(path.join(packageDirectory, 'repair-context.json'));
        const statusFile = path.join(packageDirectory, 'status.json');
        let layered = false;
        try {
            layered = fs.existsSync(statusFile)
                && JSON.parse(fs.readFileSync(statusFile, 'utf8')).generationMode === 'layered';
        } catch {
            layered = false;
        }
        if (layered) {
            return repair
                ? 'Lee repair-context.json, validation.json, generation-plan.json y agent-response.schema.json. Corrige directamente agent-response.json conservando recordingId, planId y las cuatro rutas del plan. Modifica solo los archivos afectados por los errores; no edites los resultados ni handoffs bajo agents/. Puedes usar node, python o python3 únicamente para validar archivos de este paquete. Termina cuando agent-response.json quede listo para reimportar.'
                : 'Lee agent-response.json, generation-plan.json y agent-response.schema.json. Revisa la propuesta integrada y aplica únicamente los cambios solicitados por el QA directamente en agent-response.json, conservando recordingId, planId, rutas y trazabilidad. No edites los resultados ni handoffs bajo agents/ y no explores el framework. Deja el archivo listo para reimportar.';
        }
        const generationMode = resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE);
        if (generationMode === 'deterministic' && !repair) {
            return 'Trabaja únicamente en esta carpeta. Lee instructions.md, gaps.json y scenario.json. Evalúa objetivo y criterio de aceptación y escribe testDesignReview como sugerencia no bloqueante, sin roast ni humor; acepta validaciones consolidadas y no inventes requisitos. Resuelve los gaps semánticos y reescribe solo las filas wording=template mediante gherkinResolutions. Escribe gap-resolutions.json con herramientas nativas del CLI. Después, lee validation-feedback.json y corrige el mismo archivo si el recorder lo solicita. Termina cuando el feedback indique valid o planner-regeneration-required. Puedes usar node, python o python3 solo para validar archivos autorizados de este paquete. No explores fwk-mobile-test.';
        }
        return repair
            ? generationMode === 'deterministic'
                ? 'Lee repair-context.json y validation-feedback.json. Corrige únicamente gap-resolutions.json, incluidas sus gherkinResolutions cuando el error corresponda al Gherkin; el recorder regenerará agent-response.json al reimportar. No edites agent-response.json ni explores el repositorio. Puedes usar node, python o python3 solo para validar archivos autorizados de este paquete.'
                : 'Lee repair-context.json y corrige únicamente los archivos indicados. Prioriza exactitud y viabilidad del caso por encima de la rapidez. No explores el repositorio; escribe agent-response.json con herramientas nativas del CLI. Puedes usar node, python o python3 solo para validar archivos autorizados de este paquete.'
            : 'Trabaja únicamente en esta carpeta. Lee instructions.md y solo los archivos mínimos que allí se enumeran. No leas resolved-context.json salvo diagnóstico explícito. Prioriza exactitud y viabilidad del caso por encima de la rapidez. Resuelve solo los gaps declarados y escribe agent-response.json con herramientas nativas del CLI. Puedes usar node, python o python3 solo para validar archivos autorizados de este paquete. No explores fwk-mobile-test.';
    }

    describe(provider: AutomationAgent, packageDirectory: string): LaunchResult {
        return { provider, packageDirectory, prompt: this.initialPrompt(packageDirectory) };
    }

    openTerminal(provider: AutomationAgent, packageDirectory: string): LaunchResult {
        if (!fs.existsSync(packageDirectory)) throw new Error('La carpeta del paquete ya no existe');
        const platform = process.platform;
        const command = platform === 'darwin'
            ? 'open'
            : platform === 'win32'
                ? 'cmd.exe'
                : 'x-terminal-emulator';
        const args = platform === 'darwin'
            ? ['-a', 'Terminal', packageDirectory]
            : platform === 'win32'
                ? ['/c', 'start', '', 'cmd', '/K', 'cd', '/d', packageDirectory]
                : [`--working-directory=${packageDirectory}`];
        const child = this.runner(command, args, {
            cwd: packageDirectory,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        return this.describe(provider, packageDirectory);
    }

    openTerminalWithPrompt(provider: AutomationAgent, packageDirectory: string, model?: string): LaunchResult {
        return this.openInteractiveTerminalWithPrompt(provider, packageDirectory, undefined, model);
    }

    openInteractiveTerminalWithPrompt(
        provider: AutomationAgent,
        packageDirectory: string,
        prompt = this.initialPrompt(packageDirectory),
        model?: string,
    ): LaunchResult {
        if (!fs.existsSync(packageDirectory)) throw new Error('La carpeta del paquete ya no existe');
        const requestedModel = normalizeAgentModel(model ?? process.env.RECORDER_COPILOT_MODEL);
        const sessionId = randomUUID();
        const launch = { provider, packageDirectory, prompt, sessionId, requestedModel };
        if (process.platform !== 'darwin') {
            return this.openTerminal(provider, packageDirectory);
        }
        const command = process.env.RECORDER_COPILOT_CLI_COMMAND || 'copilot';
        const promptFile = path.join(packageDirectory, 'agent-task.md');
        // El contexto semántico puede contener comillas, saltos de línea y JSON.
        // Nunca se incrusta en AppleScript ni en el comando de zsh. Copilot
        // recibe un bootstrap corto y lee la tarea con su herramienta nativa.
        fs.writeFileSync(promptFile, prompt, { encoding: 'utf8', mode: 0o600 });
        const args = [
            '--model',
            requestedModel,
            '--session-id', sessionId,
            ...copilotPermissionArgs(packageDirectory),
        ];
        const bootstrapPrompt = [
            'Lee agent-task.md en esta carpeta.',
            'Sigue todas sus instrucciones y ejecuta la tarea completa.',
            'No reproduzcas su contenido; trabaja únicamente con los archivos autorizados allí.',
        ].join(' ');
        const shellCmd = [
            this.shellQuote(command),
            this.shellQuote('-i'),
            this.shellQuote(bootstrapPrompt),
            ...args.map(value => this.shellQuote(value)),
        ].join(' ');
        const launchScript = path.join(packageDirectory, `.recorder-copilot-${sessionId}.sh`);
        const isolation = this.isolationScriptLines(command);
        const script = [
            '#!/bin/zsh',
            'set -u',
            `cd ${this.shellQuote(packageDirectory)}`,
            `cleanup() { /bin/rm -f ${this.shellQuote(promptFile)} ${this.shellQuote(launchScript)}; }`,
            'trap cleanup EXIT INT TERM',
            ...isolation.lines,
            `echo ${this.shellQuote('[recorder] Copilot recibió el prompt del recorder. La revisión se abrirá al terminar.')}`,
            `${shellCmd}${isolation.expansion}`,
        ].join('\n') + '\n';
        fs.writeFileSync(launchScript, script, { encoding: 'utf8', mode: 0o700 });
        const terminalCommand = `${this.shellQuote('/bin/zsh')} ${this.shellQuote(launchScript)}`;
        const escaped = terminalCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const child = this.runner('osascript', [
            '-e',
            `tell application "Terminal" to do script "${escaped}"`,
            '-e',
            'tell application "Terminal" to activate',
        ], {
            cwd: packageDirectory,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        return launch;
    }

    openExecutionMonitor(packageDirectory: string): void {
        if (!fs.existsSync(packageDirectory)) throw new Error('La carpeta del paquete ya no existe');
        const logFile = path.join(packageDirectory, 'agent-execution.log');
        if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf-8');
        if (process.platform !== 'darwin') {
            this.openTerminal('copilot', packageDirectory);
            return;
        }
        const script = [
            `cd ${this.shellQuote(packageDirectory)}`,
            'touch agent-execution.log',
            "echo 'Copilot en vivo (resumen):'",
            "echo 'Se muestran eventos clave de la ejecución automática.'",
            "echo 'Para ver todo el detalle, abre agent-execution.log directamente.'",
            "tail -n 200 -F agent-execution.log | grep --line-buffered -E '\\[pass[0-9]+\\]\\[(start|exit|timeout|error)\\]|\"type\":\"(session.auto_mode_resolved|assistant.turn_end|assistant.message|assistant.tool_call|tool.execution_complete|tool.execution_failed|model_turn_ended)\"' | sed -u -E 's/^\\[[^]]+\\]\\[(pass[0-9]+)\\]\\[(stdout|stderr)\\] /[\\1] /'",
        ].join('; ');
        const escaped = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const child = this.runner('osascript', [
            '-e',
            `tell application "Terminal" to do script "${escaped}"`,
            '-e',
            'tell application "Terminal" to activate',
        ], {
            cwd: packageDirectory,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
    }
}
