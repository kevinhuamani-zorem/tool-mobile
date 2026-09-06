/**
 * Familia salida: el `OutputValidator` corre sobre el preview y sus mensajes
 * se atribuyen a la capa que los origino.
 *
 * Un Screen `update` que solo reutiliza APIs existentes no arrastra la deuda
 * legacy del archivo compartido: sus mensajes se omiten.
 */
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function outputRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, outputValidator, reusesScreenWithoutChanges, updateBaselines } = context;
    const { errors, warnings } = report;
            // Deuda que el Screen baseline ya tenia (imports relativos, browser
            // sin importar...) no es del agente: solo cuenta lo que agrega. Los
            // imports relativos se descuentan uno a uno (el agente puede haber
            // aliasado parte de ellos); el resto de mensajes, por igualdad.
            const screenBaseline = plan.files.find(file => file.layer === 'screen')?.operation === 'update'
                ? updateBaselines.get('screen')
                : undefined;
            const stepsBaseline = plan.files.find(file => file.layer === 'steps')?.operation === 'update'
                ? updateBaselines.get('steps')
                : undefined;
            const baselines = { screen: screenBaseline, steps: stepsBaseline };
            const output = outputValidator.validate(preview, scenario.platform, { baselines });
            const inherited = new Set(screenBaseline
                ? outputValidator.validate({ ...preview, screenContent: screenBaseline }, scenario.platform, { baselines }).errors
                    .filter(message => /^ScreenObject/.test(message))
                : []);
            output.errors.forEach(message => {
                if (inherited.has(message)) return;
                const layer = /^(?:Feature|Scenario)/.test(message)
                    ? 'feature'
                    : /^Steps/.test(message)
                        ? 'steps'
                        : /^(?:ScreenObject)/.test(message)
                            ? 'screen'
                            : /(?:locator|JSON)/i.test(message)
                                ? 'locators'
                                : undefined;
                if (layer === 'screen' && reusesScreenWithoutChanges) return;
                errors.push({
                    code: 'output',
                    message,
                    file: layer ? response.files.find(file => file.layer === layer)?.path : undefined,
                });
            });
            warnings.push(...output.warnings);
}
