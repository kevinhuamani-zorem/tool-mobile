/**
 * API pública de `validation`: vocabulario puro (`domain`), construcción de
 * contratos de reglas (`application`) y, dado que `validation` no tiene una
 * capa intermedia propia para sus validadores concretos, también su
 * `infrastructure` (`OutputValidator`, `AutomationResponseValidator`,
 * `validateTypeScriptSyntax`, el adaptador de archivo del catálogo de
 * reglas), que leen contra el framework destino y el compilador de
 * TypeScript.
 */
export type {
    AutomationValidation,
    OutputValidation,
    ValidationIssue,
    ValidationRepairContext,
    ValidationRepairGroup,
} from './domain/validationResult';
export type {
    ValidationRuleContract,
    ValidationRuleContractEntry,
} from './domain/validationRule';
export {
    buildValidationRuleContractFromSource,
    validatorRuleCodesFromSource,
} from './application/buildValidationRuleContract';
export { OutputValidator } from './infrastructure/outputValidator';
export {
    AutomationResponseValidator,
    emptyOnRecordedPlatform,
} from './infrastructure/automationResponseValidator';
export {
    validateTypeScriptSyntax,
} from './infrastructure/typescriptSyntaxValidator';
export type {
    TypeScriptSyntaxDiagnostic,
} from './infrastructure/typescriptSyntaxValidator';
export {
    buildValidationRuleContractFromFile,
    defaultValidatorSourcePath,
    readValidatorRuleSource,
    validatorRuleSourcePaths,
} from './infrastructure/validationRuleCatalogFileAdapter';
