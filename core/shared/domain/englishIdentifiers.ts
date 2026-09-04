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
    // Ausencia y negacion. Faltaban enteras, y como tampoco se detectaban como
    // espanol, `mensaje de no hay ventas` salia `noHaySalesMessage`: un nombre
    // a medias que el recorder daba por limpio. La mitad del trabajo de QA son
    // casos negativos, asi que el hueco no era anecdotico.
    sin: 'without', vacio: 'empty', vacia: 'empty', vacios: 'empty', vacias: 'empty',
    ninguno: 'no', ninguna: 'no', ningun: 'no',
    resultado: 'result', resultados: 'results',
    // Vocabulario corriente de QA que faltaba entero. Medido sobre 113 palabras
    // habituales, el diccionario cubria 42: las 71 restantes salian tal cual en
    // los identificadores —`etiquetaBalanceDisponible`— y ademas 70 de ellas no
    // se detectaban como espanol, asi que `gap-english-naming` nunca saltaba y
    // el recorder daba el nombre por limpio.
    etiqueta: 'label', etiquetas: 'labels', disponible: 'available',
    informacion: 'information', completa: 'complete', completar: 'complete',
    columna: 'column', columnas: 'columns', importe: 'amount', importes: 'amounts',
    codigo: 'code', codigos: 'codes', hora: 'time', horas: 'times',
    estado: 'status', estados: 'statuses', historial: 'history',
    comercio: 'merchant', comercios: 'merchants', producto: 'product', productos: 'products',
    recibo: 'receipt', recibos: 'receipts', operacion: 'operation', operaciones: 'operations',
    transferencia: 'transfer', transferencias: 'transfers',
    deposito: 'deposit', depositos: 'deposits', retiro: 'withdrawal', retiros: 'withdrawals',
    abono: 'credit', abonos: 'credits', cargo: 'charge', cargos: 'charges',
    banco: 'bank', bancos: 'banks', tipo: 'type', tipos: 'types',
    cambio: 'exchange', moneda: 'currency', monedas: 'currencies', dolares: 'dollars',
    atras: 'back', ordenar: 'sort', elegir: 'choose', recibir: 'receive',
    compartir: 'share', descargar: 'download', copiar: 'copy', pegar: 'paste',
    // Conectores temporales y de modo que si aportan al nombre.
    tras: 'after', despues: 'after', antes: 'before', durante: 'during', hasta: 'until',
    acceder: 'access', accede: 'access', acceso: 'access',
    editar: 'edit', eliminar: 'delete', borrar: 'clear',
    agregar: 'add', anadir: 'add', quitar: 'remove',
    activar: 'enable', habilitar: 'enable', desactivar: 'disable',
    alerta: 'alert', alertas: 'alerts', aviso: 'notice', avisos: 'notices',
    correcto: 'correct', incorrecto: 'incorrect', valido: 'valid', invalido: 'invalid',
    lleno: 'full', pendiente: 'pending', pendientes: 'pending',
    aprobado: 'approved', aprobada: 'approved', rechazado: 'rejected', rechazada: 'rejected',
    superior: 'top', inferior: 'bottom', izquierda: 'left', derecha: 'right',
    arriba: 'up', abajo: 'down', primero: 'first',
    cantidad: 'quantity', descuento: 'discount', descuentos: 'discounts',
    comision: 'fee', comisiones: 'fees', deuda: 'debt', deudas: 'debts',
    cobro: 'collection', cobros: 'collections',
};

/**
 * Palabras del diccionario que solas no prueban nada: este repo usa `ver` como
 * abreviatura de "version" y `solo`/`mas`/`dia` existen o parecen inglesas.
 * Necesitan compania para marcar; el resto del diccionario marca solo.
 */
/**
 * Vocabulario aprendido de respuestas validadas a score 100: cuando el agente
 * renombro `userDescargaHistory` a `userDownloadHistory`, `descarga->download`
 * queda registrado y el siguiente caso ya no paga tokens por esa palabra.
 * Vive en la memoria del recorder; aqui solo se aplica en proceso.
 */
const LEARNED: Record<string, string> = {};

export function extendTranslations(entries: Record<string, string>): void {
    for (const [word, translation] of Object.entries(entries || {})) {
        const key = String(word || '').trim().toLowerCase();
        const value = String(translation || '').trim();
        if (!key || !value || TRANSLATIONS[key]) continue;
        LEARNED[key] = value;
    }
}

export function learnedTranslations(): Record<string, string> {
    return { ...LEARNED };
}

/**
 * Busca una palabra en el diccionario tolerando su forma: plural, sustantivo
 * deverbal (`descarga` -> `descargar`) y participio (`descargado` ->
 * `descargar`). Solo deriva formas cuya raiz este en el diccionario; nunca
 * inventa una traduccion.
 */
export function dictionaryLookup(word: string): string | undefined {
    const direct = TRANSLATIONS[word] || LEARNED[word];
    if (direct) return direct;
    const candidates: string[] = [];
    if (word.endsWith('es') && word.length > 4) candidates.push(word.slice(0, -2));
    if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
    if (/[ae]$/.test(word) && word.length > 3) candidates.push(`${word}r`);
    if (/(ado|ada|ido|ida)$/.test(word) && word.length > 5) {
        candidates.push(`${word.slice(0, -3)}ar`, `${word.slice(0, -3)}er`, `${word.slice(0, -3)}ir`);
    }
    if (/(ados|adas|idos|idas)$/.test(word) && word.length > 6) {
        candidates.push(`${word.slice(0, -4)}ar`, `${word.slice(0, -4)}er`, `${word.slice(0, -4)}ir`);
    }
    for (const candidate of candidates) {
        const found = TRANSLATIONS[candidate] || LEARNED[candidate];
        if (found) return found;
    }
    return undefined;
}

/**
 * Ingles y vocabulario propio que pasa sin traducir ni marcar. Es una lista
 * corta a proposito: lo que no este aqui, en el diccionario ni en el framework
 * se reporta como no traducido en vez de darse por bueno.
 */
export const KNOWN_ENGLISH_TOKENS = new Set([
    // ingles habitual en codigo de pruebas
    'get', 'set', 'tap', 'click', 'open', 'close', 'show', 'hide', 'see', 'view', 'go', 'back',
    'home', 'login', 'logout', 'sign', 'in', 'out', 'up', 'down', 'on', 'off', 'to', 'from', 'with',
    'and', 'or', 'not', 'no', 'yes', 'ok', 'new', 'old', 'all', 'any', 'each', 'first', 'last',
    'next', 'previous', 'prev', 'only', 'more', 'less', 'main', 'sub', 'top', 'bottom', 'left', 'right',
    'button', 'field', 'input', 'text', 'label', 'title', 'subtitle', 'icon', 'image', 'link',
    'list', 'item', 'items', 'row', 'rows', 'card', 'cards', 'tab', 'tabs', 'menu', 'modal', 'dialog',
    'screen', 'page', 'view', 'container', 'header', 'footer', 'banner', 'toast', 'popup',
    'user', 'users', 'name', 'number', 'amount', 'balance', 'account', 'payment', 'pay', 'send',
    'receive', 'transfer', 'confirm', 'cancel', 'accept', 'continue', 'skip', 'retry', 'submit',
    'search', 'filter', 'filters', 'sort', 'select', 'option', 'options', 'check', 'verify',
    'validate', 'validation', 'error', 'success', 'warning', 'info', 'message', 'status', 'state',
    'date', 'day', 'days', 'today', 'week', 'month', 'year', 'time', 'hour', 'minute', 'range',
    'phone', 'email', 'password', 'code', 'otp', 'pin', 'qr', 'id', 'url', 'sms', 'app', 'api',
    'android', 'ios', 'mobile', 'web', 'data', 'value', 'values', 'total', 'detail', 'details',
    'summary', 'history', 'movement', 'movements', 'receipt', 'contact', 'contacts', 'store',
    'service', 'services', 'card', 'cash', 'credit', 'debit', 'loan', 'wallet', 'promo', 'promotion',
    'scroll', 'swipe', 'wait', 'press', 'long', 'type', 'clear', 'enter', 'exit', 'save', 'delete',
    'edit', 'add', 'remove', 'create', 'update', 'load', 'refresh', 'expected', 'actual', 'result',
    'happy', 'unhappy', 'path', 'case', 'cases', 'test', 'tests', 'flow', 'step', 'steps',
    // marcas y vocabulario propio de Yape
    'yape', 'yapeo', 'yapear', 'yapero', 'yaperos', 'tapp', 'bcp', 'plin', 'yapecard',
]);

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
    // `no hay X` es `no X`: el verbo no aporta nada al identificador.
    'hay', 'existe', 'existen', 'tiene', 'tienen',
    // Modales y conectores que no nombran nada: `pueda ver` es `see`.
    'pueda', 'puede', 'pueden', 'poder', 'cada', 'ya', 'aun', 'tambien', 'luego',
    'segun', 'mediante', 'entre', 'sobre', 'hacia', 'ante', 'en',
]);

/**
 * Devuelve los marcadores de espanol hallados en un identificador.
 *
 * Una palabra de dominio basta (`monto`, `movimientos`, `boton` no son ingles
 * bajo ninguna lectura). Las funcionales necesitan compania: `elSeeMore` es
 * "element See More" y tiene que pasar limpio.
 */
/**
 * Terminaciones que no aparecen en ingles y marcan una palabra como espanola sin
 * necesidad de tenerla en el diccionario.
 *
 * Es la red de seguridad: el diccionario siempre va a ir por detras del
 * vocabulario real de los QA, y una palabra desconocida pasando en silencio es
 * como se colaron `noHaySalesMessage` y `etiquetaBalanceDisponible`. Con esto,
 * lo que el diccionario no sepa traducir al menos abre `gap-english-naming` en
 * vez de darse por bueno.
 */
const SPANISH_ENDINGS = [
    'cion', 'ciones', 'dad', 'dades', 'miento', 'mientos',
    'encia', 'encias', 'ancia', 'ancias', 'mente', 'aje', 'ajes',
];

/** `informacion`, `cantidad`, `transferencia`... sin estar en el diccionario. */
function looksSpanish(word: string): boolean {
    if (word.length < 5) return false;
    return SPANISH_ENDINGS.some(ending => word.endsWith(ending));
}

export function spanishTokens(identifier: string): string[] {
    const tokens = [...new Set(words(String(identifier || '')))];
    const domain = tokens.filter(word => DOMAIN_WORDS.has(word));
    const functional = tokens.filter(word => FUNCTION_WORDS.has(word));
    // Una terminacion espanola marca sola: no necesita compania como las
    // palabras ambiguas, porque el ingles no las produce.
    const morphological = tokens.filter(word =>
        !DOMAIN_WORDS.has(word) && !TRANSLATIONS[word] && looksSpanish(word));
    if (morphological.length) return [...new Set([...domain, ...morphological, ...functional])];
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
/**
 * Tokenizacion para nombres de identificador.
 *
 * `words()` descarta todo token de un caracter, que es correcto para medir
 * similitud pero pierde informacion al nombrar: "ultimos 7 dias" salia como
 * `filterLastDays`, sin el 7, mientras 15/30/90 si sobrevivian. El nombre
 * mentia y ademas podia chocar con otro periodo. Aqui se conservan los digitos
 * sueltos y se siguen descartando las letras sueltas, que son ruido.
 */
function identifierTokens(value: string): string[] {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 1 || /^[0-9]$/.test(word));
}

/**
 * Palabras de un texto que nadie sabe traducir ni reconoce como inglesas:
 * ni el diccionario (con sus formas), ni la lista de ingles conocido, ni el
 * vocabulario que ya usa el framework (`knownTokens`). Es la red que cierra el
 * silencio: antes `descarga` o `tras` pasaban como buenas por no tener una
 * terminacion espanola.
 */
export function unknownTokens(value: string, knownTokens: Set<string> = new Set()): string[] {
    return [...new Set(identifierTokens(value)
        // `last30` es `last` + un numero: el numero no se juzga.
        .map(word => word.replace(/\d+/g, ''))
        .filter(word => !DROPPED.has(word))
        .filter(word => word.length >= 3)
        .filter(word => !dictionaryLookup(word))
        .filter(word => !KNOWN_ENGLISH_TOKENS.has(word))
        .filter(word => !ENGLISH_VALUES.has(word))
        .filter(word => !knownTokens.has(word)))];
}

const ENGLISH_VALUES = new Set(Object.values(TRANSLATIONS).flatMap(value => identifierTokens(value)));

export function translateToEnglish(value: string): Translation {
    const tokens = identifierTokens(value).filter(word => !DROPPED.has(word));
    // `no tiene ninguna venta` traduce `no` y `ninguna` a lo mismo; repetirlo
    // daria `noNoSale`.
    const translated = tokens.map(word => dictionaryLookup(word) || word)
        .filter((word, index, all) => word !== all[index - 1]);
    const untranslated = tokens.filter(word => !dictionaryLookup(word) && spanishTokens(word).length);
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
    const parts = identifierTokens(translated);
    return parts.length ? parts.join('-').slice(0, 64).replace(/-+$/, '') : fallback;
}

/**
 * Deduce traducciones a partir de renombres validados: el recorder propuso
 * `userDescargaHistory` y el agente entrego `userDownloadHistory`; con el
 * resto de tokens iguales, `descarga -> download` queda aprendido. Solo se
 * aprende de tokens que nadie sabia traducir, y solo cuando la alineacion es
 * inequivoca (misma cantidad de tokens, una unica diferencia).
 */
export function learnTranslationsFromRenames(
    renames: Array<{ before: string; after: string }>,
): Record<string, string> {
    const learned: Record<string, string> = {};
    for (const { before, after } of renames) {
        const source = identifierTokens(before);
        const target = identifierTokens(after);
        if (!source.length || source.length !== target.length) continue;
        const differences = source
            .map((token, index) => [token, target[index]] as const)
            .filter(([token, replacement]) => token !== replacement);
        if (differences.length !== 1) continue;
        const [token, replacement] = differences[0];
        if (dictionaryLookup(token) || KNOWN_ENGLISH_TOKENS.has(token)) continue;
        if (!/^[a-z]{3,}$/.test(replacement) || !/^[a-z]{3,}$/.test(token)) continue;
        learned[token] = replacement;
    }
    return learned;
}

export const englishIdentifiers = {
    spanishTokens,
    isSpanishIdentifier,
    declaredIdentifiers,
    translateToEnglish,
    translateToSlug,
    dictionaryLookup,
    unknownTokens,
    extendTranslations,
    learnedTranslations,
    learnTranslationsFromRenames,
};
