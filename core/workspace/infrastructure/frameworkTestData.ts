import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { parse } from 'yaml';
import { projectPaths } from './projectPaths';

export interface FrameworkTestUser {
    name: string;
    squad: string;
    file: string;
}

export interface FrameworkUserCatalog {
    status: 'available' | 'unavailable';
    names: Set<string>;
    users: FrameworkTestUser[];
    filesRead: number;
}

/** Mirrors ScenarioSession's recursive .yml loading under resources/data and case-insensitive name lookup.
 * Only names leave the parser; credentials and YAML parser messages never leave this module.
 */
export function readFrameworkUserCatalog(frameworkRoot = projectPaths.frameworkRoot): FrameworkUserCatalog {
    const result: FrameworkUserCatalog = { status: 'available', names: new Set(), users: [], filesRead: 0 };
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
                        const relative = path.relative(directory, file).split(path.sep);
                        result.users.push({ name: user.name, squad: relative.length > 1 ? relative[0] : '',
                            file: ['resources', 'data', ...relative].join('/') });
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

/** The mobile login lookup is global: a duplicated name cannot identify a squad fixture reliably. */
export function availableSquadUsers(catalog: FrameworkUserCatalog, squad: string): FrameworkTestUser[] {
    if (catalog.status !== 'available' || !squad) return [];
    const counts = new Map<string, number>();
    for (const user of catalog.users) counts.set(user.name.toUpperCase(), (counts.get(user.name.toUpperCase()) || 0) + 1);
    return catalog.users.filter(user => user.squad === squad && user.name.trim() === user.name && user.name.length > 0
        && counts.get(user.name.toUpperCase()) === 1)
        .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.file.localeCompare(b.file, 'en'));
}

/** Selects an existing fixture reproducibly; it makes no claim about account state or device execution. */
export function selectFrameworkUser(squad: string, recordingId: string, requestedName = '', frameworkRoot = projectPaths.frameworkRoot) {
    const requested = requestedName.trim();
    if (requested) return { name: requested, automatic: false, file: undefined, reason: 'Usuario indicado por QA.' };
    const catalog = readFrameworkUserCatalog(frameworkRoot);
    const users = availableSquadUsers(catalog, squad);
    if (!users.length) return { name: '', automatic: true, file: undefined,
        reason: catalog.status === 'unavailable' ? 'No se pudo leer el catálogo de usuarios del framework.' : `No hay usuarios únicos disponibles para el squad ${squad}.` };
    const index = createHash('sha256').update(recordingId).digest().readUInt32BE(0) % users.length;
    const user = users[index];
    return { name: user.name, automatic: true, file: user.file,
        reason: `Usuario real de ${squad}, seleccionado de forma reproducible para esta grabación. Su estado funcional debe verificarse al ejecutar.` };
}
