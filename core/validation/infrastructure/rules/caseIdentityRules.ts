import { selectorNormalization } from '../../../shared';
import { responseScenarioResolutions, ScenarioResolution } from './gherkinInspection';
import { ReuseAnalyzer } from '../../../indexing';
import { ResponseRuleContext, RuleReport } from './ruleContext';

export interface CaseIdentityContext extends ResponseRuleContext {
    updateBaselines: Map<string, string>;
    reuseAnalyzer: ReuseAnalyzer;
}

const identity = (title: string) => title.match(/\[(TC-\d+)\]/i)?.[1].toUpperCase();
const normalizedSteps = (item: ScenarioResolution) => item.lines.map(line =>
    selectorNormalization.normalizeStepText(line.raw));

/** Conserves ordered, repeated behavior; matching only a set would miss lost cycles. */
function missingCoverage(previous: string[], proposed: string[]): string[] {
    let cursor = 0;
    return previous.filter(step => {
        const match = proposed.indexOf(step, cursor);
        if (match < 0) return true;
        cursor = match + 1;
        return false;
    });
}

/** Identity is the QA case ID, independent of the agent's generated title. */
export function caseIdentityRules(context: CaseIdentityContext, report: RuleReport): void {
    const { scenario, response, updateBaselines, reuseAnalyzer } = context;
    const file = response.files.find(item => item.layer === 'feature')?.path;
    if (!file) return;
    const before = responseScenarioResolutions(updateBaselines.get('feature') || '');
    const after = responseScenarioResolutions(response.files.find(item => item.layer === 'feature')?.content || '');
    const targetId = scenario.request?.caseId?.toUpperCase();
    const ids = new Set(after.map(item => identity(item.title)).filter((id): id is string => Boolean(id)));
    for (const id of ids) {
        const prior = before.filter(item => identity(item.title) === id);
        const proposed = after.filter(item => identity(item.title) === id);
        if (proposed.length < 2) continue;
        // Do not credit inherited debt to this attempt. Altered duplicates still
        // require review: retaining their count is not permission to duplicate.
        const signatures = (items: ScenarioResolution[]) => items.map(item => JSON.stringify(item));
        const inherited = proposed.length === prior.length && signatures(proposed).every((value, index) => value === signatures(prior)[index]);
        if (inherited && id !== targetId) {
            report.warnings.push(`case-preexisting-duplicate: ${id} ya aparece ${proposed.length} veces en ${file}; este intento conserva esa deuda sin cambios.`);
        } else {
            report.errors.push({ code: 'case-duplicate', file,
                message: `${inherited ? 'Duplicación preexistente en el checkout, sin atribuirla a este intento. ' : ''}${id} aparece en ${proposed.length} escenarios del mismo Feature: ${proposed.map(item => item.title).join(' | ')}. Conserva un solo caso con su cobertura vigente; cambiar el título no crea una identidad nueva.` });
        }
    }
    if (!targetId) return;
    const proposed = after.filter(item => identity(item.title) === targetId);
    if (proposed.length) {
        try {
            const foreign = (reuseAnalyzer.getCatalog(scenario.squad, scenario.platform, scenario.request.featureScope).scenarios || [])
                .filter(item => item.file !== file && (item.caseId?.toUpperCase() || identity(item.name)) === targetId);
            const preexisting = before.some(item => identity(item.title) === targetId);
            if (foreign.length && !preexisting) report.errors.push({ code: 'framework-case-collision', file,
                message: `${targetId} ya existe en ${[...new Set(foreign.map(item => item.file))].join(', ')}. Actualiza su Feature de origen conservando la cobertura; no crees otro escenario del mismo TC en esta ruta.` });
        } catch {
            report.errors.push({ code: 'case-identity-unavailable', file,
                message: `No se pudo consultar el catálogo del framework para comprobar la identidad ${targetId}. Conserva el borrador y vuelve a analizar el framework; esta comprobación no está aprobada.` });
        }
    }
    const prior = before.filter(item => identity(item.title) === targetId);
    if (!prior.length || proposed.length > 1) return;
    if (!proposed.length) {
        report.errors.push({ code: 'case-coverage-review', file,
            message: `El Feature propuesto elimina el caso existente ${targetId}. Conserva su identidad y cobertura en la revisión.` });
        return;
    }
    const missing = prior.flatMap(item => missingCoverage(normalizedSteps(item), normalizedSteps(proposed[0])));
    if (missing.length) report.errors.push({ code: 'case-coverage-review', file,
        message: `${targetId} deja de conservar ${missing.length} paso(s) de su cobertura previa o su orden: ${missing.map(step => `«${step}»`).join(', ')}. Revisa la equivalencia y conserva la cobertura antes de declarar el caso correcto.` });
}
