import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import type { CaseCoverageSnapshot } from '../domain/caseCoverage';
import { coverageImportCandidates } from '../domain/caseCoverage/sources';

export interface CaseCoverageSnapshotInput {
    frameworkRoot: string;
    featurePath: string;
    stepFiles: string[];
    /** Captured source takes precedence over the mutable checkout. */
    beforeFiles?: Record<string, string>;
    afterFiles: Record<string, string>;
}

const scriptFile = /\.(?:[cm]?[jt]sx?|json)$/i;
const excludedDirectory = /^(?:\.git|node_modules|runtime|coverage|test-results|dist|renderer-dist|\.cache|credentials?|secrets?)$/i;

function safeRelative(file: string): string | undefined {
    const normalized = file.replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (!normalized || normalized.includes('\0') || path.posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)
        || parts.some(part => !part || part === '.' || part === '..' || excludedDirectory.test(part))
        || /(?:^|\/)\.env(?:\.|$)/i.test(normalized)
        || /^resources\/(?:data|environments?)(?:\/|$)/i.test(normalized)) return undefined;
    return normalized;
}

function within(root: string, absolute: string): boolean {
    const relative = path.relative(root, absolute);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/** A new generated file also needs a confined parent; overlays never bypass symlink checks. */
function confined(root: string, file: string): boolean {
    let existing = path.join(root, file);
    for (;;) {
        try {
            const actual = fs.realpathSync(existing);
            const relative = path.relative(root, actual).replace(/\\/g, '/');
            return within(root, actual) && (relative === '' || Boolean(safeRelative(relative)));
        }
        catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT' && code !== 'ENOTDIR') return false;
            const parent = path.dirname(existing);
            if (parent === existing || !within(root, parent)) return false;
            existing = parent;
        }
    }
}

function importSpecifiers(file: string, content: string): string[] {
    if (!scriptFile.test(file) || file.endsWith('.json')) return [];
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const specifiers = new Set<string>();
    const inspect = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
            && ts.isStringLiteralLike(node.moduleSpecifier)
            && !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)) {
            specifiers.add(node.moduleSpecifier.text);
        } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])
            && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
            specifiers.add(node.arguments[0].text);
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
            && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
            specifiers.add(node.moduleReference.expression.text);
        }
        ts.forEachChild(node, inspect);
    };
    inspect(source);
    return [...specifiers].sort();
}

/**
 * Captures two independent source graphs without applying generated content to disk.
 * Both graphs share a read-once checkout cache; missing or excluded dependencies stay
 * absent so the pure comparator can report unverified coverage instead of inventing it.
 */
export function collectCaseCoverageSnapshots(input: CaseCoverageSnapshotInput): { before: CaseCoverageSnapshot; after: CaseCoverageSnapshot } {
    if (!path.isAbsolute(input.frameworkRoot)) throw new Error('case-coverage-invalid-root');
    let root: string;
    try { root = fs.realpathSync(input.frameworkRoot); }
    catch { throw new Error('case-coverage-unavailable-root'); }
    const provided = (files: Record<string, string>): Record<string, string> => {
        const result: Record<string, string> = Object.create(null);
        for (const [file, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
            const normalized = safeRelative(file);
            if (!normalized || !confined(root, normalized) || typeof content !== 'string') throw new Error('case-coverage-invalid-source');
            if (Object.prototype.hasOwnProperty.call(result, normalized)) throw new Error('case-coverage-duplicate-source');
            result[normalized] = content;
        }
        return result;
    };
    const beforeFiles = provided(input.beforeFiles || {});
    const afterFiles = provided(input.afterFiles);
    const featurePath = safeRelative(input.featurePath);
    if (!featurePath || !confined(root, featurePath)) throw new Error('case-coverage-invalid-feature');
    const stepFiles = input.stepFiles.map(file => {
        const normalized = safeRelative(file);
        if (!normalized || !confined(root, normalized)) throw new Error('case-coverage-invalid-step');
        return normalized;
    });
    const pathCache = new Map<string, string | undefined>();
    const physicalCache = new Map<string, string | undefined>();
    const readDisk = (file: string): string | undefined => {
        if (pathCache.has(file)) return pathCache.get(file);
        let content: string | undefined;
        if (safeRelative(file) && confined(root, file)) {
            try {
                const absolute = fs.realpathSync(path.join(root, file));
                if (within(root, absolute)) {
                    if (physicalCache.has(absolute)) content = physicalCache.get(absolute);
                    else {
                        physicalCache.set(absolute, undefined);
                        if (fs.statSync(absolute).isFile()) content = fs.readFileSync(absolute, 'utf8');
                        physicalCache.set(absolute, content);
                    }
                }
            } catch { /* An unavailable dependency must remain absent. */ }
        }
        pathCache.set(file, content);
        return content;
    };
    const owns = (files: Record<string, string>, file: string): boolean => Object.prototype.hasOwnProperty.call(files, file);
    const seeds = [...new Set([featurePath, 'tsconfig.json', ...stepFiles, ...Object.keys(beforeFiles), ...Object.keys(afterFiles)])].sort();
    const capture = (overlay: Record<string, string>): CaseCoverageSnapshot => {
        const files: Record<string, string> = Object.create(null);
        const seen = new Set<string>();
        const read = (file: string): string | undefined => owns(overlay, file) ? overlay[file] : owns(beforeFiles, file) ? beforeFiles[file] : readDisk(file);
        const visit = (file: string): void => {
            if (seen.has(file) || !safeRelative(file) || !confined(root, file)) return;
            seen.add(file);
            const content = read(file);
            if (content === undefined) return;
            files[file] = content;
            for (const specifier of importSpecifiers(file, content)) {
                const resolved = coverageImportCandidates(file, specifier);
                if (resolved.external) continue;
                for (const candidate of new Set(resolved.candidates)) {
                    if (!safeRelative(candidate) || !scriptFile.test(candidate) || !confined(root, candidate)) continue;
                    if (read(candidate) !== undefined) { visit(candidate); break; }
                }
            }
        };
        for (const file of seeds) visit(file);
        return Object.freeze({ featurePath, files: Object.freeze(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))) });
    };
    return Object.freeze({ before: capture(Object.create(null)), after: capture(afterFiles) });
}
