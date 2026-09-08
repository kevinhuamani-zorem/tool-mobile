import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ts from 'typescript';
import { execFileSync } from 'child_process';
export const recoveryHash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const ignored = new Set(['.git', 'node_modules', 'tools', 'runtime', 'dist', 'build', 'coverage', 'test-results']);

/** Reads code only, without following links, executing target scripts or normalizing bytes. */
export class RecoveryWorkspace {
    readonly watched = new Map<string, string | null>();
    constructor(readonly root: string) {}
    target(relative: string): string {
        if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')
            || relative.split('/').some(part => part === '..' || ignored.has(part) || part.startsWith('.')))
            throw new Error(`Ruta no permitida para recuperar: ${relative}`);
        const target = path.resolve(this.root, relative);
        if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Ruta fuera del framework.');
        let cursor = target;
        while (cursor !== path.resolve(this.root)) {
            try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink no permitido: ${relative}`); }
            catch (error: any) { if (error.code !== 'ENOENT') throw error; }
            cursor = path.dirname(cursor);
        }
        return target;
    }
    read(relative: string): string | null {
        if (!/\.(?:ts|tsx|json|feature)$/.test(relative) || /(?:^|\/)(?:credentials|secrets|environments?)(?:[/.]|$)/i.test(relative))
            throw new Error(`Solo se recuperan archivos de código del caso: ${relative}`);
        const target = this.target(relative);
        if (!fs.existsSync(target)) { this.watched.set(relative, null); return null; }
        const stat = fs.statSync(target);
        if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error(`Archivo no regular o mayor de 4 MiB: ${relative}`);
        const bytes = fs.readFileSync(target);
        const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        this.watched.set(relative, recoveryHash(bytes));
        return content;
    }
    list(directory: string, suffix: string): string[] {
        const result: string[] = [];
        const walk = (relative: string) => {
            const target = this.target(relative);
            if (!fs.existsSync(target)) return;
            for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
                if (entry.name.startsWith('.') || ignored.has(entry.name) || entry.isSymbolicLink()) continue;
                const file = `${relative}/${entry.name}`;
                if (entry.isDirectory()) walk(file);
                else if (entry.isFile() && file.endsWith(suffix)) result.push(file);
                if (result.length > 10000) throw new Error('El catálogo supera 10000 archivos; asocia rutas concretas.');
            }
        };
        walk(directory);
        return result.sort();
    }
    resolve(from: string, specifier: string): string | undefined {
        let candidates: string[] = [];
        if (specifier.startsWith('.')) candidates = [path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))];
        else {
            const config = this.read('tsconfig.json');
            const options = config ? ts.parseConfigFileTextToJson('tsconfig.json', config).config?.compilerOptions || {} : {};
            for (const [alias, targets] of Object.entries(options.paths || {})) {
                const [prefix, suffix = ''] = alias.split('*');
                if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || (!alias.includes('*') && specifier !== alias)) continue;
                const wildcard = specifier.slice(prefix.length, suffix ? -suffix.length : undefined);
                for (const target of targets as string[]) candidates.push(path.posix.normalize(path.posix.join(options.baseUrl || '.', target.replace('*', wildcard))));
            }
        }
        for (const candidate of candidates) {
            for (const file of [candidate, candidate.replace(/\.js$/, '.ts'), `${candidate}.ts`, `${candidate}/index.ts`]) {
                if (/\.(ts|tsx|json)$/.test(file) && fs.existsSync(this.target(file))) return file;
            }
        }
        return undefined;
    }
    requireUnchanged(snapshot: Map<string, string | null>): void {
        for (const [file, hash] of snapshot) {
            const content = this.read(file);
            if ((content === null ? null : recoveryHash(content)) !== hash) throw new Error(`Cambió ${file} después de revisar. Recupera nuevamente.`);
        }
    }
}
export function recoveryGitContext(root: string) {
    const git = (...args: string[]) => {
        try { return execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args],
            { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 }).trim(); }
        catch { return undefined; }
    };
    const repository = git('rev-parse', '--show-toplevel');
    if (!repository) return {};
    return { repository, branch: git('symbolic-ref', '--short', '-q', 'HEAD'), commit: git('rev-parse', 'HEAD'),
        dirty: Boolean(git('status', '--porcelain', '--untracked-files=normal')) };
}
