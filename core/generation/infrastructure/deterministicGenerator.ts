import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AutomationScenario,
    GapResolution,
    GherkinResolution,
    GenerationPlan,
    ResolvedContext,
    ModuleDeclaration,
    declareElement,
} from '../../automation/contracts';
import {
    FwkMobileGenerator,
    GeneratedPreview,
    ReusedLocator,
    scenarioRowMethodName,
} from './fwkMobileGenerator';
import { frameworkContract, projectPaths } from '../../workspace';
import { effectiveGenerationPlan } from './effectiveGenerationPlan';
import { ReuseAnalyzer, collectCaseCoverageSnapshots, compareCaseCoverage } from '../../indexing';
import { readJsonUtf8, readUtf8File, writeJsonUtf8 } from '../../shared';
import { mergePatchImports, proposedImports } from './patchImports';
import {
    LocatorNaming,
    existingLocatorBlocks,
    locatorBlockPlatform,
    targetLocatorBlock,
} from '../domain/locatorBlocks';

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

function applyGherkinResolutions(
    scenario: AutomationScenario,
    resolutions: GherkinResolution[],
): AutomationScenario {
    const rows = scenario.request.scenarioRows || [];
    const templateRows = rows
        .map((row, index) => ({ row, index }))
        .filter(item => item.row.wording === 'template' && item.row.status === 'missing');
    if (!templateRows.length || !resolutions.length) return scenario;

    const allowed = new Set(templateRows.flatMap(item =>
        (item.row.actions || []).map(action => Number(action.sequence)).filter(Number.isInteger)
    ));
    const bySequence = new Map<number, number>();
    resolutions.forEach((resolution, resolutionIndex) => {
        resolution.actionSequences.forEach(sequence => {
            if (!allowed.has(sequence)) {
                throw new Error(
                    `La resolución Gherkin intenta modificar la secuencia ${sequence}, ` +
                    'que no pertenece a una fila wording=template.',
                );
            }
            if (bySequence.has(sequence)) {
                throw new Error(`La secuencia ${sequence} aparece en más de una resolución Gherkin.`);
            }
            bySequence.set(sequence, resolutionIndex);
        });
    });
    const missing = [...allowed].filter(sequence => !bySequence.has(sequence));
    if (missing.length) {
        throw new Error(
            `Faltan resoluciones Gherkin para las secuencias template: ${missing.join(', ')}.`,
        );
    }

    const rowResolution = new Map<number, number>();
    for (const { row, index } of templateRows) {
        const sequences = (row.actions || []).map(action => Number(action.sequence)).filter(Number.isInteger);
        const owners = new Set(sequences.map(sequence => bySequence.get(sequence)));
        if (owners.size !== 1 || owners.has(undefined)) {
            throw new Error(
                `La fila Gherkin template asociada a ${sequences.join(', ')} no puede dividirse entre varias resoluciones.`,
            );
        }
        rowResolution.set(index, [...owners][0]!);
    }
    resolutions.forEach((_resolution, resolutionIndex) => {
        const indices = [...rowResolution.entries()]
            .filter(([, owner]) => owner === resolutionIndex)
            .map(([index]) => index);
        if (!indices.length) throw new Error(`La resolución Gherkin ${resolutionIndex} no cubre ninguna fila template.`);
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        for (let index = min; index <= max; index += 1) {
            if (rowResolution.get(index) !== resolutionIndex) {
                throw new Error(
                    `La resolución Gherkin ${resolutionIndex} intenta consolidar filas no contiguas.`,
                );
            }
        }
    });

    const emitted = new Set<number>();
    const rewritten = rows.flatMap((row, index) => {
        const owner = rowResolution.get(index);
        if (owner === undefined) return [row];
        if (emitted.has(owner)) return [];
        emitted.add(owner);
        const resolution = resolutions[owner];
        const actions = rows.flatMap((candidate, candidateIndex) =>
            rowResolution.get(candidateIndex) === owner ? (candidate.actions || []) : []
        );
        return [{
            keyword: resolution.keyword,
            text: resolution.text,
            status: 'missing' as const,
            wording: 'agent' as const,
            actions,
        }];
    });
    return {
        ...scenario,
        request: { ...scenario.request, scenarioRows: rewritten },
    };
}

function hydrateScenarioRows(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    gherkinResolutions: GherkinResolution[] = [],
): AutomationScenario['request'] {
    const effectiveScenario = applyGherkinResolutions(scenario, gherkinResolutions);
    const byResolution = new Map(
        (plan.resolutions || [])
            .filter(item => Number.isInteger(item.sequence))
            .map(item => [item.sequence, item]),
    );
    const bySequence = new Map(
        (effectiveScenario.actions || [])
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
    const examples = effectiveScenario.request.examples || {};
    const rows = (effectiveScenario.request.scenarioRows || []).map(row => {
        // El paquete guarda las acciones de la fila solo por secuencia y el
        // dato escrito vuelve literal desde scenario.actions. El step lo
        // nombra como <param> con su columna en Examples: se restituye para
        // que la definition lo reciba y el Screen no lo deje fijo en codigo.
        const parameters = [...String(row.text || '').matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
            .map(match => match[1]);
        const pending = new Set(parameters);
        const actions = (row.actions || [])
            .map(entry => bySequence.get(Number((entry as any)?.sequence)))
            .filter(Boolean)
            .map(action => {
                if (action!.action !== 'ESCRIBIR' || !pending.size) return action;
                const literal = String(action!.value ?? '');
                const parameter = [...pending].find(name => String(examples[name] ?? '') === literal);
                if (!parameter || /^<[^>]+>$/.test(literal)) return action;
                pending.delete(parameter);
                return { ...action!, value: `<${parameter}>` };
            });
        return {
            ...row,
            actions,
        };
    });
    return {
        ...(effectiveScenario.request as any),
        ...(effectiveScenario.request.scenarioRows ? { scenarioRows: rows as any } : {}),
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
    // Las claves nuevas se suman al bloque que el baseline ya tiene para esa
    // plataforma aunque se llame distinto (`yapearAndroid` frente al
    // `yapearOtpAndroid` de la convencion): un segundo par de bloques dejaria
    // el getter y el validador leyendo un bloque sin la clave.
    const existing = existingLocatorBlocks(base);
    for (const [proposedBlock, entries] of Object.entries(addition)) {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        const block = targetLocatorBlock(proposedBlock, base, existing);
        const platform = locatorBlockPlatform(block);
        const merged: Record<string, unknown> = { ...(base[block] || {}) };
        let touched = Object.prototype.hasOwnProperty.call(base, block);
        for (const [name, value] of Object.entries(entries)) {
            if (!created.has(name)) continue;
            const replacement = replacements.get(name);
            if (replacement && platform !== replacement.platform) continue;
            merged[name] = value;
            touched = true;
        }
        if (touched) base[block] = merged;
    }
    return `${JSON.stringify(base, null, 4)}\n`;
}

// `private async readRecordedText` es el helper del contrato de aserciones de
// texto: sin admitir la visibilidad, el merge lo dejaba fuera del update y el
// borrador materializado no pasaba `recorded-text-assertion`.
const ASYNC_METHOD_PATTERN = /\b(?:public|private|protected)\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g;

function methodNames(source: string): Set<string> {
    return new Set([...source.matchAll(ASYNC_METHOD_PATTERN)].map(match => match[1]));
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
    return extractClassMembers(source, new RegExp(ASYNC_METHOD_PATTERN.source, 'g'));
}

function extractGetters(source: string): Array<{ name: string; content: string; start: number; end: number }> {
    return extractClassMembers(source, /\bpublic\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g);
}

/**
 * Resuelve un specifier a una ruta canonica relativa al framework, sin
 * extension: `../commons/base.screen.js` visto desde `screenobjects/payment/x.screen.ts`
 * y `@screenobjects/commons/base.screen.ts` son el mismo modulo. Permite
 * fusionar imports sin reescribir los relativos que el baseline ya tiene.
 */
export function frameworkModuleResolver(filePath: string): (specifier: string) => string {
    const contract = frameworkContract(projectPaths.frameworkRoot);
    const directory = path.posix.dirname(String(filePath).replace(/\\/g, '/'));
    const aliases = Object.entries(contract.aliases).sort((a, b) => b[0].length - a[0].length);
    return (specifier: string): string => {
        const clean = String(specifier).replace(/\\/g, '/');
        let canonical = clean;
        if (clean.startsWith('.')) {
            canonical = path.posix.normalize(path.posix.join(directory, clean));
        } else {
            const alias = aliases.find(([name]) => clean === name || clean.startsWith(`${name}/`));
            if (alias) canonical = `${alias[1]}${clean.slice(alias[0].length)}`;
        }
        return canonical.replace(/\.(?:js|ts|mjs|cjs)$/, '');
    };
}

/**
 * El baseline entra al merge tal cual: un `update` conserva byte a byte la
 * clase, los imports (relativos incluidos) y todo lo que no agrega. Antes se
 * "modernizaba" (alias, clase en PascalCase, BaseScreen del contrato) y eso
 * era justo lo que el QA no quiere en Screens escritos a mano; el validador
 * tolera esa deuda heredada. Solo se asegura `browser` en `@wdio/globals` si
 * el baseline lo usa sin importarlo, porque sin eso el archivo no compila.
 */
function prepareScreenBaseline(baseline: string): string {
    if (!/\bbrowser\./.test(baseline)) return baseline;
    if (/import\s*\{[^}]*\bbrowser\b[^}]*\}\s*from\s*['"]@wdio\/globals['"]/.test(baseline)) return baseline;
    return baseline.replace(
        /import\s*\{([^}]*)\}\s*from\s*['"]@wdio\/globals['"];?/,
        (_match, symbols: string) => {
            const names = new Set(symbols.split(',').map((item: string) => item.trim()).filter(Boolean));
            names.add('browser');
            return `import { ${[...names].sort().join(', ')} } from '@wdio/globals';`;
        },
    );
}

export function mergeScreenUpdate(
    baseline: string,
    generated: string,
    screenPath: string,
    replacementGetterNames: ReadonlySet<string> = new Set(),
): string {
    baseline = prepareScreenBaseline(baseline);
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
    if (!additions.length && !existingForReplacement.length) return baseline;
    baseline = mergePatchImports(baseline, proposedImports(generated), frameworkModuleResolver(screenPath));
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
    const inactivePlatform = scenario.platform === 'android' ? 'ios' : 'android';
    // Un JSON legacy puede traer mas de un bloque por plataforma; la clave
    // vale en cualquiera de ellos, no solo en el primero.
    const blocksOf = (platform: string) => Object.entries(locators)
        .filter(([name, value]) => locatorBlockPlatform(name) === platform && value && typeof value === 'object')
        .map(([, value]) => value);
    const declares = (blocks: Array<Record<string, unknown>>, name: string) =>
        blocks.some(block => Object.prototype.hasOwnProperty.call(block, name));
    const active = blocksOf(scenario.platform);
    const inactive = blocksOf(inactivePlatform);
    const missing = created.filter(name =>
        !declares(active, name)
        || !declares(inactive, name)
        || !new RegExp(`\\bpublic\\s+get\\s+${name}\\s*\\(`).test(preview.screenContent!)
    );
    if (missing.length) {
        throw new Error(
            'GENERATION_MATERIALIZATION_ERROR: no se materializó de forma atómica '
            + `locator/getter para ${missing.join(', ')}.`,
        );
    }
}

const STEP_DEFINITION_PATTERN = /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g;

function stepDefinitionBlocks(source: string): Array<{ name: string; code: string }> {
    // Cada definicion termina en `});` al inicio de linea. El baseline y lo
    // generado por el recorder cumplen ese formato; no se interpreta codigo.
    return [...source.matchAll(/^(?:Given|When|Then)\(\/\^([^\n]+?)\$\/[\s\S]*?^\}\);/gm)]
        .map(match => ({ name: match[1], code: match[0] }));
}

/**
 * Un Steps `update` conserva el archivo existente y solo suma definiciones.
 *
 * Es la casuistica de encadenar casos sin commitear: el caso B reutiliza el
 * Steps que dejo el caso A, y el validador exige (`destructive-update`) que
 * el archivo propuesto siga exponiendo cada definicion de A. Screen y Locators
 * ya se fusionaban; Steps se proponia entero de nuevo y el caso quedaba
 * bloqueado aunque todo estuviera verificado.
 */
const IMPORT_LINE_PATTERN = /^import\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?$/;

/** Steps legacy: `import yapearOTPScreen from '../../../screenobjects/payment/yapear-otp.screen.ts'`. */
function existingScreenBinding(baseline: string, generatedImport: string): { local: string; line: string } | undefined {
    const generatedSpecifier = IMPORT_LINE_PATTERN.exec(generatedImport)?.[1];
    if (!generatedSpecifier) return undefined;
    const fileName = path.posix.basename(generatedSpecifier).replace(/\.(?:js|ts)$/, '');
    for (const match of baseline.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?$/gm)) {
        const [line, local, specifier] = match;
        if (path.posix.basename(specifier).replace(/\.(?:js|ts)$/, '') === fileName) return { local, line };
    }
    return undefined;
}

export function mergeStepsUpdate(baseline: string, generated: string): string {
    const existing = new Set([...baseline.matchAll(STEP_DEFINITION_PATTERN)].map(match => match[1]));
    let additions = stepDefinitionBlocks(generated).filter(block => !existing.has(block.name));
    const baselineImports = new Set([...baseline.matchAll(/^import .+;$/gm)].map(match => match[0]));
    const missingImports: string[] = [];
    for (const line of [...generated.matchAll(/^import .+;$/gm)].map(match => match[0])) {
        if (baselineImports.has(line) || !/screen/i.test(line)) continue;
        // El baseline ya importa ese Screen (quiza por ruta relativa y con otro
        // nombre, `yapearOTPScreen`): las definiciones nuevas usan ese binding
        // en vez de importar el mismo modulo dos veces.
        const bound = existingScreenBinding(baseline, line);
        const generatedLocal = /^import\s+([A-Za-z_$][\w$]*)\s+from/.exec(line)?.[1];
        if (bound && generatedLocal) {
            if (bound.local !== generatedLocal) {
                const identifier = new RegExp(`\\b${generatedLocal}\\b`, 'g');
                additions = additions.map(block => ({ ...block, code: block.code.replace(identifier, bound.local) }));
            }
            continue;
        }
        missingImports.push(line);
    }
    if (!additions.length && !missingImports.length) return baseline;
    let output = baseline.replace(/\s+$/, '');
    if (missingImports.length) {
        const lastImport = [...output.matchAll(/^import .+;$/gm)].pop();
        if (lastImport && lastImport.index !== undefined) {
            const end = lastImport.index + lastImport[0].length;
            output = `${output.slice(0, end)}\n${missingImports.join('\n')}${output.slice(end)}`;
        } else {
            output = `${missingImports.join('\n')}\n\n${output}`;
        }
    }
    return `${output}\n\n${additions.map(block => block.code).join('\n\n')}\n`;
}

function scenarioBlocks(content: string): Array<{ name: string; block: string }> {
    const lines = content.split(/\r?\n/);
    const starts = lines.flatMap((line, index) => /^\s*Scenario(?: Outline)?:/.test(line) ? [index] : []);
    return starts.map((start, position) => {
        const name = (lines[start].match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/) || [])[1] || '';
        // Los tags inmediatamente anteriores pertenecen al Scenario.
        let from = start;
        while (from > 0 && /^\s*@[^\n]*$/.test(lines[from - 1])) from -= 1;
        const next = starts[position + 1];
        let to = next === undefined ? lines.length : next;
        while (next !== undefined && to > from && /^\s*@[^\n]*$/.test(lines[to - 1])) to -= 1;
        return { name, block: lines.slice(from, to).join('\n').replace(/\s*$/, '\n') };
    });
}

/**
 * Un Feature `update` conserva el archivo existente y solo suma Scenarios.
 *
 * Dos grabaciones con el mismo objetivo caen en la misma ruta de Feature; la
 * segunda debe anadir su Scenario, no reemplazar el archivo (y con el, el
 * caso anterior). Los Scenarios cuyo nombre ya existe no se duplican.
 */
export function mergeFeatureUpdate(
    baseline: string, generated: string, preserveCoverage = false,
    coverageStatus?: (caseId: string) => 'preserved' | 'lost' | 'unverified',
): string {
    const existing = scenarioBlocks(baseline);
    const caseId = (name: string) => name.match(/\[(TC-\d+)\]/i)?.[1]?.toUpperCase();
    // Identity survives a renamed title. An unreviewed scope reduction remains a visible conflict.
    for (const proposed of scenarioBlocks(generated)) {
        const id = caseId(proposed.name);
        const sameId = id ? existing.filter(item => caseId(item.name) === id) : [];
        if (sameId.length !== 1 || (!preserveCoverage && sameId[0].name === proposed.name)) continue;
        const current = sameId[0];
        const texts = (block: string) => [...block.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gm)].map(m => m[1].trim());
        const next = texts(proposed.block);
        let cursor = 0;
        const removed = texts(current.block).filter(text => {
            const index = next.indexOf(text, cursor);
            if (index < 0) return true;
            cursor = index + 1;
            return false;
        });
        // The production path compares final code across all four layers.
        // Callers without snapshots retain a conservative wording fallback.
        const needsReview = preserveCoverage && (coverageStatus
            ? coverageStatus(id!) !== 'preserved' : removed.length > 0);
        const replacement = needsReview
            ? `<<<<<<< COBERTURA EXISTENTE ${id}\n${current.block.trimEnd()}\n======= PROPUESTA PARA REVISAR\n${proposed.block.trimEnd()}\n>>>>>>> REVISAR CAMBIO DE COBERTURA\n`
            : proposed.block;
        baseline = baseline.replace(current.block.trimEnd(), replacement.trimEnd());
        generated = generated.replace(proposed.block.trimEnd(), '');
    }
    const existingNames = new Set(scenarioBlocks(baseline).map(item => item.name));
    const proposed = scenarioBlocks(generated).filter(item => item.name);
    // El mismo caso regenerado (mismo nombre de Scenario, es decir mismo TC)
    // sustituye su propio bloque: conservar el viejo dejaria el Feature
    // desalineado con los Steps y la trazabilidad recien generados.
    let output = baseline;
    for (const item of proposed.filter(candidate => existingNames.has(candidate.name))) {
        const current = scenarioBlocks(output).find(block => block.name === item.name);
        if (!current || current.block.trim() === item.block.trim()) continue;
        output = output.replace(current.block.trimEnd(), item.block.trimEnd());
    }
    const additions = proposed.filter(item => !existingNames.has(item.name));
    if (!additions.length) return output;
    return `${output.replace(/\s+$/, '')}\n\n${additions.map(item => item.block).join('\n')}`;
}

function preserveUpdateBaselines(preview: GeneratedPreview, plan: GenerationPlan, scenario: AutomationScenario): GeneratedPreview {
    let screenContent = preview.screenContent;
    let locatorContent = preview.locatorContent;
    let stepContent = preview.stepContent;
    let featureContent = preview.featureContent;
    const featurePlan = plan.files.find(file => file.layer === 'feature' && file.operation === 'update');
    const baselines = new Map(plan.files.filter(file => file.operation === 'update')
        .map(file => [file.path, readUtf8File(path.join(projectPaths.frameworkRoot, file.path))]));
    const screenPlan = plan.files.find(file => file.layer === 'screen' && file.operation === 'update');
    const locatorPlan = plan.files.find(file => file.layer === 'locators' && file.operation === 'update');
    const stepsPlan = plan.files.find(file => file.layer === 'steps' && file.operation === 'update');
    if (stepsPlan && !stepContent) {
        stepContent = baselines.get(stepsPlan.path)!;
        preview = { ...preview, stepPath: path.join(projectPaths.frameworkRoot, stepsPlan.path) };
    }
    if (screenPlan && !screenContent) {
        screenContent = baselines.get(screenPlan.path)!;
        preview = { ...preview, screenPath: path.join(projectPaths.frameworkRoot, screenPlan.path) };
    }
    if (stepsPlan && stepContent) {
        stepContent = mergeStepsUpdate(
            baselines.get(stepsPlan.path)!,
            stepContent,
        );
    }
    if (screenPlan && screenContent) {
        const replacementGetters = new Set(plan.resolutions
            .filter(item => item.locatorReplacement && item.locatorName)
            .map(item => item.locatorName!));
        screenContent = mergeScreenUpdate(
            baselines.get(screenPlan.path)!,
            screenContent,
            screenPlan.path,
            replacementGetters,
        );
    }
    if (locatorPlan && locatorContent) {
        locatorContent = mergeLocatorUpdate(
            baselines.get(locatorPlan.path)!,
            locatorContent,
            plan,
        );
    }
    if (featurePlan && featureContent && !plan.existingCase) {
        const baselineFeature = baselines.get(featurePlan.path)!;
        const proposedFeature = mergeFeatureUpdate(baselineFeature, featureContent);
        let coverageStatus: ((caseId: string) => 'preserved' | 'lost' | 'unverified') | undefined;
        const preserveCoverage = Boolean(plan.behaviorReuse?.sameCase.length && !plan.reconciliation);
        if (preserveCoverage) {
            try {
                const catalog = new ReuseAnalyzer().getCatalog(scenario.squad, scenario.platform, scenario.request.featureScope);
                const byLayer = { feature: proposedFeature, steps: stepContent, screen: screenContent, locators: locatorContent };
                const snapshots = collectCaseCoverageSnapshots({
                    frameworkRoot: projectPaths.frameworkRoot, featurePath: featurePlan.path,
                    stepFiles: [...new Set((catalog.frameworkStepDefinitions || []).map(item => item.file))],
                    beforeFiles: Object.fromEntries(baselines),
                    afterFiles: Object.fromEntries(plan.files.filter(file => byLayer[file.layer] !== undefined)
                        .map(file => [file.path, byLayer[file.layer]!])),
                });
                coverageStatus = caseId => compareCaseCoverage({ caseId, platform: scenario.platform, ...snapshots }).status;
            } catch { coverageStatus = () => 'unverified'; }
        }
        featureContent = mergeFeatureUpdate(baselineFeature, featureContent, preserveCoverage, coverageStatus);
    }
    return { ...preview, screenContent, locatorContent, stepContent, featureContent };
}

/**
 * Identificador con el que el Screen existente importa ese JSON de locators
 * (`import LocatorOtp from '../../resources/locators/payment/yapear-otp.locator.json'`).
 * Se compara por nombre de archivo porque el baseline puede usar ruta
 * relativa y el generador alias.
 */
export function existingLocatorImportIdentifier(screenBaseline: string, locatorPath: string): string | undefined {
    const fileName = path.posix.basename(String(locatorPath).replace(/\\/g, '/'));
    if (!fileName) return undefined;
    const source = ts.createSourceFile('baseline.ts', screenBaseline, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const specifier = statement.moduleSpecifier.text.replace(/\\/g, '/');
        if (specifier !== fileName && !specifier.endsWith(`/${fileName}`)) continue;
        const name = statement.importClause?.name?.text;
        if (name) return name;
    }
    return undefined;
}

/**
 * Nombres que el generador debe respetar cuando Screen y Locators son
 * `update`: bloques por plataforma del JSON existente e identificador del
 * import en el Screen existente. Sin baseline no impone nada.
 */
export function updateLocatorNaming(plan: GenerationPlan): LocatorNaming {
    const naming: LocatorNaming = {};
    const locatorPlan = plan.files.find(file => file.layer === 'locators' && file.operation === 'update');
    if (!locatorPlan) return naming;
    const locatorFile = path.join(projectPaths.frameworkRoot, locatorPlan.path);
    if (fs.existsSync(locatorFile)) {
        try {
            naming.blocks = existingLocatorBlocks(JSON.parse(readUtf8File(locatorFile)));
        } catch {
            // Un JSON ilegible no bloquea el borrador: se aplica la convencion.
        }
    }
    const screenPlan = plan.files.find(file => file.layer === 'screen' && file.operation === 'update');
    const screenFile = screenPlan ? path.join(projectPaths.frameworkRoot, screenPlan.path) : undefined;
    if (screenFile && fs.existsSync(screenFile)) {
        naming.identifier = existingLocatorImportIdentifier(readUtf8File(screenFile), locatorPlan.path);
    }
    return naming;
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

    const actionTrace = (scenario.request.scenarioRows || [])
        .filter(row => row.status === 'missing' || (row.status === 'reused' && (row.actions || []).length))
        .flatMap((row, index) =>
            (row.actions || []).map(action => {
                const resolution = plan.resolutions.find(item => item.sequence === action.sequence);
                return {
                    sequence: action.sequence!,
                    gherkinStep: `${row.keyword} ${row.text}`,
                    // Una fila reutilizada se traza al metodo que ya invoca el
                    // step existente; no se genera ninguno nuevo.
                    screenMethod: row.status === 'reused'
                        ? row.methodName
                        : resolution?.resolution === 'reuse' && resolution.existingMethod
                            ? resolution.existingMethod.name
                            : scenarioRowMethodName(row, index),
                    locatorName: resolution?.locatorName,
                };
            })
        );
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

    /** Materializa una referencia rápida sin alterar el plan efectivo oficial. */
    createDraft(packageDirectory: string): AutomationAgentResponse {
        return this.materialize(packageDirectory, [], [], false);
    }

    generate(
        packageDirectory: string,
        resolutions: GapResolution[],
        gherkinResolutions: GherkinResolution[] = [],
    ): AutomationAgentResponse {
        return this.materialize(packageDirectory, resolutions, gherkinResolutions, true);
    }

    private materialize(
        packageDirectory: string,
        resolutions: GapResolution[],
        gherkinResolutions: GherkinResolution[],
        persistEffectivePlan: boolean,
    ): AutomationAgentResponse {
        const scenario = readJson<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
        const basePlan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const plan = effectiveGenerationPlan(packageDirectory, basePlan, resolutions);
        if (persistEffectivePlan) {
            writeJsonUtf8(path.join(packageDirectory, 'effective-generation-plan.json'), plan);
        }
        const resolvedContext = fs.existsSync(path.join(packageDirectory, 'resolved-context.json'))
            ? readJson<ResolvedContext>(path.join(packageDirectory, 'resolved-context.json'))
            : undefined;
        const effectiveScenario = applyGherkinResolutions(scenario, gherkinResolutions);
        const hydratedRequest = hydrateScenarioRows(scenario, plan, gherkinResolutions);
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
                locatorNaming: updateLocatorNaming(plan),
            },
        );
        const preview = preserveUpdateBaselines(generatedPreview, plan, effectiveScenario);
        assertCreateArtifacts(effectiveScenario, plan, preview);
        return responseFromPreview(effectiveScenario, plan, preview, resolutions);
    }
}
