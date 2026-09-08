import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { AutomationHistoryArtifact, AutomationHistoryEvent, AutomationHistoryIdentity, AutomationArtifactOrigin, AutomationRevisionSource, AutomationLifecycle } from '../contracts/automationHistory';

type EventInput = Omit<AutomationHistoryEvent, 'schemaVersion' | 'eventId' | 'sequence' | 'createdAt' | 'artifacts'>;
type ArtifactInput = { name: string; content: Buffer | string };
const hash = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Immutable, content-addressed evidence kept outside the mutable package views. */
export class AutomationHistoryStore {
    readonly root: string;
    constructor(readonly packageDirectory: string) {
        this.root = path.join(packageDirectory, 'history', 'v1');
    }

    private directory(...parts: string[]): string {
        let current = this.packageDirectory;
        // Never follow a substituted history directory outside this package.
        for (const part of ['history', 'v1', ...parts]) {
            current = path.join(current, part);
            if (fs.existsSync(current)) {
                const stat = fs.lstatSync(current);
                if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('El historial requiere directorios locales sin enlaces.');
            } else fs.mkdirSync(current, { recursive: true });
        }
        return current;
    }

    private immutable(file: string, bytes: Buffer | string): void {
        const temporary = path.join(path.dirname(file), `.pending-${crypto.randomUUID()}`);
        try {
            fs.writeFileSync(temporary, bytes, { flag: 'wx' });
            try { fs.linkSync(temporary, file); }
            catch (error: any) {
                if (error.code !== 'EEXIST') throw error;
                if (fs.lstatSync(file).isSymbolicLink() || hash(fs.readFileSync(file)) !== hash(bytes)) {
                    throw new Error('El contenido inmutable del historial fue alterado.');
                }
            }
        } finally { try { fs.rmSync(temporary, { force: true }); } catch { /* A committed event stays committed. */ } }
    }

    events(): AutomationHistoryEvent[] {
        if (!fs.existsSync(this.root)) return [];
        const directory = this.directory('events');
        return fs.readdirSync(directory).filter(name => /^\d{12}-[a-f0-9]{64}\.json$/.test(name)).sort().map(name => {
            const file = path.join(directory, name);
            if (fs.lstatSync(file).isSymbolicLink()) throw new Error('El historial no admite enlaces de eventos.');
            const bytes = fs.readFileSync(file);
            if (hash(bytes) !== name.slice(13, -5)) throw new Error('Un evento del historial fue alterado.');
            const event = JSON.parse(bytes.toString('utf8')) as AutomationHistoryEvent;
            if (event.schemaVersion !== 1 || event.sequence !== Number(name.slice(0, 12))) throw new Error('Versión o secuencia del historial no soportada.');
            return event;
        });
    }

    current(): AutomationHistoryEvent | undefined {
        return this.events().filter(event => event.kind === 'revision-created').at(-1);
    }

    identity(): AutomationHistoryIdentity | undefined {
        const current = this.current();
        if (!current) return undefined;
        const attempt = this.events().filter(event => (event.kind === 'attempt-started' || event.kind === 'attempt-planned') && event.revisionId === current.revisionId).at(-1);
        return {
            recordingId: current.recordingId, caseId: current.caseId,
            revisionId: current.revisionId, parentRevisionId: current.parentRevisionId, basedOnAttemptId: current.basedOnAttemptId,
            ...(attempt ? { attemptId: attempt.attemptId, planId: attempt.planId } : {}),
        };
    }

    beginRevision(input: { recordingId: string; caseId?: string; source: AutomationRevisionSource }, artifacts: ArtifactInput[] = []): AutomationHistoryEvent {
        const parent = this.current();
        if (parent && parent.recordingId !== input.recordingId) throw new Error('El historial pertenece a otra grabación.');
        if (parent?.caseId && input.caseId && parent.caseId !== input.caseId) throw new Error('El caseId no puede cambiar dentro del historial del mismo caso.');
        return this.append({
            recordingId: input.recordingId, caseId: input.caseId || parent?.caseId,
            revisionId: `revision-${crypto.randomUUID()}`, parentRevisionId: parent?.revisionId,
            basedOnAttemptId: this.identity()?.attemptId || parent?.basedOnAttemptId,
            kind: 'revision-created', source: input.source,
            origin: input.source === 'qa-edit' ? 'qa' : input.source === 'framework-import' ? 'framework' : input.source === 'legacy' ? 'legacy' : 'recording',
        }, artifacts);
    }

    ensureRevision(recordingId: string, caseId?: string): AutomationHistoryEvent {
        const current = this.current();
        if (!current) return this.beginRevision({ recordingId, caseId, source: 'legacy' });
        if (current.recordingId !== recordingId) throw new Error('El intento pertenece a otra grabación.');
        if (current.caseId && caseId && current.caseId !== caseId) throw new Error('El caseId del historial no coincide con el caso actual.');
        return current;
    }

    startAttempt(recordingId: string, attemptId: string, planId?: string): AutomationHistoryIdentity {
        const revision = this.ensureRevision(recordingId);
        const identity = { recordingId, caseId: revision.caseId, revisionId: revision.revisionId, parentRevisionId: revision.parentRevisionId, attemptId, planId };
        this.append({ ...identity, kind: 'attempt-started', origin: 'recorder' });
        return identity;
    }

    append(input: EventInput, artifacts: ArtifactInput[] = []): AutomationHistoryEvent {
        const descriptors = artifacts.map(({ name, content }): AutomationHistoryArtifact => {
            const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
            const sha256 = hash(bytes);
            this.immutable(path.join(this.directory('blobs'), sha256), bytes);
            return { name, sha256, bytes: bytes.length };
        });
        const previous = this.events();
        const event: AutomationHistoryEvent = {
            ...input, schemaVersion: 1, eventId: crypto.randomUUID(),
            sequence: (previous.at(-1)?.sequence || 0) + 1,
            createdAt: new Date().toISOString(), artifacts: descriptors,
        };
        const bytes = JSON.stringify(event, null, 2) + '\n';
        const file = `${String(event.sequence).padStart(12, '0')}-${hash(bytes)}.json`;
        this.immutable(path.join(this.directory('events'), file), bytes);
        return event;
    }

    capture(name: string, content: Buffer | string, origin: AutomationArtifactOrigin, stage: string, pass?: 1 | 2): AutomationHistoryEvent | undefined {
        const identity = this.identity();
        if (!identity) return undefined;
        const digest = hash(content);
        const previous = this.events().filter(event => event.revisionId === identity.revisionId && event.attemptId === identity.attemptId && event.stage === stage && event.artifacts.some(item => item.name === name)).at(-1);
        if (previous?.artifacts.some(item => item.name === name && item.sha256 === digest)) return previous;
        return this.append({ ...identity, kind: 'artifact-captured', origin, stage, ...(pass ? { pass } : {}) }, [{ name, content }]);
    }

    captureFile(file: string, origin: AutomationArtifactOrigin, stage: string, pass?: 1 | 2): void {
        if (!fs.existsSync(file)) return;
        // macOS may spell the same temp directory as /var or /private/var.
        // Compare real paths, also detecting a parent directory redirected outside.
        const relative = path.relative(fs.realpathSync(this.packageDirectory), fs.realpathSync(file));
        if (relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(file).isSymbolicLink()) throw new Error('Archivo de evidencia fuera del paquete.');
        this.capture(relative.replace(/\\/g, '/'), fs.readFileSync(file), origin, stage, pass);
    }

    /** Snapshot before reset includes partial/invalid bytes, without following links. */
    checkpoint(stage: string): void {
        if (!this.identity()) return;
        const artifacts: ArtifactInput[] = [];
        const walk = (directory: string): void => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                if (entry.name === 'history' || entry.name.startsWith('.')) continue;
                const file = path.join(directory, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (entry.isFile() && /\.(json|ts|feature|md)$/.test(entry.name)) artifacts.push({
                    name: path.relative(this.packageDirectory, file).replace(/\\/g, '/'), content: fs.readFileSync(file),
                });
            }
        };
        if (fs.existsSync(this.packageDirectory)) walk(this.packageDirectory);
        if (artifacts.length) this.append({ ...this.identity()!, kind: 'artifact-captured', origin: 'legacy', stage }, artifacts);
    }

    readArtifact(artifact: AutomationHistoryArtifact): Buffer {
        if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Hash de evidencia inválido.');
        const file = path.join(this.directory('blobs'), artifact.sha256);
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error('El historial no admite enlaces de artefactos.');
        const content = fs.readFileSync(file);
        if (content.length !== artifact.bytes || hash(content) !== artifact.sha256) throw new Error('Un artefacto histórico fue alterado.');
        return content;
    }

    lifecycle(revisionId = this.current()?.revisionId): AutomationLifecycle {
        const state: AutomationLifecycle = { generation: 'not-started', export: 'not-exported', qaApproval: 'pending', functionalVerification: 'not-reported' };
        for (const event of this.events().filter(event => event.revisionId === revisionId)) {
            if (event.kind === 'attempt-started') state.generation = 'running';
            if (event.kind === 'generation-result') state.generation = event.result === 'passed' ? 'passed' : event.result === 'failed' ? 'failed' : 'unknown';
            if (event.kind === 'export-result') state.export = event.result === 'exported' ? 'exported' : 'failed';
            if (event.kind === 'qa-verification') {
                if (event.result === 'approved' || event.result === 'revoked') state.qaApproval = event.result;
                if (event.result === 'passed' || event.result === 'failed') state.functionalVerification = event.result;
            }
        }
        return state;
    }
}
