/**
 * API pública de `generation`. Incluye el vocabulario puro (`domain`), la
 * capa de aplicación (metadata uniforme de archivos generados) y, dado que
 * `generation` no tiene una capa intermedia propia para sus generadores
 * concretos, también su `infrastructure` (`FwkMobileGenerator`,
 * `DeterministicGenerator`, `effectiveGenerationPlan`), que hacen E/S contra
 * el framework destino.
 */
export type {
    GeneratedPreview,
    ReusedLocator,
} from './domain/generatedPreview';
export * from './domain/deterministicDraft';
export * from './domain/generationQuality';
export {
    GENERATED_FILE_AUTHOR,
    GENERATED_FILE_GENERATOR,
    withGeneratedFileMetadata,
    withGeneratedResponseMetadata,
} from './application/generatedFileMetadata';
export * from './infrastructure/fwkMobileGenerator';
export * from './infrastructure/deterministicGenerator';
export * from './infrastructure/deterministicDraftBuilder';
export * from './infrastructure/effectiveGenerationPlan';
export { mergePatchImports, proposedImports } from './infrastructure/patchImports';
