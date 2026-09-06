/**
 * Lecturas del Feature y de los Steps como texto: los steps de cada Scenario,
 * las expresiones de las definiciones, los patrones de Gherkin imperativo o de
 * plantilla y el tag de plataforma.
 *
 * Son consultas puras sobre el contenido propuesto; las reglas que las usan
 * viven en `gherkinQualityRules` y `frameworkCollisionRules`.
 */
import { selectorNormalization } from '../../../shared';
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
