/**
 * Lecturas del Feature y de los Steps como texto: los steps de cada Scenario,
 * las expresiones de las definiciones, los patrones de Gherkin imperativo o de
 * plantilla y el tag de plataforma.
 *
 * Son consultas puras sobre el contenido propuesto; las reglas que las usan
 * viven en `gherkinQualityRules` y `frameworkCollisionRules`.
 */
import { expandExampleRow, selectorNormalization } from '../../../shared';
import {
    gherkinKeywordAccepted,
    gherkinPersonProblem,
    gherkinStepKind,
    expectedGherkinKeyword,
} from '../../../automation/contracts';

/** Expresiones de las definiciones Given/When/Then declaradas en Steps. */
export function stepDefinitionExpressions(content: string): string[] {
    return [...content.matchAll(
        /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g
    )].map(match => match[1]);
}

export function responseScenarioSteps(content: string): string[][] {
    const scenarios: string[][] = [];
    let current: string[] | undefined;
    for (const line of content.split(/\r?\n/)) {
        if (/^\s*Scenario(?: Outline)?:/i.test(line)) {
            current = [];
            scenarios.push(current);
            continue;
        }
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (current && match) current.push(selectorNormalization.normalizeStepText(match[1]));
    }
    return scenarios;
}

const IMPERATIVE_GHERKIN_PATTERNS = [
    /\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b/,
    /\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:boton|elemento|campo)\b/,
    /\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b/,
    /\b(?:espera|esperar)\s+\d+\s*(?:segundo|segundos)\b/,
    /\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b/,
];

const GENERIC_TEMPLATE_GHERKIN_PATTERNS = [
    /^el usuario completa\b/,
    /^se obtiene el resultado esperado de\b/,
];

export const TECHNICAL_ACTIONS = new Set([
    'SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'ESPERAR', 'SCREENSHOT',
]);

export function imperativeGherkinSteps(content: string): string[] {
    return content.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (!match) return [];
        const normalized = selectorNormalization.normalizeStepText(match[1]);
        return IMPERATIVE_GHERKIN_PATTERNS.some(pattern => pattern.test(normalized))
            ? [match[1].trim()]
            : [];
    });
}

export function genericTemplateGherkinSteps(content: string): string[] {
    return content.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (!match) return [];
        const normalized = selectorNormalization.normalizeStepText(match[1]);
        return GENERIC_TEMPLATE_GHERKIN_PATTERNS.some(pattern => pattern.test(normalized))
            ? [match[1].trim()]
            : [];
    });
}

/** Steps de cada Scenario con su keyword tal como estan escritos. */
export function responseScenarioKeywordLines(content: string): Array<Array<{ keyword: string; text: string; raw: string }>> {
    const scenarios: Array<Array<{ keyword: string; text: string; raw: string }>> = [];
    let current: Array<{ keyword: string; text: string; raw: string }> | undefined;
    for (const line of content.split(/\r?\n/)) {
        if (/^\s*Scenario(?: Outline)?:/i.test(line)) {
            current = [];
            scenarios.push(current);
            continue;
        }
        const match = line.match(/^\s*(Given|When|Then|And|But)\s+(.+)$/i);
        if (current && match) {
            current.push({
                keyword: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
                text: selectorNormalization.normalizeStepText(match[2]),
                raw: match[2].trim(),
            });
        }
    }
    return scenarios;
}

export interface GherkinKeywordProblem {
    step: string;
    keyword: string;
    expected: string;
    kind: 'context' | 'behavior' | 'assertion';
}

/**
 * Given: contexto inicial. When: accion. Then: resultado esperado. And/But:
 * complementan el paso anterior (heredan su tipo). El tipo de cada step sale
 * de lo que ejecuta segun `actionTrace`: un step cuya ultima accion es una
 * verificacion es un resultado; con cualquier otra accion es un
 * comportamiento; sin acciones trazadas es contexto y solo se admite antes
 * del primer comportamiento (o no se juzga si ya empezo el flujo).
 */
export function gherkinKeywordProblems(
    content: string,
    actionTrace: ReadonlyArray<{ sequence: number; gherkinStep: string }>,
    actions: ReadonlyArray<{ sequence: number; action: string }>,
): GherkinKeywordProblem[] {
    const actionBySequence = new Map(actions.map(action => [Number(action.sequence), action]));
    const actionsByStep = new Map<string, Array<{ action: string }>>();
    for (const trace of actionTrace) {
        const text = selectorNormalization.normalizeStepText(
            String(trace.gherkinStep || '').replace(/^\s*(?:Given|When|Then|And|But)\s+/i, ''),
        );
        const action = actionBySequence.get(Number(trace.sequence));
        if (!text || !action) continue;
        const list = actionsByStep.get(text) || [];
        list.push({ action: action.action });
        actionsByStep.set(text, list);
    }
    const problems: GherkinKeywordProblem[] = [];
    for (const scenario of responseScenarioKeywordLines(content)) {
        // Solo se juzga el Scenario que este caso escribe: en un Feature
        // update los Scenarios anteriores no traen acciones trazadas.
        if (!scenario.some(line => actionsByStep.has(line.text))) continue;
        let previous: 'context' | 'behavior' | 'assertion' | undefined;
        for (const line of scenario) {
            const traced = actionsByStep.get(line.text);
            // Un step sin acciones trazadas es contexto si abre el Scenario
            // (el login reutilizado); dentro del flujo no se puede clasificar
            // y no cambia el anterior.
            if (!traced && previous !== undefined) continue;
            const kind = traced ? gherkinStepKind(traced) : 'context';
            if (!gherkinKeywordAccepted(line.keyword, kind, previous)) {
                problems.push({
                    step: `${line.keyword} ${line.raw}`,
                    keyword: line.keyword,
                    expected: expectedGherkinKeyword(kind, previous),
                    kind,
                });
            }
            previous = kind;
        }
    }
    return problems;
}

export interface GherkinPersonProblem {
    step: string;
    problem: 'first-person' | 'second-person' | 'infinitive';
}

/** Steps en primera persona o en imperativo/segunda persona; `skip` excluye los reutilizados. */
export function gherkinPersonProblems(content: string, skip: ReadonlySet<string> = new Set()): GherkinPersonProblem[] {
    const problems: GherkinPersonProblem[] = [];
    for (const scenario of responseScenarioKeywordLines(content)) {
        for (const line of scenario) {
            if (skip.has(line.text)) continue;
            const problem = gherkinPersonProblem(line.raw);
            if (problem) problems.push({ step: `${line.keyword} ${line.raw}`, problem });
        }
    }
    return problems;
}

export function hasPlatformTag(content: string, platform: 'android' | 'ios'): boolean {
    // `@android @ventas` (el tag de plataforma primero) tambien cuenta: la
    // version anterior exigia algo antes de `@android` y lo daba por ausente.
    return new RegExp(`^\\s*(?:@[^\\s@]+\\s+)*@${platform}(?:\\s|$)`, 'mi').test(content);
}

export interface ScenarioResolutionLine {
    /** Texto de la linea sin keyword, tal cual esta en el Feature. */
    raw: string;
    keyword: string;
    /** Textos que Cucumber resolvera: la linea expandida por cada fila de Examples (o la propia si no hay). */
    expanded: string[];
}

export interface ScenarioResolution {
    title: string;
    lines: ScenarioResolutionLine[];
}

/**
 * Los Scenarios del Feature con sus lineas y cada linea expandida con las
 * filas de Examples, que es lo que Cucumber resuelve contra las definiciones.
 * Las filas de una DataTable (`| … |`) y los docstrings no son lineas de
 * step y se ignoran; `<columna>` sin Examples se deja tal cual (lo reporta
 * `missing-examples`).
 */
export function responseScenarioResolutions(content: string): ScenarioResolution[] {
    const scenarios: Array<{ title: string; steps: Array<{ keyword: string; raw: string }>; examples: Array<Record<string, string>> }> = [];
    let current: (typeof scenarios)[number] | undefined;
    let headers: string[] | undefined;
    let inExamples = false;
    for (const line of String(content || '').split(/\r?\n/)) {
        const scenarioMatch = line.match(/^\s*(?:Scenario(?: Outline)?|Esquema del escenario|Escenario):\s*(.*)$/i);
        if (scenarioMatch) {
            current = { title: scenarioMatch[1].trim(), steps: [], examples: [] };
            scenarios.push(current);
            headers = undefined;
            inExamples = false;
            continue;
        }
        if (!current) continue;
        if (/^\s*(?:Examples|Ejemplos):/i.test(line)) {
            inExamples = true;
            headers = undefined;
            continue;
        }
        const stepMatch = line.match(/^\s*(Given|When|Then|And|But)\s+(.+)$/i);
        if (stepMatch) {
            inExamples = false;
            current.steps.push({
                keyword: stepMatch[1][0].toUpperCase() + stepMatch[1].slice(1).toLowerCase(),
                raw: stepMatch[2].trim().replace(/\s+/g, ' '),
            });
            continue;
        }
        if (inExamples && /^\s*\|/.test(line)) {
            const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
            if (!headers) {
                headers = cells;
                continue;
            }
            const row: Record<string, string> = {};
            headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
            current.examples.push(row);
        }
    }
    return scenarios.map(scenario => ({
        title: scenario.title,
        lines: scenario.steps.map(step => ({
            raw: step.raw,
            keyword: step.keyword,
            expanded: scenario.examples.length
                ? [...new Set(scenario.examples.map(row => expandExampleRow(step.raw, row)))]
                : [step.raw],
        })),
    }));
}

/**
 * Las definiciones del archivo de Steps tal como Cucumber las cargara:
 * regex literales con sus anclas y flags (`/^…$/i`) o cucumber expressions
 * en texto. A diferencia de `stepDefinitionExpressions`, no exige `^…$`:
 * una definicion sin anclas tambien resuelve lineas al ejecutar (y de mas).
 */
export function stepDefinitionPatterns(content: string): string[] {
    const source = String(content || '');
    const patterns: Array<{ index: number; expression: string }> = [];
    for (const match of source.matchAll(/\b(?:Given|When|Then)\s*\(\s*\/((?:\\\/|[^/\n])+)\/([a-z]*)\s*,/g)) {
        patterns.push({ index: match.index ?? 0, expression: `/${match[1]}/${match[2]}` });
    }
    for (const match of source.matchAll(/\b(?:Given|When|Then)\s*\(\s*(['"`])((?:\\\1|(?!\1).)+)\1\s*,/g)) {
        patterns.push({ index: match.index ?? 0, expression: match[2] });
    }
    return patterns.sort((left, right) => left.index - right.index).map(item => item.expression);
}
