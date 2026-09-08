import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { projectPaths } from './projectPaths';

export const GOLDEN_DATASET_DIRECTORY = path.join('tests', 'golden');
type GoldenPaths = Pick<typeof projectPaths, 'toolRoot' | 'runtimeRoot'>;
export interface GoldenRepository {
    repositoryRoot: string;
    datasetRoot: string;
    source: 'selected' | 'checkout';
}
const selectionFile = (paths: GoldenPaths) => path.join(paths.runtimeRoot, 'config', 'golden-repository.json');
const unavailable = 'Selecciona el repositorio Git del recorder en Casos golden → Seleccionar repositorio. Los casos se guardan en tests/golden.';

/** Require the recorder's own Git root, including worktrees, never a bundle or a parent framework repository. */
function recorderRepository(candidate: string, source: GoldenRepository['source']): GoldenRepository {
    try {
        if (!path.isAbsolute(candidate)) throw new Error('relative');
        const repositoryRoot = fs.realpathSync(candidate);
        const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
        if (manifest.name !== 'appium-visual-recorder') throw new Error('package');
        const gitRoot = execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', repositoryRoot, 'rev-parse', '--show-toplevel'],
            { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r?\n$/, '');
        if (fs.realpathSync(gitRoot) !== repositoryRoot) throw new Error('git root');
        const tests = path.join(repositoryRoot, 'tests');
        if (!fs.statSync(tests).isDirectory() || fs.lstatSync(tests).isSymbolicLink()) throw new Error('tests');
        const datasetRoot = path.join(repositoryRoot, GOLDEN_DATASET_DIRECTORY);
        // Reject even dangling links before the store can create any directories.
        if (fs.readdirSync(tests).includes('golden') &&
            (fs.lstatSync(datasetRoot).isSymbolicLink() || !fs.statSync(datasetRoot).isDirectory())) throw new Error('golden');
        return { repositoryRoot, datasetRoot, source };
    } catch { throw new Error(unavailable); }
}

/** A saved selection is authoritative: a moved/missing checkout must not silently switch datasets. */
export function resolveGoldenRepository(paths: GoldenPaths = projectPaths): GoldenRepository {
    const file = selectionFile(paths);
    if (fs.existsSync(file)) {
        let saved: { schemaVersion?: number; repositoryRoot?: string };
        try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch { throw new Error(`No se pudo leer la selección golden. ${unavailable}`); }
        if (saved?.schemaVersion !== 1 || typeof saved.repositoryRoot !== 'string') throw new Error(unavailable);
        return recorderRepository(saved.repositoryRoot, 'selected');
    }
    for (const candidate of new Set([paths.toolRoot, paths.runtimeRoot])) {
        try { return recorderRepository(candidate, 'checkout'); } catch { /* Try the packaged runtime's checkout. */ }
    }
    throw new Error(unavailable);
}

/** Persist only a local path; approval and Git publication remain separate explicit actions. */
export function saveGoldenRepository(repositoryRoot: string, paths: GoldenPaths = projectPaths): GoldenRepository {
    const selected = recorderRepository(repositoryRoot, 'selected');
    const file = selectionFile(paths);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, repositoryRoot: selected.repositoryRoot }, null, 2) + '\n', { flag: 'wx' });
        fs.renameSync(temporary, file);
    } finally { fs.rmSync(temporary, { force: true }); }
    return selected;
}
