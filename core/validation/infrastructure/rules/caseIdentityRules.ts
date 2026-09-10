import type { CoverageRepairTargets } from '../../../automation/contracts';
import { selectorNormalization } from '../../../shared';
import { responseScenarioResolutions, ScenarioResolution } from './gherkinInspection';
import { ReuseAnalyzer, CaseCoverageSnapshot, compareCaseCoverage } from '../../../indexing';
import { ResponseRuleContext, RuleReport } from './ruleContext';

export interface CaseIdentityContext extends ResponseRuleContext {
    updateBaselines: Map<string, string>;
    reuseAnalyzer: ReuseAnalyzer;
    coverageSnapshots?: { before: CaseCoverageSnapshot; after: CaseCoverageSnapshot };
    coverageUnavailable?: boolean;
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

/** Paths only: do not include source, Examples, selectors or expected values in routing. */
function coverageRepairTargets(context: CaseIdentityContext): CoverageRepairTargets {
    if (!context.coverageSnapshots) return { files: [], complete: false };
    const { before, after } = context.coverageSnapshots;
    const layerByPath = new Map(context.plan.files.map(file => [file.path, file.layer]));
    const layerOf = (file: string): CoverageRepairTargets['files'][number]['layer'] => {
        const declared = layerByPath.get(file);
        if (declared) return declared;
        if (/\.feature$/.test(file)) return 'feature';
        if (/\.steps?\.[jt]s$/.test(file) || /^features\/.*steps/.test(file)) return 'steps';
        if (/^screenobjects\//.test(file)) return 'screen';
        if (/^resources\/locators\//.test(file)) return 'locators';
        return 'shared';
    };
    const files = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
        .filter(file => before.files[file] !== after.files[file])
        .sort().map(file => ({ path: file, layer: layerOf(file) }));
    return { files, complete: files.length > 0 };
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
    if (context.coverageSnapshots) {
        const coverage = compareCaseCoverage({ caseId: targetId, platform: scenario.platform, ...context.coverageSnapshots });
        report.caseCoverage = coverage;
        if (coverage.status !== 'preserved') report.errors.push({
            code: coverage.status === 'lost' ? 'case-coverage-review' : 'case-coverage-unverified', file,
            coverageRepairTargets: coverageRepairTargets(context),
            message: `${targetId}: ${coverage.status === 'lost' ? 'la propuesta no conserva el comportamiento previo' : 'no se pudo demostrar la equivalencia con la versión previa'}. ${[...new Set(coverage.differences.map(item => `${item.message}${item.beforeStepIndices.length ? ` Pasos previos: ${item.beforeStepIndices.join(', ')}.` : ''}${item.afterStepIndices.length ? ` Pasos propuestos: ${item.afterStepIndices.join(', ')}.` : ''}`))].join(' ')} Revisa las llamadas, los argumentos y las aserciones; conservar o renombrar frases por sí solo no demuestra cobertura. El borrador sigue disponible para exportar.`,
        });
        return;
    }
    if (context.coverageUnavailable) {
        report.errors.push({ code: 'case-coverage-unverified', file, coverageRepairTargets: { files: [], complete: false },
            message: `${targetId}: no se pudo obtener una instantánea completa del framework para comparar la cobertura. Vuelve a analizar el checkout; el borrador sigue disponible para exportar.` });
        return;
    }
    if (!proposed.length) {
        report.errors.push({ code: 'case-coverage-review', file,
            message: `El Feature propuesto elimina el caso existente ${targetId}. Conserva su identidad y cobertura en la revisión.` });
        return;
    }
    const missing = prior.flatMap(item => missingCoverage(normalizedSteps(item), normalizedSteps(proposed[0])));
    if (missing.length) report.errors.push({ code: 'case-coverage-review', file,
        message: `${targetId} requiere revisar ${missing.length} paso(s) modificados o reordenados; falta evidencia de código para demostrar equivalencia: ${missing.map(step => `«${step}»`).join(', ')}. Revisa la equivalencia y conserva la cobertura antes de declarar el caso correcto.` });
}
