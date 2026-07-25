import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';

export interface StepDefinitionInfo {
    keyword: 'Given' | 'When' | 'Then';
    expression: string;
    file: string;
    squad: string;
    scope: 'squad' | 'commons';
}

export interface ScreenMethodInfo {
    name: string;
    file: string;
    squad: string;
}

export interface StepReuseResult {
    text: string;
    status: 'reused' | 'missing';
    match?: StepDefinitionInfo;
}

export interface LocatorInfo {
    name: string;
    selector: string;
    file: string;
    module: string;
    squad: string;
    scope: 'squad' | 'commons' | 'home' | 'global';
    platform: 'android' | 'ios';
}

export interface SquadReuseCatalog {
    squad: string;
    platform: 'android' | 'ios';
    stepDefinitions: StepDefinitionInfo[];
    screenMethods: ScreenMethodInfo[];
    locators: LocatorInfo[];
    features: FeatureStepGroup[];
}

export interface FeatureStepGroup {
    name: string;
    file: string;
    stepDefinitions: StepDefinitionInfo[];
}

function walkTypeScript(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const output: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(fullPath);
            else if (entry.isFile() && entry.name.endsWith('.ts')) output.push(fullPath);
        }
    }
    return output.sort();
}

function safeRegex(expression: string): RegExp | undefined {
    try {
        return new RegExp(expression);
    } catch {
        return undefined;
    }
}

export class ReuseAnalyzer {
    private stepDefinitions: StepDefinitionInfo[] = [];
    private screenMethods: ScreenMethodInfo[] = [];

    refresh(): void {
        this.stepDefinitions = this.indexStepDefinitions();
        this.screenMethods = this.indexScreenMethods();
    }

    analyzeSteps(
        texts: string[],
        squad?: string,
        excludedFile?: string
    ): StepReuseResult[] {
        if (this.stepDefinitions.length === 0) this.refresh();
        const normalizedExcluded = excludedFile?.replace(/\\/g, '/');
        const definitions = this.getStepDefinitions(squad).filter(
            definition => definition.file.replace(/\\/g, '/') !== normalizedExcluded
        );
        return texts.map(rawText => {
            const text = rawText.trim().replace(/^(Given|When|Then|And|But)\s+/, '');
            const match = definitions.find(definition => {
                const regex = safeRegex(definition.expression);
                return regex ? regex.test(text) : false;
            });
            return match
                ? { text, status: 'reused', match }
                : { text, status: 'missing' };
        });
    }

    getStepDefinitions(squad?: string): StepDefinitionInfo[] {
        if (this.stepDefinitions.length === 0) this.refresh();
        if (!squad) return this.stepDefinitions;
        return this.stepDefinitions.filter(definition =>
            definition.squad === squad || definition.squad === 'commons'
        );
    }

    getCatalog(squad: string, platform: 'android' | 'ios'): SquadReuseCatalog {
        this.refresh();
        const stepDefinitions = this.getStepDefinitions(squad);
        return {
            squad,
            platform,
            stepDefinitions,
            screenMethods: this.getScreenMethods(squad),
            locators: this.indexLocators(squad, platform),
            features: this.indexFeatureSteps(squad, stepDefinitions)
        };
    }

    getScreenMethods(squad?: string): ScreenMethodInfo[] {
        if (this.screenMethods.length === 0) this.refresh();
        if (!squad) return this.screenMethods;
        return this.screenMethods.filter(method =>
            method.squad === squad || method.squad === 'commons'
        );
    }

    getSummary(): { stepDefinitions: number; screenMethods: number } {
        if (this.stepDefinitions.length === 0 && this.screenMethods.length === 0) this.refresh();
        return {
            stepDefinitions: this.stepDefinitions.length,
            screenMethods: this.screenMethods.length
        };
    }

    private indexStepDefinitions(): StepDefinitionInfo[] {
        const definitions: StepDefinitionInfo[] = [];
        const pattern = /\b(Given|When|Then)\s*\(\s*\/((?:\\\/|[^/])+)\/[dgimsuvy]*\s*,/g;

        for (const file of walkTypeScript(projectPaths.stepDefinitions)) {
            const relativeToSteps = path.relative(projectPaths.stepDefinitions, file);
            const squad = relativeToSteps.split(path.sep)[0];
            if (!squad || squad === '..') continue;
            const content = fs.readFileSync(file, 'utf-8');
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(content)) !== null) {
                definitions.push({
                    keyword: match[1] as StepDefinitionInfo['keyword'],
                    expression: match[2].replace(/\\\//g, '/'),
                    file: path.relative(projectPaths.frameworkRoot, file),
                    squad,
                    scope: squad === 'commons' ? 'commons' : 'squad'
                });
            }
        }
        return definitions;
    }

    private indexLocators(squad: string, platform: 'android' | 'ios'): LocatorInfo[] {
        const ranked = new Map<string, LocatorInfo>();
        const sources: { directory: string; squad: string; scope: LocatorInfo['scope'] }[] = [
            { directory: projectPaths.locators, squad: 'global', scope: 'global' },
            { directory: path.join(projectPaths.locators, 'home'), squad: 'home', scope: 'home' },
            { directory: path.join(projectPaths.locators, 'commons'), squad: 'commons', scope: 'commons' },
            { directory: path.join(projectPaths.locators, squad), squad, scope: 'squad' }
        ];

        for (const source of sources) {
            const files = source.scope === 'global'
                ? (fs.existsSync(source.directory)
                    ? fs.readdirSync(source.directory, { withFileTypes: true })
                        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
                        .map(entry => path.join(source.directory, entry.name))
                    : [])
                : this.walkJson(source.directory);

            for (const file of files) {
                let document: Record<string, unknown>;
                try {
                    document = JSON.parse(fs.readFileSync(file, 'utf-8'));
                } catch {
                    continue;
                }
                for (const [blockName, rawBlock] of Object.entries(document)) {
                    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
                    const normalizedBlock = blockName.toLowerCase();
                    const matchesPlatform = platform === 'android'
                        ? normalizedBlock === 'android' || normalizedBlock.endsWith('android')
                        : normalizedBlock === 'ios' || normalizedBlock.endsWith('ios');
                    if (!matchesPlatform) continue;

                    for (const [name, selector] of Object.entries(rawBlock as Record<string, unknown>)) {
                        if (typeof selector !== 'string' || !selector.trim()) continue;
                        ranked.set(name, {
                            name,
                            selector: selector.trim(),
                            file: path.relative(projectPaths.frameworkRoot, file),
                            module: path.relative(projectPaths.locators, file)
                                .replace(/\\/g, '/')
                                .replace(/\.locator\.json$/i, '')
                                .replace(/\.json$/i, ''),
                            squad: source.squad,
                            scope: source.scope,
                            platform
                        });
                    }
                }
            }
        }
        return [...ranked.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    private walkJson(root: string): string[] {
        if (!fs.existsSync(root)) return [];
        const output: string[] = [];
        const pending = [root];
        while (pending.length > 0) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(fullPath);
                else if (entry.isFile() && entry.name.endsWith('.json')) output.push(fullPath);
            }
        }
        return output.sort();
    }

    private indexFeatureSteps(
        squad: string,
        definitions: StepDefinitionInfo[]
    ): FeatureStepGroup[] {
        const root = path.join(projectPaths.features, squad);
        if (!fs.existsSync(root)) return [];
        const files: string[] = [];
        const pending = [root];
        while (pending.length > 0) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(fullPath);
                else if (entry.isFile() && entry.name.endsWith('.feature')) files.push(fullPath);
            }
        }

        return files.sort().map(file => {
            const content = fs.readFileSync(file, 'utf-8');
            const featureName = content.match(/^\s*Feature:\s*(.+)$/mi)?.[1]?.trim()
                || path.basename(file, '.feature');
            const texts = [...content.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)]
                .map(match => match[1].trim());
            const matched = definitions.filter(definition => {
                const regex = safeRegex(definition.expression);
                return regex ? texts.some(text => {
                    regex.lastIndex = 0;
                    return regex.test(text);
                }) : false;
            });
            return {
                name: featureName,
                file: path.relative(projectPaths.frameworkRoot, file),
                stepDefinitions: matched
            };
        }).filter(feature => feature.stepDefinitions.length > 0);
    }

    private indexScreenMethods(): ScreenMethodInfo[] {
        const methods: ScreenMethodInfo[] = [];
        const methodPattern = /\b(?:public\s+)?async\s+([A-Za-z_$][\w$]*)\s*\(/g;

        for (const file of walkTypeScript(projectPaths.screenobjects)) {
            const relative = path.relative(projectPaths.screenobjects, file);
            const squad = relative.split(path.sep)[0];
            const content = fs.readFileSync(file, 'utf-8');
            let match: RegExpExecArray | null;
            while ((match = methodPattern.exec(content)) !== null) {
                methods.push({
                    name: match[1],
                    file: path.relative(projectPaths.frameworkRoot, file),
                    squad
                });
            }
        }
        return methods;
    }
}
