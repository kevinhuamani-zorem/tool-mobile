/**
 * [visual-recorder] Resolucion de los anclajes estructurales del framework.
 *
 * BaseScreen, LocatorFactory y el enum TypeLocator estaban escritos como
 * literales en tres sitios distintos (generador, validador e instrucciones del
 * agente) sin ninguna comprobacion contra el disco. Si alguien movia
 * `base.screen.ts` o renombraba el alias `@utils`, el recorder seguia emitiendo
 * el import viejo y TODAS las capas lo daban por bueno: `transpileModule` no
 * resuelve modulos, el validador comparaba contra su propia constante y el
 * verificador solo miraba que el import no fuera relativo. El fallo aparecia
 * recien al correr wdio.
 *
 * Aqui se resuelven leyendo el framework: los alias salen de su tsconfig y los
 * anclajes se buscan por su declaracion, no por su ruta.
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

export interface FrameworkContract {
    /** Prefijo de alias -> directorio relativo. `@utils` -> `support/utils`. */
    aliases: Record<string, string>;
    baseScreenImport: string;
    baseScreenClass: string;
    locatorFactoryImport: string;
    typeLocatorImport: string;
    /** Anclajes que no se encontraron y quedaron en su valor por defecto. */
    warnings: string[];
}

/**
 * Ultimo recurso cuando el framework no se deja leer (tsconfig ausente o
 * ilegible, ancla no encontrada): la convencion de fwk-mobile tal como estaba
 * escrita a mano. Se acompana siempre de un warning; nunca se usa en silencio.
 */
const DEFAULTS = {
    aliases: {
        '@config': 'config',
        '@features': 'features',
        '@resources': 'resources',
        '@locators': 'resources/locators',
        '@screenobjects': 'screenobjects',
        '@utils': 'support/utils',
        '@support': 'support',
    } as Record<string, string>,
    baseScreenImport: '@screenobjects/commons/base.screen.ts',
    baseScreenClass: 'BaseScreen',
    locatorFactoryImport: '@utils/LocatorFactory.ts',
    typeLocatorImport: '@utils/Enums.ts',
};

const SCAN_ROOTS = ['screenobjects', 'support', 'features'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'tools', 'runtime']);

function readAliases(frameworkRoot: string): { aliases: Record<string, string>; found: boolean } {
    const file = path.join(frameworkRoot, 'tsconfig.json');
    if (!fs.existsSync(file)) return { aliases: { ...DEFAULTS.aliases }, found: false };
    // El tsconfig del framework trae comentarios, asi que JSON.parse falla.
    const parsed = ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf-8'));
    const paths = parsed.config?.compilerOptions?.paths;
    if (!paths || typeof paths !== 'object') return { aliases: { ...DEFAULTS.aliases }, found: false };
    const aliases: Record<string, string> = {};
    for (const [pattern, targets] of Object.entries(paths as Record<string, string[]>)) {
        const target = Array.isArray(targets) ? targets[0] : undefined;
        if (!pattern.endsWith('/*') || typeof target !== 'string' || !target.endsWith('/*')) continue;
        aliases[pattern.slice(0, -2)] = target.slice(0, -2).replace(/^\.\//, '');
    }
    return Object.keys(aliases).length
        ? { aliases, found: true }
        : { aliases: { ...DEFAULTS.aliases }, found: false };
}

function walk(directory: string, onFile: (file: string) => void): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
            walk(path.join(directory, entry.name), onFile);
        } else if (/\.tsx?$/.test(entry.name)) {
            onFile(path.join(directory, entry.name));
        }
    }
}

/** Convierte una ruta relativa del framework en un import por alias. */
export function aliasImport(relative: string, aliases: Record<string, string>): string | undefined {
    const normalized = relative.replace(/\\/g, '/').replace(/^\.\//, '');
    // El alias mas especifico gana: `@locators` (resources/locators) antes que
    // `@resources` (resources).
    const match = Object.entries(aliases)
        .filter(([, directory]) => normalized === directory || normalized.startsWith(`${directory}/`))
        .sort((a, b) => b[1].length - a[1].length)[0];
    if (!match) return undefined;
    const [alias, directory] = match;
    return `${alias}/${normalized.slice(directory.length + 1)}`;
}

function resolve(frameworkRoot: string): FrameworkContract {
    const { aliases, found } = readAliases(frameworkRoot);
    const warnings: string[] = [];
    if (!found) {
        warnings.push(
            'No se pudo leer compilerOptions.paths del tsconfig del framework: ' +
            'se usan los alias por convencion.'
        );
    }

    // Se busca por la declaracion, no por la ruta: asi mover el archivo no rompe.
    const anchors: Record<string, { pattern: RegExp; file?: string; capture?: string }> = {
        baseScreen: { pattern: /export\s+default\s+abstract\s+class\s+([A-Za-z_$][\w$]*)/ },
        locatorFactory: { pattern: /export\s+default\s+class\s+LocatorFactory\b/ },
        typeLocator: { pattern: /export\s+enum\s+TypeLocator\b/ },
    };
    const pending = new Set(Object.keys(anchors));
    for (const root of SCAN_ROOTS) {
        if (!pending.size) break;
        walk(path.join(frameworkRoot, root), file => {
            if (!pending.size) return;
            let content: string;
            try {
                content = fs.readFileSync(file, 'utf-8');
            } catch {
                return;
            }
            for (const key of [...pending]) {
                const match = content.match(anchors[key].pattern);
                if (!match) continue;
                anchors[key].file = path.relative(frameworkRoot, file).replace(/\\/g, '/');
                anchors[key].capture = match[1];
                pending.delete(key);
            }
        });
    }

    const importFor = (key: string, fallback: string): string => {
        const relative = anchors[key].file;
        const specifier = relative ? aliasImport(relative, aliases) : undefined;
        if (!specifier) {
            warnings.push(`No se encontró ${key} en el framework: se usa ${fallback}.`);
            return fallback;
        }
        return specifier;
    };

    return {
        aliases,
        baseScreenImport: importFor('baseScreen', DEFAULTS.baseScreenImport),
        baseScreenClass: anchors.baseScreen.capture || DEFAULTS.baseScreenClass,
        locatorFactoryImport: importFor('locatorFactory', DEFAULTS.locatorFactoryImport),
        typeLocatorImport: importFor('typeLocator', DEFAULTS.typeLocatorImport),
        warnings,
    };
}

/**
 * Firma barata del arbol para invalidar la cache. El mtime de un directorio
 * cambia cuando se agrega, borra o mueve un archivo dentro, que es justo el
 * caso que hay que detectar; el tsconfig se vigila por contenido.
 */
function signature(frameworkRoot: string): string {
    const stamps = [path.join(frameworkRoot, 'tsconfig.json'), ...SCAN_ROOTS.map(root =>
        path.join(frameworkRoot, root))]
        .map(target => {
            try {
                return String(fs.statSync(target).mtimeMs);
            } catch {
                return '0';
            }
        });
    return stamps.join('|');
}

const cache = new Map<string, { signature: string; contract: FrameworkContract }>();

/**
 * Resuelve el contrato del framework, recalculandolo cuando el arbol cambia.
 * Se llama una vez por grabacion, no una vez por proceso, para que mover un
 * anclaje se refleje sin reiniciar el recorder.
 */
export function frameworkContract(frameworkRoot: string): FrameworkContract {
    const current = signature(frameworkRoot);
    const cached = cache.get(frameworkRoot);
    if (cached && cached.signature === current) return cached.contract;
    const contract = resolve(frameworkRoot);
    cache.set(frameworkRoot, { signature: current, contract });
    return contract;
}

/** Solo para tests: fuerza una nueva resolucion. */
export function clearFrameworkContractCache(): void {
    cache.clear();
}
