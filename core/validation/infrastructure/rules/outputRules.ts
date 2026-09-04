/**
 * Familia salida: el `OutputValidator` corre sobre el preview y sus mensajes
 * se atribuyen a la capa que los origino.
 *
 * Un Screen `update` que solo reutiliza APIs existentes no arrastra la deuda
 * legacy del archivo compartido: sus mensajes se omiten.
 */
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function outputRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, outputValidator, reusesScreenWithoutChanges } = context;
    const { errors, warnings } = report;
            const output = outputValidator.validate(preview, scenario.platform);
            output.errors.forEach(message => {
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
