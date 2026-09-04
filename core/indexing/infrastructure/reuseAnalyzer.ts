import fs from 'fs';
import { indexDeclaredStrategies } from './locatorStrategy';
import ts from 'typescript';
import path from 'path';
import { projectPaths } from '../../workspace';
import { featureScopeDirectory, normalizeFeatureScope } from '../../shared';
import { CodeGraph, CodeGraphBuildMetrics } from './codeGraph';
import { locatorKeysIn } from '../domain/locatorReferences';

export { locatorKeysIn } from '../domain/locatorReferences';

export interface StepDefinitionInfo {
    keyword: 'Given' | 'When' | 'Then';
    expression: string;
    file: string;
    squad: string;
    scope: 'squad' | 'commons';
    /**
     * Metodos de Screen Object que invoca el cuerpo de la definicion, con el
     * archivo del Screen resuelto desde el import. Es lo que permite decidir
     * si un step existente hace exactamente lo que este caso grabo.
     */
    screenMethods?: Array<{ file: string; method: string }>;
}

export interface ScreenMethodInfo {
    name: string;
    file: string;
    squad: string;
    locatorFiles: string[];
    /** Firma pública sin cuerpo, para poder reutilizar el método sin leer el archivo. */
    signature: string;
    /** Claves del .locator.json que alcanza el método, directas o vía getter. */
    locatorKeys: string[];
    className: string;
}

export interface ArtifactBundle {
    steps: string;
    screens: string[];
    locators: string[];
    stepExpressions: string[];
    screenMethods: string[];
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
    /**
     * Estrategia declarada en el getter que consume la clave. El JSON solo
     * guarda el valor; sin el tipo no se puede afirmar que un locator sirva.
     */
    androidStrategy?: string;
    iosStrategy?: string;
    file: string;
    module: string;
    squad: string;
    scope: 'squad' | 'commons' | 'home' | 'global';
    platform: 'android' | 'ios';
}

export interface SquadReuseCatalog {
    squad: string;
    featureScope: string;
    platform: 'android' | 'ios';
    stepDefinitions: StepDefinitionInfo[];
    screenMethods: ScreenMethodInfo[];
    locators: LocatorInfo[];
    features: FeatureStepGroup[];
    scenarios: FeatureScenarioInfo[];
    artifactBundles: ArtifactBundle[];
    /** Telemetría del acceso que produjo este catálogo; no forma parte del contexto del agente. */
    frameworkMetrics?: CodeGraphBuildMetrics & { queryCount: number };
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
    relatedArtifacts: {
        steps: string[];
        screens: string[];
        locators: string[];
    };
}

export interface FeatureStepGroup {
    name: string;
    file: string;
    stepDefinitions: StepDefinitionInfo[];
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
    private graphRevision = '';
    private frameworkFiles: string[] = [];
    private lastMetrics?: CodeGraphBuildMetrics & { queryCount: number };
    private catalogCache = new Map<string, SquadReuseCatalog>();

    constructor(private readonly graph = new CodeGraph()) {}

    refresh(): void {
        const snapshot = this.graph.snapshot();
        this.lastMetrics = { ...snapshot.metrics, queryCount: 1 };
        if (snapshot.revision === this.graphRevision && this.stepDefinitions.length) return;
        this.graphRevision = snapshot.revision;
        this.frameworkFiles = snapshot.files;
        this.catalogCache.clear();
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
        for (const relativeFile of this.frameworkFiles.filter(file =>
            file.startsWith('features/yape-features/') && file.endsWith('.feature')
        )) {
            const fullPath = path.join(projectPaths.frameworkRoot, relativeFile);
            let feature = path.basename(relativeFile).replace(/\.feature$/, '');
            let scenario = 'Sin escenario';
            for (const line of this.readFrameworkFile(fullPath).split(/\r?\n/)) {
                const featureMatch = line.match(/^\s*Feature:\s*(.+)$/i);
                if (featureMatch) feature = featureMatch[1].trim();
                const scenarioMatch = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
                if (scenarioMatch) scenario = scenarioMatch[1].trim();
                const stepMatch = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
                if (stepMatch) {
                    usages.push({ feature, scenario, file: relativeFile, text: stepMatch[1].trim() });
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

    getCatalog(squad: string, platform: 'android' | 'ios', featureScope = ''): SquadReuseCatalog {
        const started = process.hrtime.bigint();
        this.refresh();
        const normalizedScope = normalizeFeatureScope(featureScope);
        const cacheKey = `${this.graphRevision}|${squad}|${platform}|${normalizedScope}`;
        const cached = this.catalogCache.get(cacheKey);
        if (cached) return { ...cached, frameworkMetrics: this.lastMetrics };
        const stepDefinitions = this.getStepDefinitions(squad);
        const catalog: SquadReuseCatalog = {
            squad,
            featureScope: normalizedScope,
            platform,
            stepDefinitions,
            screenMethods: this.getScreenMethods(squad),
            locators: this.indexLocators(squad, platform),
            features: this.indexFeatureSteps(squad, stepDefinitions, normalizedScope),
            scenarios: this.indexFeatureScenarios(squad, normalizedScope, stepDefinitions),
            artifactBundles: this.indexArtifactBundles(squad, stepDefinitions),
            frameworkMetrics: this.lastMetrics,
        };
        if (this.lastMetrics) {
            this.lastMetrics.indexDurationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        }
        this.catalogCache.set(cacheKey, catalog);
        return catalog;
    }

    private indexFeatureScenarios(
        squad: string,
        featureScope: string,
        definitions: StepDefinitionInfo[]
    ): FeatureScenarioInfo[] {
        const root = featureScopeDirectory(projectPaths.features, squad, featureScope);
        if (!fs.existsSync(root)) return [];
        const files = this.filesUnder(root, '.feature');
        const scenarios: FeatureScenarioInfo[] = [];
        for (const file of files) {
            const relativeFeature = path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
            const basename = path.basename(file, '.feature');
            const content = this.readFrameworkFile(file);
            const feature = content.match(/^\s*Feature:\s*(.+)$/mi)?.[1]?.trim() || basename;
            const lines = content.split(/\r?\n/);
            let current: FeatureScenarioInfo | undefined;
            const flush = (): void => {
                if (!current) return;
                const related = this.resolveScenarioArtifacts(current.steps, definitions);
                current.relatedArtifacts = related;
                if (related.steps.length === 1 && related.screens.length === 1 && related.locators.length === 1) {
                    current.artifacts = {
                        feature: relativeFeature,
                        steps: related.steps[0],
                        screen: related.screens[0],
                        locators: related.locators[0],
                    };
                }
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
                        relatedArtifacts: { steps: [], screens: [], locators: [] },
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

    private resolveScenarioArtifacts(
        steps: FeatureScenarioInfo['steps'],
        definitions: StepDefinitionInfo[]
    ): FeatureScenarioInfo['relatedArtifacts'] {
        const matchedDefinitions = definitions.filter(definition => {
            const regex = safeRegex(definition.expression);
            return regex ? steps.some(step => {
                regex.lastIndex = 0;
                return regex.test(step.text);
            }) : false;
        });
        const stepFiles = [...new Set(matchedDefinitions.map(definition => definition.file))].sort();
        const screenFiles = [...new Set(stepFiles.flatMap(file =>
            this.importedFrameworkFiles(file, 'screenobjects')
        ))].sort();
        const locatorFiles = [...new Set(screenFiles.flatMap(file =>
            this.importedFrameworkFiles(file, 'locators')
        ))].sort();
        return { steps: stepFiles, screens: screenFiles, locators: locatorFiles };
    }

    private indexArtifactBundles(
        squad: string,
        definitions: StepDefinitionInfo[]
    ): ArtifactBundle[] {
        const stepFiles = [...new Set(definitions
            .filter(definition => definition.squad === squad)
            .map(definition => definition.file))].sort();
        return stepFiles.map(steps => {
            const screens = [...new Set(this.importedFrameworkFiles(steps, 'screenobjects'))].sort();
            const locators = [...new Set(screens.flatMap(screen =>
                this.importedFrameworkFiles(screen, 'locators')
            ))].sort();
            return {
                steps,
                screens,
                locators,
                stepExpressions: definitions.filter(definition => definition.file === steps)
                    .map(definition => definition.expression),
                screenMethods: this.screenMethods.filter(method => screens.includes(method.file))
                    .map(method => method.name),
            };
        }).filter(bundle => bundle.screens.length > 0 || bundle.locators.length > 0);
    }

    private importedFrameworkFiles(
        relativeFile: string,
        target: 'screenobjects' | 'locators'
    ): string[] {
        const absoluteFile = path.join(projectPaths.frameworkRoot, relativeFile);
        if (!fs.existsSync(absoluteFile)) return [];
        const content = this.readFrameworkFile(absoluteFile);
        const imports = [...content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)]
            .map(match => match[1]);
        const alias = target === 'screenobjects' ? '@screenobjects/' : '@locators/';
        const root = target === 'screenobjects' ? projectPaths.screenobjects : projectPaths.locators;
        return imports.flatMap(source => {
            let absolute: string | undefined;
            if (source.startsWith(alias)) absolute = path.join(root, source.slice(alias.length));
            else if (source.startsWith('.')) absolute = path.resolve(path.dirname(absoluteFile), source);
            if (!absolute) return [];
            const candidates = [absolute, `${absolute}.ts`, `${absolute}.json`];
            const found = candidates.find(candidate => fs.existsSync(candidate));
            if (!found || !(found === root || found.startsWith(root + path.sep))) return [];
            return [path.relative(projectPaths.frameworkRoot, found).replace(/\\/g, '/')];
        });
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

        for (const relativeFile of this.frameworkFiles.filter(file =>
            file.startsWith('features/yape-steps-definitions/') && file.endsWith('.ts')
        )) {
            const file = path.join(projectPaths.frameworkRoot, relativeFile);
            const relativeToSteps = path.relative(projectPaths.stepDefinitions, file);
            const squad = relativeToSteps.split(path.sep)[0];
            if (!squad || squad === '..') continue;
            const content = this.readFrameworkFile(file);
            const screenAliases = new Map<string, string>();
            for (const imported of content.matchAll(
                /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]@screenobjects\/([^'"]+?)(?:\.ts)?['"]/g
            )) {
                screenAliases.set(imported[1], `screenobjects/${imported[2]}.ts`);
            }
            const starts: Array<{ index: number; match: RegExpExecArray }> = [];
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(content)) !== null) {
                starts.push({ index: match.index, match });
            }
            starts.forEach((entry, position) => {
                const body = content.slice(entry.index, starts[position + 1]?.index ?? content.length);
                const screenMethods: NonNullable<StepDefinitionInfo['screenMethods']> = [];
                for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
                    const screenFile = screenAliases.get(call[1]);
                    if (!screenFile) continue;
                    if (screenMethods.some(item => item.file === screenFile && item.method === call[2])) continue;
                    screenMethods.push({ file: screenFile, method: call[2] });
                }
                definitions.push({
                    keyword: entry.match[1] as StepDefinitionInfo['keyword'],
                    expression: entry.match[2].replace(/\\\//g, '/'),
                    file: path.relative(projectPaths.frameworkRoot, file),
                    squad,
                    scope: squad === 'commons' ? 'commons' : 'squad',
                    ...(screenMethods.length ? { screenMethods } : {}),
                });
            });
        }
        return definitions;
    }

    private indexLocators(squad: string, platform: 'android' | 'ios'): LocatorInfo[] {
        const indexed: LocatorInfo[] = [];
        const strategies = indexDeclaredStrategies();
        const sources: { directory: string; squad: string; scope: LocatorInfo['scope'] }[] = [
            { directory: path.join(projectPaths.locators, squad), squad, scope: 'squad' },
            { directory: path.join(projectPaths.locators, 'commons'), squad: 'commons', scope: 'commons' },
            { directory: path.join(projectPaths.locators, 'home'), squad: 'home', scope: 'home' },
            { directory: projectPaths.locators, squad: 'global', scope: 'global' },
        ];

        for (const source of sources) {
            const files = source.scope === 'global'
                ? this.filesUnder(source.directory, '.json').filter(file => path.dirname(file) === source.directory)
                : this.filesUnder(source.directory, '.json');

            for (const file of files) {
                let document: Record<string, unknown>;
                try {
                    document = JSON.parse(this.readFrameworkFile(file));
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
                        const declared = strategies.get(`${path.relative(projectPaths.locators, file)
                            .replace(/\\/g, '/')
                            .replace(/\.locator\.json$/i, '')
                            .replace(/\.json$/i, '')}#${name}`);
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
                            androidStrategy: declared?.android,
                            iosStrategy: declared?.ios,
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

    /** Inventario único: CodeGraph descubre archivos; ReuseAnalyzer solo filtra. */
    private filesUnder(root: string, extension: string): string[] {
        const prefix = path.relative(projectPaths.frameworkRoot, root)
            .replace(/\\/g, '/').replace(/\/$/, '');
        return this.frameworkFiles.filter(file =>
            file.endsWith(extension) && (file === prefix || file.startsWith(`${prefix}/`))
        ).map(file => path.join(projectPaths.frameworkRoot, file));
    }

    private indexFeatureSteps(
        squad: string,
        definitions: StepDefinitionInfo[],
        featureScope = ''
    ): FeatureStepGroup[] {
        const root = featureScopeDirectory(projectPaths.features, squad, featureScope);
        if (!fs.existsSync(root)) return [];
        const files = this.filesUnder(root, '.feature');

        return files.sort().map(file => {
            const content = this.readFrameworkFile(file);
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
        for (const relativeFile of this.frameworkFiles.filter(file =>
            file.startsWith('screenobjects/') && file.endsWith('.ts')
        )) {
            const file = path.join(projectPaths.frameworkRoot, relativeFile);
            const relative = path.relative(projectPaths.screenobjects, file);
            const squad = relative.split(path.sep)[0];
            const frameworkRelative = path.relative(projectPaths.frameworkRoot, file);
            const content = this.readFrameworkFile(file);
            const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            const locatorFiles = this.importedFrameworkFiles(frameworkRelative, 'locators');
            for (const declaration of source.statements) {
                if (!ts.isClassDeclaration(declaration)) continue;
                const className = declaration.name?.text || '';
                // Los getters traducen `this.x` a una clave del locator JSON; sin
                // resolverlos, un método parecería no usar ningún locator.
                const getters = new Map<string, string[]>();
                for (const member of declaration.members) {
                    if (!ts.isGetAccessorDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) continue;
                    getters.set(member.name.text, locatorKeysIn(member.getText(source)));
                }
                for (const member of declaration.members) {
                    if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) continue;
                    if (!member.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) continue;
                    const body = member.body ? member.body.getText(source) : '';
                    const used = new Set(locatorKeysIn(body));
                    for (const [getter, keys] of getters) {
                        if (new RegExp(`this\\.${getter}\\b`).test(body)) keys.forEach(key => used.add(key));
                    }
                    methods.push({
                        name: member.name.text,
                        file: frameworkRelative,
                        squad,
                        locatorFiles,
                        signature: methodSignature(member, source),
                        locatorKeys: [...used].sort(),
                        className,
                    });
                }
            }
        }
        return methods;
    }

    private readFrameworkFile(file: string): string {
        const content = fs.readFileSync(file, 'utf-8');
        if (this.lastMetrics) {
            this.lastMetrics.filesRead += 1;
            this.lastMetrics.bytesRead += Buffer.byteLength(content, 'utf-8');
        }
        return content;
    }
}

function methodSignature(member: ts.MethodDeclaration, source: ts.SourceFile): string {
    const parameters = member.parameters.map(parameter => parameter.getText(source)).join(', ');
    const returnType = member.type ? `: ${member.type.getText(source)}` : '';
    return `${member.name.getText(source)}(${parameters})${returnType}`;
}
