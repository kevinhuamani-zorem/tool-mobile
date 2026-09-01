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
import { projectPaths, composeLocator, frameworkContract, FrameworkContract } from '../../workspace';

export type MobilePlatform = 'android' | 'ios';

/**
 * Miembros de `TypeLocator` que el recorder sabe emitir. Es un union y no
 * `string` para que un tipo inventado no llegue al Screen Object generado; el
 * framework decide como se llama el enum, pero no que estrategias existen.
 */
export type LocatorTypeName =
    'ID' | 'XPATH' | 'ANDROID' | 'CLASSNAME' | 'PREDICATESTRING' | 'CLASSCHAIN';

export interface FrameworkLocator {
    /** Miembro de `TypeLocator` con el que el framework compone el selector. */
    type: LocatorTypeName;
    /** Valor tal cual va al JSON de locators, sin prefijo. */
    value: string;
}

/**
 * Traduce un selector grabado al par `(TypeLocator, valor)` que el framework
 * sabe componer.
 *
 * No es un simple recorte de prefijo. El inspector emitia `id=<resource-id>`
 * porque WebdriverIO lo entiende al grabar, pero `TypeLocator` no tiene
 * estrategia de resource-id: al reconstruirlo salia `~com.yape.qa:id/btn`
 * (accesibilidad) o `com.yape.qa:id/btn` (XPath invalido), y el codigo generado
 * no encontraba el elemento nunca. Aqui se convierte a la forma que el
 * framework SI compone:
 *
 *   id=com.yape.qa:id/btnFiltrar -> ANDROID  new UiSelector().resourceId("...")
 *   id=btnCompose                -> XPATH    //*[@resource-id="btnCompose"]
 *
 * La primera es la forma mayoritaria del framework para resource-id (33 usos
 * de UiSelector contra 18 de XPath), asi que el codigo generado se parece al
 * que ya esta escrito a mano.
 */
export function frameworkLocator(selector = '', platform: MobilePlatform = 'android'): FrameworkLocator {
    const raw = String(selector).trim().replace(/\s+/g, ' ');
    if (!raw) return { type: 'XPATH', value: '' };

    if (raw.startsWith('id=')) {
        const resourceId = raw.slice(3);
        // Un id de Compose no lleva paquete ni `/`: UiAutomator lo resuelve
        // igual, pero el XPath ya estaba probado en este repo, asi que se
        // conserva.
        const qualified = resourceId.includes('/') || resourceId.includes(':');
        if (platform === 'android' && qualified) {
            return { type: 'ANDROID', value: `new UiSelector().resourceId("${resourceId}")` };
        }
        return { type: 'XPATH', value: `//*[@resource-id="${resourceId}"]` };
    }
    if (raw.startsWith('~')) return { type: 'ID', value: raw.slice(1) };
    if (raw.startsWith('android=')) return { type: 'ANDROID', value: raw.slice('android='.length) };
    if (raw.startsWith('iosPredicate=')) {
        return { type: 'PREDICATESTRING', value: raw.slice('iosPredicate='.length) };
    }
    if (raw.startsWith('iosClassChain=')) {
        return { type: 'CLASSCHAIN', value: raw.slice('iosClassChain='.length) };
    }
    if (raw.startsWith('class=')) return { type: 'CLASSNAME', value: raw.slice('class='.length) };
    // Formas nativas del framework: ya vienen compuestas.
    if (raw.startsWith('-ios predicate string:')) {
        return { type: 'PREDICATESTRING', value: raw.slice('-ios predicate string:'.length).trim() };
    }
    if (raw.startsWith('-ios class chain:')) {
        return { type: 'CLASSCHAIN', value: raw.slice('-ios class chain:'.length).trim() };
    }
    if (/^new\s+(?:UiSelector|UiScrollable)\s*\(/.test(raw)) return { type: 'ANDROID', value: raw };
    return { type: 'XPATH', value: raw };
}

/** Estrategia que le corresponde a un selector grabado. */
export function strategyOf(selector: string, platform: MobilePlatform): LocatorTypeName {
    return frameworkLocator(selector, platform).type;
}

/**
 * Valor tal como se guarda en el JSON de locators.
 *
 * Es el complemento de `strategyOf`: el par que devuelven los dos tiene que
 * recomponer el selector original. Por eso pasa por `frameworkLocator` en vez
 * de recortar el prefijo — recortarlo dejaba `id=` sin traducir.
 */
export function strategyValue(selector = '', platform: MobilePlatform = 'android'): string {
    return frameworkLocator(selector, platform).value;
}

export interface RoundTrip {
    type: LocatorTypeName;
    value: string;
    /** Selector que el framework producira, o `undefined` si no sabe componerlo. */
    composed?: string;
    ok: boolean;
    reason?: string;
}

/**
 * Comprueba que el par `(TypeLocator, valor)` que se va a escribir en el Screen
 * Object y en el JSON reconstruye un selector equivalente al grabado.
 *
 * La comprobacion es de ida y vuelta: se compone con la tabla real del
 * framework y se vuelve a interpretar. Si al reinterpretarlo no sale el mismo
 * par, el codigo generado apuntaria a otra cosa. Esto es lo que dejaba pasar
 * `id=com.yape.qa:id/btn` -> `~com.yape.qa:id/btn`: dos strings distintos que
 * nadie comparaba hasta que fallaba wdio.
 *
 * Es un chequeo offline y estructural; no sustituye a verificar contra el
 * dispositivo, que es lo que hace `verify-selector`.
 */
export function roundTrip(
    selector: string,
    platform: MobilePlatform,
    contract: Pick<FrameworkContract, 'locatorComposition'> = frameworkContract(projectPaths.frameworkRoot)
): RoundTrip {
    const { type, value } = frameworkLocator(selector, platform);
    if (!value) {
        return { type, value, ok: false, reason: 'El selector esta vacio.' };
    }
    const composed = composeLocator(contract, type, value, platform);
    if (composed === undefined) {
        return {
            type, value, ok: false,
            reason: `El framework no compone TypeLocator.${type} en ${platform}: `
                + 'no hay caso para esa estrategia en la clase resolutora.',
        };
    }
    if (type === 'XPATH' && !/^[(/]/.test(value)) {
        return {
            type, value, composed, ok: false,
            reason: `XPATH se compone sin prefijo, asi que "${value}" llegaria a wdio tal cual `
                + 'y no es un XPath valido.',
        };
    }
    const again = frameworkLocator(composed, platform);
    if (again.type !== type || again.value !== value) {
        return {
            type, value, composed, ok: false,
            reason: `"${selector}" se compone como "${composed}", que se relee como `
                + `TypeLocator.${again.type} en vez de TypeLocator.${type}.`,
        };
    }
    return { type, value, composed, ok: true };
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
    frameworkLocator, roundTrip, strategyOf, strategyValue, inferredStrategy,
    indexDeclaredStrategies, indexModuleImports, importsOf,
};
