/**
 * Redacción declarativa del borrador (filas domain/qa/template): frases QA,
 * objeto e intención a partir de contextHints, y plantillas de respaldo.
 */
import crypto from 'crypto';
import path from 'path';
import {
    RecordedStep,
} from '../../contracts';
import {
    translateToEnglish,
} from '../../../shared';
import { camel, titleFromSlug, words } from './naming';

/**
 * Texto procedimental que no puede ser un step: narra la interfaz en vez del
 * comportamiento. Es el mismo criterio que aplica el validador al Feature.
 */
export const PROCEDURAL_TEXT =
    /\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b|\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:bot[oó]n|elemento|campo)\b|\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b|\b(?:espera|esperar)\s+\d+\s*segundos?\b|\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b/i;

/**
 * Frase del QA lista para usarse como texto de step, o `undefined`.
 *
 * El objetivo y el criterio de aceptacion ya son espanol redactado por una
 * persona y describen exactamente el comportamiento y el resultado esperado.
 * Usarlos evita la plantilla, que armaba la frase con el slug tecnico y salia
 * como "el usuario completa saldo disponible consultar etiqueta": palabras
 * sueltas en orden de maquina.
 */
export function qaSentence(value: string | undefined): string | undefined {
    const text = String(value || '').trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
    if (text.length < 12 || text.split(' ').length < 4) return undefined;
    // Un keyword dentro del texto rompe el parseo del Feature.
    if (/^(?:Given|When|Then|And|But|Dado|Cuando|Entonces)\b/i.test(text)) return undefined;
    if (PROCEDURAL_TEXT.test(text)) return undefined;
    // Un step no nombra controles: eso es narrar la interfaz, no el negocio.
    if (/\b(?:bot[oó]n|campo|icono|checkbox|men[uú]|input|label|etiqueta)\b/i.test(text)) return undefined;
    // `<param>` sin columna en Examples deja el step sin enlazar.
    if (/<[^>]+>/.test(text)) return undefined;
    return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Frase de dominio redactada a mano, o `undefined` si ninguna aplica.
 *
 * Se separa de la plantilla para poder intercalar el objetivo del QA entre
 * ambas: la frase curada es mejor Gherkin que cualquier texto generico, pero la
 * plantilla es peor que las palabras de una persona.
 */
export function domainBehaviorText(
    actions: RecordedStep[], intents: string[], technicalName: string
): string | undefined {
    const relevantIndex = actions.map(action => !['SCROLL_DOWN', 'SCROLL_UP', 'SWIPE'].includes(action.action))
        .lastIndexOf(true);
    const intent = intents[relevantIndex >= 0 ? relevantIndex : intents.length - 1] || titleFromSlug(technicalName).toLowerCase();
    const all = intents.join(' ');
    // Solo cuando la intencion es VER los movimientos: "boton filtros de
    // movimientos" tambien menciona movimientos y no es consultarlos. Y solo
    // si TODAS las acciones del bloque son de consulta: "mostrar movimientos,
    // ver todos, enviar el reporte por correo" no es consultar movimientos,
    // por mucho que empiece consultandolos.
    const relevantIntents = intents.filter((_, index) =>
        !['SCROLL_DOWN', 'SCROLL_UP', 'SWIPE'].includes(actions[index]?.action));
    const otherDomain = /\b(?:filtr|cerrar|cierra|atr[aá]s|volver|envi|correo|email|pag|yape|descarg|compart|elimin|edit|registr)/i;
    if (/movimiento/i.test(all) && /\b(?:mostrar|muestra|ver|consulta|consultar|todos)\b/i.test(all)
        && !relevantIntents.some(candidate => otherDomain.test(candidate))) {
        return /todos/i.test(all)
            ? 'el usuario consulta todos sus movimientos'
            : 'el usuario consulta sus movimientos';
    }
    if (/^mostrar\s+/i.test(intent)) return `el usuario consulta ${intent.replace(/^mostrar\s+/i, '')}`;
    if (/^ver\s+/i.test(intent)) return `el usuario consulta ${intent.replace(/^ver\s+/i, '')}`;
    return undefined;
}

/**
 * Limpia la pista contextual del QA para usarla como objeto de una frase:
 * quita el verbo de la accion y el sustantivo de UI que la encabezan.
 * "boton ultimos 30 dias" -> "ultimos 30 dias";
 * "verificar si existe boton ultimos 30 dias" -> "ultimos 30 dias".
 */
export function intentObject(intent: string): string {
    return String(intent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^(?:se\s+)?(?:(?:verificar|verifica|validar|valida|comprobar|comprueba|revisar|revisa)\s+)?(?:que\s+|si\s+)?(?:exist[ae]n?\s+|aparezcan?\s+|se\s+muestr[ae]n?\s+|(?:el|la)\s+)?/i, '')
        .replace(/^(?:hacer|hace|dar|da)\s+(?:clic|click)\s+(?:en\s+)?/i, '')
        .replace(/^(?:presionar|presiona|pulsar|pulsa|tocar|toca|seleccionar|selecciona|abrir|abre)\s+/i, '')
        .replace(/^(?:el|la|los|las|un|una)\s+/i, '')
        .replace(/^(?:bot[oó]n|campo|icono|opci[oó]n|link|enlace|pesta[ñn]a|texto|label|etiqueta)\s+(?:de\s+)?/i, '')
        .replace(/\b(?:bot[oó]n|icono)\s+(?:de\s+)?/gi, '')
        .trim();
}

/**
 * Frase construida con las palabras del QA para la accion que define el
 * bloque. Peor que una frase de dominio, mucho mejor que la plantilla: el
 * texto es unico por elemento, asi que no hace falta sufijarlo, y le da a
 * Lorem un punto de partida con sentido.
 */
export function intentBehaviorText(actions: RecordedStep[], intents: string[]): string | undefined {
    const relevantIndex = actions.map(action => !['SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'ESPERAR', 'SCREENSHOT'].includes(action.action))
        .lastIndexOf(true);
    if (relevantIndex < 0) return undefined;
    const action = actions[relevantIndex];
    const object = intentObject(intents[relevantIndex] || '');
    if (!object || object.split(' ').length < 1) return undefined;
    if (/^[\w\s]{0,2}$/.test(object)) return undefined;
    switch (action.action) {
        case 'CLICK': return `el usuario selecciona ${object}`;
        case 'PRESION_LARGA': return `el usuario mantiene presionado ${object}`;
        case 'ESCRIBIR': return `el usuario ingresa ${object}`;
        case 'LIMPIAR': return `el usuario limpia ${object}`;
        default: return undefined;
    }
}

export function intentAssertionText(actions: RecordedStep[], intents: string[]): string | undefined {
    const index = actions.map(action => /^VERIFICAR_/.test(action.action)).lastIndexOf(true);
    if (index < 0) return undefined;
    const raw = intents[index] || '';
    const object = intentObject(raw);
    if (!object) return undefined;
    const uiNoun = /\b(?:bot[oó]n|opci[oó]n)\b/i.test(raw);
    return actions[index].action === 'VERIFICAR_NO_EXISTE'
        ? `no se muestra ${uiNoun ? 'la opción ' : ''}${object}`
        : `se muestra ${uiNoun ? 'la opción ' : ''}${object}`;
}

/** Ultimo recurso: arma la frase con el slug tecnico. Sale de maquina. */
export function behaviorTemplate(technicalName: string): string {
    return `el usuario completa ${titleFromSlug(technicalName).toLowerCase()}`;
}

export function domainAssertionText(intents: string[]): string | undefined {
    const context = intents.filter(Boolean).join(' ');
    if (/movimiento/i.test(context)) return 'se muestran los movimientos esperados';
    if (/saldo/i.test(context)) return 'se muestra la información de saldo esperada';
    return undefined;
}

export function assertionTemplate(technicalName: string): string {
    return `se obtiene el resultado esperado de ${titleFromSlug(technicalName).toLowerCase()}`;
}

// El nombre del parametro viaja al Gherkin como <param>, a la columna de
// Examples y a la variable del step, asi que va en ingles como <username>.
export function inputParameterName(intent: string, sequence: number): string {
    const ignored = new Set(['input', 'campo', 'nuevo', 'nueva', 'ingresar', 'escribir']);
    const parts = words(intent).filter(word => !ignored.has(word));
    if (parts.includes('numero')) return 'number';
    if (parts.includes('telefono') || parts.includes('celular')) return 'phone';
    return translateToEnglish(parts.join(' ')).name || camel(parts.join(' '), `value${sequence}`);
}

