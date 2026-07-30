import fs from 'fs';
import path from 'path';

export type RecorderMode = 'fwk-mobile' | 'standalone' | 'neutral';

export interface WorkspaceConfiguration {
    mode: RecorderMode;
    targetProject: string;
    source: 'environment' | 'config' | 'auto';
}

// En ejecución, __dirname apunta a dist/core.
const toolRoot = path.resolve(__dirname, '..', '..');
const embeddedCandidate = path.resolve(toolRoot, '..', '..');
const workspaceConfigFile = path.join(toolRoot, 'config', 'workspace.json');
const fwkRequiredPaths = [
    'package.json',
    'features/yape-features',
    'features/yape-steps-definitions',
    'resources/locators',
    'screenobjects',
    'support'
];

function isFwkMobile(root: string): boolean {
    return fwkRequiredPaths.every(relative => fs.existsSync(path.join(root, relative)));
}

function readWorkspaceConfig(): Partial<WorkspaceConfiguration> {
    try {
        return JSON.parse(fs.readFileSync(workspaceConfigFile, 'utf-8'));
    } catch {
        return {};
    }
}

function readLocalEnv(): Record<string, string> {
    try {
        return Object.fromEntries(
            fs.readFileSync(path.join(toolRoot, '.env'), 'utf-8')
                .split(/\r?\n/)
                .flatMap(line => {
                    const match = line.trim().match(
                        /^(?:export\s+)?(RECORDER_MODE|TARGET_PROJECT)=(.*)$/
                    );
                    if (!match) return [];
                    return [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]];
                })
        );
    } catch {
        return {};
    }
}

function normalizeMode(value: unknown): RecorderMode | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'fwk-mobile' || normalized === 'standalone' || normalized === 'neutral') {
        return normalized;
    }
    return undefined;
}

export function resolveWorkspaceConfiguration(): WorkspaceConfiguration {
    const fileConfig = readWorkspaceConfig();
    const localEnv = readLocalEnv();
    const environmentMode = normalizeMode(process.env.RECORDER_MODE || localEnv.RECORDER_MODE);
    const configMode = normalizeMode(fileConfig.mode);
    const mode = environmentMode || configMode ||
        (isFwkMobile(embeddedCandidate) ? 'fwk-mobile' : 'standalone');
    const environmentTarget = process.env.TARGET_PROJECT || process.env.FWK_MOBILE_ROOT ||
        localEnv.TARGET_PROJECT;
    const configuredTarget = typeof fileConfig.targetProject === 'string'
        ? fileConfig.targetProject
        : '';
    const defaultTarget = mode === 'fwk-mobile'
        ? embeddedCandidate
        : mode === 'standalone'
            ? path.join(toolRoot, 'workspace')
            : path.join(toolRoot, 'runtime', 'neutral-workspace');
    return {
        mode,
        targetProject: path.resolve(environmentTarget || configuredTarget || defaultTarget),
        source: environmentMode || environmentTarget
            ? 'environment'
            : configMode || configuredTarget
                ? 'config'
                : 'auto'
    };
}

export const workspaceConfiguration = resolveWorkspaceConfiguration();
const frameworkRoot = workspaceConfiguration.targetProject;

export function validateFrameworkRoot(): void {
    if (workspaceConfiguration.mode !== 'fwk-mobile') return;
    const missing = fwkRequiredPaths.filter(relativePath =>
        !fs.existsSync(path.join(frameworkRoot, relativePath))
    );
    if (missing.length > 0) {
        throw new Error(
            `TARGET_PROJECT no es un fwk-mobile válido: ${frameworkRoot}. ` +
            `Faltan: ${missing.join(', ')}`
        );
    }
}

export function ensureWorkspace(): void {
    if (workspaceConfiguration.mode === 'fwk-mobile') {
        validateFrameworkRoot();
        return;
    }
    const directories = [
        'features/yape-features/default',
        'features/yape-steps-definitions/default',
        'resources/locators/default',
        'resources/data/default',
        'resources/apps',
        'screenobjects/default',
        'screenobjects/commons',
        'support/utils',
        'config/envs'
    ];
    directories.forEach(directory =>
        fs.mkdirSync(path.join(frameworkRoot, directory), { recursive: true })
    );
    const packageFile = path.join(frameworkRoot, 'package.json');
    if (!fs.existsSync(packageFile)) {
        fs.writeFileSync(packageFile, JSON.stringify({
            name: 'appium-visual-recorder-workspace',
            private: true,
            scripts: { test: 'cucumber-js' },
            devDependencies: {
                '@cucumber/cucumber': '^10.9.0',
                webdriverio: '^8.0.0'
            }
        }, null, 2) + '\n');
    }
    if (workspaceConfiguration.mode === 'standalone') {
        const scaffold: Record<string, string> = {
            'screenobjects/commons/base.screen.ts': [
                `import { $, browser } from '@wdio/globals';`,
                ``,
                `export default class BaseScreen {`,
                `    protected uiHelper = {`,
                `        waitForElementToBeReady: async (selector: string) => {`,
                `            const element = await $(selector);`,
                `            await element.waitForDisplayed();`,
                `            return element;`,
                `        },`,
                `        interactWithElement: async (selector: string, action: string, value?: string) => {`,
                `            const element = await this.uiHelper.waitForElementToBeReady(selector);`,
                `            if (action === 'click') await element.click();`,
                `            if (action === 'setValue') await element.setValue(value || '');`,
                `        },`,
                `        waitForDisplayed: async (selector: string) =>`,
                `            (await this.uiHelper.waitForElementToBeReady(selector)).waitForDisplayed(),`,
                `        isElementPresent: async (selector: string) => (await $(selector)).isExisting()`,
                `    };`,
                `    protected gestureHelper = {`,
                `        verticalScrollingToEnd: async () => browser.execute('mobile: scrollGesture', {`,
                `            direction: 'down', percent: 0.75`,
                `        }),`,
                `        verticalScrollTextIntoView: async (text: string) => browser.execute('mobile: scroll', { text })`,
                `    };`,
                `    protected keyboardHelper = {};`,
                `}`,
                ''
            ].join('\n'),
            'support/utils/LocatorFactory.ts': [
                `export default class LocatorFactory {`,
                `    static getElement(iosType: unknown, ios: string, androidType: unknown, android: string): string {`,
                `        return process.env.PLATFORM === 'ios' ? ios : android;`,
                `    }`,
                `}`,
                ''
            ].join('\n'),
            'support/utils/Enums.ts': [
                `export enum TypeLocator {`,
                `    XPATH = 'xpath', ID = 'id', CLASSNAME = 'class name',`,
                `    ANDROID = '-android uiautomator',`,
                `    PREDICATESTRING = '-ios predicate string',`,
                `    CLASSCHAIN = '-ios class chain'`,
                `}`,
                ''
            ].join('\n')
        };
        for (const [relative, content] of Object.entries(scaffold)) {
            const file = path.join(frameworkRoot, relative);
            if (!fs.existsSync(file)) fs.writeFileSync(file, content);
        }
    }
}

export const projectPaths = {
    toolRoot,
    frameworkRoot,
    workspaceConfigFile,
    mode: workspaceConfiguration.mode,
    toolConfig: path.join(toolRoot, 'config'),
    screenshots: path.join(toolRoot, 'runtime', 'screenshots'),
    codeGraphCache: path.join(toolRoot, 'runtime', `codegraph-${workspaceConfiguration.mode}.json`),
    recorderCodeGraphCache: path.join(toolRoot, 'runtime', 'codegraph-recorder.json'),
    neutralExports: path.join(toolRoot, 'runtime', 'exports'),
    features: path.join(frameworkRoot, 'features', 'yape-features'),
    stepDefinitions: path.join(frameworkRoot, 'features', 'yape-steps-definitions'),
    locators: path.join(frameworkRoot, 'resources', 'locators'),
    data: path.join(frameworkRoot, 'resources', 'data'),
    apps: path.join(frameworkRoot, 'resources', 'apps'),
    environments: path.join(frameworkRoot, 'config', 'envs'),
    screenobjects: path.join(frameworkRoot, 'screenobjects')
};
