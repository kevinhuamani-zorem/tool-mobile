/**
 * API pública de `workspace`. Todo el contenido actual del módulo es
 * `infrastructure` (resolución de rutas y anclajes del framework contra
 * disco); no existe una capa `domain`/`application` separada porque leer y
 * resolver el árbol del framework destino es, en sí mismo, el trabajo de
 * este módulo. Por eso su `infrastructure` es su público, junto con
 * `workspace/contracts` (tipos puros de configuración).
 */
export * from './contracts';
export * from './infrastructure/projectPaths';
export * from './infrastructure/workspaceAdapter';
export * from './infrastructure/frameworkContract';
export * from './infrastructure/frameworkHelpers';
export * from './infrastructure/frameworkScanner';
export * from './infrastructure/frameworkQueryService';
