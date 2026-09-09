/**
 * Redacción declarativa del borrador (filas domain/qa/template): frases QA,
 * objeto e intención a partir de contextHints, y plantillas de respaldo.
 */
import crypto from 'crypto';
import path from 'path';
import {
    RecordedStep,
    gherkinPersonProblem,
    gherkinBusinessWordingProblem,
} from '../../contracts';
import {
    translateToEnglish,
} from '../../../shared';
import { camel, titleFromSlug, words } from './naming';

/**
 * Frase del QA lista para usarse como texto de step, o `undefined`.
 *
 * El objetivo y el criterio de aceptacion ya son espanol redactado por una
 * persona y describen exactamente el comportamiento y el resultado esperado.
 * Usarlos evita la plantilla, que armaba la frase con el slug tecnico y salia
 * como "el usuario completa saldo disponible consultar etiqueta": palabras
 * sueltas en orden de maquina.
 */
export function qaSentence(value: string | undefined, kind: 'behavior' | 'assertion' = 'behavior'): string | undefined {
    let text = String(value || '').trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
    if (text.length < 12 || text.split(' ').length < 4) return undefined;
    // Un keyword dentro del texto rompe el parseo del Feature.
    if (/^(?:Given|When|Then|And|But|Dado|Cuando|Entonces)\b/i.test(text)) return undefined;
    if (gherkinBusinessWordingProblem(text)) return undefined;
    // Un step no nombra controles: eso es narrar la interfaz, no el negocio.
    if (/\b(?:bot[oó]n|campo|icono|checkbox|men[uú]|input|label|etiqueta)\b/i.test(text)) return undefined;
    // `<param>` sin columna en Examples deja el step sin enlazar.
    if (/<[^>]+>/.test(text)) return undefined;
    text = text.charAt(0).toLowerCase() + text.slice(1);
    // El criterio suele venir como instruccion ("verificar que existe el
    // filtro"): el resultado esperado se dice de forma impersonal ("se
    // muestra el filtro"). Lo que siga en infinitivo, primera persona o
    // imperativo no sirve como step: se deja a la frase construida con las
    // intenciones, que sale en tercera persona.
    if (kind === 'assertion') text = impersonalAssertion(text);
    if (gherkinPersonProblem(text)) return undefined;
    return text;
}

function impersonalAssertion(text: string): string {
    const stripped = text.replace(/^(?:se\s+)?(?:verificar|verifica|validar|valida|comprobar|comprueba|revisar|revisa)\s+(?:que\s+|si\s+)?/i, '');
    const shown = stripped.match(/^(?:se\s+)?(exist[ae]n?|aparec[ea]n?|visualiz[ae]n?|observ[ae]n?|muestr[ae]n?)\s+(.+)$/i);
    if (!shown) return stripped;
    const plural = /n$/i.test(shown[1]);
    return `${plural ? 'se muestran' : 'se muestra'} ${shown[2]}`;
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
    if (actions.some(action => !['CLICK', 'SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'ESPERAR', 'SCREENSHOT'].includes(action.action))) return undefined;
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
        .replace(/^(?:ingresar|ingresa|escribir|escribe|digitar|digita|completar|completa|llenar|llena)\s+(?:en\s+)?/i, '')
        .replace(/^(?:el|la|los|las|un|una)\s+/i, '')
        .replace(/^(?:bot[oó]n|campo|icono|opci[oó]n|link|enlace|pesta[ñn]a|texto|label|etiqueta)\s+(?:de\s+)?/i, '')
        .replace(/\b(?:bot[oó]n|icono)\s+(?:de\s+)?/gi, '')
        .trim();
}

export interface BehaviorWordingContext {
    previousAssertions?: string[];
    nextAssertions?: string[];
}

/**
 * Sintetiza el bloque completo entre verificaciones. Las frases de dominio
 * requieren acciones que las sostengan; el nombre del caso no basta para
 * atribuir un propósito a un click aislado. Lo desconocido queda para Lorem.
 */
export function intentBehaviorText(
    actions: RecordedStep[], intents: string[], context: BehaviorWordingContext = {},
): string | undefined {
    const entries = actions.map((action, index) => ({ action, object: intentObject(intents[index] || '') }))
        .filter(({ action }) => !['SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'ESPERAR', 'SCREENSHOT'].includes(action.action));
    if (!entries.length) return undefined;
    const folded = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const objects = entries.map(entry => folded(entry.object));
    const inputs = entries.filter(entry => entry.action.action === 'ESCRIBIR');
    const parameter = (entry: typeof entries[number]) => String(entry.action.value || '').match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/)?.[0];
    const previous = folded((context.previousAssertions || []).join(' '));
    const next = folded((context.nextAssertions || []).join(' '));
    const last = entries[entries.length - 1];
    const allClicks = entries.every(entry => entry.action.action === 'CLICK');
    // Permisos y avisos no sustituyen la intención inicial de entrar al flujo.
    if (allClicks && /^(?:yapear|iniciar yapeo)$/.test(objects[0])
        && objects.slice(1).every(object => /^(?:permitir|cerrar|aceptar|entendido)$/.test(object))
        && /\b(?:yapear|contactos|destinatario)\b/.test(next)) {
        return 'el usuario inicia un yapeo';
    }
    const emailInput = inputs.find(entry => /\b(?:correo|email)\b/.test(folded(entry.object)));
    if (emailInput && inputs.length === 1 && parameter(emailInput)
        && entries.every(entry => entry === emailInput || (entry.action.action === 'CLICK'
            && /^(?:enviar(?: correo)?|confirmar(?: envio)?)$/.test(folded(entry.object))))
        && last !== emailInput && /movimientos/.test(previous)) {
        return `el usuario solicita sus movimientos en el correo ${parameter(emailInput)}`;
    }
    if (entries.length === 1 && allClicks && /^(?:correo|enviar (?:por )?correo)$/.test(objects[0])
        && /enviar movimientos/.test(next)) {
        return 'el usuario prepara el envío de sus movimientos por correo';
    }
    const recipient = inputs.find(entry => /^(?:(?:su|el) )?(?:numero|telefono|celular)(?: (?:de )?(?:destino|destinatario))?$/.test(folded(entry.object)));
    if (recipient && inputs.length === 1 && parameter(recipient)
        && entries.every(entry => entry === recipient || (entry.action.action === 'CLICK'
            && /^(?:seleccionar |elegir )?(?:numero|telefono|celular)(?: (?:de )?(?:destino|destinatario))?$/.test(folded(entry.object))))
        && last !== recipient) {
        return `el usuario identifica al destinatario mediante el número ${parameter(recipient)}`;
    }
    const amount = inputs.find(entry => /^(?:el )?monto$/.test(folded(entry.object)));
    const comment = inputs.find(entry => /^(?:(?:agregar|anadir) )?(?:mensaje|comentario)$/.test(folded(entry.object)));
    if (amount && parameter(amount) && (!comment || parameter(comment))
        && last.action.action === 'CLICK' && folded(last.object) === 'yapear'
        && entries.every(entry => entry === amount || entry === comment || entry === last)) {
        return `el usuario solicita un yapeo por ${parameter(amount)}${comment ? ` con el comentario ${parameter(comment)}` : ''}`;
    }
    // Cerrar un detalle conocido expresa navegación, nunca éxito de la operación.
    if (allClicks && objects.every(object => /^(?:cerrar|entendido|atras|volver)$/.test(object))) {
        if (/correo enviado|envio.*correo/.test(previous)) return 'el usuario finaliza la consulta del envío por correo';
        if (/yapeo|yapeado/.test(previous)) return 'el usuario cierra el detalle del yapeo';
        return undefined;
    }
    // El respaldo conserva TODOS los datos del bloque, no solo el primer input.
    const phrases = entries.map(({ action, object }) => {
        if (!object || /^[\w\s]{0,2}$/.test(object)) return undefined;
        if (action.action === 'ESCRIBIR') {
            const param = String(action.value || '').match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/)?.[0];
            const noun = object.replace(/^(?:agregar|añadir)\s+/i, '');
            return `ingresa ${noun}${param ? ` ${param}` : ''}`;
        }
        if (action.action === 'CLICK') {
            const verbs: Record<string, string> = { enviar: 'envía', confirmar: 'confirma', buscar: 'busca',
                consultar: 'consulta', filtrar: 'filtra', compartir: 'comparte', cancelar: 'cancela',
                guardar: 'guarda', eliminar: 'elimina', descargar: 'descarga', yapear: 'solicita un yapeo' };
            const match = object.match(/^(enviar|confirmar|buscar|consultar|filtrar|compartir|cancelar|guardar|eliminar|descargar|yapear)(?:\s+(.+))?$/i);
            if (match) return `${verbs[match[1].toLowerCase()]}${match[2] ? ` ${match[2]}` : ''}`;
            return `selecciona ${object}`;
        }
        return undefined;
    });
    if (phrases.some(phrase => !phrase)) return undefined;
    const text = `el usuario ${phrases.join(' y ')}`;
    return gherkinBusinessWordingProblem(text) ? undefined : text;
}

export function intentAssertionText(actions: RecordedStep[], intents: string[]): string | undefined {
    const index = actions.map(action => /^VERIFICAR_/.test(action.action)).lastIndexOf(true);
    if (index < 0) return undefined;
    const raw = intents[index] || '';
    const negated = actions[index].action === 'VERIFICAR_NO_EXISTE';
    // "pantalla enviar movimientos" -> "se muestra la pantalla de enviar
    // movimientos"; "texto de correo enviado" -> "se muestra el mensaje de
    // correo enviado". La pista del QA nombra la pantalla o el mensaje y el
    // step lo dice con el articulo, no con las palabras sueltas.
    const screen = raw.match(/^(?:se\s+)?(?:(?:verificar|verifica|validar|valida|comprobar|comprueba)\s+)?(?:que\s+|si\s+)?(?:se\s+muestr[ae]n?\s+|exist[ae]n?\s+|aparezcan?\s+)?(?:la\s+)?pantalla\s+(?:de\s+)?(.+)$/i)?.[1];
    if (screen) return `${negated ? 'no ' : ''}se muestra la pantalla de ${screen.trim()}`;
    const message = raw.match(/^(?:se\s+)?(?:(?:verificar|verifica|validar|valida|comprobar|comprueba)\s+)?(?:que\s+|si\s+)?(?:se\s+muestr[ae]n?\s+|exist[ae]n?\s+|aparezcan?\s+)?(?:el\s+)?(?:texto|mensaje)\s+(?:de\s+)?(.+)$/i)?.[1];
    if (message) return `${negated ? 'no ' : ''}se muestra el mensaje${/^(?:del|de)\b/i.test(message.trim()) ? ' ' : ' de '}${message.trim()}`;
    const object = intentObject(raw).replace(/^numero\b/i, 'número');
    if (!object) return undefined;
    const article = /^(?:filtro|número|monto|nombre|saldo|correo)\b/i.test(object) ? 'el '
        : /^(?:informaci[oó]n|fecha|lista|cuenta)\b/i.test(object) ? 'la ' : '';
    const uiNoun = /\b(?:bot[oó]n|opci[oó]n)\b/i.test(raw);
    return negated
        ? `no se muestra ${uiNoun ? 'la opción ' : article}${object}`
        : `se muestra ${uiNoun ? 'la opción ' : article}${object}`;
}

/** Ultimo recurso: arma la frase con el slug tecnico. Sale de maquina. */
export function behaviorTemplate(technicalName: string): string {
    return `el usuario completa ${titleFromSlug(technicalName).toLowerCase()}`;
}

/**
 * La frase de dominio solo aplica cuando la verificacion es sobre el propio
 * dominio: "pantalla enviar movimientos" menciona movimientos y no verifica
 * los movimientos, sino el titulo de otra pantalla. Sin este filtro la frase
 * "se muestran los movimientos esperados" se repetia y la desambiguacion le
 * pegaba el nombre tecnico ("... en ingresa correo valida mensaje").
 */
const ASSERTION_OTHER_DOMAIN =
    /\b(?:filtr\w*|cerrar|cierra|atr[aá]s|volver|envi\w*|correo|email|pag\w*|descarg\w*|compart\w*|elimin\w*|edit\w*|registr\w*|mensaje|texto|pantalla|t[ií]tulo)\b/i;

export function domainAssertionText(intents: string[]): string | undefined {
    const context = intents.filter(Boolean).join(' ');
    if (ASSERTION_OTHER_DOMAIN.test(context)) return undefined;
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

