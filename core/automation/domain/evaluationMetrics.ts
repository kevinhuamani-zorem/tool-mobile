/** Explicit denominators: missing evidence is not a failed or successful observation. */
export const evaluationFraction = (numerator: number, denominator: number, notEvaluated = 0) => ({
    numerator, denominator, rate: denominator ? numerator / denominator : null, notEvaluated,
});
export type EvaluationOutcome = 'passed' | 'failed' | 'not-evaluated';
export interface PilotObservation {
    caseId: string; repetition: number; examples: boolean;
    status: 'completed' | 'interrupted' | 'infrastructure-error';
    static: EvaluationOutcome; acceptance: EvaluationOutcome; functional: EvaluationOutcome;
    qaCorrected: boolean; modelVerified: boolean; pipelinePassed?: boolean; prepared?: boolean; compilationStatus?: string;
}

/** Scheduled trials remain in the termination denominator, even when no artifact was delivered. */
export function summarizePilot(observations: PilotObservation[], scheduled: Array<{ caseId: string; repetition: number; examples: boolean }>) {
    const identity = (row: { caseId: string; repetition: number; examples: boolean }) => `${row.caseId}:${row.repetition}:${row.examples}`;
    if (new Set(scheduled.map(identity)).size !== scheduled.length) throw new Error('El protocolo contiene repeticiones duplicadas.');
    const keys = new Set(scheduled.map(identity));
    if (new Set(observations.map(identity)).size !== observations.length || observations.some(row => !keys.has(identity(row)))) throw new Error('Observaciones duplicadas o ajenas al protocolo.');
    const summarize = (expected: typeof scheduled, actual: PilotObservation[]) => {
        const measured = (field: 'static' | 'acceptance' | 'functional') => {
            const known = actual.filter(row => row[field] !== 'not-evaluated');
            return evaluationFraction(known.filter(row => row[field] === 'passed').length, known.length, expected.length - known.length);
        };
        const autonomous = actual.filter(row => typeof row.pipelinePassed === 'boolean' && row.static !== 'not-evaluated' && row.acceptance !== 'not-evaluated' && row.modelVerified);
        const passed = (row: PilotObservation) => row.pipelinePassed === true && row.prepared === true && ['passed', 'preexisting-errors'].includes(row.compilationStatus || '') && row.status === 'completed' && !row.qaCorrected && row.modelVerified && row.static === 'passed' && row.acceptance === 'passed';
        const groups = [...new Set(expected.map(row => row.caseId))].map(caseId => {
            const trials = actual.filter(row => row.caseId === caseId), count = expected.filter(row => row.caseId === caseId).length;
            return { caseId, scheduled: count, observed: trials.length, passed: trials.filter(passed).length,
                allRepetitionsPassed: trials.length === count && trials.every(passed) };
        });
        return { scheduled: expected.length, observed: actual.length,
            termination: evaluationFraction(actual.filter(row => row.status === 'completed').length, expected.length, expected.length - actual.length),
            staticPassRate: measured('static'), acceptanceImplementationPassRate: measured('acceptance'), functionalPassRate: measured('functional'),
            autonomousTaskSuccess: evaluationFraction(autonomous.filter(passed).length, expected.length, expected.length - autonomous.length),
            // An all-trials metric deliberately counts missing/failed trials as not passing the case.
            allRepetitionsPassRate: evaluationFraction(groups.filter(row => row.allRepetitionsPassed).length, groups.length),
            qaIntervention: evaluationFraction(actual.filter(row => row.qaCorrected).length, actual.length, expected.length - actual.length),
            actualModelUnverified: actual.filter(row => !row.modelVerified).length,
            pipelineFailures: actual.filter(row => row.pipelinePassed === false).length,
            finalPreparationUnverified: actual.filter(row => row.prepared !== true).length,
            compilationUnverified: actual.filter(row => !['passed', 'preexisting-errors'].includes(row.compilationStatus || '')).length,
            infrastructureErrors: actual.filter(row => row.status === 'infrastructure-error').length,
            interrupted: actual.filter(row => row.status === 'interrupted').length, cases: groups };
    };
    return { ...summarize(scheduled, observations), arms: [false, true].map(examples => ({ examples,
        ...summarize(scheduled.filter(row => row.examples === examples), observations.filter(row => row.examples === examples)) })),
        scope: 'Static implementation acceptance is separate from device execution; corrected trials never become autonomous successes.' };
}

export function summarizeControlledFaults(samples: Array<{ id: string; expected: 'valid' | 'invalid'; observed: 'valid' | 'invalid' | 'not-evaluated'; expectedCode?: string; actualCodes: string[] }>) {
    if (new Set(samples.map(row => row.id)).size !== samples.length) throw new Error('Mutaciones duplicadas.');
    const known = samples.filter(row => row.observed !== 'not-evaluated');
    const tp = known.filter(row => row.expected === 'invalid' && row.observed === 'invalid' && (!row.expectedCode || row.actualCodes.includes(row.expectedCode))).length;
    const fp = known.filter(row => row.expected === 'valid' && row.observed === 'invalid').length;
    const fn = known.filter(row => row.expected === 'invalid' && (row.observed === 'valid' || row.expectedCode && !row.actualCodes.includes(row.expectedCode))).length;
    return { truePositives: tp, falsePositives: fp, falseNegatives: fn,
        precision: evaluationFraction(tp, tp + fp), recall: evaluationFraction(tp, tp + fn),
        notEvaluated: samples.length - known.length, measured: known.length, samples,
        scope: 'Detection of labelled injected defects; not an agent success rate.' };
}
