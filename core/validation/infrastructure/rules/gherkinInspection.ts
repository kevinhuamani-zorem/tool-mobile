/**
 * Lecturas del Feature y de los Steps como texto: los steps de cada Scenario,
 * las expresiones de las definiciones, los patrones de Gherkin imperativo o de
 * plantilla y el tag de plataforma.
 *
 * Son consultas puras sobre el contenido propuesto; las reglas que las usan
 * viven en `gherkinQualityRules` y `frameworkCollisionRules`.
 */
import { selectorNormalization } from '../../../shared';

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

export function hasPlatformTag(content: string, platform: 'android' | 'ios'): boolean {
    // `@android @ventas` (el tag de plataforma primero) tambien cuenta: la
    // version anterior exigia algo antes de `@android` y lo daba por ausente.
    return new RegExp(`^\\s*(?:@[^\\s@]+\\s+)*@${platform}(?:\\s|$)`, 'mi').test(content);
}
