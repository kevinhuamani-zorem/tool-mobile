/**
 * [visual-recorder] Deteccion de identificadores en espanol.
 *
 * El framework nombra su codigo en ingles (`goBack`, `enterPassword`,
 * `viewAll`, `verifyPdpDetail`) y deja el espanol para la prosa que lee el QA:
 * la linea `Feature:`, el nombre del Scenario y el texto de los steps. El
 * agente mezclaba los dos planos y producia `elUsuarioConsultaTodosSusMovimientos`.
 *
 * No es un detector de idioma: es una lista de marcadores inequivocos del
 * espanol. Se prefiere no marcar nada antes que marcar de mas, asi que quedan
 * fuera todas las palabras que existen igual en ingles (menu, total, final,
 * error, data, email, id, normal, principal, visual, actual, general, local...).
 */

import { words } from './selectorNormalization';

/**
 * Diccionario ES->EN del vocabulario que produce el recorder.
 *
 * Existe para que el camino determinista siga siendo determinista: el QA
 * escribe los contextHint en espanol, y si cada nombre logico tuviera que
 * pasar por el agente solo para traducirse, ninguna grabacion terminaria sin
 * gastar tokens. Lo que el diccionario no cubre si va al agente.
 */
const TRANSLATIONS: Record<string, string> = {
    usuario: 'user', usuarios: 'users', boton: 'button', botones: 'buttons',
    pantalla: 'screen', pantallas: 'screens', mostrar: 'show', muestra: 'show',
    muestran: 'show', ver: 'see', todo: 'all', todos: 'all', todas: 'all', mas: 'more',
    filtrar: 'filter', filtro: 'filter', filtros: 'filters', buscar: 'search', busca: 'search',
    validar: 'validate', valida: 'validate', verificar: 'verify', verifica: 'verify',
    ingresar: 'enter', ingresa: 'enter', seleccionar: 'select', selecciona: 'select',
    escribir: 'type', escribe: 'type', contenedor: 'container', pagina: 'page',
    cuenta: 'account', cuentas: 'accounts', saldo: 'balance', monto: 'amount',
    correo: 'email', clave: 'password', contrasena: 'password', numero: 'number',
    nombre: 'name', fecha: 'date', campo: 'field', campos: 'fields',
    lista: 'list', listas: 'lists', mensaje: 'message', mensajes: 'messages',
    guardar: 'save', enviar: 'send', cerrar: 'close', abrir: 'open',
    continuar: 'continue', aceptar: 'accept', cancelar: 'cancel',
    siguiente: 'next', anterior: 'previous', inicio: 'home',
    periodo: 'period', periodos: 'periods', fila: 'row', filas: 'rows',
    fallo: 'failure', fallos: 'failures', movimiento: 'movement', movimientos: 'movements',
    titulo: 'title', subtitulo: 'subtitle', opcion: 'option', opciones: 'options',
    esperado: 'expected', esperados: 'expected', esperada: 'expected', esperadas: 'expected',
    consulta: 'view', consultar: 'view', deberia: 'should', debe: 'should',
    // Vocabulario recurrente de Yape que el QA usa en los contextHint.
    pago: 'payment', pagos: 'payments', pagar: 'pay', recarga: 'topup',
    servicio: 'service', servicios: 'services', tarjeta: 'card', tarjetas: 'cards',
    celular: 'phone', telefono: 'phone', telefonico: 'phone', direccion: 'address', tienda: 'store',
    nuevo: 'new', nueva: 'new', ultimo: 'last', ultima: 'last', ultimos: 'last', ultimas: 'last',
    primer: 'first', primera: 'first', primeros: 'first', hoy: 'today', solo: 'only',
    valor: 'value', valores: 'values', texto: 'text', rango: 'range', rangos: 'ranges',
    desplazar: 'scroll', desplaza: 'scroll', deslizar: 'swipe', desliza: 'swipe',
    esperar: 'wait', espera: 'wait', tocar: 'tap', toca: 'tap', presionar: 'press', presiona: 'press',
    carrito: 'cart', precio: 'price', detalle: 'detail', detalles: 'details',
    resumen: 'summary', confirmar: 'confirm', exito: 'success', ayuda: 'help',
    casuistica: 'case', casuisticas: 'cases', caso: 'case', casos: 'cases',
    elemento: 'element', elementos: 'elements', modal: 'modal', ventana: 'window',
    flujo: 'flow', prueba: 'test', pruebas: 'tests',
    sesion: 'session', salir: 'exit', regresar: 'back', volver: 'back',
    comprobante: 'receipt', constancia: 'receipt', contacto: 'contact', contactos: 'contacts',
    comentario: 'comment', imagen: 'image', icono: 'icon', enlace: 'link',
    ventas: 'sales', venta: 'sale', dia: 'day', dias: 'days', mes: 'month', ano: 'year',
};

/**
 * Palabras del diccionario que solas no prueban nada: este repo usa `ver` como
 * abreviatura de "version" y `solo`/`mas`/`dia` existen o parecen inglesas.
 * Necesitan compania para marcar; el resto del diccionario marca solo.
 */
const AMBIGUOUS_ALONE = new Set(['ver', 'solo', 'mas', 'dia', 'dias', 'mes', 'ano']);

/**
 * Articulos, preposiciones y pronombres. Igual que AMBIGUOUS_ALONE, hacen falta
 * dos: `el` aqui suele significar "element" (`elSeeMore`, `elSeeAll`).
 */
const FUNCTION_WORDS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'del', 'al', 'de', 'por', 'para', 'con', 'se', 'su', 'sus',
    'lo', 'que', 'cual', 'cuando', 'donde', 'como',
    'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    ...AMBIGUOUS_ALONE,
]);

/**
 * Vocabulario de dominio: se deriva de las claves del diccionario para que las
 * dos listas no puedan separarse. Todo lo que sabemos traducir lo sabemos
 * reconocer, y al reves.
 */
const DOMAIN_WORDS = new Set(
    Object.keys(TRANSLATIONS).filter(word => !AMBIGUOUS_ALONE.has(word))
);

/** Palabras que se descartan al traducir: no aportan al identificador. */
const DROPPED = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'del', 'al', 'de', 'por', 'para', 'con', 'se', 'su', 'sus',
    'lo', 'que', 'cual', 'cuando', 'donde', 'como',
    'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
]);

/**
 * Devuelve los marcadores de espanol hallados en un identificador.
 *
 * Una palabra de dominio basta (`monto`, `movimientos`, `boton` no son ingles
 * bajo ninguna lectura). Las funcionales necesitan compania: `elSeeMore` es
 * "element See More" y tiene que pasar limpio.
 */
export function spanishTokens(identifier: string): string[] {
    const tokens = [...new Set(words(String(identifier || '')))];
    const domain = tokens.filter(word => DOMAIN_WORDS.has(word));
    const functional = tokens.filter(word => FUNCTION_WORDS.has(word));
    if (!domain.length && functional.length < 2) return [];
    return [...domain, ...functional];
}

export function isSpanishIdentifier(identifier: string): boolean {
    return spanishTokens(identifier).length > 0;
}

export interface NamedSymbol {
    kind: string;
    name: string;
}

/**
 * Identificadores que el agente declara en cada capa. Deliberadamente NO mira
 * el Feature: ahi el espanol es lo correcto.
 */
export function declaredIdentifiers(input: {
    steps?: string;
    screen?: string;
    locators?: string;
}): NamedSymbol[] {
    const symbols: NamedSymbol[] = [];
    const push = (kind: string, name: string) => {
        if (name) symbols.push({ kind, name });
    };

    const screen = String(input.screen || '');
    [...screen.matchAll(/public\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g)]
        .forEach(match => push('método del Screen Object', match[1]));
    [...screen.matchAll(/(?:private|protected|public)\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .forEach(match => push('getter del Screen Object', match[1]));
    [...screen.matchAll(/(?:private|protected)\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g)]
        .forEach(match => push('miembro del Screen Object', match[1]));

    const steps = String(input.steps || '');
    for (const [, declaration] of [
        ...steps.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=:]/g),
        ...screen.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=:]/g),
    ]) {
        push('variable', declaration);
    }
    // `for (const fila of ...)` no lleva `=`, se declara aparte.
    for (const [, binding] of [
        ...steps.matchAll(/\bfor\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/g),
        ...screen.matchAll(/\bfor\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/g),
    ]) {
        push('variable', binding);
    }

    try {
        const document = JSON.parse(String(input.locators || '{}'));
        Object.entries(document)
            .filter(([block, value]) =>
                block !== '_metadata' && value && typeof value === 'object' && !Array.isArray(value))
            .forEach(([, value]) => Object.keys(value as object)
                .forEach(key => push('locator', key)));
    } catch {
        // Un JSON invalido ya lo reporta otra regla.
    }

    return symbols;
}




/** Sustantivos de UI que en ingles van al final: `boton de filtro` -> `filterButton`. */
const TRAILING_NOUNS = new Set([
    'button', 'buttons', 'field', 'fields', 'screen', 'screens', 'list', 'lists',
    'container', 'page', 'message', 'messages', 'title', 'subtitle',
    'option', 'options', 'icon', 'label', 'input', 'tab', 'link', 'image',
]);

export interface Translation {
    /** camelCase en ingles, o '' si no quedo nada aprovechable. */
    name: string;
    /** Palabras en espanol que el diccionario no cubrio. */
    untranslated: string[];
}

/**
 * Traduce una intencion funcional a un identificador en ingles.
 *
 * Palabras que ya son inglesas o neutras (nombres propios, `qr`, `otp`, `pin`)
 * pasan tal cual: solo se traduce lo que el diccionario reconoce y solo se
 * reporta lo que quedo marcado como espanol sin traduccion.
 */
export function translateToEnglish(value: string): Translation {
    const tokens = words(String(value || '')).filter(word => !DROPPED.has(word));
    const translated = tokens.map(word => TRANSLATIONS[word] || word);
    const untranslated = tokens.filter(word => !TRANSLATIONS[word] && spanishTokens(word).length);
    const leading = translated.filter(word => !TRAILING_NOUNS.has(word));
    const trailing = translated.filter(word => TRAILING_NOUNS.has(word));
    // Si TODO era sustantivo de UI no hay nada que mover: `lista` -> `list`.
    const ordered = leading.length ? [...leading, ...trailing] : trailing;
    const name = ordered
        .map((word, index) => index === 0 ? word : word[0].toUpperCase() + word.slice(1))
        .join('');
    return { name, untranslated: [...new Set(untranslated)] };
}

/**
 * Version kebab-case para nombres de archivo y de modulo de locators.
 * El framework los nombra en ingles (`show-balance-happy-path.feature`,
 * `menu-my-addresses.feature`) aunque la linea `Feature:` vaya en espanol.
 */
export function translateToSlug(value: string, fallback: string): string {
    const translated = translateToEnglish(value).name;
    const parts = words(translated);
    return parts.length ? parts.join('-').slice(0, 64).replace(/-+$/, '') : fallback;
}

export const englishIdentifiers = {
    spanishTokens,
    isSpanishIdentifier,
    declaredIdentifiers,
    translateToEnglish,
    translateToSlug,
};
