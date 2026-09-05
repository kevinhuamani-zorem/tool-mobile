/**
 * API pública de `shared`: primitivas de texto/naming transversales sin
 * lógica de negocio, más las utilidades de E/S de texto/JSON en UTF-8 que
 * el resto del recorder consume como una sola pieza (no hay una capa de
 * aplicación separada para `shared`, así que su `infrastructure` es su
 * público). No exponer aquí nada que dependa de `automation`, `generation`
 * u otro módulo de dominio.
 */
export * from './domain/englishIdentifiers';
export * from './domain/selectorNormalization';
export * from './domain/semanticNaming';
export * from './domain/featureScope';
export * from './infrastructure/utf8Text';
export * from './infrastructure/fileRollback';
