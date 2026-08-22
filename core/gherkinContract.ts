/**
 * [visual-recorder] Reglas de contrato del Feature que el agente NO puede
 * reinterpretar.
 *
 * Vive aparte porque la misma logica corre en dos sitios: el validador que se
 * ejecuta al importar la propuesta, y `verify-package.js`, que corre dentro del
 * sandbox del agente para que se autocorrija antes de devolver nada.
 */

import { AutomationScenario } from './automationContracts';

/**
 * Normaliza un step SOLO en espacios.
 *
 * Deliberadamente no toca mayusculas, tildes ni el nombre del parametro:
 * Cucumber compara el texto del step contra la expresion tal cual, asi que
 * `inicia sesion` no enlaza con `/inicia sesión/` y `<username>` reemplazado por
 * un literal tampoco. Bajar tildes o case aqui dejaria pasar justo los dos
 * errores que esta regla existe para atrapar.
 */
export function normalizeGherkinStep(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function featureStepLines(feature: string): string[] {
    return [...String(feature || '').matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)]
        .map(match => match[1].trim());
}

/**
 * Filas que el resolver marco `reused`: son steps que YA existen en el
 * framework, con su expresion exacta. Reescribirlas deja el Feature apuntando a
 * un step que no existe, y Cucumber lo reporta como undefined en ejecucion, no
 * al generar. El caso tipico es el login: `el usuario <username> inicia sesion
 * en Yape` lo resuelve login.steps.ts, y basta con inlinar el usuario o perder
 * la tilde de "sesion" para que deje de enlazar.
 */
export function rewrittenReusedSteps(scenario: AutomationScenario, feature: string): string[] {
    const rows = scenario.request?.scenarioRows || [];
    const present = new Set(featureStepLines(feature).map(normalizeGherkinStep));
    return rows
        .filter(row => row.status === 'reused')
        .map(row => row.text)
        .filter(text => !present.has(normalizeGherkinStep(text)));
}

function placeholdersIn(feature: string): string[] {
    const names = featureStepLines(feature)
        .flatMap(line => [...line.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1]));
    return [...new Set(names)];
}

function examplesColumns(feature: string): Set<string> {
    const columns = new Set<string>();
    const lines = String(feature || '').split('\n');
    for (let index = 0; index < lines.length; index++) {
        if (!/^\s*Examples\s*:/i.test(lines[index])) continue;
        // La cabecera es la primera fila de tabla tras `Examples:`.
        const header = lines.slice(index + 1).find(line => line.trim().startsWith('|'));
        if (!header) continue;
        header.split('|').slice(1, -1)
            .map(cell => cell.trim())
            .filter(Boolean)
            .forEach(cell => columns.add(cell));
    }
    return columns;
}

/**
 * Un `<parametro>` sin Examples no se sustituye: Cucumber busca el step con los
 * angulos incluidos y no encuentra nada. Y una tabla de Examples dentro de un
 * `Scenario:` simple es un error de parseo, tiene que ser `Scenario Outline:`.
 */
export function missingExamples(feature: string): string[] {
    const placeholders = placeholdersIn(feature);
    if (!placeholders.length) return [];
    const problems: string[] = [];
    if (!/^\s*Scenario\s+Outline\s*:/mi.test(String(feature || ''))) {
        problems.push(
            `El Feature usa <${placeholders.join('>, <')}> pero declara "Scenario:": ` +
            'con parametros tiene que ser "Scenario Outline:" y traer su tabla Examples.'
        );
    }
    const columns = examplesColumns(feature);
    const missing = placeholders.filter(name => !columns.has(name));
    if (missing.length) {
        problems.push(
            `Faltan columnas en Examples para: <${missing.join('>, <')}>. ` +
            'Sin la columna, el parametro llega literal al step y nunca enlaza.'
        );
    }
    return problems;
}

export const gherkinContract = {
    normalizeGherkinStep,
    featureStepLines,
    rewrittenReusedSteps,
    missingExamples,
};
