/**
 * Familia colisiones con el framework: lo propuesto no puede duplicar lo que
 * ya vive en el catalogo del squad.
 *
 * Definiciones Gherkin equivalentes, escenarios con la misma secuencia de
 * steps y selectores que ya existen bajo otro nombre.
 */
import { selectorNormalization } from '../../../shared';
import { changedLocatorValues, responseLocatorValues } from './locatorInspection';
import { responseScenarioSteps } from './gherkinInspection';
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function frameworkCollisionRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, definitions, updateBaselines, reuseAnalyzer } = context;
    const { errors, warnings } = report;
            const catalog = reuseAnalyzer.getCatalog(
                scenario.squad,
                scenario.platform,
                scenario.request.featureScope
            );
            const stepsPath = response.files.find(file => file.layer === 'steps')?.path;
            for (const definition of definitions) {
                const normalizedDefinition = selectorNormalization.canonicalStepExpression(definition);
                const collision = catalog.stepDefinitions.find(existing =>
                    existing.file !== stepsPath
                    && (
                        existing.expression === definition
                        || selectorNormalization.canonicalStepExpression(existing.expression) === normalizedDefinition
                    )
                );
                if (collision) {
                    errors.push({
                        code: 'framework-step-collision',
                        message: `Definición Gherkin ya existente en ${collision.file}: ${definition}`,
                        file: stepsPath,
                    });
                }
            }
            const featurePath = response.files.find(file => file.layer === 'feature')?.path;
            for (const proposed of responseScenarioSteps(preview.featureContent)) {
                const collision = (catalog.scenarios || []).find(existing =>
                    existing.file !== featurePath &&
                    existing.steps.length === proposed.length &&
                    existing.steps.every((step, index) =>
                        selectorNormalization.normalizeStepText(step.text) === proposed[index]
                    )
                );
                if (collision) {
                    errors.push({
                        code: 'framework-scenario-collision',
                        message: `Escenario equivalente ya existente en ${collision.file}: ${collision.name}`,
                        file: featurePath,
                    });
                }
            }
            const locatorFile = response.files.find(file => file.layer === 'locators');
            const locatorBaseline = updateBaselines.get('locators');
            const proposedLocators = locatorBaseline
                ? changedLocatorValues(locatorFile?.content || '', locatorBaseline)
                : responseLocatorValues(locatorFile?.content || '');
            for (const proposed of proposedLocators) {
                const aliases = selectorNormalization.selectorAliases(proposed.selector, scenario.platform);
                const collision = catalog.locators.find(existing =>
                    existing.file !== locatorFile?.path && Boolean(existing.selector) &&
                    [...selectorNormalization.selectorAliases(existing.selector, scenario.platform)]
                        .some(alias => aliases.has(alias))
                );
                if (collision) {
                    errors.push({
                        code: 'framework-locator-collision',
                        message: `Selector de ${proposed.name} ya existe como ${collision.name} en ${collision.file}`,
                        file: locatorFile?.path,
                    });
                }
            }
}
