/**
 * Familia colisiones con el framework: lo propuesto no puede duplicar lo que
 * ya vive en el framework ni dejar lineas que Cucumber no resuelva a
 * exactamente una definicion.
 *
 * Definiciones Gherkin equivalentes, lineas ambiguas o sin definicion,
 * escenarios con la misma secuencia de steps y selectores que ya existen
 * bajo otro nombre. Las definiciones se juzgan contra TODO el framework
 * (todos los squads), que es lo que carga `wdio` al ejecutar; el catalogo del
 * squad solo acota que se reutiliza.
 */
import { matchingStepDefinitions, selectorNormalization, stepTextEscaping } from '../../../shared';
import { changedLocatorValues, responseLocatorValues } from './locatorInspection';
import { responseScenarioResolutions, responseScenarioSteps, stepDefinitionPatterns } from './gherkinInspection';
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function frameworkCollisionRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, definitions, updateBaselines, reuseAnalyzer } = context;
    const { errors, warnings } = report;
            const catalog = reuseAnalyzer.getCatalog(
                scenario.squad,
                scenario.platform,
                scenario.request.featureScope
            );
            // Los catalogos de prueba antiguos solo traen `stepDefinitions`.
            const frameworkDefinitions = catalog.frameworkStepDefinitions || catalog.stepDefinitions || [];
            const stepsFile = response.files.find(file => file.layer === 'steps');
            const stepsPath = stepsFile?.path;
            for (const definition of definitions) {
                const normalizedDefinition = selectorNormalization.canonicalStepExpression(definition);
                const collision = frameworkDefinitions.find(existing =>
                    existing.file !== stepsPath
                    && (
                        existing.expression === definition
                        || selectorNormalization.canonicalStepExpression(existing.expression) === normalizedDefinition
                    )
                );
                if (collision && stepDefinitionPatterns(updateBaselines.get('steps') || '').some(pattern =>
                    selectorNormalization.canonicalStepExpression(pattern) === normalizedDefinition)) {
                    warnings.push(`framework-preexisting-step-collision: la definición ${definition} ya estaba duplicada entre ${stepsPath} y ${collision.file}. No fue creada por este intento; revisa los archivos existentes.`);
                    continue;
                }
                if (collision) {
                    errors.push({
                        code: 'framework-step-collision',
                        message: `Definición Gherkin ya existente en ${collision.file}: ${definition}`,
                        file: stepsPath,
                    });
                }
            }
            // Resolucion como la hace Cucumber: carga todas las definiciones del
            // framework mas las propuestas, ignora el keyword y prueba cada
            // regex contra cada linea expandida con Examples. Dos o mas
            // coincidencias es `Multiple step definitions match` y el Scenario
            // falla; cero es un step undefined. Un regex laxo de otro squad
            // (`^el usuario ingresa su (.*) y (.*)$`) atrapa la frase nueva igual
            // que la definicion propia, y eso solo se descubria ejecutando.
            const featurePath = response.files.find(file => file.layer === 'feature')?.path;
            const resolutionPool = [
                ...frameworkDefinitions
                    .filter(existing => existing.file !== stepsPath)
                    .map(existing => ({ expression: existing.expression, file: existing.file })),
                ...stepDefinitionPatterns(stepsFile?.content || '')
                    .map(expression => ({ expression, file: stepsPath || 'steps' })),
            ];
            const describe = (item: { expression: string; file: string }) =>
                `${item.file} → ${item.expression.replace(/^\/([\s\S]+)\/$/, '$1')}`;
            for (const outline of responseScenarioResolutions(preview.featureContent)) {
                for (const line of outline.lines) {
                    const ambiguous = line.expanded
                        .map(text => ({ text, matches: matchingStepDefinitions(text, resolutionPool) }))
                        .find(item => item.matches.length > 1);
                    if (ambiguous) {
                        const foreign = ambiguous.matches.filter(item => item.file !== stepsPath);
                        const suggestion = foreign.length
                            ? stepTextEscaping(line.raw, resolutionPool)
                            : undefined;
                        errors.push({
                            code: 'step-ambiguous',
                            message: `La línea «${line.raw}» del Scenario "${outline.title}" la resuelven ` +
                                `${ambiguous.matches.length} definiciones y Cucumber la marcará ambigua ` +
                                `(Multiple step definitions match): ${ambiguous.matches.map(describe).join(' | ')}. ` +
                                (foreign.length
                                    ? 'Reformula la frase para que solo la matchee tu definición (cambia el verbo o la ' +
                                        `conjunción, sin sufijos: la captura final del regex ajeno se los come)` +
                                        `${suggestion ? `, por ejemplo «${suggestion}»` : ''}, y actualiza la definición en Steps.`
                                    : 'Deja una sola definición en Steps para esa frase.'),
                            file: featurePath,
                        });
                        continue;
                    }
                    if (!frameworkDefinitions.length) continue;
                    const undefinedText = line.expanded.find(text => matchingStepDefinitions(text, resolutionPool).length === 0);
                    if (undefinedText !== undefined) {
                        errors.push({
                            code: 'step-undefined',
                            message: `La línea «${line.raw}» del Scenario "${outline.title}" no la resuelve ninguna ` +
                                'definición, ni de Steps ni del framework: al ejecutar queda undefined. Agrega su ' +
                                'definición en Steps o, si es un step reutilizado, cópialo literal del borrador.',
                            file: stepsPath,
                        });
                    }
                }
            }
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
            // Locators que el plan crea a proposito aunque su selector exista en
            // otro modulo: un selector sin predicado identificador (className,
            // instance(n), XPath sin predicado) no prueba que sea el mismo
            // elemento, asi que la coincidencia no es una colision.
            const declinedByName = new Map((plan.resolutions || [])
                .filter(resolution => resolution.resolution === 'create' && resolution.unspecificSelector && resolution.locatorName)
                .map(resolution => [resolution.locatorName as string, resolution.declinedReuse]));
            for (const proposed of proposedLocators) {
                const aliases = selectorNormalization.selectorAliases(proposed.selector, scenario.platform);
                const collision = catalog.locators.find(existing =>
                    existing.file !== locatorFile?.path && Boolean(existing.selector) &&
                    [...selectorNormalization.selectorAliases(existing.selector, scenario.platform)]
                        .some(alias => aliases.has(alias))
                );
                if (!collision) continue;
                if (declinedByName.has(proposed.name)) {
                    const declined = declinedByName.get(proposed.name);
                    warnings.push(
                        `framework-locator-collision (aviso): el selector de ${proposed.name} coincide con ` +
                        `${collision.name} en ${collision.file}, pero es un selector sin predicado identificador ` +
                        'de otro módulo: el plan lo crea aquí a propósito' +
                        `${declined ? ` (reutilización de ${declined.module}.${declined.name} descartada)` : ''}.`,
                    );
                    continue;
                }
                errors.push({
                    code: 'framework-locator-collision',
                    message: `Selector de ${proposed.name} ya existe como ${collision.name} en ${collision.file}`,
                    file: locatorFile?.path,
                });
            }
}
