import path from 'path';

const safeSegment = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Ruta funcional dentro de features/yape-features/<squad>.
 * No representa un squad nuevo y nunca se aplica a las otras tres capas.
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

