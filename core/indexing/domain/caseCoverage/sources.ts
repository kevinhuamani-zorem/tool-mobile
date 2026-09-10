import ts from 'typescript';
import crypto from 'crypto';
import path from 'path';

export const coverageHash = (value: unknown): string => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const printer = ts.createPrinter({ removeComments: true });
export const canonicalNode = (node: ts.Node, source: ts.SourceFile): string => printer.printNode(ts.EmitHint.Unspecified, node, source);
const aliases: Record<string, string> = {
    '@screenobjects/': 'screenobjects/', '@locators/': 'resources/locators/', '@resources/': 'resources/',
    '@common/': 'support/common/', '@utils/': 'support/utils/', '@support/': 'support/',
    '@config/': 'config/', '@features/': 'features/',
};
export function coverageImportCandidates(from: string, specifier: string): { candidates: string[]; external: boolean } {
    const alias = Object.keys(aliases).find(prefix => specifier.startsWith(prefix));
    const local = specifier.startsWith('.') || Boolean(alias) || specifier.startsWith('/');
    if (!local) return { candidates: [specifier], external: true };
    const candidate = path.posix.normalize(alias ? aliases[alias] + specifier.slice(alias.length) : specifier.startsWith('/') ? specifier : path.posix.join(path.posix.dirname(from), specifier));
    const stem = candidate.replace(/\.(?:[cm]?js|tsx?)$/, '');
    return { external: false, candidates: [candidate, stem + '.ts', stem + '.tsx', stem + '.js', candidate + '.ts', candidate + '.js', candidate + '/index.ts', candidate + '/index.js'] };
}

export interface ImportBinding { target: string; exported: string; external: boolean }
export interface SourceModule { file: string; source: ts.SourceFile; imports: Map<string, ImportBinding>; localDependencies: string[]; problem?: string }

/** Only supplied source is examined: no filesystem, package loading or execution. */
export class CoverageSources {
    readonly files: Record<string, string>;
    private configurationProblem?: string;
    private modules = new Map<string, SourceModule>();
    private fingerprints = new Map<string, { hash: string; complete: boolean }>();
    constructor(files: Record<string, string>) {
        this.files = Object.fromEntries(Object.entries(files).map(([file, content]) => [path.posix.normalize(file.replace(/\\/g, '/')), content]));
        const configuration = this.files['tsconfig.json'];
        if (configuration !== undefined) {
            const parsed = ts.parseConfigFileTextToJson('tsconfig.json', configuration);
            const compiler = parsed.config?.compilerOptions || {};
            if (parsed.error || parsed.config?.extends || compiler.baseUrl && !['.', './'].includes(compiler.baseUrl)) this.configurationProblem = 'unsupported-source-paths';
            for (const [pattern, targets] of Object.entries(compiler.paths || {})) {
                const expected = aliases[pattern.replace(/\*$/, '')];
                if (!expected || !Array.isArray(targets) || targets.length !== 1 || String(targets[0]).replace(/^\.\//, '') !== expected + '*') this.configurationProblem = 'unsupported-source-paths';
            }
        }
    }
    resolve(from: string, specifier: string): { target: string; external: boolean; exists: boolean } {
        const { candidates: choices, external } = coverageImportCandidates(from, specifier);
        if (external) return { target: specifier, external: true, exists: true };
        const candidate = choices[0];
        const target = choices.find(file => Object.prototype.hasOwnProperty.call(this.files, file));
        return { target: target || candidate, external: false, exists: Boolean(target) };
    }
    module(file: string): SourceModule {
        const cached = this.modules.get(file);
        if (cached) return cached;
        const text = this.files[file];
        const source = ts.createSourceFile(file, text ?? '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const module: SourceModule = { file, source, imports: new Map(), localDependencies: [], ...(this.configurationProblem ? { problem: this.configurationProblem } : {}) };
        this.modules.set(file, module);
        if (text === undefined || (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) module.problem = 'missing-or-invalid-source';
        for (const statement of source.statements) {
            if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
                if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
                const resolved = this.resolve(file, statement.moduleSpecifier.text);
                if (!resolved.exists) module.problem = 'missing-local-dependency';
                if (!resolved.external) module.localDependencies.push(resolved.target);
                if (ts.isImportDeclaration(statement)) {
                    const clause = statement.importClause;
                    if (clause?.name) module.imports.set(clause.name.text, { ...resolved, exported: 'default' });
                    const named = clause?.namedBindings;
                    if (named && ts.isNamespaceImport(named)) module.imports.set(named.name.text, { ...resolved, exported: '*' });
                    if (named && ts.isNamedImports(named)) for (const element of named.elements) {
                        if (!element.isTypeOnly) module.imports.set(element.name.text, { ...resolved, exported: element.propertyName?.text || element.name.text });
                    }
                }
            }
        }
        const inspect = (node: ts.Node) => {
            if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
                const specifier = node.arguments[0];
                if (!specifier || !ts.isStringLiteralLike(specifier)) module.problem = 'dynamic-dependency';
                else {
                    const resolved = this.resolve(file, specifier.text);
                    if (!resolved.exists) module.problem = 'missing-local-dependency';
                    if (!resolved.external) module.localDependencies.push(resolved.target);
                }
            }
            if (ts.isImportEqualsDeclaration(node)) module.problem = 'unsupported-import-binding';
            ts.forEachChild(node, inspect);
        };
        inspect(source);
        return module;
    }
    /** Whole dependency closure is conservative: edited dependencies require review. */
    fingerprint(file: string): { hash: string; complete: boolean } {
        const cached = this.fingerprints.get(file);
        if (cached) return cached;
        const visited = new Set<string>();
        const entries: Array<[string, string]> = [];
        let complete = true;
        const visit = (target: string) => {
            if (visited.has(target)) return;
            visited.add(target);
            const content = this.files[target];
            if (content === undefined) { complete = false; return; }
            if (target.endsWith('.json')) {
                try { entries.push([target, coverageHash(JSON.parse(content))]); }
                catch { complete = false; }
                return;
            }
            const module = this.module(target);
            if (module.problem) complete = false;
            entries.push([target, coverageHash(printer.printFile(module.source))]);
            for (const dependency of module.localDependencies) visit(dependency);
        };
        visit(file);
        const value = { hash: coverageHash(entries.sort(([a], [b]) => a.localeCompare(b))), complete };
        this.fingerprints.set(file, value);
        return value;
    }
    importFingerprint(binding: ImportBinding): { hash: string; complete: boolean } {
        return binding.external ? { hash: coverageHash(['external', binding.target]), complete: true } : this.fingerprint(binding.target);
    }
}
