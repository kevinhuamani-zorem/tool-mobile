import { linearizeCoverageExtractions } from './caseCoverage/extraction';
import { CoverageSources, coverageHash } from './caseCoverage/sources';
import { CoverageExecution, CoverageStepDefinitions } from './caseCoverage/steps';
import { expandCoverageStep, readCoverageScenario } from './caseCoverage/feature';

export interface CaseCoverageSnapshot { featurePath: string; files: Record<string, string> }
export interface CompareCaseCoverageInput {
    caseId: string;
    before: CaseCoverageSnapshot;
    after: CaseCoverageSnapshot;
    platform: 'android' | 'ios';
}
export interface CaseCoverageDifference {
    code: string;
    message: string;
    beforeStepIndices: number[];
    afterStepIndices: number[];
    exampleIndex?: number;
}
export interface CaseCoverageMapping {
    beforeStepIndices: number[];
    afterStepIndices: number[];
    exampleIndex: number;
}
export interface CaseCoverageReport {
    schemaVersion: 1;
    caseId: string;
    platform: 'android' | 'ios';
    baselineHash: string;
    candidateHash: string;
    status: 'preserved' | 'lost' | 'unverified';
    differences: CaseCoverageDifference[];
    mappings: CaseCoverageMapping[];
    checkedExamples: number;
}
const messages: Record<string, string> = {
    'missing-case': 'La propuesta elimina el caso existente.',
    'ambiguous-case': 'La identidad del caso no permite una comparación única.',
    'missing-baseline': 'Falta el caso previo necesario para comparar la cobertura.',
    'missing-feature': 'Falta el Feature de una de las revisiones.',
    'unsupported-scenario': 'El escenario contiene una estructura o datos que requieren revisión.',
    'unsupported-step-input': 'No se pudo resolver la entrada completa del paso.',
    'missing-step-binding': 'No se encontró una definición para el paso.',
    'ambiguous-step-binding': 'Más de una definición puede ejecutar el paso.',
    'unsupported-step-pattern': 'Hay expresiones de Steps que requieren resolución adicional.',
    'incomplete-source-dependencies': 'Faltan dependencias de código para comprobar la equivalencia.',
    'source-dependency-changed': 'El paso invoca la misma operación, pero cambió su código o una dependencia. Revisa la equivalencia.',
    'unsupported-step-behavior': 'El comportamiento del paso requiere revisión para comprobar su equivalencia.',
    'step-hook-boundaries-changed': 'Cambió el límite entre pasos y hay hooks por paso; revisa su secuencia de ejecución.',
    'step-context-changed': 'Cambió el contexto compartido, un hook o una dependencia de Steps; revisa la equivalencia.',
    'required-operation-missing': 'La propuesta no conserva una operación previa con sus argumentos, repeticiones y orden.',
};
function difference(code: string, before: number[], after: number[], exampleIndex?: number): CaseCoverageDifference {
    return { code, message: messages[code] || messages['unsupported-step-behavior'], beforeStepIndices: before, afterStepIndices: after, ...(exampleIndex ? { exampleIndex } : {}) };
}
function snapshotHash(snapshot: CaseCoverageSnapshot): string {
    return coverageHash([snapshot.featurePath, Object.entries(snapshot.files).sort(([a], [b]) => a.localeCompare(b))]);
}

/**
 * Proof is deliberately scoped to supplied source and Examples under the same
 * external runtime. It does not execute code or prove business acceptance.
 * Screen bodies (including guards) are opaque, pinned source: a dependency edit
 * requires review rather than an invented equivalence. Ordinary Step statements
 * are flattened, so wording, local names, grouping and division can change.
 */
export function compareCaseCoverage(input: CompareCaseCoverageInput): CaseCoverageReport {
    const report: CaseCoverageReport = {
        schemaVersion: 1, caseId: input.caseId.toUpperCase(), platform: input.platform,
        baselineHash: snapshotHash(input.before), candidateHash: snapshotHash(input.after),
        status: 'unverified', differences: [], mappings: [], checkedExamples: 0,
    };
    const previousFeature = input.before.files[input.before.featurePath];
    const proposedFeature = input.after.files[input.after.featurePath];
    if (previousFeature === undefined || proposedFeature === undefined) {
        report.differences.push(difference('missing-feature', [], [])); return report;
    }
    const previous = readCoverageScenario(previousFeature, input.caseId);
    const proposed = readCoverageScenario(proposedFeature, input.caseId);
    if (!previous.count) { report.differences.push(difference('missing-baseline', [], [])); return report; }
    if (!proposed.count) { report.status = 'lost'; report.differences.push(difference('missing-case', previous.scenario?.steps.map(step => step.index) || [], [])); return report; }
    if (previous.count !== 1 || proposed.count !== 1) { report.differences.push(difference('ambiguous-case', [], [])); return report; }
    if (!previous.scenario || !proposed.scenario || previous.scenario.problem || proposed.scenario.problem) {
        report.differences.push(difference('unsupported-scenario', [], [])); return report;
    }
    const linearized = linearizeCoverageExtractions(input.before.files, input.after.files);
    const beforeDefinitions = new CoverageStepDefinitions(new CoverageSources(linearized.beforeFiles), linearized.beforeCalls);
    const afterDefinitions = new CoverageStepDefinitions(new CoverageSources(linearized.afterFiles), linearized.afterCalls);
    const stepHooks = beforeDefinitions.hasStepHooks() || afterDefinitions.hasStepHooks();
    const beforeContext = beforeDefinitions.contextFingerprint();
    const afterContext = afterDefinitions.contextFingerprint();
    if (!beforeContext.complete || !afterContext.complete || beforeContext.hash !== afterContext.hash) {
        report.differences.push(difference(!beforeContext.complete || !afterContext.complete ? 'incomplete-source-dependencies' : 'step-context-changed', [], []));
        return report;
    }
    const afterExecutions = proposed.scenario.rows.map(row => afterDefinitions.execute(proposed.scenario!.steps.map(step => ({ text: expandCoverageStep(step, row), index: step.index }))));
    const usedRows = new Set<number>();
    const results = previous.scenario.rows.map((row, rowIndex) => {
        const execution = beforeDefinitions.execute(previous.scenario!.steps.map(step => ({ text: expandCoverageStep(step, row), index: step.index })));
        const comparisons = afterExecutions.map((after, index) => ({ index, result: compareExecution(execution, after, rowIndex + 1, stepHooks) })).filter(item => !usedRows.has(item.index));
        // A prior Examples row must still have a complete matching execution.
        // Additional rows are permitted, but are not counted as prior coverage.
        const selected = comparisons.find(item => item.result.status === 'preserved')
            || comparisons.find(item => item.result.status === 'unverified') || comparisons[0];
        if (selected) {
            if (selected.result.status === 'preserved') usedRows.add(selected.index);
            return selected.result;
        }
        return { status: 'lost' as const, differences: [difference('required-operation-missing', execution.operations.map(operation => operation.stepIndex), [], rowIndex + 1)], mappings: [] };
    });
    for (const result of results) {
        if (!result) { report.differences.push(difference('unsupported-scenario', [], [])); continue; }
        report.checkedExamples++;
        report.differences.push(...result.differences);
        report.mappings.push(...result.mappings);
    }
    report.status = results.some(result => result?.status === 'lost') ? 'lost'
        : results.length && results.every(result => result?.status === 'preserved') ? 'preserved' : 'unverified';
    report.differences = [...new Map(report.differences.map(item => [JSON.stringify([item.code, item.beforeStepIndices, item.afterStepIndices, item.exampleIndex]), item])).values()];
    return report;
}
function compareExecution(before: CoverageExecution, after: CoverageExecution, exampleIndex: number, stepHooks: boolean): Pick<CaseCoverageReport, 'status' | 'differences' | 'mappings'> {
    const result: Pick<CaseCoverageReport, 'status' | 'differences' | 'mappings'> = { status: 'preserved', differences: [], mappings: [] };
    for (const problem of before.problems) result.differences.push(difference(problem.code, [problem.stepIndex], [], exampleIndex));
    for (const problem of after.problems) result.differences.push(difference(problem.code, [], [problem.stepIndex], exampleIndex));
    if (result.differences.length) { result.status = 'unverified'; return result; }
    let cursor = 0;
    const mapping = new Map<number, Set<number>>();
    for (const operation of before.operations) {
        const index = after.operations.findIndex((candidate, position) => position >= cursor && candidate.hash === operation.hash);
        if (index >= 0) {
            const matches = mapping.get(operation.stepIndex) || new Set<number>();
            matches.add(after.operations[index].stepIndex); mapping.set(operation.stepIndex, matches);
            cursor = index + 1;
            continue;
        }
        const related = after.operations.filter(candidate => candidate.core === operation.core && candidate.hash !== operation.hash);
        const unknown = operation.opaque || related.length || after.operations.some(candidate => candidate.opaque);
        result.differences.push(difference(related.length ? 'source-dependency-changed' : unknown ? 'unsupported-step-behavior' : 'required-operation-missing', [operation.stepIndex], related.map(candidate => candidate.stepIndex), exampleIndex));
        if (unknown && result.status === 'preserved') result.status = 'unverified';
        else if (!unknown) result.status = 'lost';
    }
    for (const [beforeStep, afterSteps] of mapping) result.mappings.push({ beforeStepIndices: [beforeStep], afterStepIndices: [...afterSteps], exampleIndex });
    if (!before.operations.length || !after.operations.length) {
        result.status = 'unverified'; result.differences.push(difference('unsupported-step-behavior', [], [], exampleIndex));
    }
    if (stepHooks && result.status === 'preserved') {
        const beforeBoundaries = before.operations.map(operation => operation.stepIndex);
        const afterBoundaries = after.operations.map(operation => operation.stepIndex);
        if (JSON.stringify(beforeBoundaries) !== JSON.stringify(afterBoundaries)) {
            result.status = 'unverified'; result.differences.push(difference('step-hook-boundaries-changed', [...new Set(beforeBoundaries)], [...new Set(afterBoundaries)], exampleIndex));
        }
    }
    return result;
}
