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
