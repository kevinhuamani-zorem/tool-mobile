import { createHash } from 'crypto';
import type { AutomationValidation } from '../../../../core/automation/contracts';

/** Informational review data. It never changes validation, export or QA approval. */
export interface ReviewDiagnostic {
    id: string;
    code: string;
    message: string;
    file?: string;
    source: 'generation' | 'recording';
    severity: 'error' | 'warning';
    sequences: number[];
    passes: number[];
    status: 'pending' | 'resolved';
}

interface DiagnosticIssue {
    code?: string;
    message?: string;
    file?: string;
    sequence?: number;
    actionSequence?: number;
    actionSequences?: readonly number[];
    sequences?: readonly number[];
}

interface DiagnosticStage {
    /** LayeredGenerationStageReport uses zero-based attempts. */
    attempt?: number;
    pass?: number;
    error?: string;
    errors?: readonly (DiagnosticIssue | string)[];
    validation?: { errors?: readonly (DiagnosticIssue | string)[] };
}

export interface ReviewDiagnosticsInput {
    validation: Pick<AutomationValidation, 'valid' | 'errors'>;
    scenario?: { actions?: readonly { sequence?: number; selectorVerified?: boolean }[] };
    plan?: { resolutions?: readonly { sequence: number; resolution: string }[] };
    testDesignReview?: {
        status: string;
        issues?: readonly (DiagnosticIssue & {
            /** Older persisted reviews used sequence/issue instead of actionSequences/message. */
            issue?: string;
        })[];
    };
    qaObservations?: readonly { type: string; message: string; actionSequence: number }[];
    layeredRun?: { stages?: readonly DiagnosticStage[] };
}

const arrayOf = <T>(value: readonly T[] | undefined): readonly T[] => Array.isArray(value) ? value : [];
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const orderedNumbers = (values: readonly number[]): number[] => [...new Set(values)]
    .filter(value => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b);
const cleanText = (value: unknown): string => typeof value === 'string'
    ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';

function sequencesIn(message: string): number[] {
    const values: number[] = [];
    for (const match of message.matchAll(/\b(?:acci[oó]n|action|secuencia|sequence|seq\.?)\s*[:#]?\s*(\d+)/giu)) {
        values.push(Number(match[1]));
    }
    for (const match of message.matchAll(/\b(?:acciones|actions|secuencias|sequences)\s*:?\s*(\d+(?:\s*(?:,|y|e|and|&)\s*\d+)*)/giu)) {
        values.push(...(match[1].match(/\d+/gu) || []).map(Number));
    }
    return orderedNumbers(values);
}

function issueSequences(issue: DiagnosticIssue, message: string): number[] {
    return orderedNumbers([
        ...arrayOf(issue.sequences), ...arrayOf(issue.actionSequences),
        issue.sequence || 0, issue.actionSequence || 0, ...sequencesIn(message),
    ]);
}

function passOf(stage: DiagnosticStage): number | undefined {
    if (stage.pass === 1 || stage.pass === 2) return stage.pass;
    if (stage.attempt === 0 || stage.attempt === 1) return stage.attempt + 1;
    return undefined;
}

/** Parse persisted stage failures, never arbitrary output files or agent context. */
function parseStageError(value: unknown): DiagnosticIssue[] {
    const error = typeof value === 'string' ? value : '';
    const markers = [...error.matchAll(/\[([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\]\s*/gu)];
    if (!markers.length) return cleanText(error) ? [{ code: 'generation-stage', message: error }] : [];
    return markers.map((marker, index) => {
        const start = marker.index! + marker[0].length;
        const segment = error.slice(start, markers[index + 1]?.index ?? error.length).replace(/\s*\|\s*$/u, '').trim();
        const path = segment.match(/^([^\n]+?\.(?:feature|[cm]?[jt]sx?|json|ya?ml)):\s*/u);
        return { code: marker[1], ...(path ? { file: path[1] } : {}), message: path ? segment.slice(path[0].length) : segment };
    });
}

function expandIssue(value: DiagnosticIssue | string): DiagnosticIssue[] {
    if (typeof value === 'string') return parseStageError(value);
    if (!isObject(value) || !cleanText(value.message)) return [];
    if (['generation-incomplete', 'generation-stage'].includes(cleanText(value.code))
        && /\[[a-z][a-z0-9]*(?:-[a-z0-9]+)*\]/u.test(cleanText(value.message))) {
        return parseStageError(value.message);
    }
    return [value];
}

function stageIssues(stage: DiagnosticStage): DiagnosticIssue[] {
    const structured = [...arrayOf(stage.validation?.errors), ...arrayOf(stage.errors)].flatMap(expandIssue);
    return structured.length ? structured : parseStageError(stage.error);
}

function generationIssue(issue: DiagnosticIssue, passes: number[], status: ReviewDiagnostic['status']): Omit<ReviewDiagnostic, 'id'> | undefined {
    const message = cleanText(issue.message);
    if (!message) return undefined;
    const file = cleanText(issue.file);
    return {
        code: cleanText(issue.code) || 'generation-stage', message, ...(file ? { file } : {}),
        source: 'generation', severity: 'error', sequences: issueSequences(issue, message), passes, status,
    };
}

function recordingWarnings(input: ReviewDiagnosticsInput): Map<number, { code: string; message: string }> {
    const warnings = new Map<number, { code: string; message: string }>();
    for (const row of arrayOf(input.plan?.resolutions)) {
        if (!isObject(row) || row.resolution !== 'unresolved' || !orderedNumbers([row.sequence]).length) continue;
        warnings.set(row.sequence, {
            code: 'recording-action-association-pending',
            message: `El plan dejó pendiente la asociación de la acción ${row.sequence}. El QA debe revisar si quedó implementada en el código y corregir o volver a grabar esta acción si hace falta.`,
        });
    }
    for (const action of arrayOf(input.scenario?.actions)) {
        if (!isObject(action)) continue;
        const sequence = action.sequence;
        if (action.selectorVerified !== false || !sequence || !orderedNumbers([sequence]).length) continue;
        warnings.set(sequence, {
            code: 'recording-selector-unverified',
            message: `La acción ${sequence} tiene un selector sin verificar. El QA debe comprobar el elemento y corregir su asociación o volver a grabar esta acción. Una referencia en la traza no demuestra que esté implementada en el código.`,
        });
    }
    return warnings;
}

function observationMessage(type: string, sequence: number, fallback: string): string {
    switch (type) {
        case 'ui-text-quality': return 'Posible error ortográfico en el texto visible de la aplicación. Revisa el texto observado en la grabación y repórtalo si corresponde.';
        case 'weak-assertion': return `La verificación de la acción ${sequence} usa un selector genérico que puede identificar otro elemento. El QA debe comprobar el elemento esperado y refinar el selector o volver a grabar la verificación.`;
        case 'unspecific-selector': return `La acción ${sequence} usa un selector genérico que puede identificar otro elemento. El QA debe comprobarlo y refinar el selector o volver a grabar esta acción si hace falta.`;
        default: return cleanText(fallback);
    }
}

/**
 * Pure projection of already loaded artifacts. Pass numbers describe generation
 * history; recording warnings stay pending even when static validation passes.
 * No action values, selectors, Examples, observed text or review summaries are copied.
 */
export function buildReviewDiagnostics(input: ReviewDiagnosticsInput): ReviewDiagnostic[] {
    const diagnostics = new Map<string, ReviewDiagnostic>();
    const add = (issue: Omit<ReviewDiagnostic, 'id'> | undefined): void => {
        if (!issue || !issue.message) return;
        const identity = JSON.stringify([issue.source, issue.code, issue.file || '', issue.message]);
        const existing = diagnostics.get(identity);
        if (existing) {
            existing.passes = orderedNumbers([...existing.passes, ...issue.passes]);
            existing.sequences = orderedNumbers([...existing.sequences, ...issue.sequences]);
            if (issue.status === 'pending') existing.status = 'pending';
            return;
        }
        diagnostics.set(identity, { ...issue, id: `review-${createHash('sha256').update(identity).digest('hex').slice(0, 20)}` });
    };
    const stages = arrayOf(input.layeredRun?.stages).filter(isObject);
    // Current validation may follow a manual QA edit. Only stage evidence can
    // attribute an issue to an automatic pass; never copy the latest pass blindly.
    for (const issue of arrayOf(input.validation?.errors).flatMap(expandIssue)) add(generationIssue(issue, [], 'pending'));
    for (const stage of stages) {
        const pass = passOf(stage);
        for (const issue of stageIssues(stage)) {
            add(generationIssue(issue, pass ? [pass] : [], input.validation?.valid === true ? 'resolved' : 'pending'));
        }
    }
    const pendingRecording = recordingWarnings(input);
    const addWarning = (code: string, message: string, sequences: number[]): void => add({
        code, message, source: 'recording', severity: 'warning', sequences, passes: [], status: 'pending',
    });
    for (const [sequence, warning] of pendingRecording) addWarning(warning.code, warning.message, [sequence]);
    const review = input.testDesignReview;
    if (review && ['suggestion', 'qa-required'].includes(review.status)) {
        for (const issue of arrayOf(review.issues)) {
            if (!isObject(issue)) continue;
            let message = cleanText(issue.message || issue.issue);
            const sequences = issueSequences(issue, message);
            const remaining = sequences.filter(sequence => !pendingRecording.has(sequence));
            if (remaining.length < sequences.length) {
                if (!remaining.length) continue;
                // A grouped agent claim may incorrectly include an unresolved action.
                // Keep the review for the other actions without repeating that claim.
                message = `Revisa el diseño de la prueba para las acciones ${remaining.join(', ')}. Comprueba que sus verificaciones observen el resultado esperado y corrige o vuelve a grabar si hace falta.`;
            }
            addWarning(cleanText(issue.code) || 'test-design-review', message, remaining);
        }
    }
    for (const observation of arrayOf(input.qaObservations)) {
        if (!isObject(observation)) continue;
        const sequences = orderedNumbers([observation.actionSequence]);
        if (!sequences.length) continue;
        if (pendingRecording.has(sequences[0]) && ['weak-assertion', 'unspecific-selector'].includes(observation.type)) continue;
        addWarning(cleanText(observation.type) || 'recording-observation',
            observationMessage(observation.type, sequences[0], observation.message), sequences);
    }
    return [...diagnostics.values()];
}
