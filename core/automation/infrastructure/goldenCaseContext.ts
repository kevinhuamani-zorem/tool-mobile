import { goldenHash } from './goldenFiles';

type File = { path: string; layer: string; content: string };
export interface GoldenDependencyReference {
    path: string; layer: string; sha256: string; frameworkHash: string; symbols: string[]; referencedBy: string[];
}

/** A recovered rename stays a case file; following a reused login does not make its helpers new case layers. */
export function goldenPrimaryPaths(plan: { files: Array<{ path: string }> }, files: File[], recovery?: any): Set<string> {
    const planned = new Set(plan.files.map(file => file.path));
    const recovered = new Map<string, any>((recovery?.files || []).map((file: any) => [file.path, file]));
    return new Set(files.filter(file => {
        const origin = recovered.get(file.path);
        return planned.has(file.path) || origin?.association === 'receipt' || origin?.previousPath && planned.has(origin.previousPath);
    }).map(file => file.path));
}

/** References identify exact approved dependencies; their code remains in the reproducible evidence. */
export function goldenCaseContext(plan: { files: Array<{ path: string }> }, files: File[], dependencies: File[], recovery?: any) {
    const primary = goldenPrimaryPaths(plan, files, recovery);
    const caseFiles = files.filter(file => primary.has(file.path));
    const relations = recovery?.relations || [];
    const reachable = (start: string) => {
        const found = new Set([start]); const queue = [start];
        for (const current of queue) for (const relation of relations) {
            const next = relation.to?.path;
            if (relation.from?.path === current && next && !found.has(next)) { found.add(next); queue.push(next); }
        }
        return found;
    };
    const consumers = new Map(caseFiles.map(file => [file.path, reachable(file.path)]));
    const unique = new Map([...files.filter(file => !primary.has(file.path)), ...dependencies].map(file => [file.path, file]));
    const references: GoldenDependencyReference[] = [...unique.values()].map(file => {
        const recovered = recovery?.files?.find((item: any) => item.path === file.path);
        const symbols: string[] = [...new Set<string>([
            ...(recovered?.symbols || []), ...relations.filter((edge: any) => edge.to?.path === file.path).map((edge: any) => edge.to.symbol).filter(Boolean),
        ])].sort();
        return { path: file.path, layer: file.layer || 'dependency', sha256: goldenHash(file.content),
            frameworkHash: recovered?.currentHash || goldenHash(file.content), symbols,
            referencedBy: caseFiles.filter(owner => !relations.length || consumers.get(owner.path)!.has(file.path)).map(owner => owner.path) };
    }).sort((a, b) => a.path.localeCompare(b.path));
    return { files: caseFiles, dependencies: references };
}
