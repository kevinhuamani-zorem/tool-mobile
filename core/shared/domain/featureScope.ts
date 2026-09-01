import path from 'path';

const safeSegment = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Ruta funcional dentro de features/yape-features/<squad>.
 * No representa un squad nuevo y nunca se aplica a las otras tres capas.
 *
 * Vive en `shared` (no en `automation/contracts`) porque tanto
 * `automation/contracts` como `indexing` (`reuseAnalyzer`) la necesitan: ver
 * ADR-0001, "retiro de fachadas" — dejarla en `automation/contracts` habría
 * cerrado un ciclo, ya que `indexing` depende de `workspace`/`shared` pero
 * `automation/contracts` depende de `indexing`.
 */
export function normalizeFeatureScope(value = ''): string {
    const normalized = value.trim().toLowerCase()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
    if (!normalized) return '';
    const segments = normalized.split('/');
    if (segments.some(segment => !safeSegment.test(segment))) {
        throw new Error(`Ruta Feature inválida: ${value}`);
    }
    return segments.join('/');
}

export function featureScopeDirectory(root: string, squad: string, featureScope = ''): string {
    const normalized = normalizeFeatureScope(featureScope);
    return normalized ? path.join(root, squad, ...normalized.split('/')) : path.join(root, squad);
}
