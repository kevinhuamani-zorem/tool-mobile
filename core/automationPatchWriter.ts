import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { GENERATED_FILE_AUTHOR, GENERATED_FILE_GENERATOR } from './generatedFileMetadata';

/**
 * Escritura aditiva sobre archivos existentes del framework.
 *
 * El recorder ya conoce selector, estrategia, nombre lógico y orden de acciones,
 * así que las inserciones son deterministas y no necesitan agente. Cada patch
 * solo AÑADE: antes de escribir se compara el conjunto de símbolos previo contra
 * el posterior y se aborta si desapareció alguno.
 */

export interface LocatorAddition {
    name: string;
    android: string;
    ios: string;
}

/**
 * Relleno del hueco de una clave que YA existe.
 *
 * Es distinto de una adicion: la clave esta en los dos bloques y una plataforma
 * la tiene vacia. 387 de las 1001 claves compartidas de este framework estan
 * asi, casi el 40%, asi que grabar en la plataforma vacia es lo normal, no un
 * caso borde. Antes `patchLocators` saltaba cualquier clave existente y el
 * relleno salia como `skipped` en silencio; el getter quedaba apuntando a "".
 */
export interface LocatorCompletionEdit {
    name: string;
    platform: 'android' | 'ios';
    block: string;
    value: string;
}

export interface MemberAddition {
    name: string;
    code: string;
}

export interface PatchInput {
    recordingId: string;
    createdAt: string;
    locators?: {
        file: string;
        additions: LocatorAddition[];
        completions?: LocatorCompletionEdit[];
    };
    screen?: { file: string; getters: MemberAddition[]; methods: MemberAddition[] };
    steps?: { file: string; definitions: MemberAddition[]; screenImport?: string };
    feature?: { file: string; scenario: string };
}

export interface PatchOutcome {
    file: string;
    layer: 'locators' | 'screen' | 'steps' | 'feature';
    added: string[];
    skipped: string[];
}

export class AdditivePatchError extends Error {}

function provenance(marker: '//' | '#', recordingId: string, createdAt: string, indent = ''): string {
    return `${indent}${marker} [${GENERATED_FILE_GENERATOR}] ${recordingId} · ${createdAt}\n` +
        `${indent}${marker} Author: ${GENERATED_FILE_AUTHOR}\n`;
}

/** Mismos tokens que vigila el verificador del paquete. */
export function symbolsOf(layer: PatchOutcome['layer'], content: string): string[] {
    if (layer === 'steps') {
        return [...content.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(match => match[1]);
    }
    if (layer === 'screen') {
        return [...content.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
    }
    if (layer === 'feature') {
        return [...content.matchAll(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm)].map(match => match[1]);
    }
    try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(parsed)
            .filter(([name, value]) => name !== '_metadata' && value && typeof value === 'object' && !Array.isArray(value))
            .flatMap(([, value]) => Object.keys(value as Record<string, unknown>));
    } catch {
        return [];
    }
}

function assertAdditive(layer: PatchOutcome['layer'], before: string, after: string, file: string): void {
    const previous = symbolsOf(layer, before);
    const next = new Set(symbolsOf(layer, after));
    const lost = previous.filter(symbol => !next.has(symbol));
    if (lost.length) {
        throw new AdditivePatchError(
            `El patch de ${file} eliminaría ${lost.length} símbolo(s) existente(s): ${lost.slice(0, 5).join(', ')}`
        );
    }
}

function atomicWrite(file: string, content: string): void {
    const temporary = `${file}.avr-${process.pid}.tmp`;
    fs.writeFileSync(temporary, content, 'utf-8');
    fs.renameSync(temporary, file);
}

export class AutomationPatchWriter {
    /** Fusiona claves nuevas en el par <módulo>Android/<módulo>Ios ya existente. */
    patchLocators(
        content: string,
        additions: LocatorAddition[],
        recordingId: string,
        createdAt: string,
        completions: LocatorCompletionEdit[] = []
    ) {
        const parsed = JSON.parse(content) as Record<string, any>;
        const blocks = Object.keys(parsed).filter(name => name !== '_metadata');
        const android = blocks.find(name => /Android$/i.test(name));
        const ios = blocks.find(name => /Ios$/i.test(name));
        if (!android || !ios) {
            throw new AdditivePatchError('El archivo de locators no tiene el par <módulo>Android/<módulo>Ios');
        }
        const added: string[] = [];
        const skipped: string[] = [];

        // Rellenar el hueco de una clave existente. La clave tiene que estar ya
        // en el bloque de esa plataforma: si no esta, ese modulo nunca declaro
        // el elemento ahi y anadirla es una decision del QA, no del patch.
        for (const completion of completions) {
            const block = completion.block;
            if (
                !block.toLowerCase().endsWith(completion.platform)
                || !parsed[block]
                || typeof parsed[block] !== 'object'
            ) {
                throw new AdditivePatchError(
                    `El bloque ${block} no es el bloque ${completion.platform} autorizado del módulo.`
                );
            }
            if (!Object.prototype.hasOwnProperty.call(parsed[block], completion.name)) {
                throw new AdditivePatchError(
                    `La clave "${completion.name}" no existe en el bloque ${block}: ` +
                    'no se puede completar una plataforma que el modulo no declara.'
                );
            }
            // Un valor real nunca se pisa; completar es solo llenar el vacio.
            if (String(parsed[block][completion.name] || '').trim()) {
                skipped.push(completion.name);
                continue;
            }
            parsed[block][completion.name] = completion.value;
            added.push(completion.name);
        }

        for (const addition of additions) {
            // Nunca se pisa una clave existente: si ya está, se reutiliza.
            if (Object.prototype.hasOwnProperty.call(parsed[android], addition.name) ||
                Object.prototype.hasOwnProperty.call(parsed[ios], addition.name)) {
                skipped.push(addition.name);
                continue;
            }
            parsed[android][addition.name] = addition.android;
            parsed[ios][addition.name] = addition.ios;
            added.push(addition.name);
        }
        // Sin `_metadata`: que grabacion aporto cada clave queda en el ledger
        // de `generated-files.json`, que es del recorder y no viaja en el PR.
        const next = Object.fromEntries(blocks.map(name => [name, parsed[name]]));
        return { content: JSON.stringify(next, null, 4) + '\n', added, skipped };
    }

    /** Getters tras el último getter existente; métodos antes del cierre de clase. */
    patchScreen(content: string, getters: MemberAddition[], methods: MemberAddition[], recordingId: string, createdAt: string) {
        const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const declaration = source.statements.find(ts.isClassDeclaration);
        if (!declaration) throw new AdditivePatchError('El Screen Object no declara una clase');
        const existing = new Set(declaration.members
            .filter(member => member.name && ts.isIdentifier(member.name))
            .map(member => (member.name as ts.Identifier).text));
        const added: string[] = [];
        const skipped: string[] = [];
        const pick = (items: MemberAddition[]) => items.filter(item => {
            if (existing.has(item.name)) { skipped.push(item.name); return false; }
            added.push(item.name);
            return true;
        });
        const newGetters = pick(getters);
        const newMethods = pick(methods);
        if (!newGetters.length && !newMethods.length) return { content, added, skipped };

        const accessors = declaration.members.filter(ts.isGetAccessorDeclaration);
        const header = provenance('//', recordingId, createdAt, '    ');
        let output = content;
        // Se inserta de atrás hacia adelante para no invalidar los offsets.
        const closing = declaration.getEnd() - 1;
        if (newMethods.length) {
            const block = '\n' + newMethods.map(item => header + item.code.replace(/\n?$/, '\n')).join('\n');
            output = output.slice(0, closing) + block + output.slice(closing);
        }
        if (newGetters.length) {
            const anchor = accessors.length
                ? accessors[accessors.length - 1].getEnd()
                : declaration.members[0]?.getStart(source) ?? closing;
            const block = accessors.length
                ? '\n\n' + newGetters.map(item => header + item.code.replace(/\n?$/, '')).join('\n\n')
                : newGetters.map(item => header + item.code.replace(/\n?$/, '\n\n')).join('');
            output = output.slice(0, anchor) + block + output.slice(anchor);
        }
        return { content: output, added, skipped };
    }

    /** Definiciones al final del archivo, añadiendo el import del Screen si falta. */
    patchSteps(content: string, definitions: MemberAddition[], screenImport: string | undefined, recordingId: string, createdAt: string) {
        const existing = new Set(symbolsOf('steps', content));
        const added: string[] = [];
        const skipped: string[] = [];
        const pending = definitions.filter(item => {
            if (existing.has(item.name)) { skipped.push(item.name); return false; }
            added.push(item.name);
            return true;
        });
        if (!pending.length) return { content, added, skipped };
        let output = content.replace(/\s*$/, '\n');
        if (screenImport && !output.includes(screenImport)) {
            const imports = [...output.matchAll(/^import .+;$/gm)];
            const last = imports[imports.length - 1];
            const at = last ? last.index! + last[0].length : 0;
            output = output.slice(0, at) + `\n${screenImport}` + output.slice(at);
        }
        const header = provenance('//', recordingId, createdAt);
        output += '\n' + pending.map(item => header + item.code.replace(/\n?$/, '\n')).join('\n');
        return { content: output, added, skipped };
    }

    /** Escenario al final del Feature, sin tocar los existentes. */
    patchFeature(content: string, scenario: string, recordingId: string, createdAt: string) {
        const existing = new Set(symbolsOf('feature', content));
        const name = (scenario.match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/m) || [])[1];
        if (name && existing.has(name)) return { content, added: [], skipped: [name] };
        const header = provenance('#', recordingId, createdAt, '  ');
        const output = content.replace(/\s*$/, '\n') + '\n' + header + scenario.replace(/\n?$/, '\n');
        return { content: output, added: name ? [name] : [], skipped: [] };
    }

    apply(input: PatchInput, frameworkRoot: string): PatchOutcome[] {
        const outcomes: PatchOutcome[] = [];
        const run = (
            layer: PatchOutcome['layer'],
            relative: string,
            transform: (content: string) => { content: string; added: string[]; skipped: string[] }
        ) => {
            const absolute = path.resolve(frameworkRoot, relative);
            if (path.relative(path.resolve(frameworkRoot), absolute).startsWith('..')) {
                throw new AdditivePatchError(`Ruta fuera del framework: ${relative}`);
            }
            if (!fs.existsSync(absolute)) throw new AdditivePatchError(`No existe el archivo a parchar: ${relative}`);
            const before = fs.readFileSync(absolute, 'utf-8');
            const result = transform(before);
            assertAdditive(layer, before, result.content, relative);
            if (result.content !== before) atomicWrite(absolute, result.content);
            outcomes.push({ file: relative, layer, added: result.added, skipped: result.skipped });
        };

        if (input.locators) {
            run('locators', input.locators.file, before =>
                this.patchLocators(
                    before, input.locators!.additions, input.recordingId, input.createdAt,
                    input.locators!.completions
                ));
        }
        if (input.screen) {
            run('screen', input.screen.file, before =>
                this.patchScreen(before, input.screen!.getters, input.screen!.methods, input.recordingId, input.createdAt));
        }
        if (input.steps) {
            run('steps', input.steps.file, before =>
                this.patchSteps(before, input.steps!.definitions, input.steps!.screenImport, input.recordingId, input.createdAt));
        }
        if (input.feature) {
            run('feature', input.feature.file, before =>
                this.patchFeature(before, input.feature!.scenario, input.recordingId, input.createdAt));
        }
        return outcomes;
    }
}

// ── Derivación de adiciones ──────────────────────────────────────────────────
// El agente y el generador determinista entregan el archivo completo. En vez de
// escribirlo encima, se compara contra lo que hay en disco y se extrae solo lo
// nuevo: así un `update` nunca puede perder lo que ya existía.

function locatorBlocks(content: string): { android?: string; ios?: string; parsed: Record<string, any> } {
    const parsed = JSON.parse(content) as Record<string, any>;
    const names = Object.keys(parsed).filter(name => name !== '_metadata');
    return {
        parsed,
        android: names.find(name => /Android$/i.test(name)),
        ios: names.find(name => /Ios$/i.test(name)),
    };
}

export function locatorAdditions(current: string, proposed: string): LocatorAddition[] {
    let before: ReturnType<typeof locatorBlocks>;
    let after: ReturnType<typeof locatorBlocks>;
    try {
        before = locatorBlocks(current);
        after = locatorBlocks(proposed);
    } catch {
        return [];
    }
    if (!after.android || !after.ios) return [];
    const existing = new Set([
        ...Object.keys(before.android ? before.parsed[before.android] : {}),
        ...Object.keys(before.ios ? before.parsed[before.ios] : {}),
    ]);
    return Object.keys(after.parsed[after.android])
        .filter(name => !existing.has(name))
        .map(name => ({
            name,
            android: String(after.parsed[after.android!][name] ?? ''),
            ios: String(after.parsed[after.ios!]?.[name] ?? ''),
        }));
}

export function screenAdditions(current: string, proposed: string): { getters: MemberAddition[]; methods: MemberAddition[] } {
    const parse = (content: string, name: string) =>
        ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const currentSource = parse(current, 'current.ts');
    const proposedSource = parse(proposed, 'proposed.ts');
    const currentClass = currentSource.statements.find(ts.isClassDeclaration);
    const proposedClass = proposedSource.statements.find(ts.isClassDeclaration);
    if (!proposedClass) return { getters: [], methods: [] };
    const existing = new Set((currentClass?.members || [])
        .filter(member => member.name && ts.isIdentifier(member.name))
        .map(member => (member.name as ts.Identifier).text));
    const getters: MemberAddition[] = [];
    const methods: MemberAddition[] = [];
    for (const member of proposedClass.members) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;
        const name = member.name.text;
        if (existing.has(name)) continue;
        const code = member.getText(proposedSource);
        if (ts.isGetAccessorDeclaration(member)) getters.push({ name, code: indent(code) });
        else if (ts.isMethodDeclaration(member)) methods.push({ name, code: indent(code) });
    }
    return { getters, methods };
}

function indent(code: string): string {
    return code.startsWith(' ') ? code : code.split('\n').map((line, index) =>
        index === 0 ? `    ${line}` : (line.trim() ? `    ${line}` : line)).join('\n');
}

export function stepsAdditions(current: string, proposed: string): { definitions: MemberAddition[]; imports: string[] } {
    const existing = new Set(symbolsOf('steps', current));
    const source = ts.createSourceFile('steps.ts', proposed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const definitions: MemberAddition[] = [];
    for (const statement of source.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
        const call = statement.expression;
        if (!ts.isIdentifier(call.expression) || !['Given', 'When', 'Then'].includes(call.expression.text)) continue;
        const text = statement.getText(source);
        const name = (text.match(/\(\/\^([^\n]+?)\$\//) || [])[1];
        if (!name || existing.has(name)) continue;
        definitions.push({ name, code: text });
    }
    const currentImports = new Set([...current.matchAll(/^import .+;$/gm)].map(match => match[0]));
    const imports = [...proposed.matchAll(/^import .+;$/gm)]
        .map(match => match[0])
        .filter(line => !currentImports.has(line) && /screen/i.test(line));
    return { definitions, imports };
}

export function featureAdditions(current: string, proposed: string): string | undefined {
    const existing = new Set(symbolsOf('feature', current));
    const lines = proposed.split(/\r?\n/);
    // Un Feature puede traer varios escenarios: interesa el primero que no exista.
    const starts = lines.flatMap((line, index) =>
        /^\s*Scenario(?: Outline)?:/.test(line) ? [index] : []);
    const start = starts.find(index => {
        const name = (lines[index].match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/) || [])[1];
        return Boolean(name) && !existing.has(name);
    });
    if (start === undefined) return undefined;
    // Se conserva el @tag inmediatamente anterior al Scenario.
    const tag = start > 0 && /^\s*@[-\w]+\s*$/.test(lines[start - 1]) ? start - 1 : start;
    const next = starts.find(index => index > start);
    const end = next === undefined
        ? lines.length
        : (/^\s*@[-\w]+\s*$/.test(lines[next - 1]) ? next - 1 : next);
    return lines.slice(tag, end).join('\n').replace(/\s*$/, '\n');
}
