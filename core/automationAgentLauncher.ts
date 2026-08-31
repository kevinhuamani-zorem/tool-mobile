import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AutomationAgent } from './projectPaths';
import { resolveRecorderGenerationMode } from './automationContracts';

export interface LaunchResult {
    provider: AutomationAgent;
    packageDirectory: string;
    prompt: string;
}

export class AutomationAgentLauncher {
    constructor(private readonly runner: typeof spawn = spawn) {}

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

    private withModelArg(args: string[]): string[] {
        if (args.some(value => value === '--model' || value === '-m' || value.startsWith('--model='))) {
            return args;
        }
        return [...args, '--model', process.env.RECORDER_COPILOT_MODEL || 'auto'];
    }

    initialPrompt(packageDirectory: string): string {
        const repair = fs.existsSync(path.join(packageDirectory, 'repair-context.json'));
        const generationMode = resolveRecorderGenerationMode(process.env.RECORDER_GENERATION_MODE);
        if (generationMode === 'deterministic' && !repair) {
            return 'Trabaja únicamente en esta carpeta. Lee instructions.md y gaps.json. Resuelve solo gaps semánticos y escribe gap-resolutions.json con herramientas nativas del CLI. No uses comandos de shell ni explores fwk-mobile-test.';
        }
        return repair
            ? 'Lee repair-context.json y corrige únicamente los archivos indicados. Prioriza exactitud y viabilidad del caso por encima de la rapidez. No explores el repositorio ni uses comandos de shell; escribe agent-response.json con herramientas nativas del CLI.'
            : 'Trabaja únicamente en esta carpeta. Lee instructions.md y solo los archivos mínimos que allí se enumeran. No leas resolved-context.json salvo diagnóstico explícito. Prioriza exactitud y viabilidad del caso por encima de la rapidez. Resuelve solo los gaps declarados y escribe agent-response.json con herramientas nativas del CLI. No uses comandos de shell y no explores fwk-mobile-test.';
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

    openTerminalWithPrompt(provider: AutomationAgent, packageDirectory: string): LaunchResult {
        return this.openInteractiveTerminalWithPrompt(provider, packageDirectory);
    }

    openInteractiveTerminalWithPrompt(
        provider: AutomationAgent,
        packageDirectory: string,
        prompt = this.initialPrompt(packageDirectory),
    ): LaunchResult {
        if (!fs.existsSync(packageDirectory)) throw new Error('La carpeta del paquete ya no existe');
        const launch = { provider, packageDirectory, prompt };
        if (process.platform !== 'darwin') {
            return this.openTerminal(provider, packageDirectory);
        }
        const command = process.env.RECORDER_COPILOT_CLI_COMMAND || 'copilot';
        const args = [
            '-i',
            launch.prompt,
            '--model',
            process.env.RECORDER_COPILOT_MODEL || 'auto',
            '--allow-tool=write',
            '--deny-tool=bash',
            '--no-custom-instructions',
        ];
        const shellCmd = [command, ...args].map(value => this.shellQuote(value)).join(' ');
        const script = [
            `cd ${this.shellQuote(packageDirectory)}`,
            `echo ${this.shellQuote('[recorder] Copilot recibió el prompt del recorder. La revisión se abrirá al terminar.')}`,
            shellCmd,
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
