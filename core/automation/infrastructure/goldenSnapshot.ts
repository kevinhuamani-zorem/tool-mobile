import fs from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { goldenHash, goldenPath } from './goldenFiles';
import { goldenPrimaryPaths } from './goldenCaseContext';

export const GOLDEN_EVIDENCE_ARCHIVE = 'evidence.pack.gz';
interface EvidenceArchive { schemaVersion: 1; artifacts: Record<string, string>; blobs: Record<string, string> }

/** Physical layout is independent of the approved logical inventory; no approval bytes are rewritten. */
export class GoldenSnapshotReader {
    private archive?: EvidenceArchive | null;
    constructor(readonly directory: string) {}
    read(name: string): Buffer | null {
        const file = goldenPath(this.directory, name);
        // Existing bytes are authoritative: never fall back to the archive to hide tampering.
        try {
            const stat = fs.statSync(file);
            if (!stat.isFile()) throw new Error('Artefacto golden inválido.');
            return fs.readFileSync(file);
        } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        if (this.archive === undefined) {
            const archiveFile = goldenPath(this.directory, GOLDEN_EVIDENCE_ARCHIVE);
            if (!fs.existsSync(archiveFile)) this.archive = null;
            else {
                const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(fs.readFileSync(archiveFile))));
                if (data.schemaVersion !== 1 || !data.artifacts || !data.blobs) throw new Error('Archivo de evidencia golden inválido.');
                this.archive = data;
            }
        }
        const hash = this.archive?.artifacts[name];
        if (!hash) return null;
        if (!/^[a-f0-9]{64}$/.test(hash) || typeof this.archive?.blobs[hash] !== 'string') throw new Error('Referencia de evidencia golden inválida.');
        const value = Buffer.from(this.archive.blobs[hash], 'base64');
        if (goldenHash(value) !== hash) throw new Error(`Artefacto golden alterado: ${name}`);
        return value;
    }
    require(name: string): Buffer {
        const value = this.read(name);
        if (value === null) throw new Error(`Falta artefacto golden: ${name}`);
        return value;
    }
    json<T = any>(name: string): T { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(this.require(name))); }
}

/** Four owned layers stay reviewable. Evidence is lossless, compressed and deduplicated by content hash. */
export function writeGoldenSnapshot(directory: string, manifestBytes: Buffer, manifest: any, artifacts: Map<string, Buffer>): Set<string> {
    const parse = (name: string) => artifacts.has(name) ? JSON.parse(artifacts.get(name)!.toString('utf8')) : undefined;
    const plan = parse('package/effective-generation-plan.json') || parse('package/generation-plan.json');
    const primary = goldenPrimaryPaths(plan, parse('agent-response.json').files, parse('package/framework-recovery.json'));
    const keep = new Set<string>(manifest.files.filter((file: any) => primary.has(file.path)).map((file: any) => `expected/${file.expected}`));
    const archive: EvidenceArchive = { schemaVersion: 1, artifacts: {}, blobs: {} };
    for (const [name, value] of [...artifacts].sort(([a], [b]) => a.localeCompare(b))) {
        const target = goldenPath(directory, name);
        if (keep.has(name)) {
            fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value, { flag: 'wx' });
        } else {
            const hash = goldenHash(value); archive.artifacts[name] = hash;
            archive.blobs[hash] = value.toString('base64');
        }
    }
    fs.writeFileSync(goldenPath(directory, GOLDEN_EVIDENCE_ARCHIVE), gzipSync(Buffer.from(JSON.stringify(archive)), { level: 9 }), { flag: 'wx' });
    fs.writeFileSync(goldenPath(directory, 'manifest.json'), manifestBytes, { flag: 'wx' });
    return keep;
}
