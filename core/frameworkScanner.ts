import fs from 'fs';
import path from 'path';
import { projectPaths, validateFrameworkRoot } from './projectPaths';
import { getWorkspaceAdapter } from './workspaceAdapter';
import { ReuseAnalyzer } from './reuseAnalyzer';

type LayerName = 'features' | 'steps' | 'screenobjects' | 'locators' | 'data';

export interface EnvironmentVariableInfo {
    key: string;
    configured: boolean;
    sensitive: boolean;
}

export interface EnvironmentInfo {
    name: string;
    file: string;
    variables: EnvironmentVariableInfo[];
}

export interface FrameworkFileInfo {
    name: string;
    relativePath: string;
    absolutePath: string;
}

export interface SquadInfo {
    name: string;
    layers: Record<LayerName, number>;
}

export interface FrameworkCatalog {
    frameworkRoot: string;
    workspace: ReturnType<ReturnType<typeof getWorkspaceAdapter>['describe']>;
    environments: EnvironmentInfo[];
    squads: SquadInfo[];
    apps: FrameworkFileInfo[];
    dataSets: FrameworkFileInfo[];
    totals: Record<LayerName, number>;
    reusable: {
        stepDefinitions: number;
        screenMethods: number;
    };
}

const sensitiveKeyPattern =
    /(PASSWORD|PASS|SECRET|TOKEN|KEY|CREDENTIAL|AUTH|CLIENT_ID|SUBSCRIPTION|UUID)/i;

function walkFiles(root: string): string[] {
    if (!fs.existsSync(root)) return [];

    const files: string[] = [];
    const pending = [root];

    while (pending.length > 0) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === '.DS_Store') continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(fullPath);
            else if (entry.isFile()) files.push(fullPath);
        }
    }

    return files.sort();
}

function firstPathSegment(root: string, filePath: string): string | undefined {
    const relative = path.relative(root, filePath);
    const first = relative.split(path.sep)[0];
    return first && first !== '..' ? first : undefined;
}

function parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
        if (!match) continue;

        let value = match[2].trim();
        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }
        result[match[1]] = value;
    }

    return result;
}

export class FrameworkScanner {
    private readonly envsPath = path.join(projectPaths.frameworkRoot, 'config', 'envs');
    private readonly reuseAnalyzer = new ReuseAnalyzer();

    scan(): FrameworkCatalog {
        validateFrameworkRoot();

        const layerRoots: Record<LayerName, string> = {
            features: projectPaths.features,
            steps: projectPaths.stepDefinitions,
            screenobjects: projectPaths.screenobjects,
            locators: projectPaths.locators,
            data: projectPaths.data
        };

        const filesByLayer = Object.fromEntries(
            Object.entries(layerRoots).map(([layer, root]) => [layer, walkFiles(root)])
        ) as Record<LayerName, string[]>;

        const squadNames = new Set<string>();
        for (const [layer, files] of Object.entries(filesByLayer) as [LayerName, string[]][]) {
            const root = layerRoots[layer];
            for (const file of files) {
                const squad = firstPathSegment(root, file);
                if (squad) squadNames.add(squad);
            }
        }

        const squads = [...squadNames].sort().map(name => ({
            name,
            layers: Object.fromEntries(
                (Object.keys(layerRoots) as LayerName[]).map(layer => [
                    layer,
                    filesByLayer[layer].filter(
                        file => firstPathSegment(layerRoots[layer], file) === name
                    ).length
                ])
            ) as Record<LayerName, number>
        }));

        return {
            frameworkRoot: projectPaths.frameworkRoot,
            workspace: getWorkspaceAdapter().describe(),
            environments: this.scanEnvironments(),
            squads,
            apps: this.toFileInfo(
                walkFiles(projectPaths.apps).filter(file => /\.(apk|aab|xapk|ipa)$/i.test(file))
            ),
            dataSets: this.toFileInfo(
                walkFiles(projectPaths.data).filter(file => /\.(ya?ml|json)$/i.test(file))
            ),
            totals: Object.fromEntries(
                (Object.keys(filesByLayer) as LayerName[]).map(layer => [
                    layer,
                    filesByLayer[layer].length
                ])
            ) as Record<LayerName, number>,
            reusable: this.reuseAnalyzer.getSummary()
        };
    }

    loadEnvironment(name: string): Record<string, string> {
        const normalized = name.replace(/^\.env\./, '');
        if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
            throw new Error(`Ambiente inválido: ${name}`);
        }

        const envPath = path.join(this.envsPath, `.env.${normalized}`);
        if (!fs.existsSync(envPath)) throw new Error(`No existe el ambiente: ${normalized}`);
        return parseEnv(fs.readFileSync(envPath, 'utf-8'));
    }

    private scanEnvironments(): EnvironmentInfo[] {
        if (!fs.existsSync(this.envsPath)) return [];

        return fs.readdirSync(this.envsPath, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.startsWith('.env.'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(entry => {
                const values = this.loadEnvironment(entry.name);
                return {
                    name: entry.name.slice('.env.'.length),
                    file: path.relative(projectPaths.frameworkRoot, path.join(this.envsPath, entry.name)),
                    variables: Object.entries(values)
                        .map(([key, value]) => ({
                            key,
                            configured: value.trim().length > 0,
                            sensitive: sensitiveKeyPattern.test(key)
                        }))
                        .sort((a, b) => a.key.localeCompare(b.key))
                };
            });
    }

    private toFileInfo(files: string[]): FrameworkFileInfo[] {
        return files.map(file => ({
            name: path.basename(file, path.extname(file)),
            relativePath: path.relative(projectPaths.frameworkRoot, file),
            absolutePath: file
        }));
    }
}
