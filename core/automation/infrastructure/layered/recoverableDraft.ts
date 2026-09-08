import path from 'path';
import type { AgentGeneratedFile, GenerationPlan } from '../../contracts';
import { writeJsonUtf8 } from '../../../shared';
import { readLayeredOutput } from './outputEnvelope';
import { ROLE_LAYERS, type AuthorRole } from './roles';
import type { RecoverableLayeredDraft } from '../../domain/layeredGenerationContracts';

/** Current attempt only. Raw evidence also lives in the immutable history. */
export class RecoverableDraftStore {
    private readonly files = new Map<AgentGeneratedFile['layer'], RecoverableLayeredDraft['files'][number]>();
    constructor(private readonly root: string, private readonly plan: GenerationPlan) {}

    capture(file: string, origin: 'agent' | 'deterministic' | 'qa', role?: AuthorRole, pass?: 1 | 2): void {
        try {
            const value = readLayeredOutput(file) as any;
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
        const draft: RecoverableLayeredDraft = {
            files: [...this.files.values()],
            missingLayers: this.plan.files.filter(file => !this.files.has(file.layer)).map(file => file.layer),
            diagnostics: [...new Set(diagnostics)],
        };
        writeJsonUtf8(path.join(this.root, 'layered-draft.json'), draft);
        return draft;
    }
}
