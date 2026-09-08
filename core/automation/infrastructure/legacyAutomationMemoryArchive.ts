import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { projectPaths } from '../../workspace';

/** Archive legacy entries without reading their contents or changing recordings/golden. */
export function archiveLegacyAutomationMemory(root = projectPaths.automationMemory): string[] {
    const names = ['index.json', 'fragments.json', 'vocabulary.json', 'cases', 'agent-cache'];
    const present = names.filter(name => fs.existsSync(path.join(root, name)));
    if (!present.length) return [];
    const archiveRoot = path.join(root, 'legacy-v1');
    if (fs.existsSync(archiveRoot)) {
        const stat = fs.lstatSync(archiveRoot);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('El archivo de memoria histórica debe ser un directorio local.');
    }
    fs.mkdirSync(archiveRoot, { recursive: true });
    const batch = path.join(archiveRoot, crypto.randomUUID());
    fs.mkdirSync(batch);
    const moved: string[] = [];
    try {
        for (const name of present) {
            fs.renameSync(path.join(root, name), path.join(batch, name));
            moved.push(name);
        }
    } catch (error) {
        for (const name of moved.reverse()) fs.renameSync(path.join(batch, name), path.join(root, name));
        throw error;
    }
    return present.map(name => path.join(batch, name));
}
