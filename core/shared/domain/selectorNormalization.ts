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

/**
 * Un XPath sin predicado (`//android.view.View`, `//*`) engancha el primer
 * nodo de ese tipo, que existe en casi cualquier pantalla. No se corrige ni
 * se bloquea: el QA puede haberlo elegido a proposito para que el agente
 * itere en codigo; solo se avisa.
 */
export function selectorCannotIdentifyElement(selector = ''): boolean {
    const value = String(selector).trim();
    if (!/^\/{1,2}[^/]/.test(value) && value !== '//*') return false;
    // Cualquier predicado, atributo o funcion ya lo hace especifico.
    if (/[\[\]@=]|contains\(|text\(\)|starts-with\(/.test(value)) return false;
    return true;
}

/**
 * Metodos de UiSelector que identifican un elemento por lo que es, no por la
 * posicion que ocupa. `className` e `instance(n)` describen un tipo y un
 * indice: el mismo par aparece en cualquier pantalla con un campo de texto.
 */
const UI_SELECTOR_IDENTIFYING_METHODS =
    /\.(?:text|textContains|textStartsWith|textMatches|description|descriptionContains|descriptionStartsWith|descriptionMatches|resourceId|resourceIdMatches)\s*\(/;

/**
 * Un selector sin predicado identificador no prueba identidad entre modulos.
 *
 * `new UiSelector().className("android.widget.EditText")` es el campo del
 * codigo OTP en `yapear-otp` y tambien el campo del correo en la pantalla de
 * movimientos: coincidir en el texto del selector no significa que sea el
 * mismo elemento. Lo mismo vale para `instance(n)`, para un XPath sin
 * predicado o solo con indice (`//android.view.View[3]`) y para una class
 * chain de iOS sin predicado (`**\/XCUIElementTypeTextField[2]`). Un id,
 * un accessibility id, un texto o un resource-id si identifican. El selector
 * grabado nunca se corrige por esto: solo deja de valer como evidencia de
 * reutilizacion fuera del modulo que el caso extiende.
 */
export function selectorIsUnspecific(selector = ''): boolean {
    const value = String(selector).trim();
    if (!value) return false;
    const uiSelector = value.replace(/^android=/, '');
    if (/^new\s+UiSelector\(\)/.test(uiSelector)) {
        return !UI_SELECTOR_IDENTIFYING_METHODS.test(uiSelector);
    }
    if (/^-ios predicate string:/.test(value)) return false;
    const chain = value.replace(/^-ios class chain:/, '');
    if (/^\*\*\//.test(chain) || /^XCUIElementType\w+(?:\/XCUIElementType\w+)*(?:\[\d+\])?$/.test(chain)) {
        return !/\[`[^`]*`\]/.test(chain);
    }
    if (/^\(?\/{1,2}[^/]/.test(value) || value === '//*') {
        const withoutPositions = value.replace(/\[\d+\]/g, '');
        return !/[\[\]@=]|contains\(|text\(\)|starts-with\(/.test(withoutPositions);
    }
    return false;
}
