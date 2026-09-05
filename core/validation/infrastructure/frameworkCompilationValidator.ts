import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import type { AutomationValidation } from '../domain/validationResult';

export interface CompilationFile {
    path: string;
    content: string;
    before: string | null;
}

export interface CompilationDiagnostic {
    code: number;
    message: string;
    file?: string;
    line?: number;
    column?: number;
}

export interface FrameworkCompilationReport {
    schemaVersion: '1.0';
    status: 'passed' | 'preexisting-errors' | 'failed' | 'unavailable';
    compilerVersion: string;
    scope: 'prepared-typescript-and-dependencies';
    diagnostics: CompilationDiagnostic[];
    preexistingDiagnostics: CompilationDiagnostic[];
    durationMs: number;
    filesRead: number;
    bytesRead: number;
    checkedFiles: number;
}

/** Compiles an in-memory overlay. Never emits, invokes target scripts or loads plugins. */
export class FrameworkCompilationValidator {
    validate(frameworkRoot: string, files: CompilationFile[]): FrameworkCompilationReport {
        const started = performance.now();
        const root = path.resolve(frameworkRoot);
        const disk = new Map<string, string | undefined>();
        const readFile = (file: string) => {
            const key = path.resolve(file);
            if (!disk.has(key)) disk.set(key, ts.sys.readFile(key));
            return disk.get(key);
        };
        const report: FrameworkCompilationReport = {
            schemaVersion: '1.0', status: 'unavailable', compilerVersion: ts.version,
            scope: 'prepared-typescript-and-dependencies', diagnostics: [], preexistingDiagnostics: [],
            durationMs: 0, filesRead: 0, bytesRead: 0, checkedFiles: 0,
        };
        const diagnostic = (item: ts.Diagnostic): CompilationDiagnostic => {
            const position = item.file?.getLineAndCharacterOfPosition(item.start || 0);
            return {
                code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
                ...(item.file ? { file: path.relative(root, item.file.fileName).split(path.sep).join('/') } : {}),
                ...(position ? { line: position.line + 1, column: position.character + 1 } : {}),
            };
        };
        try {
            const overlay = new Map<string, string>();
            const baseline = new Map<string, string>();
            for (const file of files) {
                const absolute = path.resolve(root, file.path);
                if (path.isAbsolute(file.path) || !absolute.startsWith(root + path.sep) || overlay.has(absolute)) {
                    throw new Error('Ruta inválida o duplicada en la propuesta de compilación.');
                }
                let cursor = absolute;
                while (cursor !== root) {
                    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
                        throw new Error('La propuesta de compilación no admite destinos symlink.');
                    }
                    cursor = path.dirname(cursor);
                }
                overlay.set(absolute, file.content);
                baseline.set(absolute, file.before ?? '');
            }
            const roots = [...overlay.keys()].filter(file => /\.[cm]?tsx?$/.test(file));
            if (!roots.length) throw new Error('No hay archivos TypeScript preparados para comprobar.');
            const configPath = path.join(root, 'tsconfig.json');
            const config = ts.readConfigFile(configPath, readFile);
            if (config.error) {
                report.diagnostics = [diagnostic(config.error)];
                return report;
            }
            // Roots are deliberately scoped; do not scan tools/, recordings or unrelated suites.
            const parsed = ts.parseJsonConfigFileContent(config.config, {
                ...ts.sys, readFile, readDirectory: () => [],
            }, root, undefined, configPath);
            const configErrors = parsed.errors.filter(item => item.code !== 18003);
            if (configErrors.length) {
                report.diagnostics = configErrors.map(diagnostic);
                return report;
            }
            if (parsed.options.noCheck || parsed.projectReferences?.length) {
                report.diagnostics = [{ code: 0, message: parsed.options.noCheck
                    ? 'El tsconfig desactiva la comprobación semántica con noCheck.'
                    : 'La comprobación aislada todavía no admite project references; no se certifica la compilación.' }];
                return report;
            }
            const options = { ...parsed.options, noEmit: true };
            const compile = (contents: Map<string, string>, rootNames = roots) => {
                const host = ts.createCompilerHost(options);
                const virtualDirectories = new Set<string>();
                for (const file of contents.keys()) {
                    let parent = path.dirname(file);
                    while (parent.startsWith(root)) {
                        virtualDirectories.add(parent);
                        if (parent === root) break;
                        parent = path.dirname(parent);
                    }
                }
                host.getCurrentDirectory = () => root;
                host.readFile = file => contents.get(path.resolve(file)) ?? readFile(file);
                host.fileExists = file => contents.has(path.resolve(file)) || ts.sys.fileExists(file);
                host.directoryExists = dir => virtualDirectories.has(path.resolve(dir)) || ts.sys.directoryExists(dir);
                host.realpath = file => contents.has(path.resolve(file)) ? path.resolve(file) : ts.sys.realpath!(file);
                host.getSourceFile = (file, version) => {
                    const text = host.readFile(file);
                    return text === undefined ? undefined : ts.createSourceFile(file, text, version, true);
                };
                host.writeFile = () => { throw new Error('La validación no puede escribir archivos.'); };
                const program = ts.createProgram({ rootNames, options, host });
                return { program, diagnostics: ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error) };
            };
            const current = compile(overlay);
            // A new Steps file can introduce a reference to a legacy Screen.
            // Check that dependency in the baseline too, even though the empty
            // baseline of the new Steps file does not import it yet.
            const baselineRoots = [...new Set([...roots, ...current.program.getSourceFiles()
                .filter(file => !file.isDeclarationFile && /\.[cm]?tsx?$/.test(file.fileName)
                    && file.fileName.startsWith(root + path.sep) && ts.sys.fileExists(file.fileName))
                .map(file => file.fileName)])];
            const old = compile(baseline, baselineRoots);
            report.checkedFiles = current.program.getSourceFiles().length;
            // Compare as a multiset; line shifts alone are not new errors. Never hide extra occurrences.
            const identity = (item: ts.Diagnostic) => JSON.stringify([
                item.file?.fileName, item.code, ts.flattenDiagnosticMessageText(item.messageText, '\n'),
                item.file && typeof item.start === 'number'
                    ? item.file.text.slice(item.start, item.start + (item.length || 0)) : '',
            ]);
            const counts = new Map<string, number>();
            for (const item of old.diagnostics) counts.set(identity(item), (counts.get(identity(item)) || 0) + 1);
            const added: ts.Diagnostic[] = [];
            for (const item of current.diagnostics) {
                const key = identity(item);
                const count = counts.get(key) || 0;
                if (count > 0) {
                    counts.set(key, count - 1);
                    report.preexistingDiagnostics.push(diagnostic(item));
                } else {
                    added.push(item);
                    report.diagnostics.push(diagnostic(item));
                }
            }
            // Missing type environments invalidate any claim of successful type checking, even preexisting.
            const missingEnvironment = current.diagnostics.some(item => [2307, 2688, 6053, 2318, 7016].includes(item.code));
            report.status = missingEnvironment ? 'unavailable' : added.length ? 'failed'
                : report.preexistingDiagnostics.length ? 'preexisting-errors' : 'passed';
        } catch {
            report.diagnostics.push({ code: 0, message: 'No se pudo comprobar TypeScript. Revisa las rutas, tsconfig y dependencias del framework seleccionado.' });
        } finally {
            report.durationMs = performance.now() - started;
            report.filesRead = [...disk.values()].filter(value => value !== undefined).length;
            report.bytesRead = [...disk.values()].reduce((sum, text) => sum + Buffer.byteLength(text || '', 'utf8'), 0);
        }
        return report;
    }
}

/** Preserve editable drafts, but do not promote or apply code with new compilation errors. */
export function includeFrameworkCompilation(validation: AutomationValidation, report: FrameworkCompilationReport): void {
    for (const item of report.diagnostics) {
        validation.errors.push({ code: 'framework-typescript', file: item.file,
            message: `TS${item.code}${item.line ? ` (${item.line}:${item.column})` : ''}: ${item.message}` });
    }
    if (report.status === 'unavailable') validation.errors.push({ code: 'framework-typescript-unavailable',
        message: 'No se pudo verificar la compilación contra el framework. Revisa tsconfig y sus dependencias; no es un resultado aprobado.' });
    if (report.preexistingDiagnostics.length) validation.warnings.push(
        `TypeScript: ${report.preexistingDiagnostics.length} error(es) preexistentes en los archivos comprobados. La propuesta no certifica que todo el framework compile.`);
    if (report.status === 'passed') validation.warnings.push(
        'TypeScript del preview y sus dependencias: sin errores. No se ha ejecutado el caso en el dispositivo.');
    if (validation.errors.length) {
        validation.valid = false;
        validation.qualityScore = Math.max(0, 100 - validation.errors.length * 10);
        validation.repairContext = { ...validation.repairContext, attempt: validation.repairContext?.attempt || 0,
            errors: validation.errors, affectedFiles: [...new Set(validation.errors.flatMap(item => item.file ? [item.file] : []))] };
        // Existing groups were calculated before compilation and would omit these errors.
        delete validation.repairContext.groups;
    }
}
