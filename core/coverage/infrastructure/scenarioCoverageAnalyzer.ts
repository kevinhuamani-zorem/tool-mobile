import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { projectPaths } from '../../workspace';

export interface ExistingScenarioInfo {
    id: string;
    feature: string;
    name: string;
    caseId: string;
    tags: string[];
    file: string;
    line: number;
    steps: {
        keyword: string;
        text: string;
    }[];
}

export interface ScenarioStepResolution {
    index: number;
    keyword: string;
    text: string;
    definition?: string;
    screenCalls: { file: string; method: string }[];
    locators: ScenarioLocatorCoverage[];
}

export interface ScenarioLocatorCoverage {
    name: string;
    file: string;
    module: string;
    steps: string[];
    androidSelector: string;
    iosSelector: string;
    androidBlock?: string;
    iosBlock?: string;
}

export interface ScenarioCoverageResult {
    scenario: ExistingScenarioInfo;
    steps: ScenarioStepResolution[];
    locators: ScenarioLocatorCoverage[];
    unresolvedSteps: string[];
    totals: {
        locators: number;
        android: number;
        ios: number;
    };
}

interface ParsedDefinition {
    expression: string;
    file: string;
    screenCalls: { file: string; method: string }[];
}

interface LocatorReference {
    file: string;
    block: string;
    name: string;
}

export class ScenarioCoverageAnalyzer {
    listScenarios(squad: string): ExistingScenarioInfo[] {
        const root = path.join(projectPaths.features, squad);
        if (!fs.existsSync(root)) return [];
        return this.walk(root, file => file.endsWith('.feature'))
            .flatMap(file => this.parseFeature(file))
            .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    }

    analyze(squad: string, scenarioId: string): ScenarioCoverageResult {
        const scenario = this.listScenarios(squad).find(item => item.id === scenarioId);
        if (!scenario) throw new Error(`No se encontro el escenario: ${scenarioId}`);
        const definitions = this.indexDefinitions(squad);
        const resolvedSteps = scenario.steps.map((gherkinStep, index) => {
            const definition = definitions.find(candidate =>
                this.matches(candidate.expression, gherkinStep.text)
            );
            const locatorReferences = (definition?.screenCalls || []).flatMap(call =>
                this.resolveScreenLocators(call.file, call.method)
            );
            return {
                index,
                keyword: gherkinStep.keyword,
                text: gherkinStep.text,
                definition: definition?.file,
                screenCalls: definition?.screenCalls || [],
                locatorReferences
            };
        });

        const references = new Map<string, {
            reference: LocatorReference;
            steps: Set<string>;
        }>();
        for (const step of resolvedSteps) {
            for (const reference of step.locatorReferences) {
                const key = `${reference.file}:${reference.name}`;
                const usage = references.get(key) || {
                    reference,
                    steps: new Set<string>()
                };
                usage.steps.add(step.text);
                references.set(key, usage);
            }
        }
        const locators = [...references.values()]
            .map(({ reference, steps: linkedSteps }) => {
                const coverage = this.readCoverage(reference);
                return coverage
                    ? { ...coverage, steps: [...linkedSteps] }
                    : undefined;
            })
            .filter((locator): locator is ScenarioLocatorCoverage => Boolean(locator))
            .sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
        const locatorByKey = new Map(
            locators.map(locator => [`${locator.file}:${locator.name}`, locator])
        );
        const steps: ScenarioStepResolution[] = resolvedSteps.map(step => ({
            index: step.index,
            keyword: step.keyword,
            text: step.text,
            definition: step.definition,
            screenCalls: step.screenCalls,
            locators: step.locatorReferences
                .map(reference => locatorByKey.get(
                    `${path.relative(projectPaths.frameworkRoot, reference.file).replace(/\\/g, '/')}:${reference.name}`
                ))
                .filter((locator): locator is ScenarioLocatorCoverage => Boolean(locator))
                .filter((locator, index, items) =>
                    items.findIndex(item =>
                        item.file === locator.file && item.name === locator.name
                    ) === index
                )
        }));

        return {
            scenario,
            steps,
            locators,
            unresolvedSteps: steps.filter(step => !step.definition).map(step => step.text),
            totals: {
                locators: locators.length,
                android: locators.filter(locator => Boolean(locator.androidSelector)).length,
                ios: locators.filter(locator => Boolean(locator.iosSelector)).length
            }
        };
    }

    private parseFeature(file: string): ExistingScenarioInfo[] {
        const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
        const relative = path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
        const scenarios: ExistingScenarioInfo[] = [];
        let feature = path.basename(file, '.feature');
        let pendingTags: string[] = [];
        let current: ExistingScenarioInfo | undefined;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
            const featureMatch = line.match(/^Feature:\s*(.+)$/i);
            if (featureMatch) feature = featureMatch[1].trim();
            if (line.startsWith('@')) {
                pendingTags = line.split(/\s+/).filter(tag => tag.startsWith('@'));
                continue;
            }
            const scenarioMatch = line.match(/^Scenario(?: Outline)?:\s*(.+)$/i);
            if (scenarioMatch) {
                const name = scenarioMatch[1].trim();
                const caseId = name.match(/\[((?:TC-\d+)|(?:CP_[^\]]+))\]/i)?.[1]?.toUpperCase() || '';
                current = {
                    id: `${relative}:${index + 1}`,
                    feature,
                    name,
                    caseId,
                    tags: pendingTags,
                    file: relative,
                    line: index + 1,
                    steps: []
                };
                scenarios.push(current);
                pendingTags = [];
                continue;
            }
            const stepMatch = line.match(/^(Given|When|Then|And|But)\s+(.+)$/);
            if (stepMatch && current) {
                current.steps.push({
                    keyword: stepMatch[1],
                    text: stepMatch[2].trim()
                });
            }
            if (/^(Examples:|Scenario|Feature:)/i.test(line) && !scenarioMatch) current = undefined;
        }
        return scenarios;
    }

    private indexDefinitions(squad: string): ParsedDefinition[] {
        const root = projectPaths.stepDefinitions;
        if (!fs.existsSync(root)) return [];
        const preferred = [
            `${path.sep}${squad}${path.sep}`,
            `${path.sep}commons${path.sep}`
        ];
        return this.walk(root, file => file.endsWith('.ts'))
            .sort((a, b) => {
                const rank = (file: string) => {
                    const index = preferred.findIndex(segment => file.includes(segment));
                    return index < 0 ? preferred.length : index;
                };
                return rank(a) - rank(b) || a.localeCompare(b);
            })
            .flatMap(file => this.parseDefinitions(file));
    }

    private parseDefinitions(file: string): ParsedDefinition[] {
        const source = ts.createSourceFile(
            file,
            fs.readFileSync(file, 'utf-8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
        const screenImports = new Map<string, string>();
        source.statements.forEach(statement => {
            if (!ts.isImportDeclaration(statement) || !statement.importClause?.name) return;
            const specifier = String((statement.moduleSpecifier as ts.StringLiteral).text);
            if (!specifier.includes('screenobjects/')) return;
            const resolved = this.resolveImport(file, specifier);
            if (resolved) screenImports.set(statement.importClause.name.text, resolved);
        });
        const output: ParsedDefinition[] = [];
        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                ['Given', 'When', 'Then'].includes(node.expression.text) &&
                node.arguments.length >= 2 &&
                ts.isRegularExpressionLiteral(node.arguments[0])
            ) {
                const literal = node.arguments[0].text;
                const expression = literal.slice(1, literal.lastIndexOf('/'));
                const callback = node.arguments[1];
                const screenCalls: { file: string; method: string }[] = [];
                const inspect = (child: ts.Node) => {
                    if (
                        ts.isCallExpression(child) &&
                        ts.isPropertyAccessExpression(child.expression) &&
                        ts.isIdentifier(child.expression.expression)
                    ) {
                        const screenFile = screenImports.get(child.expression.expression.text);
                        if (screenFile) {
                            screenCalls.push({
                                file: screenFile,
                                method: child.expression.name.text
                            });
                        }
                    }
                    ts.forEachChild(child, inspect);
                };
                ts.forEachChild(callback, inspect);
                output.push({
                    expression,
                    file: path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/'),
                    screenCalls
                });
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
        return output;
    }

    private resolveScreenLocators(screenFile: string, methodName: string): LocatorReference[] {
        if (!fs.existsSync(screenFile)) return [];
        const source = ts.createSourceFile(
            screenFile,
            fs.readFileSync(screenFile, 'utf-8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );
        const locatorImports = new Map<string, string>();
        source.statements.forEach(statement => {
            if (!ts.isImportDeclaration(statement) || !statement.importClause?.name) return;
            const specifier = String((statement.moduleSpecifier as ts.StringLiteral).text);
            if (!specifier.includes('resources/locators/') || !specifier.endsWith('.json')) return;
            const resolved = this.resolveImport(screenFile, specifier);
            if (resolved) locatorImports.set(statement.importClause.name.text, resolved);
        });
        const members = new Map<string, ts.ClassElement>();
        const visitClasses = (node: ts.Node) => {
            if (ts.isClassDeclaration(node)) {
                node.members.forEach(member => {
                    if (
                        (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member)) &&
                        member.name && ts.isIdentifier(member.name)
                    ) members.set(member.name.text, member);
                });
            }
            ts.forEachChild(node, visitClasses);
        };
        visitClasses(source);

        const references: LocatorReference[] = [];
        const visited = new Set<string>();
        const inspectMember = (name: string) => {
            if (visited.has(name)) return;
            visited.add(name);
            const member = members.get(name);
            if (!member) return;
            const inspect = (node: ts.Node) => {
                if (
                    ts.isPropertyAccessExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression)
                ) {
                    const locatorFile = locatorImports.get(node.expression.expression.text);
                    if (locatorFile) {
                        references.push({
                            file: locatorFile,
                            block: node.expression.name.text,
                            name: node.name.text
                        });
                    }
                }
                if (
                    ts.isPropertyAccessExpression(node) &&
                    node.expression.kind === ts.SyntaxKind.ThisKeyword
                ) inspectMember(node.name.text);
                ts.forEachChild(node, inspect);
            };
            ts.forEachChild(member, inspect);
        };
        inspectMember(methodName);
        return references;
    }

    private readCoverage(reference: LocatorReference): ScenarioLocatorCoverage | undefined {
        try {
            const document = JSON.parse(fs.readFileSync(reference.file, 'utf-8')) as Record<string, any>;
            const stem = reference.block.replace(/(android|ios)$/i, '').toLowerCase();
            const androidBlock = Object.keys(document).find(block =>
                block.toLowerCase().endsWith('android') &&
                block.replace(/android$/i, '').toLowerCase() === stem
            );
            const iosBlock = Object.keys(document).find(block =>
                block.toLowerCase().endsWith('ios') &&
                block.replace(/ios$/i, '').toLowerCase() === stem
            );
            const androidSelector = typeof document[androidBlock || '']?.[reference.name] === 'string'
                ? document[androidBlock!][reference.name].trim()
                : '';
            const iosSelector = typeof document[iosBlock || '']?.[reference.name] === 'string'
                ? document[iosBlock!][reference.name].trim()
                : '';
            return {
                name: reference.name,
                file: path.relative(projectPaths.frameworkRoot, reference.file).replace(/\\/g, '/'),
                module: path.relative(projectPaths.locators, reference.file)
                    .replace(/\\/g, '/')
                    .replace(/\.locator\.json$/i, ''),
                steps: [],
                androidSelector,
                iosSelector,
                androidBlock,
                iosBlock
            };
        } catch {
            return undefined;
        }
    }

    private resolveImport(fromFile: string, specifier: string): string | undefined {
        if (!specifier.startsWith('.')) return undefined;
        const raw = path.resolve(path.dirname(fromFile), specifier);
        const candidates = [
            raw,
            raw.replace(/\.js$/i, '.ts'),
            raw.replace(/\.ts$/i, '.ts')
        ];
        return candidates.find(candidate => fs.existsSync(candidate));
    }

    private matches(expression: string, text: string): boolean {
        try {
            return new RegExp(expression).test(text);
        } catch {
            return false;
        }
    }

    private walk(root: string, predicate: (file: string) => boolean): string[] {
        const files: string[] = [];
        const pending = [root];
        while (pending.length > 0) {
            const current = pending.pop()!;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(full);
                else if (entry.isFile() && predicate(full)) files.push(full);
            }
        }
        return files.sort();
    }
}
