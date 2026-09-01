/**
 * Puerto de `automation/application`: lectura del hash/existencia de un
 * archivo ya escrito en el framework, usado por `DeterministicResolver` para
 * marcar `PlannedFile.baseHash` en operaciones `update` sin depender de `fs`
 * directamente (ver ADR-0001, regla 1: `application` no importa filesystem).
 */
export interface BaselineSnapshot {
    exists: boolean;
    /** sha256 del contenido actual, solo si `exists` es `true`. */
    hash?: string;
}

export interface BaselineSnapshotPort {
    read(relativePath: string): BaselineSnapshot;
}
