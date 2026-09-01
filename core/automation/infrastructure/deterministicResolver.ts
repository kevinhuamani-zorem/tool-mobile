import { FsBaselineSnapshotAdapter } from './fsBaselineSnapshotAdapter';
import {
    DeterministicResolver as DeterministicResolverApplication,
} from '../application/deterministicResolver';

export * from '../application/deterministicResolver';

/**
 * `automation/application/deterministicResolver` exige un `BaselineSnapshotPort`
 * explícito (no puede importar `fs`, ver ADR-0001). Este adaptador de
 * `infrastructure` conserva el constructor histórico de 0/1 argumentos
 * inyectando el adaptador real (`FsBaselineSnapshotAdapter`), única pieza
 * con E/S de disco.
 */
export class DeterministicResolver extends DeterministicResolverApplication {
    constructor(catalog?: ConstructorParameters<typeof DeterministicResolverApplication>[0]) {
        super(catalog, new FsBaselineSnapshotAdapter());
    }
}
