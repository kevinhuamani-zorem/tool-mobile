const test = require('node:test');
const assert = require('node:assert/strict');
const {
    spanishTokens, declaredIdentifiers, translateToEnglish,
} = require('../dist/core/shared');

test('marca el espanol inequivoco y deja pasar el ingles', () => {
    assert.deepEqual(spanishTokens('showMovementsButton'), []);
    assert.deepEqual(spanishTokens('verifyPdpDetail'), []);
    assert.deepEqual(spanishTokens('enterPassword'), []);
    assert.ok(spanishTokens('elUsuarioConsultaTodosSusMovimientos').length);
    assert.ok(spanishTokens('botonDeFiltroDeMovimientos').length);
    assert.ok(spanishTokens('fallos').length);
});

// Este repo usa `el` como abreviatura de "element" y `ver` de "version": una
// sola palabra funcional no puede bastar para marcar.
test('una palabra funcional sola no marca', () => {
    assert.deepEqual(spanishTokens('elSeeMore'), []);
    assert.deepEqual(spanishTokens('elSeeAll'), []);
    assert.deepEqual(spanishTokens('appVer'), []);
    assert.ok(spanishTokens('deLaCuenta').length, 'dos funcionales si marcan');
});

test('traduce el vocabulario del recorder sin pasar por el agente', () => {
    assert.equal(translateToEnglish('lista de movimientos').name, 'movementsList');
    assert.equal(translateToEnglish('boton de filtro de movimientos').name, 'filterMovementsButton');
    assert.equal(translateToEnglish('boton de mostrar movimientos').name, 'showMovementsButton');
    assert.equal(translateToEnglish('campo de correo').name, 'emailField');
    assert.equal(translateToEnglish('el usuario desplaza movimientos').name, 'userScrollMovements');
});

// El sustantivo de UI va al final para que el nombre se lea en ingles.
test('mueve el sustantivo de UI al final salvo que sea lo unico que hay', () => {
    assert.equal(translateToEnglish('pantalla de resumen').name, 'summaryScreen');
    assert.equal(translateToEnglish('lista').name, 'list');
    assert.equal(translateToEnglish('boton').name, 'button');
});

test('reporta lo que el diccionario no cubre', () => {
    const desconocido = translateToEnglish('boton de zarandeo');
    assert.equal(desconocido.untranslated.length, 0, 'zarandeo no es marcador: no se reporta');
    // Una palabra que SI es marcador pero no tiene traduccion no puede existir:
    // los marcadores se derivan de las claves del diccionario.
    assert.deepEqual(translateToEnglish('movimientos del usuario').untranslated, []);
});

test('extrae los identificadores de cada capa y nunca del Feature', () => {
    const symbols = declaredIdentifiers({
        screen: 'class X extends BaseScreen {\n' +
            '  private get movementsList(): string { return ""; }\n' +
            '  private filterByPeriod(filtro: string): string { return filtro; }\n' +
            '  public async verifyMovements(): Promise<void> { return; }\n' +
            '}',
        steps: 'When(/^x$/, async (dataTable) => {\n' +
            '  const fallos = [];\n' +
            '  for (const fila of dataTable.hashes()) { fallos.push(fila); }\n' +
            '});',
        locators: JSON.stringify({ _metadata: { author: 'x' }, xAndroid: { showMovements: 'a' } }),
    });
    const names = symbols.map(symbol => symbol.name);
    assert.ok(names.includes('movementsList'));
    assert.ok(names.includes('filterByPeriod'));
    assert.ok(names.includes('verifyMovements'));
    assert.ok(names.includes('fallos'));
    assert.ok(names.includes('fila'), 'el binding de for..of tambien es una variable');
    assert.ok(names.includes('showMovements'));
    assert.equal(names.includes('_metadata'), false);
    assert.equal(names.includes('author'), false);
});

// Los casos negativos son la mitad del trabajo de QA y el diccionario no tenia
// ni una palabra de ausencia: `mensaje de no hay ventas` salia
// `noHaySalesMessage`, un nombre a medias que ademas nadie marcaba como
// espanol, asi que el agente lo renombraba por su cuenta y rompia el plan.
test('la ausencia y la negacion se traducen', () => {
    const { translateToEnglish } = require('../dist/core/shared');
    const name = value => translateToEnglish(value).name;
    assert.equal(name('mensaje de no hay ventas'), 'noSalesMessage');
    assert.equal(name('lista vacia de movimientos'), 'emptyMovementsList');
    assert.equal(name('sin resultados'), 'withoutResults');
    assert.equal(name('no existe el boton de filtro'), 'noFilterButton');
    // `no` y `ninguna` traducen a lo mismo; repetirlo daria `noNoSale`.
    assert.equal(name('no tiene ninguna venta'), 'noSale');
});

// Auditoria: de 113 palabras corrientes de QA el diccionario cubria 42, y 70 de
// las 71 restantes tampoco se detectaban como espanol, asi que salian en los
// identificadores y `gap-english-naming` nunca saltaba.
test('el vocabulario corriente de QA se traduce', () => {
    const { translateToEnglish } = require('../dist/core/shared');
    const name = value => translateToEnglish(value).name;
    assert.equal(name('etiqueta del saldo disponible'), 'balanceAvailableLabel');
    assert.equal(name('mensaje de transferencia rechazada'), 'transferRejectedMessage');
    assert.equal(name('historial de operaciones'), 'historyOperations');
    assert.equal(name('boton de eliminar tarjeta'), 'deleteCardButton');
});

// Red de seguridad: el diccionario siempre ira por detras del vocabulario real,
// asi que una terminacion espanola marca sola aunque la palabra no este.
test('las terminaciones espanolas se detectan sin diccionario', () => {
    const { isSpanishIdentifier } = require('../dist/core/shared');
    for (const identifier of [
        'autenticacionButton', 'visibilidadLabel', 'desplazamientoField',
        'existenciaCheck', 'correctamenteMessage', 'porcentajeInput',
    ]) {
        assert.equal(isSpanishIdentifier(identifier), true, identifier);
    }
    // Y no marca ingles legitimo con terminaciones parecidas.
    for (const identifier of [
        'visibilityLabel', 'authenticationButton', 'percentageInput',
        'displacementField', 'existenceCheck', 'quantityTotal',
    ]) {
        assert.equal(isSpanishIdentifier(identifier), false, identifier);
    }
});

const {
    dictionaryLookup, unknownTokens, learnTranslationsFromRenames, extendTranslations,
} = require('../dist/core/shared');

// El diccionario entiende la forma de la palabra: `descarga` y `descargados`
// salen de `descargar` sin enumerar cada forma a mano.
test('dictionaryLookup deriva plurales, sustantivos deverbales y participios', () => {
    assert.equal(dictionaryLookup('descargar'), 'download');
    assert.equal(dictionaryLookup('descarga'), 'download');
    assert.equal(dictionaryLookup('descargados'), 'download');
    assert.equal(dictionaryLookup('filtros'), 'filters');
    assert.equal(dictionaryLookup('encadenado'), undefined, 'no inventa: la raiz no esta en el diccionario');
    assert.equal(translateToEnglish('el usuario descarga el historial').name, 'userDownloadHistory');
    assert.equal(translateToEnglish('se muestra el titulo tras descargar').name, 'showAfterDownloadTitle');
    assert.equal(translateToEnglish('validar que pueda ver el contenedor').name, 'validateSeeContainer');
});

// Lo que nadie sabe traducir ya no pasa en silencio; el vocabulario del
// framework y las marcas propias si pasan.
test('unknownTokens reporta lo que ni el diccionario ni el framework reconocen', () => {
    assert.deepEqual(unknownTokens('historyEncadenadoButton'), ['encadenado']);
    assert.deepEqual(unknownTokens('showMovementsButton'), []);
    assert.deepEqual(unknownTokens('yaperoTappHome'), []);
    assert.deepEqual(unknownTokens('siLast30DaysButton'), []);  // "si" es corto: no se juzga
    assert.deepEqual(unknownTokens('historyEncadenadoButton', new Set(['encadenado'])), [],
        'una palabra que el framework ya usa es vocabulario valido');
});

test('learnTranslationsFromRenames aprende solo de alineaciones inequivocas y lo aplica', () => {
    assert.deepEqual(learnTranslationsFromRenames([
        { before: 'userEncadenadoHistory', after: 'userChainedHistory' },
        { before: 'showMovementsButton', after: 'showMovementsButton' },
        { before: 'aButton', after: 'anotherButtonEntirely' },          // distinta cantidad de tokens
        { before: 'filterTodayButton', after: 'filterNowButton' },       // `today` ya es ingles: no se aprende
    ]), { encadenado: 'chained' });
    extendTranslations({ encadenado: 'chained' });
    assert.equal(translateToEnglish('historial encadenado').name, 'historyChained');
    assert.deepEqual(unknownTokens('historyEncadenadoButton'), []);
});
