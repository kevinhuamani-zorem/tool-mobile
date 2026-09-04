/**
 * Familias de reglas del validador de respuestas del agente, en el orden en
 * que `AutomationResponseValidator` las compone.
 *
 * Antes de dividirlas, las once familias vivian dentro de un unico metodo
 * `validate` de mas de mil lineas. El orden de composicion es parte del
 * contrato: la deduplicacion final conserva la primera aparicion de cada
 * `(code, message, file)`, y el catalogo de reglas que recibe el agente se
 * construye leyendo el codigo fuente de este directorio.
 */
export type {
    PreviewRule,
    PreviewRuleContext,
    ResponseRule,
    ResponseRuleContext,
    RuleReport,
} from './ruleContext';
export { groupRepairErrors } from './ruleContext';
export { envelopeRules } from './envelopeRules';
export { syntaxRules } from './syntaxRules';
export { completionRules } from './completionRules';
export { layerRules } from './layerRules';
export { gapRules } from './gapRules';
export { locatorContractRules } from './locatorContractRules';
export { existingAutomationRules } from './existingAutomationRules';
export { outputRules } from './outputRules';
export { gherkinQualityRules } from './gherkinQualityRules';
export { codeStructureRules } from './codeStructureRules';
export { updateSafetyRules } from './updateSafetyRules';
export { frameworkCollisionRules } from './frameworkCollisionRules';
export { stepDefinitionExpressions } from './gherkinInspection';
export { emptyOnRecordedPlatform } from './screenInspection';
