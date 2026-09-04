import path from 'path';
import type { GenerationPlan } from '../../automation/contracts';
import { readJsonUtf8, writeJsonUtf8 } from '../../shared';
import {
    DETERMINISTIC_DRAFT_SCHEMA_VERSION,
    DeterministicGenerationDraft,
} from '../domain/deterministicDraft';
import { DeterministicGenerator } from './deterministicGenerator';

export class DeterministicDraftBuilder {
    constructor(private readonly generator = new DeterministicGenerator()) {}

    build(packageDirectory: string): DeterministicGenerationDraft {
        const plan = readJsonUtf8<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const response = this.generator.createDraft(packageDirectory);
        const draft: DeterministicGenerationDraft = {
            schemaVersion: DETERMINISTIC_DRAFT_SCHEMA_VERSION,
            recordingId: plan.recordingId,
            planId: plan.planId,
            planFingerprint: plan.fingerprint,
            files: response.files,
            actionTrace: response.actionTrace,
            assumptions: [
                'Borrador local del recorder: sirve como referencia editable y no reemplaza las decisiones de los agentes.',
            ],
        };
        writeJsonUtf8(path.join(packageDirectory, 'deterministic-draft.json'), draft);
        return draft;
    }
}

