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
    code: 'json-import-attribute' | 'locator-import-alias' | 'getElement-arity'
        | 'getElement-order' | 'type-locator-import' | 'helper-method'
        | 'screen-alias' | 'screen-singleton-name' | 'screen-class-name'
        | 'locator-import-identifier' | 'locator-bracket-notation';
    message: string;
}

export const SCREEN_OBJECT_CONTRACT_RULE_CODES: ScreenObjectProblem['code'][] = [
    'json-import-attribute',
    'locator-import-alias',
    'getElement-arity',
    'getElement-order',
    'type-locator-import',
    'helper-method',
    'screen-alias',
    'screen-singleton-name',
    'screen-class-name',
    'locator-import-identifier',
    'locator-bracket-notation',
];

export interface ScreenObjectRules {
    /** Nombre del enum de estrategias en ESTE framework (`TypeLocator`). */
    typeLocatorSymbol: string;
    /** Modulo del que se importa ese enum; opcional solo para tests. */
    typeLocatorImport?: string;
    /**
     * API real de los helpers que BaseScreen expone, leida del framework.
     * Sin esto no se puede afirmar que `this.uiHelper.scrollDown()` no existe.
     */
    helpers?: Array<{ property: string; methods: string[] }>;
    /** Orden de plataformas que declara la firma de `getElement`. */
    platformOrder: ('android' | 'ios')[];
    parameterCount: number;
    /**
     * Override del import esperado por nombre de archivo. Es opcional porque la
     * forma correcta se deriva del propio especificador; sirve cuando el paquete
     * ya la trae escrita.
     */
    expectedImports?: Record<string, string>;
    /** Identificador obligatorio por nombre de `.locator.json`. */
    expectedIdentifiers?: Record<string, string>;
    /** Nombres esperados del Screen Object para esta ruta planificada. */
    expectedNames?: {
        className: string;
        instanceName: string;
        importSource?: string;
        baseScreenClass?: string;
    };
    /** Steps propuestos, usado para validar alias importado del Screen Object. */
    stepsContent?: string;
}

const GENERIC_SCREEN_ALIASES = new Set([
    'generatedScreen', 'screen', 'page', 'screenObject', 'obj',
]);

function pascalCase(value: string): string {
    return value
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(segment => segment[0].toUpperCase() + segment.slice(1))
        .join('');
}

/**
 * Alias semantico de un locator JSON.
 *
 * `movements.locator.json` -> `LocatorMovements`
 * `movements-cases.locator.json` -> `LocatorMovementsCases`
 */
export function locatorImportIdentifier(moduleOrPath: string): string {
    const normalized = String(moduleOrPath || '').replace(/\\/g, '/');
    const fileName = normalized.split('/').pop() || normalized;
    const moduleName = fileName
        .replace(/\.locator\.json$/i, '')
        .replace(/\.json$/i, '');
    const baseName = pascalCase(moduleName);
    if (!baseName) throw new Error(`No se pudo derivar el alias locator de ${moduleOrPath}`);
    return `Locator${baseName}`;
}

export function screenObjectNames(moduleOrPath: string): {
    moduleName: string;
    className: string;
    instanceName: string;
} {
    const normalized = String(moduleOrPath || '').replace(/\\/g, '/');
    const fileName = normalized.split('/').pop() || normalized;
    const moduleName = fileName
        .replace(/\.screen\.(?:ts|js)$/i, '')
        .replace(/\.screen$/i, '');
    const baseName = pascalCase(moduleName);
    if (!baseName) throw new Error(`No se pudo derivar un nombre semántico de ${moduleOrPath}`);
    const className = `${baseName}Screen`;
    return {
        moduleName,
        className,
        instanceName: `${className[0].toLowerCase()}${className.slice(1)}`,
    };
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
 * El enum de estrategias es un export NOMBRADO.
 *
 * Importarlo por defecto no compila —el modulo no tiene default— y ademas
 * invalida cualquier analisis del getter: el validador deja de reconocer
 * `TypeLocator.X` y dispara errores sobre "el par primary" que no nombran el
 * problema real, que esta en la linea del import. Por eso se expone aparte:
 * cuando esta rota, las comprobaciones que dependen de los tipos no se corren.
 */
export function typeLocatorImportProblem(
    content: string,
    rules: Pick<ScreenObjectRules, 'typeLocatorSymbol' | 'typeLocatorImport'>
): ScreenObjectProblem | undefined {
    const source = String(content || '');
    const symbol = rules.typeLocatorSymbol;
    if (!new RegExp(`\\b${symbol}\\s*\\.`).test(source)) return undefined;
    if (new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`).test(source)) return undefined;
    const byDefault = new RegExp(`import\\s+${symbol}\\s*(?:,|from)`).test(source);
    const from = rules.typeLocatorImport ? ` from '${rules.typeLocatorImport}'` : '';
    return {
        code: 'type-locator-import',
        message: byDefault
            ? `${symbol} es un export nombrado, no un default: \`import ${symbol}${from}\` no compila. `
                + `Escribe exactamente: import { ${symbol} }${from};`
            : `El Screen Object usa ${symbol} pero no lo importa. `
                + `Escribe exactamente: import { ${symbol} }${from};`,
    };
}

/**
 * Llamadas a metodos de helper que no existen.
 *
 * El caso real: `this.uiHelper.scrollDown()`. El metodo existe, pero en
 * `gestureHelper`. Compila mal y el fallo aparecia recien al construir el
 * framework, fuera del pipeline. Cuando el metodo vive en otro helper el
 * mensaje lo dice, que es el arreglo entero.
 */
export function helperMethodProblems(
    content: string,
    helpers: Array<{ property: string; methods: string[] }> = []
): ScreenObjectProblem[] {
    if (!helpers.length) return [];
    const byProperty = new Map(helpers.map(helper => [helper.property, new Set(helper.methods)]));
    const problems: ScreenObjectProblem[] = [];
    const seen = new Set<string>();
    for (const [, property, method] of String(content || '').matchAll(
        /\bthis\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g
    )) {
        const known = byProperty.get(property);
        if (!known || known.has(method)) continue;
        const unique = `${property}.${method}`;
        if (seen.has(unique)) continue;
        seen.add(unique);
        const owner = helpers.find(helper => helper.property !== property
            && helper.methods.includes(method));
        problems.push({
            code: 'helper-method',
            message: owner
                ? `this.${property}.${method}() no existe: ${method} vive en ${owner.property}. `
                    + `Escribe this.${owner.property}.${method}(...).`
                : `this.${property}.${method}() no existe y ningun helper del framework lo tiene. `
                    + `Los metodos de ${property} son: ${[...known].sort().join(', ')}. `
                    + 'Si necesitas algo que no esta, escribelo como un metodo del propio Screen '
                    + 'Object para que quede reutilizable; no inventes una llamada al helper.',
        });
    }
    return problems;
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
    const expected = rules.expectedNames;

    if (expected?.className) {
        const classPattern = expected.baseScreenClass
            ? new RegExp(`class\\s+${expected.className}\\s+extends\\s+${expected.baseScreenClass}\\b`)
            : new RegExp(`class\\s+${expected.className}\\b`);
        if (!classPattern.test(source)) {
            problems.push({
                code: 'screen-class-name',
                message: expected.baseScreenClass
                    ? `Clase Screen Object inválida: esperado ${expected.className} extends ${expected.baseScreenClass}.`
                    : `Clase Screen Object inválida. Esperado: ${expected.className}.`,
            });
        }
        if (!new RegExp(`export\\s+default\\s+new\\s+${expected.className}\\s*\\(`).test(source)) {
            problems.push({
                code: 'screen-singleton-name',
                message: `Singleton Screen Object inválido: esperado ${expected.className}.`,
            });
        }
    }
    if (expected?.instanceName) {
        const imports = [...String(rules.stepsContent || '').matchAll(
            /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.screen\.(?:ts|js))['"]/gm
        )];
        const selected = expected.importSource
            ? imports.find(match => match[2] === expected.importSource)
            : imports[0];
        const alias = selected?.[1];
        if (!alias || GENERIC_SCREEN_ALIASES.has(alias) || alias !== expected.instanceName) {
            problems.push({
                code: 'screen-alias',
                message: `Alias Screen Object inválido: ${alias || 'ausente'}. Esperado: ${expected.instanceName}.`,
            });
        }
    }

    for (const entry of locatorImports(source)) {
        const expected = expectedSpecifier(entry.source, rules.expectedImports);
        const expectedIdentifier = rules.expectedIdentifiers?.[fileNameOf(entry.source)];
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
        if (expectedIdentifier && entry.identifier !== expectedIdentifier) {
            problems.push({
                code: 'locator-import-identifier',
                message: `El import de ${fileNameOf(entry.source)} usa el identificador "${entry.identifier}". `
                    + `Escribe exactamente "${expectedIdentifier}" y accede con notacion de punto: `
                    + `${expectedIdentifier}.<moduloAndroid|moduloIos>.<nombreLocator>.`,
            });
        }
        const escapedIdentifier = entry.identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escapedIdentifier}\\s*(?:\\.\\s*)?\\[`).test(source)) {
            problems.push({
                code: 'locator-bracket-notation',
                message: `El locator ${entry.identifier} usa corchetes. Usa solamente notacion de punto: `
                    + `${expectedIdentifier || entry.identifier}.<moduloAndroid|moduloIos>.<nombreLocator>.`,
            });
        }
    }

    const enumImport = typeLocatorImportProblem(source, rules);
    if (enumImport) problems.push(enumImport);

    for (const problem of helperMethodProblems(source, rules.helpers)) problems.push(problem);

    const order = rules.platformOrder;
    for (const call of getElementCalls(source)) {
        if (call.arguments.length !== rules.parameterCount) {
            problems.push({
                code: 'getElement-arity',
                message: `getElement(${call.text}) recibe ${call.arguments.length} argumentos y son `
                    + `${rules.parameterCount} siempre, tambien cuando falta una plataforma: `
                    + `${signatureHint(rules)}. Si ${order[0]} no tiene selector aun, igual referencia `
                    + `la clave del locator ${order[0]} (con '' en JSON), nunca un literal vacio.`,
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
            if (/^['"]\s*['"]$/.test(value.trim())) {
                problemsHere.push(
                    `el argumento ${index * 2 + 2} de ${platform} no puede ser literal vacío: `
                    + 'debe apuntar a la clave del locator JSON para esa plataforma'
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
    helperMethodProblems,
    typeLocatorImportProblem,
    signatureHint,
    getElementCalls,
    callArguments,
    screenObjectNames,
    locatorImportIdentifier,
    SCREEN_OBJECT_CONTRACT_RULE_CODES,
};
