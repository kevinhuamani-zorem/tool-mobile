import fs from 'fs';
import path from 'path';
import type { AutomationAgent, RecorderMode, WorkspaceConfiguration } from '../contracts';

export type { RecorderMode, AutomationAgent, WorkspaceConfiguration } from '../contracts';

// En ejecución, __dirname apunta a dist/core/workspace/infrastructure.
const toolRoot = path.resolve(__dirname, '..', '..', '..', '..');
const embeddedCandidate = path.resolve(toolRoot, '..', '..');
const fwkRequiredPaths = [
    'package.json',
    'features/yape-features',
    'features/yape-steps-definitions',
    'resources/locators',
    'screenobjects',
    'support'
];

export function resolveWorkspaceConfiguration(): WorkspaceConfiguration {
    return {
        mode: 'fwk-mobile',
        targetProject: embeddedCandidate,
        source: 'auto'
    };
}

export const workspaceConfiguration = resolveWorkspaceConfiguration();

export function missingFrameworkPaths(frameworkRoot: string): string[] {
    return fwkRequiredPaths.filter(relativePath =>
        !fs.existsSync(path.join(frameworkRoot, relativePath))
    );
}

export function isFrameworkRoot(frameworkRoot: string): boolean {
    return missingFrameworkPaths(frameworkRoot).length === 0;
}

export function validateFrameworkRoot(frameworkRoot = projectPaths.frameworkRoot): void {
    const missing = missingFrameworkPaths(frameworkRoot);
    if (missing.length > 0) {
        throw new Error(
            `El directorio padre no es un fwk-mobile válido: ${frameworkRoot}. ` +
            `Faltan: ${missing.join(', ')}`
        );
    }
}

function pathsFor(frameworkRoot: string, runtimeRoot: string) {
    const runtime = path.join(runtimeRoot, 'runtime');
    return {
        toolRoot,
        runtimeRoot,
        frameworkRoot,
        mode: workspaceConfiguration.mode,
        automationAgent: 'copilot' as AutomationAgent,
        toolConfig: path.join(runtimeRoot, 'config'),
        screenshots: path.join(runtime, 'screenshots'),
        recordings: path.join(runtime, 'recordings'),
        automationMemory: path.join(runtime, 'automation-memory'),
        codeGraphCache: path.join(runtime, `codegraph-${workspaceConfiguration.mode}.json`),
        recorderCodeGraphCache: path.join(runtime, 'codegraph-recorder.json'),
        features: path.join(frameworkRoot, 'features', 'yape-features'),
        stepDefinitions: path.join(frameworkRoot, 'features', 'yape-steps-definitions'),
        locators: path.join(frameworkRoot, 'resources', 'locators'),
        data: path.join(frameworkRoot, 'resources', 'data'),
        apps: path.join(frameworkRoot, 'resources', 'apps'),
        environments: path.join(frameworkRoot, 'config', 'envs'),
        screenobjects: path.join(frameworkRoot, 'screenobjects')
    };
}

export const projectPaths = pathsFor(workspaceConfiguration.targetProject, toolRoot);

export interface WorkspacePathConfiguration {
    targetProject: string;
    runtimeRoot?: string;
    source: WorkspaceConfiguration['source'];
}

/**
 * Configura el workspace antes de construir scanners, stores y handlers.
 * El objeto exportado se conserva por referencia para no romper consumidores
 * existentes que leen `projectPaths` después del bootstrap de Electron.
 */
export function configureWorkspacePaths(configuration: WorkspacePathConfiguration): void {
    const frameworkRoot = path.resolve(configuration.targetProject);
    validateFrameworkRoot(frameworkRoot);
    const runtimeRoot = path.resolve(configuration.runtimeRoot || toolRoot);
    Object.assign(workspaceConfiguration, {
        mode: 'fwk-mobile' as const,
        targetProject: frameworkRoot,
        source: configuration.source,
    });
    Object.assign(projectPaths, pathsFor(frameworkRoot, runtimeRoot));
}
