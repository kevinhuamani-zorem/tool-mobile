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
const frameworkRoot = workspaceConfiguration.targetProject;

export function validateFrameworkRoot(): void {
    const missing = fwkRequiredPaths.filter(relativePath =>
        !fs.existsSync(path.join(frameworkRoot, relativePath))
    );
    if (missing.length > 0) {
        throw new Error(
            `El directorio padre no es un fwk-mobile válido: ${frameworkRoot}. ` +
            `Faltan: ${missing.join(', ')}`
        );
    }
}

export const projectPaths = {
    toolRoot,
    frameworkRoot,
    mode: workspaceConfiguration.mode,
    automationAgent: 'copilot' as AutomationAgent,
    toolConfig: path.join(toolRoot, 'config'),
    screenshots: path.join(toolRoot, 'runtime', 'screenshots'),
    recordings: path.join(toolRoot, 'runtime', 'recordings'),
    automationMemory: path.join(toolRoot, 'runtime', 'automation-memory'),
    codeGraphCache: path.join(toolRoot, 'runtime', `codegraph-${workspaceConfiguration.mode}.json`),
    recorderCodeGraphCache: path.join(toolRoot, 'runtime', 'codegraph-recorder.json'),
    features: path.join(frameworkRoot, 'features', 'yape-features'),
    stepDefinitions: path.join(frameworkRoot, 'features', 'yape-steps-definitions'),
    locators: path.join(frameworkRoot, 'resources', 'locators'),
    data: path.join(frameworkRoot, 'resources', 'data'),
    apps: path.join(frameworkRoot, 'resources', 'apps'),
    environments: path.join(frameworkRoot, 'config', 'envs'),
    screenobjects: path.join(frameworkRoot, 'screenobjects')
};
