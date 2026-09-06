import ts from 'typescript';
import { RECORDED_TEXT_READER } from '../contracts';

/**
 * El validador exige que `readRecordedText` sea idéntico, token a token, al
 * helper del contrato (`RECORDED_TEXT_READER`): es la única evidencia de que
 * la aserción de texto lee lo grabado y no lo que dice el XPath. El modelo
 * tiende a reescribirlo con otro límite, `$$('*')` o un `slice`, y sin el
 * borrador determinista ni siquiera lo tiene delante; entonces la regla
 * `recorded-text-assertion` falla ronda tras ronda por algo puramente
 * mecánico (TC-10239, 05-09-2026). Derek lo corrige antes de juzgar, igual que
 * normaliza keywords de Cucumber o el import del Screen Object.
 */
const printer = ts.createPrinter({ removeComments: true });

function canonical(node: ts.Node, source: ts.SourceFile): string {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard,
        printer.printNode(ts.EmitHint.Unspecified, node, source));
    const tokens: unknown[] = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
        tokens.push([kind, scanner.getTokenValue() || scanner.getTokenText()]);
    }
    return JSON.stringify(tokens);
}

const TEMPLATE = ts.createSourceFile('template.ts', `class Template { ${RECORDED_TEXT_READER} }`, ts.ScriptTarget.Latest, true);
const EXPECTED = canonical((TEMPLATE.statements[0] as ts.ClassDeclaration).members[0], TEMPLATE);

export const RECORDED_TEXT_READER_NAME = 'readRecordedText';

function readerOf(declaration: ts.ClassDeclaration, source: ts.SourceFile): ts.MethodDeclaration | undefined {
    return declaration.members
        .filter(ts.isMethodDeclaration)
        .find(method => method.name.getText(source) === RECORDED_TEXT_READER_NAME);
}

/** `true` si la clase declara el helper exactamente como el contrato. */
export function hasCanonicalRecordedTextReader(screenContent: string): boolean {
    const source = ts.createSourceFile('screen.ts', screenContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return source.statements.filter(ts.isClassDeclaration).some(declaration => {
        const helper = readerOf(declaration, source);
        return Boolean(helper) && canonical(helper!, source) === EXPECTED;
    });
}

/**
 * Restaura el helper canónico en cada clase del Screen Object: reemplaza una
 * versión divergente y lo inserta cuando la clase lo invoca sin declararlo.
 * Devuelve el mismo string si no hay nada que corregir.
 */
export function normalizeRecordedTextReader(screenContent: string): string {
    if (typeof screenContent !== 'string' || !screenContent.includes(RECORDED_TEXT_READER_NAME)) return screenContent;
    const source = ts.createSourceFile('screen.ts', screenContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    for (const declaration of source.statements.filter(ts.isClassDeclaration)) {
        const helper = readerOf(declaration, source);
        if (helper) {
            if (canonical(helper, source) === EXPECTED) continue;
            edits.push({ start: helper.getStart(source), end: helper.getEnd(), text: RECORDED_TEXT_READER.trimStart() });
            continue;
        }
        if (!new RegExp(`\\bthis\\.${RECORDED_TEXT_READER_NAME}\\s*\\(`).test(declaration.getText(source))) continue;
        const closeBrace = declaration.getEnd() - 1;
        const separator = /\n[ \t]*$/.test(screenContent.slice(0, closeBrace)) ? '\n' : '\n\n';
        edits.push({ start: closeBrace, end: closeBrace, text: `${separator}${RECORDED_TEXT_READER}\n` });
    }
    if (!edits.length) return screenContent;
    let output = screenContent;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
        output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    }
    return output;
}
