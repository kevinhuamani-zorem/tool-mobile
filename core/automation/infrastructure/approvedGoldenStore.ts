import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const goldenHash = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
export interface GoldenApproval { status: 'approved'; actor: string; at: string; source: 'qa-declaration' }
export interface GoldenPublication {
    schemaVersion: 1; sequence: number; previous: string | null; goldenId: string; versionHash: string;
    manifestHash: string; revisionId: string; executed?: 'passed' | 'failed' | 'not-run'; notes?: string; action: 'approved' | 'revoked'; actor: string; at: string;
}
export interface ApprovedGoldenIndex {
    schemaVersion: 1; fingerprint: string;
    entries: Array<{ goldenId: string; revisionId: string; versionHash: string; manifestHash: string; directory: string;
        squad: string; platform: string; featureScope: string; environment: string; contract: string; recordingId: string; caseId: string; source: string; approval: GoldenApproval }>;
    issues: string[]; versions: number;
}
export function goldenPath(root: string, relative: string): string {
    if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Ruta golden inválida.');
    const target = path.resolve(root, relative);
    let cursor = target;
    while (cursor !== path.resolve(root)) {
        try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('El dataset no admite symlinks.'); }
        catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        cursor = path.dirname(cursor);
    }
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('El dataset no admite symlinks.');
    return target;
}
function bytes(root: string, file: string): Buffer {
    const target = goldenPath(root, file); const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Artefacto golden inválido o demasiado grande.');
    return fs.readFileSync(target);
}
const json = (root: string, file: string): any => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(root, file)));
function atomic(file: string, content: string) {
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temp, content, { flag: 'wx' }); fs.renameSync(temp, file); }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

/** Publication records are authority. The index is a disposable projection. */
export class ApprovedGoldenStore {
    constructor(readonly root: string) {}
    private publications(goldenId: string): Array<{ value: GoldenPublication; hash: string }> {
        if (!/^golden-[a-f0-9]{64}$/.test(goldenId)) throw new Error('Identidad golden inválida.');
        const relative = `approved/${goldenId}/publications`;
        const directory = goldenPath(this.root, relative);
        if (!fs.existsSync(directory)) return [];
        let previous: string | null = null;
        return fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort().map((name, index) => {
            const match = /^(\d{12})-([a-f0-9]{64})\.json$/.exec(name);
            if (!match) throw new Error('Publicación golden inválida.');
            const content = bytes(this.root, `${relative}/${name}`); const value = JSON.parse(content.toString('utf8')) as GoldenPublication;
            if (goldenHash(content) !== match[2] || value.schemaVersion !== 1 || value.goldenId !== goldenId || value.sequence !== index + 1
                || Number(match[1]) !== value.sequence || value.previous !== previous || !['approved', 'revoked'].includes(value.action)
                || !value.actor?.trim() || !/^[a-f0-9]{64}$/.test(value.versionHash) || !/^[a-f0-9]{64}$/.test(value.manifestHash)) throw new Error('La publicación golden fue alterada.');
            previous = match[2]; return { value, hash: match[2] };
        });
    }
    private verify(goldenId: string, versionHash: string, manifestHash?: string): { directory: string; manifest: any } {
        if (!/^[a-f0-9]{64}$/.test(versionHash)) throw new Error('Versión golden inválida.');
        const relative = `approved/${goldenId}/versions/${versionHash}`;
        const manifestBytes = bytes(this.root, `${relative}/manifest.json`);
        if (manifestHash && goldenHash(manifestBytes) !== manifestHash) throw new Error('El manifiesto golden fue alterado.');
        const manifest = JSON.parse(manifestBytes.toString('utf8'));
        if (manifest.schemaVersion !== 2 || manifest.goldenId !== goldenId || manifest.versionHash !== versionHash || !manifest.artifacts) throw new Error('Identidad de versión golden inválida.');
        for (const [file, expected] of Object.entries(manifest.artifacts) as Array<[string, { sha256: string; bytes: number }]>) {
            const content = bytes(this.root, `${relative}/${file}`);
            if (content.length !== expected.bytes || goldenHash(content) !== expected.sha256) throw new Error(`Artefacto golden alterado: ${file}`);
        }
        for (const required of ['agent-response.json', 'package/scenario.json', 'package/generation-plan.json', 'catalog.json', 'diagnostics.json', 'execution.json', 'qa-changes.json', 'provenance/events.json', 'dependency-files.json']) if (!manifest.artifacts[required]) throw new Error('Inventario golden incompleto.');
        const response = json(this.root, `${relative}/agent-response.json`);
        const scenario = json(this.root, `${relative}/package/scenario.json`);
        const contextHash = goldenHash(JSON.stringify(Object.entries(manifest.artifacts).filter(([name]) => !name.startsWith('provenance/') && !name.startsWith('expected/') && !['execution.json', 'agent-response.json', 'dependency-files.json'].includes(name)).map(([name, value]: [string, any]) => [name, value.sha256]).sort(([a], [b]) => a.localeCompare(b))));
        if (contextHash !== manifest.contextHash) throw new Error('Contexto golden alterado.');
        const contentKey = { recordingId: scenario.recordingId, caseId: scenario.request?.caseId || '', squad: scenario.squad, platform: scenario.platform,
            featureScope: scenario.request?.featureScope || '', environment: scenario.environment || '',
            contextHash, scenarioHash: goldenHash(bytes(this.root, `${relative}/package/scenario.json`)), contract: manifest.contract, dependencies: json(this.root, `${relative}/dependency-files.json`), files: response.files.map((file: any) => ({ layer: file.layer, path: file.path, content: file.content })).sort((a: any, b: any) => a.path.localeCompare(b.path)) };
        const { contract: _, files: __, dependencies: ___, scenarioHash: ____, contextHash: _____, ...identity } = contentKey;
        if (`golden-${goldenHash(JSON.stringify(identity))}` !== goldenId || Object.entries(identity).some(([key, value]) => manifest[key] !== value)) throw new Error('Ámbito golden alterado.');
        if (manifest.files.length !== response.files.length || new Set(response.files.map((file: any) => file.path)).size !== response.files.length) throw new Error('Inventario de capas inválido.');
        if (goldenHash(JSON.stringify(contentKey)) !== versionHash) throw new Error('El contenido golden no corresponde a su versión.');
        for (const file of manifest.files) {
            if (!manifest.artifacts[`expected/${file.expected}`]) throw new Error('Falta hash de capa golden.');
            const expected = bytes(this.root, `${relative}/expected/${file.expected}`);
            if (goldenHash(expected) !== file.sha256 || !response.files.some((item: any) => item.path === file.path && item.layer === file.layer && Buffer.from(item.content).equals(expected))) throw new Error('Las capas golden no coinciden con lo aprobado.');
        }
        return { directory: goldenPath(this.root, relative), manifest };
    }
    read(goldenId: string, versionHash?: string) {
        const publications = this.publications(goldenId);
        const active = publications.at(-1)?.value;
        const approved = [...publications].reverse().find(item => item.value.action === 'approved' && (!versionHash || item.value.versionHash === versionHash))?.value;
        if (!approved) throw new Error('La versión no tiene una aprobación QA publicada.');
        const result = this.verify(goldenId, approved.versionHash, approved.manifestHash);
        return { ...result, manifest: { ...result.manifest, revisionId: approved.revisionId, executed: approved.executed || result.manifest.executed, notes: approved.notes, approval: { status: 'approved', actor: approved.actor, at: approved.at, source: 'qa-declaration' },
            active: active?.action === 'approved' && active.versionHash === approved.versionHash }, publication: approved };
    }
    private locked<T>(run: () => T): T {
        fs.mkdirSync(this.root, { recursive: true });
        const lock = goldenPath(this.root, '.publication.lock');
        if (fs.existsSync(lock)) {
            const pid = Number(fs.readFileSync(lock, 'utf8'));
            if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Publicación golden en curso; revisa el bloqueo local.');
            try { process.kill(pid, 0); throw new Error('Otra publicación golden está en curso.'); }
            catch (error: any) { if (error.code !== 'ESRCH') throw error; fs.unlinkSync(lock); }
        }
        fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
        try { return run(); } finally { try { fs.unlinkSync(lock); } catch { /* Publication remains authoritative. */ } }
    }
    protected publishRecord(goldenId: string, value: GoldenPublication): void {
        const directory = goldenPath(this.root, `approved/${goldenId}/publications`); fs.mkdirSync(directory, { recursive: true });
        const content = JSON.stringify(value, null, 2) + '\n';
        // A hard-link publishes exactly once without replacing an existing record.
        const temp = path.join(directory, `.pending-${crypto.randomUUID()}`);
        try { fs.writeFileSync(temp, content, { flag: 'wx' }); fs.linkSync(temp, path.join(directory, `${String(value.sequence).padStart(12, '0')}-${goldenHash(content)}.json`)); }
        finally { try { fs.unlinkSync(temp); } catch { /* The record may already be committed. */ } }
    }
    publish(manifest: any, artifacts: Map<string, Buffer>, actor: string, revisionId: string, approved: boolean) {
        if (approved !== true || !actor.trim() || !revisionId) throw new Error('Se necesita aprobación QA explícita y una revisión concreta.');
        const result = this.locked(() => {
            const { goldenId, versionHash } = manifest;
            const publications = this.publications(goldenId); const latest = publications.at(-1);
            const directory = goldenPath(this.root, `approved/${goldenId}/versions/${versionHash}`);
            if (!fs.existsSync(directory)) {
                const staging = goldenPath(this.root, `approved/${goldenId}/versions/.pending-${crypto.randomUUID()}`);
                fs.mkdirSync(staging, { recursive: true });
                try {
                    for (const [file, content] of artifacts) { const target = goldenPath(staging, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, { flag: 'wx' }); }
                    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
                    fs.renameSync(staging, directory);
                } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
            }
            const prior = [...publications].reverse().find(item => item.value.action === 'approved' && item.value.versionHash === versionHash);
            const version = this.verify(goldenId, versionHash, prior?.value.manifestHash);
            const manifestHash = goldenHash(fs.readFileSync(path.join(directory, 'manifest.json')));
            if (latest?.value.action === 'approved' && latest.value.versionHash === versionHash && latest.value.revisionId === revisionId && latest.value.actor === actor
                && latest.value.executed === manifest.executed && (latest.value.notes || '') === (manifest.notes || '')) {
                this.verify(goldenId, versionHash, latest.value.manifestHash);
                return { ...this.read(goldenId, versionHash), duplicate: true };
            }
            const at = new Date().toISOString();
            this.publishRecord(goldenId, { schemaVersion: 1, sequence: publications.length + 1, previous: latest?.hash || null,
                goldenId, versionHash, manifestHash, revisionId, executed: manifest.executed, notes: manifest.notes, action: 'approved', actor, at });
            return { ...version, manifest: { ...version.manifest, revisionId, executed: manifest.executed, notes: manifest.notes, approval: { status: 'approved', actor, at, source: 'qa-declaration' } }, duplicate: Boolean(prior) };
        });
        let indexWarning: string | undefined;
        try { this.rebuildIndex(); } catch { indexWarning = 'Golden aprobado; el índice local se reconstruirá desde las publicaciones.'; }
        return { ...result, indexWarning };
    }
    revoke(goldenId: string, versionHash: string, actor: string) {
        this.locked(() => {
            const pubs = this.publications(goldenId); const latest = pubs.at(-1);
            if (!latest || latest.value.action !== 'approved' || latest.value.versionHash !== versionHash) throw new Error('La versión activa cambió. Actualiza la lista.');
            this.publishRecord(goldenId, { ...latest.value, sequence: pubs.length + 1, previous: latest.hash, action: 'revoked', actor, at: new Date().toISOString() });
        });
        try { return { index: this.rebuildIndex() }; } catch { return { indexWarning: 'Revocación publicada; reconstruye el índice.' }; }
    }
    index(): ApprovedGoldenIndex {
        const entries: ApprovedGoldenIndex['entries'] = []; const issues: string[] = []; const heads: string[] = []; let versions = 0;
        const directory = goldenPath(this.root, 'approved');
        if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory).sort()) {
            if (!name.startsWith('golden-')) continue;
            try {
                const pubs = this.publications(name); const latest = pubs.at(-1);
                versions += new Set(pubs.filter(item => item.value.action === 'approved').map(item => item.value.versionHash)).size;
                if (!latest) continue; heads.push(latest.hash);
                if (latest.value.action !== 'approved') continue;
                const { manifest, directory } = this.read(name, latest.value.versionHash);
                entries.push({ goldenId: name, revisionId: latest.value.revisionId, versionHash: latest.value.versionHash, manifestHash: latest.value.manifestHash,
                    directory, squad: manifest.squad, platform: manifest.platform, contract: manifest.contract, recordingId: manifest.recordingId,
                    caseId: manifest.caseId, featureScope: manifest.featureScope, environment: manifest.environment, source: manifest.source || 'qa', approval: manifest.approval });
            } catch (error: any) { issues.push(`${name}: ${error.message}`); }
        }
        return { schemaVersion: 1, fingerprint: goldenHash(JSON.stringify({ heads, issues })), entries, issues, versions };
    }
    rebuildIndex(): ApprovedGoldenIndex {
        const index = this.index(); fs.mkdirSync(this.root, { recursive: true });
        atomic(goldenPath(this.root, 'approved-index.json'), JSON.stringify(index, null, 2) + '\n'); return index;
    }
    /** Conservative F7 boundary: mutable framework bytes never inherit historical approval. */
    compatible(scope: { squad: string; platform: string; contract: string; featureScope?: string; environment?: string }, frameworkRoot: string) {
        return this.index().entries.filter(entry => {
            if (entry.squad !== scope.squad || entry.platform !== scope.platform || entry.contract !== scope.contract) return false;
            try {
                const { directory, manifest } = this.read(entry.goldenId, entry.versionHash);
                if (manifest.featureScope !== (scope.featureScope || '') || manifest.environment !== (scope.environment || '')) return false;
                const recovery = manifest.source === 'framework-recovery' && manifest.artifacts['package/framework-recovery.json'] ? json(directory, 'package/framework-recovery.json') : undefined;
                const files = [...json(directory, 'agent-response.json').files, ...json(directory, 'dependency-files.json')];
                return files.every((file: any) => {
                    const expected = recovery?.files.find((item: any) => item.path === file.path)?.currentHash || goldenHash(file.content);
                    return goldenHash(bytes(frameworkRoot, file.path)) === expected;
                });
            } catch { return false; }
        });
    }
    stats() { const value = this.index(); return { approvedCases: value.entries.length, successfulCases: value.entries.length,
        versions: value.versions, interactions: 0, gapDecisions: 0, integrityErrors: value.issues.length, fingerprint: value.fingerprint }; }
}
