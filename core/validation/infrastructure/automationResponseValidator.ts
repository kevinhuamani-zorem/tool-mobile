/**
 * Validador determinista de la respuesta del agente.
 *
 * Esta clase no contiene reglas: compone las familias de
 * `./rules` en un orden fijo sobre un unico reporte y arma el veredicto.
 * El orden es parte del contrato porque la deduplicacion final conserva la
 * primera aparicion de cada `(code, message, file)`.
 *
 * Las familias que corren sobre el preview van dentro de un `try`: cualquier
 * fallo al construirlo o al leer el framework se reporta como `preview` en vez
 * de tumbar la generacion.
 */
import path from 'path';
import fs from 'fs';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from '../../automation/contracts';
import { GeneratedPreview } from '../../generation';
import { OutputValidator } from './outputValidator';
import { projectPaths } from '../../workspace';
import { ReuseAnalyzer } from '../../indexing';
import { declaredIdentifiers } from '../../shared';
import {
    PreviewRuleContext,
    ResponseRuleContext,
    RuleReport,
    codeStructureRules,
    completionRules,
    envelopeRules,
    existingAutomationRules,
    frameworkCollisionRules,
    gapRules,
    gherkinQualityRules,
    groupRepairErrors,
    layerRules,
    textAssertionRules,
    locatorContractRules,
    outputRules,
    stepDefinitionExpressions,
    syntaxRules,
    updateSafetyRules,
} from './rules';

export { emptyOnRecordedPlatform } from './rules/screenInspection';

export class AutomationResponseValidator {
    private readonly relaxedContract = process.env.RECORDER_AGENT_RELAXED_CONTRACT === '1';

    constructor(
        private readonly outputValidator = new OutputValidator(),
        private readonly reuseAnalyzer = new ReuseAnalyzer()
    ) {}

    toPreview(response: AutomationAgentResponse): GeneratedPreview {
        const byLayer = new Map(response.files.map(file => [file.layer, file]));
        const absolute = (relative: string) => path.join(projectPaths.frameworkRoot, relative);
        const feature = byLayer.get('feature')!;
        const steps = byLayer.get('steps');
        const screen = byLayer.get('screen');
        const locators = byLayer.get('locators');
        return {
            featurePath: absolute(feature.path),
            featureContent: feature.content,
            stepPath: steps ? absolute(steps.path) : undefined,
            stepContent: steps?.content,
            screenPath: screen ? absolute(screen.path) : undefined,
            screenContent: screen?.content,
            locatorPath: locators ? absolute(locators.path) : undefined,
            locatorContent: locators?.content,
            files: response.files.map(file => absolute(file.path)),
        };
    }

    validate(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        attempt = 0
    ): AutomationValidation {
        const report: RuleReport = { errors: [], warnings: [] };
        const errors = report.errors;
        const context: ResponseRuleContext = {
            scenario,
            plan,
            response,
            relaxedContract: this.relaxedContract,
        };
        envelopeRules(context, report);
        syntaxRules(context, report);
        completionRules(context, report);
        const updateBaselines = new Map<string, string>();
        for (const file of plan.files.filter(item => item.operation === 'update')) {
            const absolute = path.join(projectPaths.frameworkRoot, file.path);
            if (fs.existsSync(absolute)) updateBaselines.set(file.layer, fs.readFileSync(absolute, 'utf-8'));
        }
        const proposedScreen = response.files.find(file => file.layer === 'screen')?.content || '';
        const baselineScreen = updateBaselines.get('screen');
        const baselineScreenNames = new Set(declaredIdentifiers({ screen: baselineScreen || '' })
            .map(symbol => symbol.name));
        const screenAddsSymbols = Boolean(baselineScreen) && declaredIdentifiers({ screen: proposedScreen })
            .some(symbol => !baselineScreenNames.has(symbol.name));
        // Un Screen `update` puede ser una referencia pura: el agente usa APIs
        // existentes y el patch writer no escribe nada. En ese caso no se
        // obliga al agente a modernizar deuda legacy del archivo compartido;
        // se valida la API indexada por el plan y las capas que sí se crean.
        const reusesScreenWithoutChanges = Boolean(baselineScreen) && !screenAddsSymbols;
        layerRules(context, report);
        textAssertionRules(context, report);
        gapRules(context, report);
        locatorContractRules(context, report);
        const existingAutomationWithoutNewLocators = existingAutomationRules(context, report);

        if (!existingAutomationWithoutNewLocators &&
            !errors.some(error => ['missing-layer', 'path', 'extra-layer'].includes(error.code))) {
            try {
                const preview = this.toPreview(response);
                const previewContext: PreviewRuleContext = {
                    ...context,
                    preview,
                    updateBaselines,
                    reusesScreenWithoutChanges,
                    definitions: stepDefinitionExpressions(preview.stepContent || ''),
                    outputValidator: this.outputValidator,
                    reuseAnalyzer: this.reuseAnalyzer,
                };
                outputRules(previewContext, report);
                gherkinQualityRules(previewContext, report);
                codeStructureRules(previewContext, report);
                updateSafetyRules(previewContext, report);
                frameworkCollisionRules(previewContext, report);
            } catch (error: any) {
                errors.push({ code: 'preview', message: error.message });
            }
        }
        const unique = errors.filter((error, index) =>
            errors.findIndex(candidate => candidate.code === error.code && candidate.message === error.message && candidate.file === error.file) === index
        );
        const valid = unique.length === 0;
        const affectedFiles = [...new Set(unique.map(error => error.file).filter(Boolean) as string[])];
        return {
            valid,
            qualityScore: valid ? 100 : Math.max(0, 100 - unique.length * 10),
            errors: unique,
            warnings: report.warnings,
            ...(valid ? {} : {
                repairContext: {
                    attempt,
                    errors: unique,
                    affectedFiles,
                    groups: groupRepairErrors(unique),
                },
            }),
        };
    }
}
