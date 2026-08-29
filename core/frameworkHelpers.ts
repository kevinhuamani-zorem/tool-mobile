/**
 * [visual-recorder] API real de los helpers que BaseScreen expone por composicion.
 *
 * El agente escribia `this.uiHelper.scrollDown()` —que no existe; vive en
 * `gestureHelper`— y nadie lo veia: el paquete nunca le decia que metodos hay,
 * y ninguna capa comprobaba que el metodo existiera. El fallo aparecia al
 * compilar el framework, fuera del pipeline.
 *
 * Se lee del disco por AST y no de una tabla escrita a mano: una tabla
 * hardcodeada envejece en cuanto el framework agrega un helper o un metodo, y
 * entonces marca como invalido codigo correcto. Es el mismo criterio que
 * `frameworkContract`.
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { frameworkContract } from './frameworkContract';

export interface HelperMethod {
    name: string;
    /** Firma tal como se escribe la llamada: `scrollDown()`. */
    signature: string;
}

export interface HelperApi {
    /** Propiedad de BaseScreen: `uiHelper`, `gestureHelper`, `keyboardHelper`. */
    property: string;
    /** Clase que la implementa: `UIHelper`. */
    className: string;
    methods: HelperMethod[];
}

function sourceOf(file: string): ts.SourceFile | undefined {
    let content: string;
    try {
        content = fs.readFileSync(file, 'utf-8');
    } catch {
        return undefined;
    }
    return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** `./core/UIHelper.js` desde base.screen.ts -> ruta real en disco. */
function resolveSpecifier(fromFile: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) return undefined;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base.replace(/\.js$/, '.ts'), `${base}.ts`, base]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return undefined;
}

function isPublic(member: ts.ClassElement): boolean {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    if (!modifiers) return true;
    return !modifiers.some(modifier =>
        modifier.kind === ts.SyntaxKind.PrivateKeyword
        || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        || modifier.kind === ts.SyntaxKind.StaticKeyword);
}

/** Firma legible: nombre y parametros con su tipo, sin cuerpo ni JSDoc. */
function signatureOf(method: ts.MethodDeclaration, source: ts.SourceFile): string {
    const parameters = method.parameters.map(parameter => {
        const name = parameter.name.getText(source);
        const optional = parameter.questionToken || parameter.initializer ? '?' : '';
        const type = parameter.type ? `: ${parameter.type.getText(source)}` : '';
        return `${name}${optional}${type}`;
    });
    const returns = method.type ? `: ${method.type.getText(source)}` : '';
    return `${method.name.getText(source)}(${parameters.join(', ')})${returns}`;
}

function methodsOf(file: string, className: string): HelperMethod[] {
    const source = sourceOf(file);
    if (!source) return [];
    const declaration = source.statements.find((statement): statement is ts.ClassDeclaration =>
        ts.isClassDeclaration(statement) && statement.name?.text === className);
    if (!declaration) return [];
    return declaration.members
        .filter((member): member is ts.MethodDeclaration =>
            ts.isMethodDeclaration(member) && Boolean(member.name) && isPublic(member))
        .map(member => ({
            name: member.name!.getText(source),
            signature: signatureOf(member, source),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Helpers que BaseScreen expone, con los metodos publicos de cada uno.
 *
 * Se descubren por la declaracion de BaseScreen —no por una lista de nombres—,
 * asi que agregar un cuarto helper al framework lo incorpora sin tocar esto.
 */
function resolve(baseScreenFile: string): { helpers: HelperApi[]; files: string[] } {
    const source = sourceOf(baseScreenFile);
    if (!source) return { helpers: [], files: [baseScreenFile] };
    const imports = new Map<string, string>();
    source.statements.forEach(statement => {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
        const target = resolveSpecifier(baseScreenFile, statement.moduleSpecifier.text);
        if (!target) return;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
            bindings.elements.forEach(element => imports.set(element.name.text, target));
        }
        const defaultName = statement.importClause?.name?.text;
        if (defaultName) imports.set(defaultName, target);
    });

    const declaration = source.statements.find(ts.isClassDeclaration);
    if (!declaration) return { helpers: [], files: [baseScreenFile] };
    const helpers: HelperApi[] = [];
    // Los archivos que aportan metodos son la entrada real de este mapa: son
    // ellos los que hay que vigilar para invalidar la cache.
    const files = new Set<string>([baseScreenFile]);
    declaration.members.forEach(member => {
        if (!ts.isPropertyDeclaration(member) || !member.name || !isPublic(member)) return;
        const className = member.type && ts.isTypeReferenceNode(member.type)
            ? member.type.typeName.getText(source)
            : undefined;
        if (!className) return;
        const file = imports.get(className);
        if (!file) return;
        const methods = methodsOf(file, className);
        if (!methods.length) return;
        files.add(file);
        helpers.push({ property: member.name.getText(source), className, methods });
    });
    return {
        helpers: helpers.sort((left, right) => left.property.localeCompare(right.property)),
        files: [...files],
    };
}

const cache = new Map<string, { signature: string; helpers: HelperApi[]; files: string[] }>();

/**
 * Sello de los archivos cuyo contenido determina el resultado.
 *
 * Se sella cada ARCHIVO por `mtime` y tamano, no el directorio que lo contiene:
 * el mtime de un directorio solo cambia al agregar o quitar entradas, nunca al
 * editar un archivo dentro. Sellando el directorio, agregar un metodo a un
 * helper existente —el caso normal cuando el framework se actualiza— dejaba
 * esto congelado hasta reiniciar el recorder.
 */
function signature(files: string[]): string {
    return files.map(file => {
        try {
            const stats = fs.statSync(file);
            return `${file}:${stats.mtimeMs}:${stats.size}`;
        } catch {
            return `${file}:0`;
        }
    }).join('|');
}

export function frameworkHelpers(baseScreenFile: string): HelperApi[] {
    const cached = cache.get(baseScreenFile);
    if (cached && cached.signature === signature(cached.files)) return cached.helpers;
    const { helpers, files } = resolve(baseScreenFile);
    cache.set(baseScreenFile, { signature: signature(files), helpers, files });
    return helpers;
}

/** Solo para tests: fuerza una nueva lectura. */
export function clearFrameworkHelpersCache(): void {
    cache.clear();
}

/**
 * Helpers del framework de esta grabacion, resolviendo BaseScreen desde el
 * contrato: los llamadores no repiten la aritmetica de alias.
 */
export function frameworkHelpersOf(frameworkRoot: string): HelperApi[] {
    const contract = frameworkContract(frameworkRoot);
    const relative = Object.entries(contract.aliases)
        .filter(([alias]) => contract.baseScreenImport.startsWith(`${alias}/`))
        .sort((left, right) => right[0].length - left[0].length)
        .map(([alias, directory]) =>
            `${directory}/${contract.baseScreenImport.slice(alias.length + 1)}`)[0];
    if (!relative) return [];
    const file = path.join(frameworkRoot, relative.replace(/\.js$/, '.ts'));
    return frameworkHelpers(fs.existsSync(file) ? file : path.join(frameworkRoot, relative));
}

export const frameworkHelperApi = {
    frameworkHelpers, frameworkHelpersOf, clearFrameworkHelpersCache,
};
