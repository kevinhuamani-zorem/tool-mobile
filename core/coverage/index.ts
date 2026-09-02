/**
 * API pública de `coverage`. Todo el contenido actual es `infrastructure`
 * (lee y compara features/scenarios existentes contra disco); no existe una
 * capa `domain`/`application` propia, así que se expone directamente aquí.
 */
export * from './infrastructure/scenarioCoverageAnalyzer';
export * from './infrastructure/recordingCoverageAnalyzer';
export * from './infrastructure/recordingPlatformUpdater';
