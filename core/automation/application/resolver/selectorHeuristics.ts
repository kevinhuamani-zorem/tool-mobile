/**
 * Heurísticas sobre selectores grabados: texto dinámico, valores fijados en
 * el selector, comodines falsos y similitud conceptual entre métodos.
 */
import crypto from 'crypto';
import path from 'path';
import {
    ActionResolution,
    RecordedStep,
} from '../../contracts';
import { SquadReuseCatalog } from '../../../indexing';
import {
    TECHNICAL_STOP_WORDS,
    translateToEnglish,
} from '../../../shared';
import { words } from './naming';

export function likelyDynamicText(value = ''): boolean {
    const text = value.trim();
    return /(?:S\/|\$|€|£)\s*\d|\b\d+[.,]\d{2}\b|\b\d{6,}\b/.test(text);
}

/** Literales entre comillas dentro de un selector. */
export function selectorLiterals(selector = ''): string[] {
    return [...selector.matchAll(/["']([^"']+)["']/g)].map(match => match[1].trim());
}

/**
 * El selector fija el mismo texto que la acción valida.
 *
 * Es el patrón que produce un locator inservible: el dato observado deja de ser
 * lo que se verifica y pasa a ser la forma de encontrar el elemento, así que el
 * `Then` solo pasa mientras el dato no cambie. Un nombre propio no lo detecta
 * `likelyDynamicText`, que solo mira montos y números largos.
 */
export function selectorPinsAssertedValue(step: RecordedStep): boolean {
    const value = String(step.value || '').trim().toLowerCase();
    if (value.length < 3) return false;
    return selectorLiterals(step.selector).some(literal => {
        const bare = literal.replace(/[*%]+$/, '').trim().toLowerCase();
        if (!bare) return false;
        return bare === value || (bare.length >= 4 && (bare.includes(value) || value.includes(bare)));
    });
}

/**
 * Un XPath solo de tipos de nodo, sin ningun predicado, no identifica nada:
 * `//android.view.View` engancha la primera View generica del arbol, que existe
 * en practicamente cualquier pantalla. Como asercion siempre pasa, y el caso
 * queda verde sin haber comprobado nada.
 */
/** `UiSelector().text()` es coincidencia exacta: un `*` final nunca actúa como comodín. */
export function selectorUsesFakeWildcard(selector = ''): boolean {
    return /\.(?:text|description)\(\s*["'][^"']*[*%]["']\s*\)/.test(selector);
}

/**
 * Métodos del módulo target que ya cubren la intención de una acción.
 *
 * Detectar el módulo correcto no basta: el caso que se generó reutilizó el
 * archivo y aun así creó `validarNombreDelUsuarioYapero` junto al ya existente
 * `validarNombreDelYapero`. Se compara la intención contra el nombre del método
 * y contra las claves de locator que consume, con un bono si ambos son del
 * mismo tipo de acción.
 */
/**
 * Similitud entre conceptos, ignorando el relleno del idioma.
 *
 * `similarity` a secas cuenta palabras como "por" o "del", suficientes para que
 * "compartir constancia por correo" pareciera "buscar yapero por numero".
 */
/**
 * Sustantivos de interfaz que aparecen en casi cualquier metodo o clave del
 * framework. `TECHNICAL_STOP_WORDS` ya los descarta en espanol; la variante
 * traducida los reintroducia (`historyButton`, `txttitle`) y bastaban dos
 * coincidencias como `button` y `title` para que un Screen ajeno pareciera
 * cubrir las intenciones de una pantalla nueva y el plan lo extendiera.
 */
export const GENERIC_UI_TOKENS = new Set([
    'button', 'btn', 'txt', 'text', 'title', 'label', 'icon', 'screen', 'element',
    'option', 'item', 'field', 'input', 'tab', 'see', 'show', 'view', 'validate',
    'verify', 'check', 'press', 'tap', 'click', 'user', 'page',
]);

export function conceptSimilarity(left: string, right: string): number {
    const variants = (value: string) => [value, translateToEnglish(value).name]
        .filter(Boolean)
        .map(candidate => new Set([
            ...words(candidate)
                .filter(word => !TECHNICAL_STOP_WORDS.has(word) && !GENERIC_UI_TOKENS.has(word))
                .map(word => word.length >= 4 && word.endsWith('s') ? word.slice(0, -1) : word),
            // `words` descarta numeros de un digito. En filtros 7/15/30/90
            // ese numero es justamente lo que distingue una opcion de otra.
            ...(candidate.match(/\d+/g) || []),
        ]));
    let best = 0;
    // No se mezclan ambos idiomas en un unico conjunto: hacerlo infla el
    // denominador y vuelve cero una coincidencia valida como
    // `filtrar por solo hoy` -> `filterday`.
    for (const a of variants(left)) {
        for (const b of variants(right)) {
            if (!a.size || !b.size) continue;
            // El framework conserva identificadores legacy completamente en
            // minusculas (`filterday`, `btntoday`, `btn7days`). TypeScript no
            // permite separarlos por camelCase, pero sus conceptos siguen
            // siendo observables por inclusion de tokens suficientemente
            // largos. No se aplica a abreviaturas cortas para evitar ruido.
            const common = [...a].filter(word => [...b].some(candidate =>
                word === candidate
                || (word.length >= 3 && candidate.length >= 3
                    && (word.includes(candidate) || candidate.includes(word)))
            )).length;
            best = Math.max(best, common / Math.max(a.size, b.size));
        }
    }
    return best;
}

export function similarExistingMethods(
    catalog: SquadReuseCatalog,
    screenFile: string,
    resolution: ActionResolution
): NonNullable<ActionResolution['existingMethod']>[] {
    const assertion = /^VERIFICAR_/.test(resolution.action);
    return (catalog.screenMethods || [])
        .filter(method => method.file === screenFile)
        .map(method => {
            const byName = conceptSimilarity(resolution.intent, method.name);
            const byLocator = Math.max(0, ...(method.locatorKeys || [])
                .map(key => conceptSimilarity(resolution.intent, key)));
            const translatedIntent = [
                ...words(translateToEnglish(resolution.intent).name),
                ...(resolution.intent.match(/\d+/g) || []),
            ];
            const generic = new Set(['filter', 'movement', 'movements', 'button', 'btn', 'validate']);
            const specific = translatedIntent.filter(token => !generic.has(token));
            const specificLocatorHit = specific.some(token => (method.locatorKeys || [])
                .some(key => key.toLowerCase().includes(token.toLowerCase())));
            // El bono solo aplica entre aserciones: que dos acciones cualesquiera
            // "no sean aserción" no dice nada sobre si hacen lo mismo.
            const bothAssert = assertion && /^(?:validar|verificar|valida|verifica)/i.test(method.name);
            const score = Math.min(1,
                Math.max(byName, byLocator)
                + (bothAssert ? 0.15 : 0)
                + (specificLocatorHit ? 0.2 : 0));
            return {
                name: method.name,
                signature: method.signature,
                file: method.file,
                locatorKeys: method.locatorKeys || [],
                score: Number(score.toFixed(3)),
            };
        })
        .filter(candidate => candidate.score > 0)
        .sort((left, right) => right.score - left.score);
}
