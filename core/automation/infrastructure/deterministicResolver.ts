import type { BaselineSnapshotPort } from '../ports/baselineSnapshotPort';
import { FsBaselineSnapshotAdapter } from './fsBaselineSnapshotAdapter';
import {
    DeterministicResolver as DeterministicResolverApplication,
} from '../application/deterministicResolver';

export * from '../application/deterministicResolver';

/**
 * `automation/application/deterministicResolver` exige un `BaselineSnapshotPort`
 * explícito (no puede importar `fs`, ver ADR-0001). Este adaptador de
 * `infrastructure` conserva el constructor histórico de 0/1 argumentos
 * con FsBaselineSnapshotAdapter por defecto. El segundo argumento permite
 * inyectar baselines inmutables para replay, sin consultar el checkout vivo.
 */
export class DeterministicResolver extends DeterministicResolverApplication {
    constructor(catalog?: ConstructorParameters<typeof DeterministicResolverApplication>[0], baseline: BaselineSnapshotPort = new FsBaselineSnapshotAdapter()) {
        super(catalog, baseline);
    }
}
