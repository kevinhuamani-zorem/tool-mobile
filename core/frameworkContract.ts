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
    /**
     * Nombre real de la clase que resuelve locators. El framework la renombro de
     * `LocatorFactory` a `LocatorProvider`, y el generador la escribe en cada
     * getter: sin esto emite codigo que no compila.
     */
    locatorFactorySymbol: string;
    typeLocatorImport: string;
    typeLocatorSymbol: string;
    /**
     * Extension con la que el framework importa Screen Objects. Es la que usan
     * los Steps generados; los anclajes traen la suya, que puede diferir.
     */
    importExtension: string;
    /**
     * Firma real de `getElement`: cuantos argumentos recibe y en que orden van
     * las plataformas. El agente la adivinaba —a veces mandaba el locator antes
     * que el TypeLocator, a veces omitia iOS— y nadie lo comprobaba.
     */
    locatorSignature: LocatorSignature;
    /**
     * Import del helper de timeout por entorno, o `undefined` si el framework
     * no lo expone. El patron documentado de Screen Object lo usa para las
     * verificaciones: sin el hay que caer a un helper con timeout por defecto.
     */
    timeoutHelperImport?: string;
    timeoutHelperSymbol?: string;
    /**
     * Como compone el framework cada `TypeLocator`, leido del `switch` de la
     * clase resolutora y de las constantes que concatena.
     * `android.ANDROID` -> `{ prefix: 'android=', suffix: '' }`.
     */
    locatorComposition: LocatorComposition;
    /** Anclajes que no se encontraron y quedaron en su valor por defecto. */
    warnings: string[];
}

/** Envoltura literal alrededor del valor del locator. */
export interface CompositionRule {
    prefix: string;
    suffix: string;
}

export type LocatorComposition = Record<'android' | 'ios', Record<string, CompositionRule>>;

export interface LocatorSignature {
    /** Numero de argumentos: 2 por plataforma (tipo y valor). */
    parameterCount: number;
    /** Orden en que la firma espera las plataformas. */
    platformOrder: ('android' | 'ios')[];
}

const DEFAULT_SIGNATURE: LocatorSignature = {
    parameterCount: 4,
    platformOrder: ['ios', 'android'],
};

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
    locatorFactorySymbol: 'LocatorFactory',
    typeLocatorImport: '@utils/Enums.ts',
    typeLocatorSymbol: 'TypeLocator',
    importExtension: '.ts',
    locatorComposition: {
        android: {
            ID:        { prefix: '~', suffix: '' },
            XPATH:     { prefix: '', suffix: '' },
            ANDROID:   { prefix: 'android=', suffix: '' },
            CLASSNAME: { prefix: 'android=.className(', suffix: ')' },
        },
        ios: {
            ID:              { prefix: '~', suffix: '' },
            XPATH:           { prefix: '', suffix: '' },
            PREDICATESTRING: { prefix: '-ios predicate string:', suffix: '' },
            CLASSCHAIN:      { prefix: '-ios class chain:', suffix: '' },
            CLASSNAME:       { prefix: 'ios=.className(', suffix: ')' },
        },
    } as LocatorComposition,
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

interface ExtensionCounts { '.ts': number; '.js': number }

/**
 * Como escribe el framework sus imports internos, por destino.
 *
 * `allowImportingTsExtensions` deja convivir `.ts` y `.js`, y este repo usa las
 * dos con criterios distintos: los Screen Objects importan la infra comun con
 * `.js` (74 de 74) pero los Steps importan Screen Objects con `.ts` (115 de
 * 123). Una sola extension global generaria imports que no se parecen a los que
 * ya estan, asi que se indexa por ruta y se cae al prefijo de alias.
 */
class ExtensionIndex {
    private readonly byPath = new Map<string, ExtensionCounts>();
    private readonly byAlias = new Map<string, ExtensionCounts>();
    private readonly total: ExtensionCounts = { '.ts': 0, '.js': 0 };

    constructor(frameworkRoot: string) {
        for (const root of ['screenobjects', 'features', 'support']) {
            walk(path.join(frameworkRoot, root), file => this.indexFile(file));
        }
    }

    private indexFile(file: string): void {
        let content: string;
        try {
            content = fs.readFileSync(file, 'utf-8');
        } catch {
            return;
        }
        for (const [, specifier] of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const extension = specifier.endsWith('.ts') ? '.ts' : specifier.endsWith('.js') ? '.js' : '';
            if (!extension) continue;
            const bare = specifier.slice(0, -extension.length);
            this.bump(this.byPath, bare, extension);
            this.total[extension]++;
            const alias = specifier.startsWith('@') ? specifier.split('/')[0] : '';
            if (alias) this.bump(this.byAlias, alias, extension);
        }
    }

    private bump(target: Map<string, ExtensionCounts>, key: string, extension: '.ts' | '.js'): void {
        const entry = target.get(key) || { '.ts': 0, '.js': 0 };
        entry[extension]++;
        target.set(key, entry);
    }

    private pick(counts?: ExtensionCounts): string | undefined {
        if (!counts || counts['.ts'] === counts['.js']) return undefined;
        return counts['.js'] > counts['.ts'] ? '.js' : '.ts';
    }

    /** Extension para un import por alias sin extension, del mas preciso al mas general. */
    for(specifierWithoutExtension: string): string {
        return this.pick(this.byPath.get(specifierWithoutExtension))
            || this.pick(this.byAlias.get(specifierWithoutExtension.split('/')[0]))
            || this.pick(this.total)
            || '.ts';
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

/** Cuerpo `{...}` que empieza en `open`, balanceando llaves. */
function bodyFrom(content: string, open: number): string {
    let depth = 0;
    for (let index = open; index < content.length; index++) {
        if (content[index] === '{') depth++;
        else if (content[index] === '}') {
            depth--;
            if (depth === 0) return content.slice(open + 1, index);
        }
    }
    return '';
}

/**
 * Constantes string visibles desde un archivo: las que declara y las que
 * importa. Clave `Constants.ID`, valor `~`.
 */
function visibleStringConstants(
    frameworkRoot: string,
    file: string,
    aliases: Record<string, string>,
    readFiles?: Set<string>
): Map<string, string> {
    const found = new Map<string, string>();
    const collect = (content: string, qualifier: string): void => {
        for (const [, name, , value] of content.matchAll(
            /static\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(['"`])((?:\\.|(?!\2).)*)\2/g
        )) {
            found.set(`${qualifier}.${name}`, value.replace(/\\(.)/g, '$1'));
        }
    };

    let content: string;
    try {
        content = fs.readFileSync(file, 'utf-8');
    } catch {
        return found;
    }

    const resolveSpecifier = (specifier: string): string | undefined => {
        let base: string;
        if (specifier.startsWith('.')) {
            base = path.resolve(path.dirname(file), specifier);
        } else {
            const alias = Object.keys(aliases)
                .filter(prefix => specifier === prefix || specifier.startsWith(`${prefix}/`))
                .sort((a, b) => b.length - a.length)[0];
            if (!alias) return undefined;
            base = path.join(frameworkRoot, aliases[alias], specifier.slice(alias.length + 1));
        }
        // El import se escribe `.js`; en disco esta el `.ts`.
        for (const candidate of [base.replace(/\.js$/, '.ts'), `${base}.ts`, base]) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        }
        return undefined;
    };

    const imports = [
        ...[...content.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)]
            .flatMap(([, names, specifier]) => names.split(',')
                .map(name => name.split(/\s+as\s+/).pop()!.trim())
                .filter(Boolean)
                .map(name => [name, specifier] as const)),
        ...[...content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g)]
            .map(([, name, specifier]) => [name, specifier] as const),
    ];
    for (const [name, specifier] of imports) {
        const target = resolveSpecifier(specifier);
        if (!target) continue;
        readFiles?.add(target);
        try {
            collect(fs.readFileSync(target, 'utf-8'), name);
        } catch {
            /* un import ilegible solo deja esa constante sin resolver */
        }
    }
    // Una clase puede concatenar sus propias constantes.
    for (const [, className] of content.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) collect(content, className);
    return found;
}

/**
 * Evalua `Constants.ID + selector_value` sin ejecutar nada: sustituye las
 * constantes por su literal y parte por el identificador del valor.
 */
function compositionRule(
    expression: string,
    constants: Map<string, string>
): CompositionRule | undefined {
    const parts = expression.split('+').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return undefined;
    const pieces: (string | null)[] = [];
    for (const part of parts) {
        const literal = part.match(/^(['"`])((?:\\.|(?!\1).)*)\1$/);
        if (literal) { pieces.push(literal[2].replace(/\\(.)/g, '$1')); continue; }
        if (constants.has(part)) { pieces.push(constants.get(part)!); continue; }
        // Cualquier otro identificador es el valor del locator.
        if (/^[A-Za-z_$][\w$.]*$/.test(part)) { pieces.push(null); continue; }
        return undefined;
    }
    const slot = pieces.indexOf(null);
    if (slot < 0 || pieces.lastIndexOf(null) !== slot) return undefined;
    return {
        prefix: pieces.slice(0, slot).join(''),
        suffix: pieces.slice(slot + 1).join(''),
    };
}

/**
 * Tabla de composicion real, leida del `switch` de la clase resolutora.
 *
 * Se lee en vez de asumirse porque el recorder tiene que poder afirmar que
 * `TypeLocator.X + valor` reconstruye el selector que grabo. Si el framework
 * cambia un prefijo, el aviso sale aqui y no en la ejecucion de wdio.
 */
function readComposition(
    frameworkRoot: string,
    locatorFactoryFile: string | undefined,
    typeLocatorSymbol: string
, aliases: Record<string, string>, readFiles?: Set<string>): { composition: LocatorComposition; found: boolean } {
    const empty = { android: {}, ios: {} } as LocatorComposition;
    if (!locatorFactoryFile) return { composition: DEFAULTS.locatorComposition, found: false };
    const absolute = path.join(frameworkRoot, locatorFactoryFile);
    let content: string;
    try {
        content = fs.readFileSync(absolute, 'utf-8');
    } catch {
        return { composition: DEFAULTS.locatorComposition, found: false };
    }
    readFiles?.add(absolute);
    const constants = visibleStringConstants(frameworkRoot, absolute, aliases, readFiles);

    // Cada metodo cuyo nombre o firma nombra la plataforma aporta su switch.
    const methods = /(?:private\s+)?static\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = methods.exec(content))) {
        const signature = `${match[1]} ${match[2]}`;
        const platform: 'android' | 'ios' | undefined = /android/i.test(signature)
            ? 'android'
            : /ios/i.test(signature) ? 'ios' : undefined;
        if (!platform) continue;
        const body = bodyFrom(content, content.indexOf('{', match.index + match[0].length - 1));
        for (const [, member, expression] of body.matchAll(
            new RegExp(`case\\s+${typeLocatorSymbol}\\.([A-Za-z_$][\\w$]*)\\s*:\\s*return\\s+([^;]+);`, 'g')
        )) {
            const rule = compositionRule(expression, constants);
            if (rule) empty[platform][member] = rule;
        }
    }
    const found = Boolean(Object.keys(empty.android).length && Object.keys(empty.ios).length);
    return found ? { composition: empty, found: true } : { composition: DEFAULTS.locatorComposition, found: false };
}

/**
 * Lee la firma de `getElement` del framework en vez de asumirla.
 *
 * El orden sale del nombre de cada parametro, no de una constante: si algun dia
 * el framework pone Android primero, las instrucciones del agente y la regla
 * que las verifica se mueven con el.
 */
function readSignature(locatorFactoryFile: string | undefined, frameworkRoot: string): LocatorSignature {
    if (!locatorFactoryFile) return DEFAULT_SIGNATURE;
    let content: string;
    try {
        content = fs.readFileSync(path.join(frameworkRoot, locatorFactoryFile), 'utf-8');
    } catch {
        return DEFAULT_SIGNATURE;
    }
    const match = content.match(/\bstatic\s+getElement\s*\(([^)]*)\)/);
    if (!match) return DEFAULT_SIGNATURE;
    const parameters = match[1].split(',').map(part => part.trim()).filter(Boolean);
    if (!parameters.length) return DEFAULT_SIGNATURE;
    const platformOrder: ('android' | 'ios')[] = [];
    for (let index = 0; index < parameters.length; index += 2) {
        const name = parameters[index].toLowerCase();
        const platform = /android/.test(name) ? 'android' : /ios/.test(name) ? 'ios' : undefined;
        if (!platform || platformOrder.includes(platform)) return DEFAULT_SIGNATURE;
        platformOrder.push(platform);
    }
    return { parameterCount: parameters.length, platformOrder };
}

/** Selector que el framework producira para este par en tiempo de ejecucion. */
export function composeLocator(
    contract: Pick<FrameworkContract, 'locatorComposition'>,
    type: string,
    value: string,
    platform: 'android' | 'ios'
): string | undefined {
    const rule = contract.locatorComposition?.[platform]?.[type];
    if (!rule) return undefined;
    return `${rule.prefix}${value}${rule.suffix}`;
}

function resolve(frameworkRoot: string): { contract: FrameworkContract; files: string[] } {
    // Archivos cuyo CONTENIDO determina el contrato. Se sellan uno a uno porque
    // el mtime del directorio no cambia al editarlos: agregar un caso al switch
    // de estrategias dejaba la tabla de composicion congelada.
    const readFiles = new Set<string>([path.join(frameworkRoot, 'tsconfig.json')]);
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
        // Por forma, no por nombre: la clase que expone `static getElement` es
        // la que resuelve locators, se llame LocatorFactory o LocatorProvider.
        locatorFactory: {
            pattern: /export\s+default\s+class\s+([A-Za-z_$][\w$]*)[^]*?\bstatic\s+getElement\s*\(/,
        },
        typeLocator: { pattern: /export\s+enum\s+([A-Za-z_$][\w$]*Locator[\w$]*)\b/ },
        // Este si va por nombre: es la funcion que el codigo generado invoca,
        // asi que el nombre ES el contrato. Si no esta, se cae a un helper con
        // timeout por defecto en vez de inventar una ruta.
        timeoutHelper: { pattern: /export\s+function\s+(getTimeoutFromEnv)\s*\(/ },
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

    const extensions = new ExtensionIndex(frameworkRoot);
    const importFor = (key: string, fallback: string): string => {
        const relative = anchors[key].file;
        const specifier = relative ? aliasImport(relative, aliases) : undefined;
        if (!specifier) {
            warnings.push(`No se encontró ${key} en el framework: se usa ${fallback}.`);
            return fallback;
        }
        // El archivo en disco es .ts; el import se escribe como el framework
        // escribe los imports de ESE destino.
        const bare = specifier.replace(/\.tsx?$/, '');
        return `${bare}${extensions.for(bare)}`;
    };

    const typeLocatorSymbol = anchors.typeLocator.capture || DEFAULTS.typeLocatorSymbol;
    for (const anchor of Object.values(anchors)) {
        if (anchor.file) readFiles.add(path.join(frameworkRoot, anchor.file));
    }
    const { composition, found: compositionFound } =
        readComposition(frameworkRoot, anchors.locatorFactory.file, typeLocatorSymbol, aliases, readFiles);
    if (!compositionFound) {
        warnings.push(
            'No se pudo leer la tabla de composicion de locators del framework: ' +
            'se usan los prefijos por convencion.'
        );
    }

    return { files: [...readFiles], contract: {
        aliases,
        baseScreenImport: importFor('baseScreen', DEFAULTS.baseScreenImport),
        baseScreenClass: anchors.baseScreen.capture || DEFAULTS.baseScreenClass,
        locatorFactoryImport: importFor('locatorFactory', DEFAULTS.locatorFactoryImport),
        locatorFactorySymbol: anchors.locatorFactory.capture || DEFAULTS.locatorFactorySymbol,
        typeLocatorImport: importFor('typeLocator', DEFAULTS.typeLocatorImport),
        typeLocatorSymbol,
        importExtension: extensions.for('@screenobjects/'),
        locatorSignature: readSignature(anchors.locatorFactory.file, frameworkRoot),
        timeoutHelperImport: anchors.timeoutHelper.file
            ? (() => {
                const specifier = aliasImport(anchors.timeoutHelper.file!, aliases);
                if (!specifier) return undefined;
                const bare = specifier.replace(/\.tsx?$/, '');
                return `${bare}${extensions.for(bare)}`;
            })()
            : undefined,
        timeoutHelperSymbol: anchors.timeoutHelper.capture,
        locatorComposition: composition,
        warnings,
    } };
}

/**
 * Firma barata del arbol para invalidar la cache. El mtime de un directorio
 * cambia cuando se agrega, borra o mueve un archivo dentro, que es justo el
 * caso que hay que detectar; el tsconfig se vigila por contenido.
 */
/**
 * Sello de los archivos cuyo contenido determina el resultado.
 *
 * Se sella cada ARCHIVO por `mtime` y tamano, no el directorio que lo contiene:
 * el mtime de un directorio solo cambia al agregar o quitar entradas, nunca al
 * editar un archivo dentro. Sellando el directorio, agregar un metodo a un
 * ancla existente —el caso normal cuando el framework se actualiza— dejaba
 * esto congelado hasta reiniciar el recorder.
 */
function signature(frameworkRoot: string, files: string[] = []): string {
    // Los directorios siguen sellandose porque detectan lo otro: archivos
    // agregados, movidos o borrados, que es lo que cambia DONDE esta un ancla.
    const targets = [...SCAN_ROOTS.map(root => path.join(frameworkRoot, root)), ...files];
    return targets.map(target => {
        try {
            const stats = fs.statSync(target);
            return `${target}:${stats.mtimeMs}:${stats.isFile() ? stats.size : 'dir'}`;
        } catch {
            return `${target}:0`;
        }
    }).join('|');
}

const cache = new Map<string, { signature: string; contract: FrameworkContract; files: string[] }>();

/**
 * Resuelve el contrato del framework, recalculandolo cuando el arbol cambia.
 * Se llama una vez por grabacion, no una vez por proceso, para que mover un
 * anclaje se refleje sin reiniciar el recorder.
 */
export function frameworkContract(frameworkRoot: string): FrameworkContract {
    const cached = cache.get(frameworkRoot);
    if (cached && cached.signature === signature(frameworkRoot, cached.files)) return cached.contract;
    const { contract, files } = resolve(frameworkRoot);
    cache.set(frameworkRoot, { signature: signature(frameworkRoot, files), contract, files });
    return contract;
}

/** Solo para tests: fuerza una nueva resolucion. */
export function clearFrameworkContractCache(): void {
    cache.clear();
}
