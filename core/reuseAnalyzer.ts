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

export interface StepImpactReference {
    squad: string;
    file: string;
    keyword: StepDefinitionInfo['keyword'];
    expression: string;
    scope: StepDefinitionInfo['scope'];
    matchType: 'exact' | 'regex';
    scenarios: { feature: string; scenario: string; file: string }[];
}

export interface StepImpactResult {
    text: string;
    safe: boolean;
    references: StepImpactReference[];
}

export interface LocatorInfo {
    name: string;
    selector: string;
    androidSelector: string;
    iosSelector: string;
    androidBlock?: string;
    iosBlock?: string;
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
    scenarios: FeatureScenarioInfo[];
}

export interface FeatureScenarioInfo {
    feature: string;
    name: string;
    caseId?: string;
    file: string;
    steps: Array<{ keyword: string; text: string }>;
    artifacts?: {
        feature: string;
        steps: string;
        screen: string;
        locators: string;
    };
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

    analyzeStepImpact(texts: string[], squad?: string): StepImpactResult[] {
        if (this.stepDefinitions.length === 0) this.refresh();
        const featureUsages = this.indexFeatureUsages();
        return texts.map(rawText => {
            const text = rawText.trim().replace(/^(Given|When|Then|And|But)\s+/, '');
            const references = this.stepDefinitions.flatMap(definition => {
                const regex = safeRegex(definition.expression);
                if (!regex) return [];
                regex.lastIndex = 0;
                if (!regex.test(text)) return [];
                const normalizedExpression = definition.expression.replace(/^\^|\$$/g, '');
                return [{
                    squad: definition.squad,
                    file: definition.file,
                    keyword: definition.keyword,
                    expression: definition.expression,
                    scope: definition.scope,
                    matchType: normalizedExpression === text ? 'exact' as const : 'regex' as const,
                    scenarios: featureUsages.filter(usage => {
                        regex.lastIndex = 0;
                        return regex.test(usage.text);
                    }).map(({ feature, scenario, file }) => ({ feature, scenario, file }))
                }];
            });
            return {
                text,
                safe: references.length === 0,
                references: references.sort((left, right) => {
                    const leftExternal = left.squad !== squad ? 0 : 1;
                    const rightExternal = right.squad !== squad ? 0 : 1;
                    return leftExternal - rightExternal || left.file.localeCompare(right.file);
                })
            };
        });
    }

    private indexFeatureUsages(): {
        feature: string;
        scenario: string;
        file: string;
        text: string;
    }[] {
        const usages: { feature: string; scenario: string; file: string; text: string }[] = [];
        if (!fs.existsSync(projectPaths.features)) return usages;
        const pending = [projectPaths.features];
        while (pending.length) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    pending.push(fullPath);
                    continue;
                }
                if (!entry.isFile() || !entry.name.endsWith('.feature')) continue;
                let feature = entry.name.replace(/\.feature$/, '');
                let scenario = 'Sin escenario';
                for (const line of fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/)) {
                    const featureMatch = line.match(/^\s*Feature:\s*(.+)$/i);
                    if (featureMatch) feature = featureMatch[1].trim();
                    const scenarioMatch = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
                    if (scenarioMatch) scenario = scenarioMatch[1].trim();
                    const stepMatch = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
                    if (stepMatch) {
                        usages.push({
                            feature,
                            scenario,
                            file: path.relative(projectPaths.frameworkRoot, fullPath),
                            text: stepMatch[1].trim()
                        });
                    }
                }
            }
        }
        return usages;
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
            features: this.indexFeatureSteps(squad, stepDefinitions),
            scenarios: this.indexFeatureScenarios(squad)
        };
    }

    private indexFeatureScenarios(squad: string): FeatureScenarioInfo[] {
        const root = path.join(projectPaths.features, squad);
        if (!fs.existsSync(root)) return [];
        const files = this.walkFiles(root, '.feature');
        const scenarios: FeatureScenarioInfo[] = [];
        for (const file of files) {
            const relativeFeature = path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
            const basename = path.basename(file, '.feature');
            const content = fs.readFileSync(file, 'utf-8');
            const feature = content.match(/^\s*Feature:\s*(.+)$/mi)?.[1]?.trim() || basename;
            const lines = content.split(/\r?\n/);
            let current: FeatureScenarioInfo | undefined;
            const flush = (): void => {
                if (!current) return;
                const artifacts = {
                    feature: relativeFeature,
                    steps: `features/yape-steps-definitions/${squad}/${basename}.steps.ts`,
                    screen: `screenobjects/${squad}/${basename}.screen.ts`,
                    locators: `resources/locators/${squad}/${basename}.locator.json`,
                };
                current.artifacts = Object.values(artifacts).every(candidate =>
                    fs.existsSync(path.join(projectPaths.frameworkRoot, candidate))
                ) ? artifacts : undefined;
                scenarios.push(current);
                current = undefined;
            };
            for (const line of lines) {
                const scenarioMatch = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
                if (scenarioMatch) {
                    flush();
                    const name = scenarioMatch[1].trim();
                    current = {
                        feature,
                        name,
                        caseId: name.match(/\[(TC-\d+)\]/i)?.[1]?.toUpperCase(),
                        file: relativeFeature,
                        steps: [],
                    };
                    continue;
                }
                const stepMatch = line.match(/^\s*(Given|When|Then|And|But)\s+(.+)$/i);
                if (current && stepMatch) {
                    current.steps.push({ keyword: stepMatch[1], text: stepMatch[2].trim() });
                }
            }
            flush();
        }
        return scenarios;
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
        const indexed: LocatorInfo[] = [];
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
                const platformBlocks = Object.entries(document)
                    .filter(([, rawBlock]) =>
                        Boolean(rawBlock) && typeof rawBlock === 'object' && !Array.isArray(rawBlock)
                    )
                    .map(([blockName, rawBlock]) => {
                        const match = blockName.match(/^(.*?)(android|ios)$/i);
                        return match ? {
                            blockName,
                            stem: match[1].toLowerCase(),
                            platform: match[2].toLowerCase() as 'android' | 'ios',
                            values: rawBlock as Record<string, unknown>
                        } : undefined;
                    })
                    .filter((block): block is NonNullable<typeof block> => Boolean(block));
                const stems = [...new Set(platformBlocks.map(block => block.stem))];
                for (const stem of stems) {
                    const androidBlock = platformBlocks.find(
                        block => block.stem === stem && block.platform === 'android'
                    );
                    const iosBlock = platformBlocks.find(
                        block => block.stem === stem && block.platform === 'ios'
                    );
                    const names = new Set([
                        ...Object.keys(androidBlock?.values || {}),
                        ...Object.keys(iosBlock?.values || {})
                    ]);
                    for (const name of names) {
                        const androidValue = androidBlock?.values[name];
                        const iosValue = iosBlock?.values[name];
                        const androidSelector = typeof androidValue === 'string'
                            ? androidValue.trim()
                            : '';
                        const iosSelector = typeof iosValue === 'string'
                            ? iosValue.trim()
                            : '';
                        indexed.push({
                            name,
                            selector: platform === 'android' ? androidSelector : iosSelector,
                            androidSelector,
                            iosSelector,
                            androidBlock: androidBlock?.blockName,
                            iosBlock: iosBlock?.blockName,
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
        return indexed.sort((a, b) =>
            Number(Boolean(a.selector)) - Number(Boolean(b.selector)) ||
            a.name.localeCompare(b.name) ||
            a.file.localeCompare(b.file)
        );
    }

    private walkJson(root: string): string[] {
        return this.walkFiles(root, '.json');
    }

    private walkFiles(root: string, extension: string): string[] {
        if (!fs.existsSync(root)) return [];
        const output: string[] = [];
        const pending = [root];
        while (pending.length > 0) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(fullPath);
                else if (entry.isFile() && entry.name.endsWith(extension)) output.push(fullPath);
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
