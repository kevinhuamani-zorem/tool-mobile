import path from 'path';
import ts from 'typescript';
import type { LayeredAgentResult } from '../../domain/layeredGenerationContracts';
import { sha256Text } from '../../domain/layeredGenerationContracts';
import type { ScreenApiContract } from '../../domain/screenApiContract';

type AuthorCode = Pick<LayeredAgentResult, 'files' | 'actionTrace'>;
const stepsPath = '/__recorder_api__/steps.ts';
const screenPath = '/__recorder_api__/screen.ts';
const libraryDirectory = path.dirname(ts.getDefaultLibFilePath({}));
const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    strict: true, types: [], noEmit: true, skipLibCheck: true,
};
const apiCache = new Map<string, ScreenApiContract>();

/** Only proposed code and bundled TS libs. No framework files, plugins or scripts. */
function programFor(behavior: AuthorCode, interaction?: AuthorCode) {
    const steps = behavior.files.find(file => file.layer === 'steps')?.content || '';
    const screen = interaction?.files.find(file => file.layer === 'screen');
    const contents = new Map([[stepsPath, steps], ...(screen ? [[screenPath, screen.content] as [string, string]] : [])]);
    const host = ts.createCompilerHost(options);
    const library = (file: string) => path.dirname(path.resolve(file)) === libraryDirectory && /lib\..*\.d\.ts$/.test(file);
    host.readFile = file => contents.get(file) ?? (library(file) ? ts.sys.readFile(file) : undefined);
    host.fileExists = file => contents.has(file) || (library(file) && ts.sys.fileExists(file));
    host.getSourceFile = (file, version) => {
        const text = host.readFile(file);
        return text === undefined ? undefined : ts.createSourceFile(file, text, version, true);
    };
    host.resolveModuleNames = names => names.map(name => screen && canonicalImport(name) === canonicalImport(screen.path)
        ? { resolvedFileName: screenPath, extension: ts.Extension.Ts } : undefined);
    host.writeFile = () => { throw new Error('El contrato de API no emite archivos.'); };
    const program = ts.createProgram({ rootNames: [...contents.keys()], options, host });
    return { program, source: program.getSourceFile(stepsPath)!, checker: program.getTypeChecker() };
}

function canonicalImport(source: string): string {
    return source.replace(/^@screenobjects\//, 'screenobjects/').replace(/\.(?:ts|js)$/, '');
}

function screenCalls(source: ts.SourceFile, checker?: ts.TypeChecker): Array<{ node: ts.CallExpression; importSource: string; method: string; alias: string }> {
    const imports = new Map<string, string>();
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
            && statement.importClause?.name && /(?:^@screenobjects\/|\.screen\.[tj]s$)/.test(statement.moduleSpecifier.text)) {
            imports.set(statement.importClause.name.text, statement.moduleSpecifier.text);
        }
    }
    const calls: ReturnType<typeof screenCalls> = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
            && ts.isIdentifier(node.expression.expression)) {
            const importSource = imports.get(node.expression.expression.text);
            // Resolve lexical shadowing: a local variable with the same name is not the imported Screen.
            const imported = !checker || checker.getSymbolAtLocation(node.expression.expression)?.declarations?.some(ts.isImportClause);
            if (importSource && imported) calls.push({ node, importSource, method: node.expression.name.text, alias: node.expression.expression.text });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return calls;
}

export function buildScreenApi(behavior: AuthorCode): ScreenApiContract {
    const text = behavior.files.find(file => file.layer === 'steps')?.content || '';
    const key = sha256Text(JSON.stringify([text, behavior.actionTrace]));
    const cached = apiCache.get(key);
    if (cached) return JSON.parse(JSON.stringify(cached));
    if (!screenCalls(ts.createSourceFile(stepsPath, text, ts.ScriptTarget.Latest, true)).length) return { schemaVersion: 1, methods: [] };
    const { source, checker } = programFor(behavior);
    const methods: ScreenApiContract['methods'] = [];
    const calls = screenCalls(source, checker);
    for (const { node, importSource, method, alias } of calls) {
        const awaited = ts.isAwaitExpression(node.parent);
        const use = awaited ? node.parent : node;
        const returnUsage = awaited ? 'awaited' : ts.isExpressionStatement(use.parent) ? 'ignored' : 'value';
        const expectedReturnType = ts.isVariableDeclaration(use.parent) && use.parent.type
            ? use.parent.type.getText(source) : null;
        methods.push({
            importSource: canonicalImport(importSource), method,
            arguments: node.arguments.map((argument, position) => {
                const type = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(argument));
                const text = checker.typeToString(type, argument, ts.TypeFormatFlags.NoTruncation);
                const unresolved = Boolean(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))
                    || /\b(?:any|unknown)\b/.test(text) || ts.isSpreadElement(argument);
                return { position, type: unresolved ? 'unknown' : text, unresolved };
            }),
            returnUsage, expectedReturnType,
            sequences: [...new Set((behavior.actionTrace || []).filter(trace =>
                trace.screenMethod === `${alias}.${method}` || (trace.screenMethod === method
                    && new Set(calls.filter(call => call.method === method).map(call => canonicalImport(call.importSource))).size === 1))
                .map(trace => trace.sequence))].sort((a, b) => a - b),
        });
    }
    // Wording and call-site line numbers deliberately do not invalidate Zorem.
    const unique = new Map(methods.map(method => [JSON.stringify(method), method]));
    const result: ScreenApiContract = { schemaVersion: 1, methods: [...unique.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
    if (apiCache.size >= 16) apiCache.delete(apiCache.keys().next().value!);
    apiCache.set(key, result);
    return JSON.parse(JSON.stringify(result));
}

export function screenApiInputErrors(behavior: AuthorCode): string[] {
    return buildScreenApi(behavior).methods.filter(method => method.arguments.some(argument => argument.unresolved))
        .map(method => `La interfaz de ${method.importSource}#${method.method} tiene argumentos sin tipo verificable. Declara tipos explícitos en las variables de Steps; no uses any/unknown ni spread dinámico.`);
}

/** Check real calls against the actual exported Screen, not a claimed list of signatures. */
export function validateScreenApi(behavior: AuthorCode, interaction: AuthorCode): Array<{ code: string; message: string; file: string }> {
    const screen = interaction.files.find(file => file.layer === 'screen');
    const steps = behavior.files.find(file => file.layer === 'steps');
    if (!screen || !steps) return [];
    const parsed = ts.createSourceFile(stepsPath, steps.content, ts.ScriptTarget.Latest, true);
    if (!screenCalls(parsed).some(call => canonicalImport(call.importSource) === canonicalImport(screen.path))) return [];
    const { source, program, checker } = programFor(behavior, interaction);
    const calls = screenCalls(source, checker).filter(call => canonicalImport(call.importSource) === canonicalImport(screen.path));
    if (!calls.length) return [];
    // Ignore absent dependencies of the isolated module; phase 3 checks those against the actual framework.
    const codes = new Set([2339, 2345, 2554, 2555, 2556, 2322, 2349, 2341, 2445]);
    const exportCodes = new Set([1192, 2613, 2305]);
    return program.getSemanticDiagnostics(source).filter(diagnostic =>
        (exportCodes.has(diagnostic.code) && source.statements.some(statement =>
            ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
            && canonicalImport(statement.moduleSpecifier.text) === canonicalImport(screen.path)
            && (diagnostic.start || 0) >= statement.pos && (diagnostic.start || 0) < statement.end))
        || (codes.has(diagnostic.code) && calls.some(call => {
            const statement = ts.isAwaitExpression(call.node.parent) ? call.node.parent.parent : call.node.parent;
            return (diagnostic.start || 0) >= statement.getStart(source) && (diagnostic.start || 0) < statement.end;
        }))).map(diagnostic => ({
            code: 'screen-api-mismatch', file: screen.path,
            message: `Interfaz Lorem → Zorem, TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
        }));
}
