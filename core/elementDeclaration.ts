/**
 * [visual-recorder] Declaracion de un elemento ya existente en el framework.
 *
 * Al agente se le decia "reutiliza home/home.shortcutTapp" y se le daba el
 * nombre, el selector y la ruta del JSON. Con eso no puede escribir el getter:
 * le falta el TypeLocator, el bloque (`homeAndroid` o `homeIos`) y como se
 * importa ese archivo. Sin esas tres cosas la unica salida es copiar el valor a
 * su propio modulo, que es el duplicado que reporto el reviewer.
 *
 * Reutilizar implica adoptar el nombre existente: `name` es siempre la clave que
 * ya vive en el JSON. Si el valor no coincide con el grabado no hay
 * reutilizacion y el recorder crea un locator nuevo, asi que aqui nunca aparece
 * un nombre inventado.
 */

import path from 'path';
import { aliasImport, frameworkContract } from './frameworkContract';
import { LocatorInfo } from './reuseAnalyzer';
import { ModuleImport } from './locatorStrategy';
import { projectPaths } from './projectPaths';

export type MobilePlatform = 'android' | 'ios';

/**
 * La clave del JSON no viaja aparte: reutilizar implica adoptar el nombre
 * existente, asi que es siempre `name`. El bloque tampoco: es constante por
 * modulo y plataforma, vive en `groups` de la cabecera y ademas se lee dentro
 * de `reference`. Repetirlos en cada elemento costaba un tercio del payload sin
 * agregar informacion.
 */
export interface PlatformDeclaration {
    /** TypeLocator declarado en el getter que lo consume. */
    type?: string;
    value: string;
    /** Expresion exacta que hay que escribir: `HomeLocator.homeAndroid.shortcutTapp`. */
    reference?: string;
    /** Presente solo cuando esa plataforma todavia no tiene locator. */
    status?: 'missing';
}

/** Quien mas depende del elemento: radio de impacto de tocarlo. */
export interface ElementDependents {
    screens: string[];
    steps: string[];
}

export interface ElementDeclaration {
    name: string;
    module: string;
    /** Import por alias; el codigo generado nunca usa rutas relativas. */
    import: string;
    /** Identificador con el que referenciarlo en el Screen Object destino. */
    identifier: string;
    /** El Screen Object destino todavia no importa este modulo. */
    needsImport?: boolean;
    /** Bloque del JSON por plataforma; es constante en todo el modulo. */
    groups: Partial<Record<MobilePlatform, string>>;
    locators: Partial<Record<MobilePlatform, PlatformDeclaration>>;
}

/** El identificador mas usado del modulo; empata por orden de aparicion. */
function preferredIdentifier(entry: ModuleImport | undefined, fallback: string): string {
    if (!entry || !entry.identifiers.size) return fallback;
    return [...entry.identifiers.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** `home/home` -> `HomeLocator`, para modulos que ningun Screen Object importa aun. */
function identifierFromModule(module: string): string {
    const stem = module.split('/').pop() || module;
    const camel = stem.split(/[^A-Za-z0-9]+/).filter(Boolean)
        .map(part => part[0].toUpperCase() + part.slice(1)).join('');
    return `${camel}Locator`;
}

function platformDeclaration(
    locator: LocatorInfo,
    platform: MobilePlatform,
    identifier: string
): PlatformDeclaration {
    const value = platform === 'ios' ? locator.iosSelector : locator.androidSelector;
    const group = platform === 'ios' ? locator.iosBlock : locator.androidBlock;
    const type = platform === 'ios' ? locator.iosStrategy : locator.androidStrategy;
    const declaration: PlatformDeclaration = { value: value || '' };
    if (type) declaration.type = type;
    if (group) declaration.reference = `${identifier}.${group}.${locator.name}`;
    // El agente tiene que saber que ahi no hay nada todavia, no interpretarlo.
    if (!value) declaration.status = 'missing';
    return declaration;
}

export function declareElement(
    locator: LocatorInfo,
    imports: Map<string, ModuleImport>,
    targetScreenImports: Map<string, string> = new Map()
): ElementDeclaration {
    const module = locator.module;
    const entry = imports.get(module);
    // El identificador correcto es el del archivo donde se va a escribir; si el
    // destino no lo importa todavia, el mas usado del framework.
    const alreadyImported = targetScreenImports.get(module);
    const identifier = alreadyImported
        || preferredIdentifier(entry, identifierFromModule(module));
    const relative = path.join('resources', 'locators', `${module}.locator.json`).replace(/\\/g, '/');
    const specifier = aliasImport(relative, frameworkContract(projectPaths.frameworkRoot).aliases)
        || entry?.specifier
        || `@locators/${module}.locator.json`;

    const declaration: ElementDeclaration = {
        name: locator.name,
        module,
        import: specifier,
        identifier,
        groups: {},
        locators: {},
    };
    if (!alreadyImported) declaration.needsImport = true;
    for (const platform of ['android', 'ios'] as MobilePlatform[]) {
        const group = platform === 'ios' ? locator.iosBlock : locator.androidBlock;
        const value = platform === 'ios' ? locator.iosSelector : locator.androidSelector;
        // Sin bloque ni valor el modulo no cubre esa plataforma en absoluto.
        if (!group && !value) continue;
        if (group) declaration.groups[platform] = group;
        declaration.locators[platform] = platformDeclaration(locator, platform, identifier);
    }
    return declaration;
}

/** Un modulo con sus elementos: `import`, `identifier` y `module` se dicen una vez. */
export interface ModuleDeclaration {
    module: string;
    /** Import por alias; el codigo generado nunca usa rutas relativas. */
    import: string;
    /** Identificador con el que referenciarlo en el Screen Object destino. */
    identifier: string;
    /** El Screen Object destino todavia no importa este modulo. */
    needsImport?: boolean;
    /** Bloque del JSON por plataforma; constante para todo el modulo. */
    groups: Partial<Record<MobilePlatform, string>>;
    elements: Array<{
        name: string;
        locators: Partial<Record<MobilePlatform, PlatformDeclaration>>;
        /**
         * Screen Objects y Steps que ya dependen de este locator. Reutilizarlo
         * esta bien; cambiarlo afecta a estos archivos.
         */
        usedBy?: ElementDependents;
    }>;
}

/**
 * Declara TODOS los elementos existentes que el caso toca.
 *
 * No hay tope ni recorte: omitir uno es exactamente el error que se quiere
 * evitar, porque el agente no puede pedir lo que no sabe que existe y termina
 * duplicando. El peso se baja factorizando lo repetido —`module`, `import` e
 * `identifier` se decian en cada elemento aunque cuatro modulos cubran
 * veinticuatro claves—, que sobre un payload real bajo el tamano al 56% sin
 * quitar ni un dato. Si aun asi supera el presupuesto, el paquete avisa; no
 * recorta.
 */
export function declareElements(
    locators: LocatorInfo[],
    imports: Map<string, ModuleImport>,
    targetScreenImports: Map<string, string> = new Map(),
    dependentsOf?: (locator: LocatorInfo) => ElementDependents
): ModuleDeclaration[] {
    const seen = new Set<string>();
    const byModule = new Map<string, ModuleDeclaration>();
    for (const locator of locators) {
        const unique = `${locator.module}#${locator.name}`;
        if (seen.has(unique)) continue;
        seen.add(unique);
        const declaration = declareElement(locator, imports, targetScreenImports);
        let group = byModule.get(locator.module);
        if (!group) {
            group = {
                module: declaration.module,
                import: declaration.import,
                identifier: declaration.identifier,
                ...(declaration.needsImport ? { needsImport: true } : {}),
                groups: declaration.groups,
                elements: [],
            };
            byModule.set(locator.module, group);
        }
        // Un modulo puede cubrir una plataforma en unas claves y no en otras.
        for (const [platform, block] of Object.entries(declaration.groups)) {
            if (block) group.groups[platform as MobilePlatform] = block;
        }
        const dependents = dependentsOf?.(locator);
        group.elements.push({
            name: declaration.name,
            locators: declaration.locators,
            // Solo cuando aporta: que su propio Screen Object lo use es obvio.
            ...(dependents && (dependents.screens.length + dependents.steps.length)
                ? { usedBy: dependents }
                : {}),
        });
    }
    return [...byModule.values()];
}

export const elementDeclarations = { declareElement, declareElements };
