import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AutomationAgent } from './projectPaths';

export interface LaunchResult {
    provider: AutomationAgent;
    packageDirectory: string;
    prompt: string;
}

export class AutomationAgentLauncher {
    constructor(private readonly runner: typeof spawn = spawn) {}

    initialPrompt(packageDirectory: string): string {
        const repair = fs.existsSync(path.join(packageDirectory, 'repair-context.json'));
        return repair
            ? 'Lee repair-context.json y corrige únicamente los archivos indicados. No explores el repositorio. Ejecuta node verify-package.js.'
            : 'Trabaja únicamente en esta carpeta. Lee instructions.md y solo los archivos mínimos que allí se enumeran. No leas resolved-context.json salvo diagnóstico explícito. Resuelve solo los gaps declarados, escribe agent-response.json y ejecuta node verify-package.js. No explores fwk-mobile-test.';
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
}
