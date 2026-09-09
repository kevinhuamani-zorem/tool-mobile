import path from 'path';
import fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import type { AgentGeneratedFile, AutomationAgentResponse, GenerationPlan } from '../../contracts';
import { assertLayeredEnvelope, readLayeredOutput } from './outputEnvelope';
import { ROLE_LAYERS, type AuthorRole } from './roles';
import type { RecoverableLayeredDraft } from '../../domain/layeredGenerationContracts';

const hash = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');

/** Never splice associations from different deliveries or assign them to foreign bytes. */
export function withRecoveredResponseMetadata(draft: RecoverableLayeredDraft, response: unknown,
    plan: GenerationPlan): RecoverableLayeredDraft {
    const { responseMetadata: _discarded, ...plain } = draft;
    try {
        assertLayeredEnvelope(response, true);
        const value = response as AutomationAgentResponse;
        if (value.recordingId !== plan.recordingId || value.planId !== plan.planId
            || value.files.length !== draft.files.length || !draft.files.length
            || new Set(value.files.map(file => file.layer)).size !== value.files.length
            || !value.files.every(file => plan.files.some(item => item.layer === file.layer && item.path === file.path)
                && draft.files.some(item => item.layer === file.layer && item.path === file.path && item.content === file.content))) return plain;
        if (value.completions !== undefined && (!Array.isArray(value.completions) || value.completions.some(item =>
            !item || typeof item.file !== 'string' || typeof item.name !== 'string'
            || !['android', 'ios'].includes(item.platform) || !Number.isInteger(item.sequence)))) return plain;
        const { files, ...metadata } = value;
        return { ...plain, responseMetadata: { response: JSON.parse(JSON.stringify(metadata)),
            files: files.map(file => ({ layer: file.layer, path: file.path, sha256: hash(file.content) })) } };
    } catch { return plain; }
}

export function recoveredResponseMetadata(draft: RecoverableLayeredDraft, plan: GenerationPlan) {
    const metadata = draft.responseMetadata;
    if (!metadata || !Array.isArray(metadata.files) || metadata.files.length !== draft.files.length
        || !draft.files.every(file => metadata.files.filter(item => item.layer === file.layer
            && item.path === file.path && item.sha256 === hash(file.content)).length === 1)) return undefined;
    return withRecoveredResponseMetadata(draft, { ...metadata.response, files: draft.files }, plan).responseMetadata?.response;
}

/** Recover one complete delivery only, including packages exported by older recorders. */
export function recoverDraftMetadata(root: string, draft: RecoverableLayeredDraft,
    plan: GenerationPlan): RecoverableLayeredDraft {
    if (recoveredResponseMetadata(draft, plan)) return draft;
    const { responseMetadata: _discarded, ...plain } = draft;
    for (const relative of ['agent-response.json', 'agents/sumrak/agent-response.json']) {
        try {
            const candidate = path.join(root, relative);
            const inside = path.relative(fs.realpathSync(root), fs.realpathSync(candidate));
            if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || !fs.statSync(candidate).isFile()) continue;
            const recovered = withRecoveredResponseMetadata(plain, readLayeredOutput(candidate, true), plan);
            if (recovered.responseMetadata) return recovered;
        } catch { /* Absent, escaped or malformed candidates cannot supply associations. */ }
    }
    return plain;
}

/** Current attempt only. Raw evidence also lives in the immutable history. */
export class RecoverableDraftStore {
    private readonly files = new Map<AgentGeneratedFile['layer'], RecoverableLayeredDraft['files'][number]>();
    constructor(private readonly root: string, private readonly plan: GenerationPlan) {}

    capture(file: string, origin: 'agent' | 'deterministic' | 'qa', role?: AuthorRole, pass?: 1 | 2): void {
        try {
            const value = readLayeredOutput(file, true) as any;
            if (!value || !Array.isArray(value.files) || value.files.length > 4) return;
            // Missing IDs can be repaired mechanically; foreign IDs are never recycled.
            if ((value.recordingId && value.recordingId !== this.plan.recordingId)
                || (value.planId && value.planId !== this.plan.planId)) return;
            for (const planned of this.plan.files) {
                if (path.isAbsolute(planned.path) || planned.path.split(/[\\/]/).includes('..')) continue;
                if (role && !(ROLE_LAYERS[role] as readonly string[]).includes(planned.layer)) continue;
                const matching = value.files.filter((item: any) => item?.layer === planned.layer);
                if (matching.length !== 1) continue;
                const item = matching[0];
                // Never guess destinations from partial JSON or accept a path outside the plan.
                if (item.path !== planned.path || typeof item.content !== 'string' || !item.content.trim()) continue;
                this.files.set(planned.layer, { layer: planned.layer, path: planned.path, content: item.content, origin, ...(pass ? { pass } : {}) });
            }
        } catch { /* Malformed output stays in history; keep the last recoverable layers. */ }
    }

    save(diagnostics: string[]): RecoverableLayeredDraft {
        let draft: RecoverableLayeredDraft = {
            files: [...this.files.values()],
            missingLayers: this.plan.files.filter(file => !this.files.has(file.layer)).map(file => file.layer),
            diagnostics: [...new Set(diagnostics)],
        };
        // A failed integration can still provide associations for its exact recovered files.
        draft = recoverDraftMetadata(this.root, draft, this.plan);
        // Hashes bind original bytes: shared UTF-8 writers normalize NFC and would invalidate them.
        const destination = path.join(this.root, 'layered-draft.json');
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
            fs.mkdirSync(this.root, { recursive: true });
            fs.writeFileSync(temporary, `${JSON.stringify(draft, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
            fs.renameSync(temporary, destination);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
        return draft;
    }
}
