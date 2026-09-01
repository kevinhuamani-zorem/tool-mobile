/**
 * Normalización compartida de selectores y textos.
 *
 * Vive en su propio módulo porque tanto `deterministicResolver` como
 * `knowledgeMap` la necesitan: dejarla en el resolver obligaría al mapa a
 * importarlo y crearía un ciclo de dependencias.
 */

const DIACRITICS = /[̀-ͯ]/g;

export function normalizeSelector(value = '', platform: 'android' | 'ios'): string {
    let normalized = value.trim().replace(/\s+/g, ' ');
    if (platform === 'android' && /^new\s+UiSelector\(\)/.test(normalized)) {
        normalized = `android=${normalized}`;
    }
    return normalized;
}

export function selectorAliases(value = '', platform: 'android' | 'ios'): Set<string> {
    const normalized = normalizeSelector(value, platform);
    if (!normalized) return new Set();
    const aliases = new Set([normalized]);
    const withoutPrefix = normalized.replace(/^(?:id=|~)/, '').trim();
    if (withoutPrefix) aliases.add(withoutPrefix);
    if (normalized.startsWith('android=new UiSelector()')) {
        aliases.add(normalized.replace(/^android=/, ''));
    }
    return aliases;
}

export function words(value: string): string[] {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .normalize('NFD').replace(DIACRITICS, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 1);
}

export const TECHNICAL_STOP_WORDS = new Set([
    'usuario', 'debe', 'poder', 'pueda', 'sus', 'todos', 'todas', 'ubicar',
    'boton', 'botones', 'ver', 'verificar', 'validar', 'existe', 'mostrar', 'muestra',
    'seleccionar', 'selecciona', 'hacer', 'hace', 'click', 'pantalla', 'elemento',
    'para', 'desde', 'hacia', 'sobre', 'entre', 'esta', 'este', 'estos', 'estas',
    'del', 'las', 'los', 'una', 'uno', 'con', 'que', 'por', 'como', 'and', 'the',
]);

export function slug(value: string, fallback: string): string {
    const output = value.toLowerCase().normalize('NFD')
        .replace(DIACRITICS, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
    return output || fallback;
}

export function camel(value: string, fallback: string): string {
    const parts = words(value);
    if (!parts.length) return fallback;
    return parts[0] + parts.slice(1).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

export function normalizeStepText(value: string): string {
    return value.toLowerCase().normalize('NFD')
        .replace(DIACRITICS, '')
        .replace(/<[^>]+>/g, '<param>')
        .replace(/[^a-z0-9<>]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function canonicalStepExpression(expression: string): string {
    const trimmed = String(expression || '').trim();
    const withoutDelimiters = trimmed
        .replace(/^\/\^?/, '')
        .replace(/\$?\/[a-z]*$/i, '');
    const withoutAnchors = withoutDelimiters
        .replace(/^\^/, '')
        .replace(/\$$/, '');
    const parameterized = withoutAnchors
        .replace(/\{(?:int|float|string|word)\}/gi, '<param>')
        .replace(/\(\.\*\)/g, '<param>')
        .replace(/\(\.\+\)/g, '<param>')
        .replace(/\(\[\^"\\\]\+\)/g, '<param>')
        .replace(/\(\[\^'\\\]\+\)/g, '<param>')
        .replace(/\(\\d\+\)/g, '<param>');
    return normalizeStepText(parameterized);
}

export const selectorNormalization = {
    normalizeSelector,
    selectorAliases,
    normalizeStepText,
    canonicalStepExpression,
    slug,
    camel,
};
