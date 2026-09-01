import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../workspace';
import type { BaselineSnapshot, BaselineSnapshotPort } from '../ports/baselineSnapshotPort';

/**
 * Adaptador concreto de `BaselineSnapshotPort`: resuelve la ruta contra el
 * framework destino (`projectPaths.frameworkRoot`) y calcula el sha256 del
 * contenido existente. Es la única pieza de `DeterministicResolver` que toca
 * el filesystem; por eso vive en `infrastructure` y no en `application`.
 */
export class FsBaselineSnapshotAdapter implements BaselineSnapshotPort {
    read(relativePath: string): BaselineSnapshot {
        const absolute = path.join(projectPaths.frameworkRoot, relativePath);
        if (!fs.existsSync(absolute)) return { exists: false };
        return {
            exists: true,
            hash: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        };
    }
}
