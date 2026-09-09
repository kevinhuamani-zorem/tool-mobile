import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const goldenHash = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
export function goldenPath(root: string, relative: string): string {
    if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Ruta golden inválida.');
    const target = path.resolve(root, relative);
    let cursor = target;
    while (cursor !== path.resolve(root)) {
        try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('El dataset no admite symlinks.'); }
        catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        cursor = path.dirname(cursor);
    }
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('El dataset no admite symlinks.');
    return target;
}

/** Local cache invalidation includes ctime/inode, so restoring mtime does not conceal edits. */
export function goldenTreeSignature(directory: string): string {
    const entries: string[] = [];
    const visit = (relative: string) => {
        const file = goldenPath(directory, relative);
        const stat = fs.lstatSync(file, { bigint: true });
        entries.push([relative, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'));
        if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(relative + '/' + name);
        else if (!stat.isFile()) throw new Error('Artefacto golden no regular.');
    };
    for (const name of fs.readdirSync(directory).sort()) visit(name);
    return goldenHash(entries.join('\n'));
}
