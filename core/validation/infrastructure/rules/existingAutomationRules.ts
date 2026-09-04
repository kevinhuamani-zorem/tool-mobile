/**
 * Familia automatizacion existente: si el agente reutilizo todos los locators
 * y el modulo propuesto quedo sin entradas, este caso ya esta automatizado y
 * no se vuelve a crear.
 *
 * Devuelve el veredicto porque tambien decide si tiene sentido construir el
 * preview: sin capas nuevas no hay nada que revisar.
 */
import { hasNoLocatorEntries, reusesEveryRecordedLocator } from './locatorInspection';
import { ResponseRuleContext, RuleReport } from './ruleContext';

export function existingAutomationRules(
    context: ResponseRuleContext,
    report: RuleReport,
): boolean {
    const { scenario, plan, response } = context;
    const { errors } = report;
    const locatorFile = response.files.find(file => file.layer === 'locators');
    const existingAutomationWithoutNewLocators = Boolean(locatorFile) &&
        hasNoLocatorEntries(locatorFile!.content) &&
        (Boolean(plan.existingCase) || reusesEveryRecordedLocator(scenario, plan, response));
    if (existingAutomationWithoutNewLocators) {
        errors.push({
            code: 'existing-automation',
            message: 'El agente reutilizó todos los locators. Esta automatización ya existe y no se puede volver a crear.',
            file: locatorFile?.path,
        });
    }
    return existingAutomationWithoutNewLocators;
}
