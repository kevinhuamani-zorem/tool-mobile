import { AutomationScenario, GenerationRequest } from '../../contracts';
import { BehaviorReuseReport } from '../../contracts/behaviorReuse';
import { SquadReuseCatalog } from '../../../indexing';

/** Measures observed reuse; eligible/incorrect reuse requires independent QA labels. */
export function buildReuseReport(rows: NonNullable<GenerationRequest['scenarioRows']>, catalog: SquadReuseCatalog, scenario: AutomationScenario): BehaviorReuseReport {
    const decisions: BehaviorReuseReport['decisions'] = rows.filter(row => row.actions?.length).map(row => ({
        text: row.text, kind: row.reuse?.kind || (row.status === 'reused' ? 'step' : 'create'),
        method: row.reuse?.methodName || row.methodName,
        file: row.reuse?.stepFile || row.reuse?.screenFile,
        sequences: row.actions!.map(action => action.sequence!).filter(Number.isInteger),
        reason: row.reuse?.reason || (row.status === 'reused' ? 'Definición existente.' : 'No se demostró una operación existente compatible; requiere implementación o revisión.'),
    }));
    const sameCase = (catalog.scenarios || []).filter(candidate => candidate.caseId === scenario.request.caseId)
        .map(candidate => ({ file: candidate.file, name: candidate.name, steps: candidate.steps.length }));
    const observations: string[] = [];
    if (sameCase.length) observations.push(`El identificador ${scenario.request.caseId} ya existe en ${sameCase.map(c => c.file).join(', ')}. Revisa la actualización y conserva la cobertura que no se volvió a grabar.`);
    const existence = scenario.actions.filter(a => a.action === 'VERIFICAR_EXISTE');
    if (existence.length) observations.push(`Las acciones ${existence.map(a => a.sequence).join(', ')} verifican presencia del elemento. No acreditan contenido, importes ni rangos de fechas; revisa su correspondencia con el resultado esperado.`);
    const groups = new Map<string, string[]>();
    for (const d of catalog.frameworkStepDefinitions || catalog.stepDefinitions) {
        const files = groups.get(d.expression) || []; files.push(d.file); groups.set(d.expression, files);
    }
    for (const [expression, files] of groups) if (files.length > 1 && catalog.stepDefinitions.some(d => d.expression === expression)) {
        observations.push(`Definición duplicada previa a la generación: ${expression} (${files.join(', ')}). Requiere reconciliar los archivos existentes.`);
    }
    return { schemaVersion: 1, catalogRevision: catalog.revision, decisions, sameCase, observations,
        metrics: { functionalRows: decisions.length, reusedSteps: decisions.filter(d => d.kind === 'step').length,
            reusedMethods: decisions.filter(d => d.kind === 'method').length, newImplementations: decisions.filter(d => d.kind === 'create').length,
            coveredActions: new Set(decisions.filter(d => d.kind !== 'create').flatMap(d => d.sequences)).size } };
}
