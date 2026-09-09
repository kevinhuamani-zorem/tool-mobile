import { ApprovedGoldenStore, ApprovedGoldenIndex, goldenHash } from './approvedGoldenStore';
import { GoldenSnapshotReader } from './goldenSnapshot';
import { goldenCaseContext, GoldenDependencyReference } from './goldenCaseContext';

export type GoldenEntry = ApprovedGoldenIndex['entries'][number];
export interface GoldenExample {
    goldenId: string; revisionId: string; versionHash: string; caseId: string; recordingId: string; score: number;
    dependencies: GoldenDependencyReference[]; frameworkCommit?: string;
    approval: unknown; objective: string; actions: string[]; relationsVerified: boolean;
    files: Array<{ layer: string; path: string; content: string }>;
    lessons: Array<{ layer: string; path: string; reason: string; observedRuleCodes: string[] }>;
    relations: any[];
}
export function readGoldenReference(entry: GoldenEntry, store: ApprovedGoldenStore) {
    const { manifest, publication, directory } = store.read(entry.goldenId, entry.versionHash);
    if (!manifest.active || publication.usage === 'evaluation') throw new Error('Referencia golden no disponible.');
    const reader = new GoldenSnapshotReader(directory);
    const scenario = reader.json('package/scenario.json');
    const response = reader.json('agent-response.json');
    const plan = reader.read('package/effective-generation-plan.json')
        ? reader.json('package/effective-generation-plan.json') : reader.json('package/generation-plan.json');
    const recovery = manifest.source === 'framework-recovery' && manifest.artifacts['package/framework-recovery.json']
        ? reader.json('package/framework-recovery.json') : undefined;
    const dependencies = reader.json('dependency-files.json');
    const context = goldenCaseContext(plan, response.files, dependencies, recovery);
    const changes = reader.json('qa-changes.json');
    const diagnostics = manifest.artifacts['package/validation.json'] ? reader.json('package/validation.json') : { errors: [] };
    const example: GoldenExample = {
        goldenId: entry.goldenId, revisionId: manifest.revisionId, versionHash: entry.versionHash, caseId: entry.caseId,
        recordingId: entry.recordingId, score: 0, approval: manifest.approval, objective: scenario.objective,
        actions: [...new Set<string>((scenario.actions || []).map((action: any) => action.action))],
        relationsVerified: Boolean(recovery?.relations?.length && !recovery.pending?.length && recovery.traceAssociations?.length
            && recovery.traceAssociations.every((trace: any) => trace.status === 'preserved')),
        relations: recovery?.relations || [], files: context.files, dependencies: context.dependencies,
        frameworkCommit: manifest.framework?.commit || manifest.framework?.head,
        lessons: changes.filter((change: any) => change.changed && context.files.some(file => file.path === change.path)).map((change: any) => ({
            path: change.path, layer: response.files.find((file: any) => file.path === change.path)?.layer || 'dependency',
            reason: publication.notes || 'QA corrigió esta capa; no registró un motivo.',
            observedRuleCodes: [...new Set<string>((diagnostics.errors || []).filter((error: any) =>
                !error.file || error.file === change.path || error.file.endsWith('/' + change.path)).map((error: any) => String(error.code || 'unclassified')))],
        })),
    };
    const allFiles: Array<{ path: string; layer: string; content: string }> = [...response.files, ...dependencies];
    const frameworkFiles = allFiles.map(file => ({ path: file.path,
        sha256: recovery?.files.find((item: any) => item.path === file.path)?.currentHash || goldenHash(file.content) }));
    return { example, scenario, allFiles, frameworkFiles };
}
