/**
 * [visual-recorder] Estrategia declarada de cada locator.
 *
 * El JSON de locators guarda solo el VALOR; la estrategia (`TypeLocator.ID`,
 * `XPATH`, `ANDROID`...) vive en el getter del Screen Object que lo consume.
 * Sin cruzar las dos cosas no se puede decidir si un locator existente sirve:
 * el mismo texto con otra estrategia es otro selector.
 */

import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';

export type MobilePlatform = 'android' | 'ios';

/** Estrategia que le corresponde a un selector grabado. */
export function strategyOf(selector: string, platform: MobilePlatform): string {
    if (/^id=[^/:]+$/.test(selector)) return 'XPATH';
    if (selector.startsWith('android=')) return 'ANDROID';
    if (selector.startsWith('iosPredicate=')) return 'PREDICATESTRING';
    if (selector.startsWith('iosClassChain=')) return 'CLASSCHAIN';
    if (selector.startsWith('class=')) return 'CLASSNAME';
    if (selector.startsWith('id=') || selector.startsWith('~')) return 'ID';
    if (platform === 'android' && selector.includes('new UiSelector')) return 'ANDROID';
    return 'XPATH';
}

/**
 * Valor tal como se guarda en el JSON: el selector sin el prefijo que le pone
 * WebdriverIO. `~Tapp` -> `Tapp`; `android=new UiSelector()...` -> `new UiSelector()...`.
 */
export function strategyValue(selector = ''): string {
    return String(selector)
        .trim()
        .replace(/^(?:~|id=|android=|iosPredicate=|iosClassChain=|class=)/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Estrategia que el propio valor determina, o `undefined` si es ambiguo.
 *
 * La ambiguedad existe solo con valores pelados: `"Tapp"` es `~Tapp` bajo ID
 * pero un XPath roto bajo XPATH, asi que ahi hace falta la declaracion del
 * getter. Un valor que trae su sintaxis (`//nodo[...]`, `new UiSelector()...`)
 * se resuelve igual lo declare quien lo declare.
 */
export function inferredStrategy(value = ''): string | undefined {
    const raw = String(value).trim();
    if (!raw) return undefined;
    if (/^\/\//.test(raw) || /^\//.test(raw)) return 'XPATH';
    if (/^new\s+UiSelector\(\)/.test(raw)) return 'ANDROID';
    if (/^\*\*|^\*\*\//.test(raw)) return 'CLASSCHAIN';
    if (/^\w+\s*==|CONTAINS|BEGINSWITH/i.test(raw) && /["']/.test(raw)) return 'PREDICATESTRING';
    return undefined;
}

export interface DeclaredStrategies {
    android?: string;
    ios?: string;
}

/**
 * Argumentos de cada `getElement(...)`, balanceando parentesis.
 *
 * Un corte al primer `)` parte la llamada cuando un argumento trae uno propio,
 * como `Locators.x.y.replace('{options}', options)`, y se pierde el par de la
 * segunda plataforma.
 */
function getElementCalls(content: string): string[] {
    const calls: string[] = [];
    const opener = /getElement\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = opener.exec(content))) {
        let depth = 1;
        let index = match.index + match[0].length;
        const start = index;
        while (index < content.length && depth > 0) {
            const character = content[index];
            if (character === '(') depth++;
            else if (character === ')') depth--;
            index++;
        }
        if (depth === 0) calls.push(content.slice(start, index - 1));
    }
    return calls;
}

function walkScreens(directory: string, onFile: (file: string) => void): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walkScreens(target, onFile);
        else if (/\.screen\.tsx?$/.test(entry.name)) onFile(target);
    }
}

/** `@locators/interoperabilidad/tapp-subhome.locator.json` -> `interoperabilidad/tapp-subhome`. */
function moduleFromSpecifier(specifier: string): string | undefined {
    const match = specifier.match(/([^'"/]+\/)*([^'"/]+)\.locator\.json$/);
    if (!match) return undefined;
    return specifier
        .replace(/^.*?locators\//, '')
        .replace(/^\.{1,2}\//, '')
        .replace(/\.locator\.json$/, '');
}

/**
 * Indice `<modulo>#<clave>` -> estrategias declaradas por plataforma.
 *
 * Se clava en el modulo y no en el nombre del bloque porque los bloques se
 * repiten entre archivos: hay 13 `menuAndroid` distintos en este framework.
 */
export function indexDeclaredStrategies(
    screensRoot = projectPaths.screenobjects
): Map<string, DeclaredStrategies> {
    const index = new Map<string, DeclaredStrategies>();
    walkScreens(screensRoot, file => {
        let content: string;
        try {
            content = fs.readFileSync(file, 'utf-8');
        } catch {
            return;
        }
        const modules = [...content.matchAll(/from\s+['"]([^'"]+\.locator\.json)['"]/g)]
            .map(match => moduleFromSpecifier(match[1]))
            .filter((value): value is string => Boolean(value));
        if (!modules.length) return;

        // `getElement(TypeLocator.A, <expr ios>, TypeLocator.B, <expr android>)`.
        // La plataforma se lee del bloque que nombra cada expresion, no del
        // orden, porque no todos los Screen Objects lo respetan.
        for (const pairs of getElementCalls(content)) {
            for (const [, strategy, expression] of pairs.matchAll(
                /[A-Za-z_$][\w$]*\.([A-Z][A-Z0-9_]*)\s*,\s*([^,)]+)/g
            )) {
                const reference = expression.match(
                    /\[\s*['"]([^'"]+)['"]\s*\]\s*\.\s*([A-Za-z_$][\w$]*)|\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/
                );
                if (!reference) continue;
                const block = (reference[1] || reference[3] || '').toLowerCase();
                const key = reference[2] || reference[4];
                if (!key) continue;
                const platform: MobilePlatform | undefined = block.endsWith('android')
                    ? 'android'
                    : block.endsWith('ios') ? 'ios' : undefined;
                if (!platform) continue;
                for (const module of modules) {
                    const entry = index.get(`${module}#${key}`) || {};
                    entry[platform] = strategy;
                    index.set(`${module}#${key}`, entry);
                }
            }
        }
    });
    return index;
}

export interface ModuleImport {
    /** Especificador tal como lo escriben los Screen Objects del framework. */
    specifier: string;
    /** Identificador -> cuantos Screen Objects lo usan. Hay modulos con dos. */
    identifiers: Map<string, number>;
}

/**
 * Como importa el framework cada modulo de locators.
 *
 * `reference` no es global: 6 de los 71 modulos de este repo se importan con dos
 * identificadores distintos (`home/home` es `HomeLocator` en un Screen Object y
 * `LocatorHome` en otro). Se guardan todos con su frecuencia para poder elegir
 * el del archivo destino y, si no lo importa todavia, el mas usado.
 */
export function indexModuleImports(screensRoot = projectPaths.screenobjects): Map<string, ModuleImport> {
    const index = new Map<string, ModuleImport>();
    walkScreens(screensRoot, file => {
        let content: string;
        try {
            content = fs.readFileSync(file, 'utf-8');
        } catch {
            return;
        }
        for (const [, identifier, specifier] of content.matchAll(
            /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.locator\.json)['"]/g
        )) {
            const module = moduleFromSpecifier(specifier);
            if (!module) continue;
            const entry = index.get(module) || { specifier, identifiers: new Map<string, number>() };
            // Se prefiere el especificador por alias sobre el relativo.
            if (specifier.startsWith('@') && !entry.specifier.startsWith('@')) entry.specifier = specifier;
            entry.identifiers.set(identifier, (entry.identifiers.get(identifier) || 0) + 1);
            index.set(module, entry);
        }
    });
    return index;
}

/** Identificadores que un Screen Object concreto ya tiene importados, por modulo. */
export function importsOf(screenFile: string): Map<string, string> {
    const found = new Map<string, string>();
    let content: string;
    try {
        content = fs.readFileSync(screenFile, 'utf-8');
    } catch {
        return found;
    }
    for (const [, identifier, specifier] of content.matchAll(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.locator\.json)['"]/g
    )) {
        const module = moduleFromSpecifier(specifier);
        if (module) found.set(module, identifier);
    }
    return found;
}

export const locatorStrategy = {
    strategyOf, strategyValue, inferredStrategy, indexDeclaredStrategies,
    indexModuleImports, importsOf,
};
