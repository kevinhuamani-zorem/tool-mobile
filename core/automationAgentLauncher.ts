import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { AutomationAgent } from './projectPaths';

export interface LaunchResult {
    provider: AutomationAgent;
    executable: string;
    packageDirectory: string;
}

export class AutomationAgentLauncher {
    constructor(private readonly runner: typeof spawn = spawn) {}

    resolveExecutable(provider: AutomationAgent, configured = ''): string {
        const candidates = [
            configured,
            path.join(os.homedir(), '.local', 'bin', provider),
            `/opt/homebrew/bin/${provider}`,
            `/usr/local/bin/${provider}`,
        ].filter(Boolean);
        for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
        try {
            return execFileSync('which', [provider], { encoding: 'utf-8' }).trim();
        } catch {
            throw new Error(`No se encontró el CLI ${provider}. Configura ${provider.toUpperCase()}_CLI_PATH.`);
        }
    }

    launch(provider: AutomationAgent, packageDirectory: string, configured = ''): LaunchResult {
        const executable = this.resolveExecutable(provider, configured);
        const repair = fs.existsSync(path.join(packageDirectory, 'repair-context.json'));
        const prompt = repair
            ? 'Lee repair-context.json y corrige únicamente los archivos indicados. No explores el repositorio. Ejecuta node verify-package.js.'
            : 'Lee instructions.md y resuelve únicamente unresolved-context.json. Escribe agent-response.json y ejecuta node verify-package.js.';
        const args = provider === 'copilot'
            ? ['-C', packageDirectory, '-i', prompt]
            : [prompt];
        const child = this.runner(executable, args, {
            cwd: packageDirectory,
            detached: true,
            stdio: 'ignore',
        });
        const timeout = setTimeout(() => child.kill?.('SIGTERM'), 300_000);
        timeout.unref();
        child.unref();
        return { provider, executable, packageDirectory };
    }
}
