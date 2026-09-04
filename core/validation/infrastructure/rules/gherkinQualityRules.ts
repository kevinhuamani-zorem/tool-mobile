/**
 * Familia calidad del Gherkin: el Feature expresa intencion de negocio.
 *
 * Asercion presente, steps reutilizados copiados literal, Examples completos,
 * tag de la plataforma grabada, nada imperativo ni de plantilla, la pista
 * contextual del QA sintetizada y no copiada, las acciones tecnicas dentro de
 * un step funcional, y las definiciones sin duplicar ni quedar sin uso.
 */
import path from 'path';
import fs from 'fs';
import {
    featureStepLines,
    missingExamples,
    recordedStepContext,
    rewrittenReusedSteps,
} from '../../../automation/contracts';
import { selectorNormalization } from '../../../shared';
import { projectPaths } from '../../../workspace';
import {
    TECHNICAL_ACTIONS,
    genericTemplateGherkinSteps,
    hasPlatformTag,
    imperativeGherkinSteps,
    responseScenarioSteps,
} from './gherkinInspection';
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function gherkinQualityRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, definitions } = context;
    const { errors, warnings } = report;
            if (!/^\s*Then\s+\S+/m.test(preview.featureContent)) {
                errors.push({
                    code: 'assertion',
                    message: 'Scenario sin aserción Then',
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            // Las filas `reused` ya existen en el framework con esa
            // expresión exacta. Si el agente las reescribe (inlinar el
            // usuario, perder una tilde) el step queda undefined y eso solo
            // se descubre ejecutando el caso.
            for (const text of rewrittenReusedSteps(scenario, preview.featureContent)) {
                errors.push({
                    code: 'reused-step-rewritten',
                    message: `El step reutilizado "${text}" fue reescrito. Cópialo literal: ` +
                        'lo resuelve un step definition que ya existe y cualquier cambio lo deja sin enlazar.',
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            for (const message of missingExamples(preview.featureContent)) {
                errors.push({
                    code: 'missing-examples',
                    message,
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            // Un locator compartido puede tener cobertura histórica en la
            // otra plataforma, pero eso no demuestra que ESTE Scenario se
            // haya grabado/validado allí. El tag se habilita por la
            // plataforma de la ejecución actual; una posterior grabación
            // de completado conservará el tag previo y añadirá el nuevo.
            const requiredPlatforms = new Set<'android' | 'ios'>([scenario.platform]);
            for (const platform of requiredPlatforms) {
                if (!hasPlatformTag(preview.featureContent, platform)) {
                    errors.push({
                        code: 'platform-tag',
                        message: `El Feature requiere @${platform} porque esa plataforma tiene cobertura.`,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
            }
            for (const step of imperativeGherkinSteps(preview.featureContent)) {
                errors.push({
                    code: 'imperative-gherkin',
                    message: `Gherkin técnico/imperativo: ${step}. Describe la intención de negocio y agrupa las acciones.`,
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            for (const step of genericTemplateGherkinSteps(preview.featureContent)) {
                errors.push({
                    code: 'generic-template-gherkin',
                    message: `Gherkin genérico generado por plantilla: ${step}. Consolida el ciclo y describe un único comportamiento o resultado observable.`,
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            const proposedStepTexts = responseScenarioSteps(preview.featureContent).flat();
            for (const action of scenario.actions) {
                const contextHint = selectorNormalization.normalizeStepText(recordedStepContext(action));
                if (!contextHint || !proposedStepTexts.includes(contextHint)) continue;
                errors.push({
                    code: 'verbatim-context-hint',
                    message: `La pista contextual de la acción ${action.sequence} fue copiada literalmente como Step. Debe sintetizarse dentro del comportamiento del caso.`,
                    file: response.files.find(file => file.layer === 'feature')?.path,
                });
            }
            const traceBySequence = new Map(response.actionTrace.map(trace => [trace.sequence, trace.gherkinStep]));
            for (const action of scenario.actions.filter(item => TECHNICAL_ACTIONS.has(item.action))) {
                const current = traceBySequence.get(action.sequence);
                const groupedWithAdjacent = Boolean(current) && [action.sequence - 1, action.sequence + 1]
                    .some(sequence => traceBySequence.get(sequence) === current);
                if (!groupedWithAdjacent) {
                    errors.push({
                        code: 'ungrouped-technical-action',
                        message: `La acción técnica ${action.sequence} (${action.action}) debe quedar dentro de un step funcional adyacente.`,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
            }
            const duplicateDefinition = definitions.find((definition, index) =>
                definitions.indexOf(definition) !== index
            );
            if (duplicateDefinition) {
                errors.push({
                    code: 'duplicate-step-definition',
                    message: `Definición Gherkin duplicada: ${duplicateDefinition}`,
                    file: response.files.find(file => file.layer === 'steps')?.path,
                });
            }
            // Un step definition que ningun Scenario usa es codigo muerto en un
            // namespace global: nadie lo llama y estorba a la siguiente
            // generacion. Solo aplica cuando el archivo se crea; en un update el
            // baseline trae definitions de otros features que si se usan.
            {
                const stepsPlanned = plan.files.find(file => file.layer === 'steps');
                // En un update, las definitions del baseline pertenecen a otros
                // Scenarios y si se usan; solo se juzga lo que el agente agrega.
                const inherited = new Set<string>();
                if (stepsPlanned?.operation === 'update') {
                    const absolute = path.join(projectPaths.frameworkRoot, stepsPlanned.path);
                    if (fs.existsSync(absolute)) {
                        [...fs.readFileSync(absolute, 'utf-8').matchAll(
                            /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g
                        )].forEach(match => inherited.add(match[1]));
                    }
                }
                const featureLines = featureStepLines(preview.featureContent);
                for (const definition of definitions.filter(item => !inherited.has(item))) {
                    let expression: RegExp;
                    try {
                        expression = new RegExp(`^${definition}$`);
                    } catch {
                        continue;
                    }
                    if (featureLines.some(line => expression.test(line))) continue;
                    warnings.push(
                        `Step definition sin uso: "${definition}". Ningun Scenario del Feature lo invoca; ` +
                        'eliminalo o cubre ese comportamiento en el Gherkin.'
                    );
                }
            }
}
