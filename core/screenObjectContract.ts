/**
 * [visual-recorder] Reglas mecanicas del Screen Object que el agente rompia y
 * nadie comprobaba.
 *
 * Vive aparte por la misma razon que `gherkinContract`: la misma logica corre
 * en dos sitios —el validador que se ejecuta al importar la propuesta y
 * `verify-package.js`, dentro del sandbox del agente para que se autocorrija—
 * y tener dos copias fue justo lo que dejo divergir el resto del pipeline.
 *
 * Las tres reglas no son estilo. Medido sobre este framework:
 *   - 114 de 114 imports de `.locator.json` llevan atributo de tipo. Sin el,
 *     Node lanza al cargar el modulo: el caso no corre.
 *   - 860 de 860 llamadas a `getElement` tienen exactamente 4 argumentos y sus
 *     posiciones 1 y 3 son `TypeLocator.MIEMBRO`.
 *   - 858 de 860 pasan el valor de iOS antes que el de Android, que es el orden
 *     que declara la firma.
 */

export interface ScreenObjectProblem {
    code: 'json-import-attribute' | 'locator-import-alias' | 'getElement-arity' | 'getElement-order';
    message: string;
}

export interface ScreenObjectRules {
    /** Nombre del enum de estrategias en ESTE framework (`TypeLocator`). */
    typeLocatorSymbol: string;
    /** Orden de plataformas que declara la firma de `getElement`. */
    platformOrder: ('android' | 'ios')[];
    parameterCount: number;
    /**
     * Override del import esperado por nombre de archivo. Es opcional porque la
     * forma correcta se deriva del propio especificador; sirve cuando el paquete
     * ya la trae escrita.
     */
    expectedImports?: Record<string, string>;
}

/** Atributo de tipo de un import de JSON, en cualquiera de sus escrituras. */
const JSON_ATTRIBUTE = /\b(?:with|assert)\s*\{\s*type\s*:\s*['"]json['"]\s*\}/;

/** Argumentos de primer nivel de una llamada, balanceando parentesis. */
export function callArguments(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const character of body) {
        if ('([{'.includes(character)) depth++;
        else if (')]}'.includes(character)) depth--;
        if (character === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

/** Cada llamada a `getElement(...)` del contenido, con sus argumentos. */
export function getElementCalls(content: string): { arguments: string[]; text: string }[] {
    const calls: { arguments: string[]; text: string }[] = [];
    const opener = /\bgetElement\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(content))) {
        let depth = 1;
        let index = match.index + match[0].length;
        const start = index;
        while (index < content.length && depth > 0) {
            if (content[index] === '(') depth++;
            else if (content[index] === ')') depth--;
            index++;
        }
        if (depth !== 0) continue;
        const body = content.slice(start, index - 1);
        calls.push({ arguments: callArguments(body), text: body.replace(/\s+/g, ' ').trim() });
    }
    return calls;
}

/** Imports de `.locator.json` con su especificador y el resto de la sentencia. */
function locatorImports(content: string): { identifier: string; source: string; rest: string }[] {
    return [...content.matchAll(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.locator\.json)['"]([^;\n]*)/g
    )].map(match => ({ identifier: match[1], source: match[2], rest: match[3] }));
}

function fileNameOf(specifier: string): string {
    return specifier.split('/').pop() || specifier;
}

/**
 * Forma que debe tener el import.
 *
 * Se deriva del propio especificador —`../../resources/locators/x/y.locator.json`
 * es `@locators/x/y.locator.json`— y por eso cubre tambien los modulos
 * reutilizados, que era el agujero: solo se comprobaba el modulo planificado.
 */
function expectedSpecifier(
    source: string,
    overrides: Record<string, string> = {}
): string | undefined {
    const override = overrides[fileNameOf(source)];
    if (override) return override;
    const match = source.match(/resources\/locators\/(.+\.locator\.json)$/);
    if (match) return `@locators/${match[1]}`;
    return source.startsWith('@locators/') ? source : undefined;
}

/**
 * Comprueba las reglas y devuelve los problemas con la linea ya corregida.
 *
 * El mensaje trae el arreglo porque el agente tiene un solo intento de
 * reparacion: gastarlo copiando una linea que ya viene escrita es buen uso,
 * gastarlo adivinando no.
 */
export function screenObjectProblems(
    content: string,
    rules: ScreenObjectRules
): ScreenObjectProblem[] {
    const problems: ScreenObjectProblem[] = [];
    const source = String(content || '');

    for (const entry of locatorImports(source)) {
        const expected = expectedSpecifier(entry.source, rules.expectedImports);
        if (expected && entry.source !== expected) {
            problems.push({
                code: 'locator-import-alias',
                message: `El import de ${fileNameOf(entry.source)} usa "${entry.source}". `
                    + `Escribe exactamente: import ${entry.identifier} from '${expected}' with { type: 'json' };`,
            });
        }
        if (!JSON_ATTRIBUTE.test(entry.rest)) {
            problems.push({
                code: 'json-import-attribute',
                message: `El import de ${fileNameOf(entry.source)} no lleva el atributo de tipo y Node `
                    + 'lanza al cargarlo. Escribe exactamente: '
                    + `import ${entry.identifier} from '${expected || entry.source}' with { type: 'json' };`,
            });
        }
    }

    const order = rules.platformOrder;
    for (const call of getElementCalls(source)) {
        if (call.arguments.length !== rules.parameterCount) {
            problems.push({
                code: 'getElement-arity',
                message: `getElement(${call.text}) recibe ${call.arguments.length} argumentos y son `
                    + `${rules.parameterCount} siempre, tambien cuando falta una plataforma: `
                    + `${signatureHint(rules)}. Si ${order[0]} no tiene locator, su valor va vacio, `
                    + 'pero el argumento se escribe.',
            });
            continue;
        }
        const typed = new RegExp(`^${rules.typeLocatorSymbol}\\.[A-Z][A-Z0-9_]*$`);
        const wrong = order.flatMap((platform, index) => {
            const problemsHere: string[] = [];
            const type = call.arguments[index * 2];
            const value = call.arguments[index * 2 + 1];
            if (!typed.test(type)) {
                problemsHere.push(
                    `el argumento ${index * 2 + 1} deberia ser ${rules.typeLocatorSymbol}.<ESTRATEGIA> y es "${type}"`
                );
            }
            const other = platform === 'ios' ? 'android' : 'ios';
            // El bloque del JSON nombra su plataforma: `homeIos` / `homeAndroid`.
            if (new RegExp(`${other}\\b`, 'i').test(value) && !new RegExp(`${platform}\\b`, 'i').test(value)) {
                problemsHere.push(
                    `el argumento ${index * 2 + 2} corresponde a ${platform} y apunta a un bloque de ${other}: "${value}"`
                );
            }
            return problemsHere;
        });
        if (wrong.length) {
            problems.push({
                code: 'getElement-order',
                message: `getElement(${call.text}) no respeta la firma ${signatureHint(rules)}: `
                    + `${wrong.join('; ')}.`,
            });
        }
    }
    return problems;
}

/** `getElement(TypeLocator ios, valor ios, TypeLocator android, valor android)`. */
export function signatureHint(rules: Pick<ScreenObjectRules, 'typeLocatorSymbol' | 'platformOrder'>): string {
    const parts = rules.platformOrder.flatMap(platform => [
        `${rules.typeLocatorSymbol}.<${platform.toUpperCase()}>`,
        `<valor ${platform}>`,
    ]);
    return `getElement(${parts.join(', ')})`;
}

export const screenObjectContract = {
    screenObjectProblems,
    signatureHint,
    getElementCalls,
    callArguments,
};
