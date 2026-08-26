const test = require('node:test');
const assert = require('node:assert/strict');
const { emptyOnRecordedPlatform } = require('../dist/core/automationResponseValidator');

// El modulo real de la casuistica: iOS relleno, Android vacio.
const TAPP_SUBHOME = {
    tappSubhomeAndroid: { txtTitle: '', btnViewAllAccounts: '', txtWhatWillYouDoToday: '' },
    tappSubhomeIos: {
        txtTitle: '//XCUIElementTypeStaticText[@name="TAPP"]',
        btnViewAllAccounts: '//XCUIElementTypeButton[@name="Ver todas"]',
    },
};
const documentFor = identifier => (identifier === 'TappSubhomeLocator' ? TAPP_SUBHOME : undefined);

const SCREEN = `
    public get txtTitle() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtTitle,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtTitle
        );
        return $(locator);
    }
    public get btnViewAllAccounts() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.btnViewAllAccounts,
            TypeLocator.ANDROID, TappSubhomeLocator.tappSubhomeAndroid.btnViewAllAccounts
        );
        return $(locator);
    }`;

// El fallo que reportaste: el agente adopta la clave, escribe el getter, y no
// rellena Android. Compila, pasa el review y falla al ejecutar.
test('detecta las claves que quedarian vacias en la plataforma grabada', () => {
    assert.deepEqual(
        emptyOnRecordedPlatform(SCREEN, 'android', documentFor, new Set()),
        ['TappSubhomeLocator.tappSubhomeAndroid.txtTitle',
         'TappSubhomeLocator.tappSubhomeAndroid.btnViewAllAccounts']
    );
});

// Se evalua el archivo COMO QUEDARA: lo que el paquete va a rellenar no es un
// error, o el agente no podria resolverlo nunca.
test('una clave declarada en completions ya no cuenta como vacia', () => {
    assert.deepEqual(
        emptyOnRecordedPlatform(SCREEN, 'android', documentFor, new Set(['txtTitle'])),
        ['TappSubhomeLocator.tappSubhomeAndroid.btnViewAllAccounts']
    );
});

test('no marca el bloque de la plataforma que no se grabo', () => {
    assert.deepEqual(emptyOnRecordedPlatform(SCREEN, 'ios', documentFor, new Set()), []);
});

test('la forma con corchetes del modulo propio tambien se revisa', () => {
    const propio = `Locators["tappSubhomeAndroid"].txtTitle`;
    assert.deepEqual(
        emptyOnRecordedPlatform(propio, 'android', () => TAPP_SUBHOME, new Set()),
        ['Locators.tappSubhomeAndroid.txtTitle']
    );
});

test('una clave con valor real no produce nada', () => {
    const lleno = { xAndroid: { a: 'new UiSelector().text("A")' }, xIos: { a: '' } };
    assert.deepEqual(
        emptyOnRecordedPlatform('L.xAndroid.a', 'android', () => lleno, new Set()),
        []
    );
});
