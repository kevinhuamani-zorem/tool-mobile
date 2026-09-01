/**
 * API pública de `indexing`. `domain/locatorReferences` es puro; el resto
 * del módulo (`codeGraph`, `codeGraphExporter`, `recorderCodeGraph`,
 * `locatorStrategy`, `reuseAnalyzer`) es `infrastructure` (lee el árbol del
 * framework) y no tiene una capa de aplicación separada, así que se expone
 * directamente aquí.
 */
export * from './domain/locatorReferences';
export * from './infrastructure/codeGraph';
export * from './infrastructure/codeGraphExporter';
export * from './infrastructure/recorderCodeGraph';
export * from './infrastructure/locatorStrategy';
export * from './infrastructure/reuseAnalyzer';
