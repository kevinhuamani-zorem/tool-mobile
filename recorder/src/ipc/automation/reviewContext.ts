import fs from 'fs';
import path from 'path';
import { analyzeScenarioUiTextQuality } from '../../../../core/automation';
import type { AutomationScenario, GenerationPlan, QaObservationsArtifact } from '../../../../core/automation';
import type { AutomationValidation } from '../../../../core/validation';
import { readJsonUtf8 } from '../../../../core/shared';
import { buildReviewDiagnostics } from './reviewDiagnostics';

/** Recover optional legacy observations in memory without replacing their original file. */
export function loadQaObservations(packageDirectory: string, scenario: AutomationScenario): QaObservationsArtifact {
    try {
        const artifact = readJsonUtf8<QaObservationsArtifact>(path.join(packageDirectory, 'qa-observations.json'));
        if (artifact && Array.isArray(artifact.observations) && artifact.recordingId === scenario.recordingId) {
            return { ...artifact, observations: artifact.observations.filter(item => item && typeof item.type === 'string'
                && typeof item.message === 'string' && Number.isInteger(item.actionSequence)) };
        }
    } catch { /* Optional reports do not invalidate the prepared code. */ }
    return analyzeScenarioUiTextQuality(scenario);
}

/** Optional presentation evidence never changes validation or export permissions. */
export function loadReviewDiagnostics(packageDirectory: string, validation: AutomationValidation,
    scenario?: AutomationScenario, plan?: GenerationPlan, qaObservations?: QaObservationsArtifact['observations']) {
    const read = (name: string): any => {
        try {
            const file = path.join(packageDirectory, name);
            return fs.existsSync(file) ? readJsonUtf8(file) : undefined;
        } catch { return undefined; }
    };
    const run = read('layered-generation-run.json');
    try { return buildReviewDiagnostics({
        validation, scenario, plan,
        testDesignReview: read('test-design-review.json'),
        qaObservations: qaObservations || (scenario ? loadQaObservations(packageDirectory, scenario).observations : read('qa-observations.json')?.observations),
        layeredRun: plan && run?.planId === plan.planId ? run : undefined,
    }); } catch { return buildReviewDiagnostics({ validation, scenario, plan }); }
}
