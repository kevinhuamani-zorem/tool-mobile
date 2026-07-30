import fs from 'fs';
import path from 'path';

// En ejecución, __dirname apunta a dist/core.
const toolRoot = path.resolve(__dirname, '..', '..');
const frameworkRoot = path.resolve(
    process.env.FWK_MOBILE_ROOT || path.join(toolRoot, '..', '..')
);

const requiredFrameworkPaths = [
    'package.json',
    'features/yape-features',
    'features/yape-steps-definitions',
    'resources/locators',
    'screenobjects',
    'support'
];

export function validateFrameworkRoot(): void {
    const missing = requiredFrameworkPaths.filter(relativePath =>
        !fs.existsSync(path.join(frameworkRoot, relativePath))
    );

    if (missing.length > 0) {
        throw new Error(
            `FWK_MOBILE_ROOT inválido: ${frameworkRoot}. Faltan: ${missing.join(', ')}`
        );
    }
}

export const projectPaths = {
    toolRoot,
    frameworkRoot,
    toolConfig: path.join(toolRoot, 'config'),
    screenshots: path.join(toolRoot, 'runtime', 'screenshots'),
    codeGraphCache: path.join(toolRoot, 'runtime', 'codegraph.json'),
    features: path.join(frameworkRoot, 'features', 'yape-features'),
    stepDefinitions: path.join(frameworkRoot, 'features', 'yape-steps-definitions'),
    locators: path.join(frameworkRoot, 'resources', 'locators'),
    data: path.join(frameworkRoot, 'resources', 'data'),
    apps: path.join(frameworkRoot, 'resources', 'apps'),
    environments: path.join(frameworkRoot, 'config', 'envs'),
    screenobjects: path.join(frameworkRoot, 'screenobjects')
};
