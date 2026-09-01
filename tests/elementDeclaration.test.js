const test = require('node:test');
const assert = require('node:assert/strict');
const { declareElement, declareElements } = require('../dist/core/automation');

function imports(entries) {
    return new Map(Object.entries(entries).map(([module, identifiers]) => [
        module,
        { specifier: `@locators/${module}.locator.json`, identifiers: new Map(Object.entries(identifiers)) },
    ]));
}

const SHORTCUT_TAPP = {
    name: 'shortcutTapp', module: 'home/home', squad: 'home', scope: 'home', platform: 'android',
    file: 'resources/locators/home/home.locator.json',
    androidSelector: '//android.widget.Button[@content-desc="Tapp"]',
    iosSelector: '//XCUIElementTypeButton[@name="Tapp"]',
    androidBlock: 'homeAndroid', iosBlock: 'homeIos',
    androidStrategy: 'XPATH', iosStrategy: 'XPATH',
};

const SOLO_IOS = {
    name: 'btnViewAllAccounts', module: 'interoperabilidad/tapp-subhome',
    squad: 'interoperabilidad', scope: 'squad', platform: 'android',
    file: 'resources/locators/interoperabilidad/tapp-subhome.locator.json',
    androidSelector: '', iosSelector: '//XCUIElementTypeButton[@name="Ver todas"]',
    androidBlock: 'tappSubhomeAndroid', iosBlock: 'tappSubhomeIos',
    androidStrategy: 'XPATH', iosStrategy: 'XPATH',
};

test('declara tipo, bloque, valor y la expresión lista para escribir', () => {
    const declaration = declareElement(SHORTCUT_TAPP, imports({ 'home/home': { LocatorHome: 6 } }));

    assert.equal(declaration.name, 'shortcutTapp');
    assert.equal(declaration.identifier, 'LocatorHome');
    assert.equal(declaration.locators.android.type, 'XPATH');
    assert.equal(declaration.groups.android, 'homeAndroid');
    assert.equal(declaration.locators.android.reference, 'LocatorHome.homeAndroid.shortcutTapp');
    assert.equal(declaration.locators.ios.reference, 'LocatorHome.homeIos.shortcutTapp');
});

// Reutilizar implica adoptar el nombre existente: `name` es siempre la clave del
// JSON, nunca un nombre nuevo.
// La clave del JSON no viaja aparte porque reutilizar implica adoptar el nombre
// existente: `name` ES la clave, y `reference` la lleva dentro.
test('el nombre es el de la clave existente', () => {
    const declaration = declareElement(SHORTCUT_TAPP, imports({ 'home/home': { LocatorHome: 6 } }));
    assert.ok(declaration.locators.android.reference.endsWith(`.${declaration.name}`));
    assert.ok(declaration.locators.ios.reference.endsWith(`.${declaration.name}`));
});

// tapp-subhome es iOS puro: reutilizarlo tal cual romperia Android.
test('marca missing la plataforma que todavía no tiene locator', () => {
    const declaration = declareElement(SOLO_IOS, imports({}));

    assert.equal(declaration.locators.android.status, 'missing');
    assert.equal(declaration.locators.android.value, '');
    assert.equal(declaration.locators.ios.status, undefined);
    // El bloque y la referencia igual viajan: dicen dónde completarlo.
    assert.equal(declaration.locators.android.reference,
        'TappSubhomeLocator.tappSubhomeAndroid.btnViewAllAccounts');
});

// `home/home` se importa como HomeLocator en un Screen Object y LocatorHome en
// otro: el que vale es el del archivo donde se va a escribir.
test('usa el identificador del screen destino y avisa cuando falta el import', () => {
    const catalogo = imports({ 'home/home': { HomeLocator: 2, LocatorHome: 6 } });

    const sinImport = declareElement(SHORTCUT_TAPP, catalogo);
    assert.equal(sinImport.identifier, 'LocatorHome', 'sin destino gana el más usado');
    assert.equal(sinImport.needsImport, true);

    const conImport = declareElement(SHORTCUT_TAPP, catalogo, new Map([['home/home', 'HomeLocator']]));
    assert.equal(conImport.identifier, 'HomeLocator', 'el destino manda: el código debe compilar ahí');
    assert.equal(conImport.needsImport, undefined);
    assert.equal(conImport.locators.android.reference, 'HomeLocator.homeAndroid.shortcutTapp');
});

test('el import es por alias aunque el framework lo escriba relativo', () => {
    const relativo = new Map([['home/home', {
        specifier: '../../resources/locators/home/home.locator.json',
        identifiers: new Map([['LocatorHome', 6]]),
    }]]);
    const declaration = declareElement(SHORTCUT_TAPP, relativo);
    assert.match(declaration.import, /^@locators\//);
    assert.doesNotMatch(declaration.import, /\.\./);
});

test('deriva un identificador cuando ningún screen importa el módulo', () => {
    const declaration = declareElement(SOLO_IOS, imports({}));
    assert.equal(declaration.identifier, 'TappSubhomeLocator');
    assert.equal(declaration.needsImport, true);
});

// Omitir un elemento es el error que se quiere evitar: el agente no puede pedir
// lo que no sabe que existe, y termina duplicando.
test('declara todos los elementos, sin tope', () => {
    const muchos = Array.from({ length: 60 }, (_, index) => ({
        ...SHORTCUT_TAPP, name: `elemento${index}`, module: `squad/modulo${index % 5}`,
    }));
    const modules = declareElements(muchos, imports({}));

    assert.equal(modules.length, 5, 'un grupo por módulo');
    assert.equal(modules.reduce((total, group) => total + group.elements.length, 0), 60);
});

// El peso baja factorizando lo repetido, no quitando datos.
test('agrupa por módulo sin perder ningún campo del elemento', () => {
    const modules = declareElements(
        [SHORTCUT_TAPP, { ...SHORTCUT_TAPP, name: 'btnOther' }, SOLO_IOS],
        imports({ 'home/home': { LocatorHome: 6 } })
    );

    const home = modules.find(group => group.module === 'home/home');
    assert.equal(home.identifier, 'LocatorHome');
    assert.match(home.import, /^@locators\//);
    assert.deepEqual(home.elements.map(element => element.name), ['shortcutTapp', 'btnOther']);
    // Cada elemento conserva tipo, bloque, clave, valor y referencia.
    assert.equal(home.groups.android, 'homeAndroid');
    const android = home.elements[0].locators.android;
    assert.equal(android.type, 'XPATH');
    assert.equal(android.reference, 'LocatorHome.homeAndroid.shortcutTapp');
    assert.ok(android.value);

    const subhome = modules.find(group => group.module === 'interoperabilidad/tapp-subhome');
    assert.equal(subhome.elements[0].locators.android.status, 'missing');
});

test('no repite el mismo elemento', () => {
    const modules = declareElements([SHORTCUT_TAPP, SHORTCUT_TAPP, SOLO_IOS], imports({}));
    assert.equal(modules.reduce((total, group) => total + group.elements.length, 0), 2);
});


// Que los propios archivos del caso usen el locator no es radio de impacto: es
// ruido, y se paga en contexto.
test('el radio de impacto solo aparece cuando hay dependientes', () => {
    const conDependientes = declareElements(
        [SHORTCUT_TAPP], imports({}), new Map(),
        () => ({ screens: ['screenobjects/home/home.screen.ts'], steps: [] })
    );
    assert.deepEqual(
        conDependientes[0].elements[0].usedBy,
        { screens: ['screenobjects/home/home.screen.ts'], steps: [] }
    );

    const sinDependientes = declareElements(
        [SHORTCUT_TAPP], imports({}), new Map(), () => ({ screens: [], steps: [] })
    );
    assert.equal(sinDependientes[0].elements[0].usedBy, undefined);

    const sinLookup = declareElements([SHORTCUT_TAPP], imports({}));
    assert.equal(sinLookup[0].elements[0].usedBy, undefined);
});
