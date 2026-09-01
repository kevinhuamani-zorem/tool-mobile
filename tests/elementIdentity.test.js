const test = require('node:test');
const assert = require('node:assert/strict');
const { elementIdentity, ElementIdentityIndex } = require('../dist/core/automation');

// Los tres casos que el reviewer marco a mano en el PR de Tapp.
test('reconoce el mismo elemento aunque cambie la estrategia', () => {
    assert.deepEqual([...elementIdentity('~Tapp')], ['tapp']);
    assert.deepEqual([...elementIdentity('//android.widget.Button[@content-desc="Tapp"]')], ['tapp']);
    assert.deepEqual([...elementIdentity('android=new UiSelector().text("Tapp")')], ['tapp']);
    assert.deepEqual([...elementIdentity('//XCUIElementTypeButton[@name="Ver todas"]')], ['ver todas']);
});

test('descarta tipos de nodo, ids generados y numeros', () => {
    assert.deepEqual([...elementIdentity('//android.view.View')], []);
    assert.deepEqual([...elementIdentity('//XCUIElementTypeOther')], []);
    assert.deepEqual([...elementIdentity('//*[@resource-id=":r9:"]')], []);
    assert.deepEqual([...elementIdentity('//*[@index="3"]')], []);
    assert.deepEqual([...elementIdentity('')], []);
});

// Media app tiene un boton "Cerrar" y no son el mismo elemento.
test('una etiqueta generica sola no identifica', () => {
    assert.deepEqual([...elementIdentity('~Cerrar')], []);
    assert.deepEqual([...elementIdentity('~Continuar')], []);
    // Como parte de una etiqueta mas larga si distingue.
    assert.deepEqual([...elementIdentity('~Cerrar sesion')], ['cerrar sesion']);
});

test('encuentra el duplicado que la comparacion por cadena no veia', () => {
    const index = new ElementIdentityIndex([
        { name: 'shortcutTapp', module: 'home/home', scope: 'home',
          androidSelector: '//android.widget.Button[@content-desc="Tapp"]',
          iosSelector: '//XCUIElementTypeButton[@name="Tapp"]' },
        { name: 'btnOther', module: 'home/home', scope: 'home', androidSelector: '~Otro' },
    ]);
    const hits = index.find('~Tapp');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, 'shortcutTapp');
    assert.equal(hits[0].sharedValue, 'tapp');
});

// La razon por la que hay que leer los dos bloques: tapp-subhome esta vacio en
// Android, asi que mirando solo la plataforma de la sesion es invisible.
test('ve un locator que solo tiene valor en la otra plataforma', () => {
    const index = new ElementIdentityIndex([
        { name: 'btnViewAllAccounts', module: 'interoperabilidad/tapp-subhome', scope: 'squad',
          androidSelector: '', iosSelector: '//XCUIElementTypeButton[@name="Ver todas"]' },
    ]);
    const hits = index.find('~Ver todas');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, 'btnViewAllAccounts');
    assert.equal(hits[0].androidSelector, '', 'el gap avisa que hay que completarlo, no duplicarlo');
});

test('excluye lo que pida el llamador y no repite candidatos', () => {
    const index = new ElementIdentityIndex([
        { name: 'a', module: 'squad/propio', scope: 'squad', androidSelector: '~Ver todas' },
        { name: 'b', module: 'squad/otro', scope: 'squad',
          androidSelector: '~Ver todas', iosSelector: '//x[@name="Ver todas"]' },
    ]);
    assert.deepEqual(index.find('~Ver todas').map(hit => hit.name), ['a', 'b']);
    assert.deepEqual(
        index.find('~Ver todas', candidate => candidate.module === 'squad/propio').map(hit => hit.name),
        ['b'],
        'el modulo que se esta escribiendo no puede ser su propio duplicado'
    );
});
