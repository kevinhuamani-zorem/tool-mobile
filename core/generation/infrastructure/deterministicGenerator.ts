import fs from 'fs';
import path from 'path';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AutomationScenario,
    GapResolution,
    GenerationPlan,
    ResolvedContext,
    ModuleDeclaration,
    declareElement,
    screenObjectNames,
} from '../../automation/contracts';
import {
    FwkMobileGenerator,
    GeneratedPreview,
    ReusedLocator,
    scenarioRowMethodName,
} from './fwkMobileGenerator';
import { aliasImport, frameworkContract, projectPaths } from '../../workspace';
import { effectiveGenerationPlan } from './effectiveGenerationPlan';
import { ReuseAnalyzer } from '../../indexing';
import { readJsonUtf8, readUtf8File, writeJsonUtf8 } from '../../shared';

function readJson<T>(file: string): T {
    return readJsonUtf8<T>(file);
}

function relative(file: string): string {
    return path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
}

function reusedLocators(
    plan: Pick<GenerationPlan, 'files' | 'resolutions'>,
    context?: Pick<ResolvedContext, 'elementDeclarations'>,
    scenario?: Pick<AutomationScenario, 'squad' | 'platform' | 'request'>,
): ReusedLocator[] {
    const declarations = (context?.elementDeclarations || []) as ModuleDeclaration[];
    const byName = new Map<string, ReusedLocator>();
    for (const group of declarations) {
        for (const element of group.elements) {
            byName.set(`${group.module}#${element.name}`, {
                name: element.name,
                import: group.import,
                identifier: group.identifier,
                reference: {
                    android: element.locators.android?.reference,
                    ios: element.locators.ios?.reference,
                },
                type: {
                    android: element.locators.android?.type,
                    ios: element.locators.ios?.type,
                },
            });
        }

    }
    const own = plan.files.find(file => file.layer === 'locators')?.path;
    const selected = plan.resolutions
        .filter(resolution => resolution.resolution === 'reuse' && resolution.source && resolution.locatorName)
        .filter(resolution => resolution.source!.file !== own)
        .map(resolution => ({
            resolution,
            declaration: byName.get(`${resolution.source!.module}#${resolution.locatorName}`),
        }));
    if (scenario && selected.some(item => !item.declaration)) {
        const catalog = new ReuseAnalyzer().getCatalog(
            scenario.squad,
            scenario.platform,
            String((scenario.request as any).featureScope || ''),
        );
        for (const item of selected) {
            if (item.declaration) continue;
            const source = item.resolution.source!;
            const locator = catalog.locators.find(candidate =>
                candidate.module === source.module
                && candidate.name === item.resolution.locatorName
                && candidate.file.replace(/\\/g, '/') === source.file.replace(/\\/g, '/')
            );
            if (!locator) continue;
            const declaration = declareElement(locator, new Map());
            item.declaration = {
                name: declaration.name,
                import: declaration.import,
                identifier: declaration.identifier,
                reference: {
                    android: declaration.locators.android?.reference,
                    ios: declaration.locators.ios?.reference,
                },
                type: {
                    android: declaration.locators.android?.type,
                    ios: declaration.locators.ios?.type,
                },
            };
        }
    }
    const missing = selected.filter(item => !item.declaration);
    if (missing.length) {
        throw new Error(
            'No se pudo materializar el locator reutilizado: '
            + missing.map(item => `${item.resolution.source!.module}#${item.resolution.locatorName}`).join(', '),
        );
    }
    return selected.map(item => item.declaration!);
}

function hydrateScenarioRows(
    scenario: AutomationScenario,
    plan: GenerationPlan,
): AutomationScenario['request'] {
    const byResolution = new Map(
        (plan.resolutions || [])
            .filter(item => Number.isInteger(item.sequence))
            .map(item => [item.sequence, item]),
    );
    const bySequence = new Map(
        (scenario.actions || [])
            .filter(action => Number.isInteger(action.sequence))
            .map(action => {
                const resolution = byResolution.get(action.sequence);
                return [action.sequence, {
                    ...action,
                    variableName: resolution?.locatorName || action.variableName || '',
                    selector: action.selector || resolution?.selector || '',
                }];
            }),
    );
    const rows = (scenario.request.scenarioRows || []).map(row => {
        const actions = (row.actions || [])
            .map(entry => bySequence.get(Number((entry as any)?.sequence)))
            .filter(Boolean);
        return {
            ...row,
            actions,
        };
    });
    return {
        ...(scenario.request as any),
        ...(scenario.request.scenarioRows ? { scenarioRows: rows as any } : {}),
    } as AutomationScenario['request'];
}

function locatorModuleFromPlan(plan: GenerationPlan, fallback: string): string {
    const locatorPath = plan.files.find(file => file.layer === 'locators')?.path
        .replace(/\\/g, '/')
        .replace(/^resources\/locators\//, '')
        .replace(/\.locator\.json$/i, '');
    if (!locatorPath) return fallback;
    const squadPrefix = `${locatorPath.split('/')[0]}/`;
    return locatorPath.startsWith(squadPrefix)
        ? locatorPath.slice(squadPrefix.length)
        : locatorPath;
}

function plannedPreviewPaths(plan: GenerationPlan): Partial<Pick<GeneratedPreview,
    'featurePath' | 'stepPath' | 'screenPath' | 'locatorPath'>> {
    const byLayer = new Map(plan.files.map(file => [file.layer, file.path]));
    const absolute = (layer: GenerationPlan['files'][number]['layer']) => {
        const target = byLayer.get(layer);
        return target ? path.join(projectPaths.frameworkRoot, target) : undefined;
    };
    return {
        featurePath: absolute('feature'),
        stepPath: absolute('steps'),
        screenPath: absolute('screen'),
        locatorPath: absolute('locators'),
    };
}

function selectorText(value: string): string {
    const quoted = String(value || '').match(/["']([^"']+)["']/)?.[1];
    if (quoted) return quoted;
    return String(value || '').replace(/^(?:~|id=)/, '').trim();
}

function existingMethodMappings(plan: GenerationPlan): Map<number, { name: string; args?: string[] }> {
    const mappings = new Map<number, { name: string; args?: string[] }>();
    for (const resolution of plan.resolutions || []) {
        if (resolution.resolution !== 'reuse' || !resolution.existingMethod) continue;
        const hasParameter = /\([^)]*:\s*[^)]+\)/.test(resolution.existingMethod.signature);
        const isRepetitionValue = Boolean(plan.repetition?.sequences.some(round => round.includes(resolution.sequence))
            && plan.repetition?.sequences.some(round => round[plan.repetition!.varyingOffset] === resolution.sequence));
        const args = hasParameter
            ? [isRepetitionValue && plan.repetition?.parameter
                ? plan.repetition.parameter
                : JSON.stringify(selectorText(resolution.selector || ''))]
            : [];
        mappings.set(resolution.sequence, { name: resolution.existingMethod.name, ...(args.length ? { args } : {}) });
    }
    return mappings;
}

function repetitionUsesExistingMethods(
    plan: GenerationPlan,
    mappings: Map<number, { name: string; args?: string[] }>,
): boolean {
    const sequences = plan.repetition?.sequences.flat() || [];
    return sequences.length > 0 && sequences.every(sequence => mappings.has(sequence));
}

export function mergeLocatorUpdate(baseline: string, generated: string, plan: GenerationPlan): string {
    const base = JSON.parse(baseline) as Record<string, Record<string, unknown>>;
    const addition = JSON.parse(generated) as Record<string, Record<string, unknown>>;
    const created = new Set((plan.resolutions || [])
        .filter(item => item.resolution === 'create' && item.locatorName)
        .map(item => item.locatorName!));
    const replacements = new Map((plan.resolutions || [])
        .filter(item => item.locatorReplacement && item.locatorName)
        .map(item => [item.locatorName!, item.locatorReplacement!]));
    for (const [block, entries] of Object.entries(addition)) {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        base[block] = { ...(base[block] || {}) };
        for (const [name, value] of Object.entries(entries)) {
            if (!created.has(name)) continue;
            const replacement = replacements.get(name);
            if (replacement && !block.toLowerCase().endsWith(replacement.platform)) continue;
            base[block][name] = value;
        }
    }
    return `${JSON.stringify(base, null, 4)}\n`;
}

function methodNames(source: string): Set<string> {
    return new Set([...source.matchAll(/\bpublic\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]));
}

function getterNames(source: string): Set<string> {
    return new Set([...source.matchAll(/\bpublic\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]));
}

function extractClassMembers(
    source: string,
    pattern: RegExp,
): Array<{ name: string; content: string; start: number; end: number }> {
    const methods: Array<{ name: string; content: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
        const start = source.lastIndexOf('\n', match.index) + 1;
        const open = source.indexOf('{', pattern.lastIndex);
        if (open < 0) continue;
        let depth = 0;
        let quote = '';
        let escaped = false;
        let lineComment = false;
        let blockComment = false;
        let end = -1;
        for (let index = open; index < source.length; index += 1) {
            const char = source[index];
            const next = source[index + 1];
            if (lineComment) {
                if (char === '\n') lineComment = false;
                continue;
            }
            if (blockComment) {
                if (char === '*' && next === '/') { blockComment = false; index += 1; }
                continue;
            }
            if (quote) {
                if (escaped) { escaped = false; continue; }
                if (char === '\\') { escaped = true; continue; }
                if (char === quote) quote = '';
                continue;
            }
            if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
            if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
            if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
            if (char === '{') depth += 1;
            if (char === '}' && --depth === 0) { end = index + 1; break; }
        }
        if (end > start) methods.push({
            name: match[1],
            content: source.slice(start, end).trimEnd(),
            start,
            end,
        });
        pattern.lastIndex = Math.max(pattern.lastIndex, end);
    }
    return methods;
}

function extractAsyncMethods(source: string): Array<{ name: string; content: string; start: number; end: number }> {
    return extractClassMembers(source, /\bpublic\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g);
}

function extractGetters(source: string): Array<{ name: string; content: string; start: number; end: number }> {
    return extractClassMembers(source, /\bpublic\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g);
}

function modernizeScreenBaseline(baseline: string, screenPath: string): string {
    const absoluteScreen = path.join(projectPaths.frameworkRoot, screenPath);
    const contract = frameworkContract(projectPaths.frameworkRoot);
    let output = baseline.replace(
        /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
        (_match, prefix: string, source: string, suffix: string) => {
            const target = path.resolve(path.dirname(absoluteScreen), source);
            const relativeTarget = path.relative(projectPaths.frameworkRoot, target).replace(/\\/g, '/');
            const aliased = aliasImport(relativeTarget, contract.aliases);
            return aliased ? `${prefix}${aliased}${suffix}` : `${prefix}${source}${suffix}`;
        },
    );
    output = output.replace(
        /(import\s+BaseScreen\s+from\s+['"])[^'"]+(['"])/,
        `$1${contract.baseScreenImport}$2`,
    );
    if (/\bbrowser\./.test(output)) {
        output = output.replace(
            /import\s*\{([^}]*)\}\s*from\s*['"]@wdio\/globals['"];?/,
            (_match, symbols: string) => {
                const names = new Set(symbols.split(',').map((item: string) => item.trim()).filter(Boolean));
                names.add('browser');
                return `import { ${[...names].sort().join(', ')} } from '@wdio/globals';`;
            },
        );
    }
    const expected = screenObjectNames(screenPath);
    const declared = output.match(/\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+/)?.[1];
    if (declared && declared !== expected.className) {
        output = output.replace(new RegExp(`\\bclass\\s+${declared}\\b`), `class ${expected.className}`);
        output = output.replace(
            new RegExp(`(export\\s+default\\s+new\\s+)${declared}(\\s*\\()`),
            `$1${expected.className}$2`,
        );
    }
    return output;
}

export function mergeScreenUpdate(
    baseline: string,
    generated: string,
    screenPath: string,
    replacementGetterNames: ReadonlySet<string> = new Set(),
): string {
    baseline = modernizeScreenBaseline(baseline, screenPath);
    const generatedGetters = extractGetters(generated);
    const generatedByName = new Map(generatedGetters.map(getter => [getter.name, getter]));
    const existingForReplacement = extractGetters(baseline)
        .filter(getter => replacementGetterNames.has(getter.name) && generatedByName.has(getter.name))
        .sort((left, right) => right.start - left.start);
    for (const existing of existingForReplacement) {
        const replacement = generatedByName.get(existing.name)!;
        baseline = `${baseline.slice(0, existing.start)}${replacement.content}${baseline.slice(existing.end)}`;
    }
    const existingMethods = methodNames(baseline);
    const existingGetters = getterNames(baseline);
    const getterAdditions = generatedGetters.filter(getter => !existingGetters.has(getter.name));
    const methodAdditions = extractAsyncMethods(generated).filter(method => !existingMethods.has(method.name));
    const additions = [...getterAdditions, ...methodAdditions];
    if (!additions.length) return baseline;
    const exportIndex = baseline.lastIndexOf('\nexport default');
    const classEnd = baseline.lastIndexOf('\n}', exportIndex >= 0 ? exportIndex : baseline.length);
    if (classEnd < 0) throw new Error('No se pudo localizar el cierre de la clase del Screen Object existente.');
    return `${baseline.slice(0, classEnd)}\n\n${additions.map(item => item.content).join('\n\n')}\n${baseline.slice(classEnd + 1)}`;
}

function assertCreateArtifacts(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview,
): void {
    const created = [...new Set(plan.resolutions
        .filter(item => item.resolution === 'create' && item.locatorName)
        .map(item => item.locatorName!))];
    if (!created.length) return;
    if (!preview.locatorContent || !preview.screenContent) {
        throw new Error('GENERATION_MATERIALIZATION_ERROR: un create requiere Locators y Screen Object.');
    }
    const locators = JSON.parse(preview.locatorContent) as Record<string, Record<string, unknown>>;
    const activeSuffix = scenario.platform;
    const inactiveSuffix = scenario.platform === 'android' ? 'ios' : 'android';
    const active = Object.entries(locators).find(([name]) => name.toLowerCase().endsWith(activeSuffix))?.[1] || {};
    const inactive = Object.entries(locators).find(([name]) => name.toLowerCase().endsWith(inactiveSuffix))?.[1] || {};
    const missing = created.filter(name =>
        !Object.prototype.hasOwnProperty.call(active, name)
        || !Object.prototype.hasOwnProperty.call(inactive, name)
        || !new RegExp(`\\bpublic\\s+get\\s+${name}\\s*\\(`).test(preview.screenContent!)
    );
    if (missing.length) {
        throw new Error(
            'GENERATION_MATERIALIZATION_ERROR: no se materializó de forma atómica '
            + `locator/getter para ${missing.join(', ')}.`,
        );
    }
}

function preserveUpdateBaselines(preview: GeneratedPreview, plan: GenerationPlan): GeneratedPreview {
    let screenContent = preview.screenContent;
    let locatorContent = preview.locatorContent;
    const screenPlan = plan.files.find(file => file.layer === 'screen' && file.operation === 'update');
    const locatorPlan = plan.files.find(file => file.layer === 'locators' && file.operation === 'update');
    if (screenPlan && screenContent) {
        const replacementGetters = new Set(plan.resolutions
            .filter(item => item.locatorReplacement && item.locatorName)
            .map(item => item.locatorName!));
        screenContent = mergeScreenUpdate(
            readUtf8File(path.join(projectPaths.frameworkRoot, screenPlan.path)),
            screenContent,
            screenPlan.path,
            replacementGetters,
        );
    }
    if (locatorPlan && locatorContent) {
        locatorContent = mergeLocatorUpdate(
            readUtf8File(path.join(projectPaths.frameworkRoot, locatorPlan.path)),
            locatorContent,
            plan,
        );
    }
    return { ...preview, screenContent, locatorContent };
}

function responseFromPreview(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview,
    resolutions: GapResolution[],
): AutomationAgentResponse {
    const files: AgentGeneratedFile[] = [{
        layer: 'feature' as const,
        path: relative(preview.featurePath),
        content: preview.featureContent,
    }];
    if (preview.stepPath && preview.stepContent) files.push({ layer: 'steps' as const, path: relative(preview.stepPath), content: preview.stepContent });
    if (preview.screenPath && preview.screenContent) files.push({ layer: 'screen' as const, path: relative(preview.screenPath), content: preview.screenContent });
    if (preview.locatorPath && preview.locatorContent) files.push({ layer: 'locators' as const, path: relative(preview.locatorPath), content: preview.locatorContent });

    const actionTrace = scenario.request.scenarioRows?.filter(row => row.status === 'missing')
        .flatMap((row, index) =>
            (row.actions || []).map(action => {
                const resolution = plan.resolutions.find(item => item.sequence === action.sequence);
                return {
                    sequence: action.sequence!,
                    gherkinStep: `${row.keyword} ${row.text}`,
                    screenMethod: resolution?.resolution === 'reuse' && resolution.existingMethod
                        ? resolution.existingMethod.name
                        : scenarioRowMethodName(row, index),
                    locatorName: resolution?.locatorName,
                };
            })
        ) || [];
    return {
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: resolutions.map(item => ({
            gapId: item.gapId,
            decision: item.decision,
            ...(item.reason ? { reason: item.reason } : {}),
            ...(item.needs ? { needs: item.needs } : {}),
        })),
        actionTrace,
        files,
        assumptions: ['Salida materializada por DeterministicGenerator.'],
    };
}

export class DeterministicGenerator {
    constructor(private readonly generator = new FwkMobileGenerator()) {}

    generate(packageDirectory: string, resolutions: GapResolution[]): AutomationAgentResponse {
        const scenario = readJson<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
        const basePlan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const plan = effectiveGenerationPlan(packageDirectory, basePlan, resolutions);
        writeJsonUtf8(path.join(packageDirectory, 'effective-generation-plan.json'), plan);
        const resolvedContext = fs.existsSync(path.join(packageDirectory, 'resolved-context.json'))
            ? readJson<ResolvedContext>(path.join(packageDirectory, 'resolved-context.json'))
            : undefined;
        const hydratedRequest = hydrateScenarioRows(scenario, plan);
        const methodMappings = existingMethodMappings(plan);
        const generatedPreview = this.generator.preview(
            {
                ...hydratedRequest,
                locatorModule: locatorModuleFromPlan(plan, hydratedRequest.locatorModule),
            },
            scenario.actions,
            reusedLocators(plan, resolvedContext, scenario),
            {
                preserveDistinctActionLocators: !repetitionUsesExistingMethods(plan, methodMappings),
                paths: plannedPreviewPaths(plan),
                existingMethods: methodMappings,
            },
        );
        const preview = preserveUpdateBaselines(generatedPreview, plan);
        assertCreateArtifacts(scenario, plan, preview);
        return responseFromPreview(scenario, plan, preview, resolutions);
    }
}
