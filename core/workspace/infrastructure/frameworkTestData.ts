import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import { projectPaths } from './projectPaths';

export interface FrameworkUserCatalog {
    status: 'available' | 'unavailable';
    names: Set<string>;
    filesRead: number;
}

/** Mirrors ScenarioSession's recursive .yml loading under resources/data and case-insensitive name lookup.
 * Only names leave the parser; credentials and YAML parser messages never leave this module.
 */
export function readFrameworkUserCatalog(frameworkRoot = projectPaths.frameworkRoot): FrameworkUserCatalog {
    const result: FrameworkUserCatalog = { status: 'available', names: new Set(), filesRead: 0 };
    const directory = path.join(frameworkRoot, 'resources', 'data');
    const visit = (folder: string): void => {
        if (fs.lstatSync(folder).isSymbolicLink()) throw new Error('Unsupported data directory');
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            if (entry.isSymbolicLink()) { result.status = 'unavailable'; continue; }
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile() && entry.name.endsWith('.yml')) {
                try {
                    const value: unknown = parse(fs.readFileSync(file, 'utf8'), { merge: true });
                    result.filesRead++;
                    const users = Array.isArray(value) ? value : value ? [value] : [];
                    for (const user of users) {
                        if (!user || typeof user !== 'object' || typeof user.name !== 'string') { result.status = 'unavailable'; continue; }
                        result.names.add(user.name.toUpperCase());
                    }
                } catch { result.status = 'unavailable'; }
            }
        }
    };
    try {
        // Do not read data through a redirected parent either.
        if (fs.lstatSync(path.join(frameworkRoot, 'resources')).isSymbolicLink()) throw new Error('Unsupported resources directory');
        visit(directory);
    } catch { result.status = 'unavailable'; }
    return result;
}
