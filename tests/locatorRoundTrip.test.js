const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    frameworkLocator, roundTrip, strategyOf, strategyValue,
} = require('../dist/core/locatorStrategy');
const { frameworkContract } = require('../dist/core/frameworkContract');
const { projectPaths } = require('../dist/core/projectPaths');

const contract = frameworkContract(projectPaths.frameworkRoot);

/**
 * El fallo de origen: el inspector emitia `id=<resource-id>` porque WebdriverIO
 * lo entiende al grabar, pero `TypeLocator` no tiene estrategia de resource-id.
 * Al reconstruirlo salia `~com.yape.qa:id/btn` — accesibilidad, no resource-id —
 * y el caso generado no encontraba el elemento nunca. Nadie comparaba las dos
 * cadenas hasta que fallaba wdio.
 */
test('el par (tipo, valor) reconstruye el selector grabado', () => {
    const cases = [
        ['~Ver todos', 'android', 'ID', '~Ver todos'],
        ['android=new UiSelector().text("Hola")', 'android', 'ANDROID', 'android=new UiSelector().text("Hola")'],
        ['//*[@resource-id="com.yape.qa:id/btn"]', 'android', 'XPATH', '//*[@resource-id="com.yape.qa:id/btn"]'],
        ['iosPredicate=label == "Si"', 'ios', 'PREDICATESTRING', '-ios predicate string:label == "Si"'],
        ['iosClassChain=**/XCUIElementTypeButton', 'ios', 'CLASSCHAIN', '-ios class chain:**/XCUIElementTypeButton'],
    ];
    for (const [selector, platform, type, composed] of cases) {
        const check = roundTrip(selector, platform, contract);
        assert.equal(check.ok, true, `${selector}: ${check.reason}`);
        assert.equal(check.type, type);
        assert.equal(check.composed, composed);
    }
});

test('un resource-id de Android se graba como UiSelector, no como id=', () => {
    // `android=new UiSelector().resourceId(...)` es ademas la forma mayoritaria
    // del framework para resource-id, asi que el codigo generado se parece al
    // que ya esta escrito a mano.
    const check = roundTrip('id=com.yape.qa:id/btnFiltrar', 'android', contract);
    assert.equal(check.ok, true, check.reason);
    assert.equal(check.type, 'ANDROID');
    assert.equal(check.value, 'new UiSelector().resourceId("com.yape.qa:id/btnFiltrar")');
    assert.equal(check.composed, 'android=new UiSelector().resourceId("com.yape.qa:id/btnFiltrar")');
});

test('un id de Compose se graba como XPath sobre resource-id', () => {
    const check = roundTrip('id=btnCompose', 'android', contract);
    assert.equal(check.ok, true, check.reason);
    assert.equal(check.type, 'XPATH');
    assert.equal(check.composed, '//*[@resource-id="btnCompose"]');
});

test('strategyOf y strategyValue son las dos mitades del mismo par', () => {
    for (const selector of ['~Tapp', 'id=com.yape.qa:id/btn', 'id=btnCompose', '//*[@text="Hola"]']) {
        const pair = frameworkLocator(selector, 'android');
        assert.equal(strategyOf(selector, 'android'), pair.type);
        assert.equal(strategyValue(selector, 'android'), pair.value);
    }
});

test('avisa cuando el framework no puede componer la estrategia', () => {
    // XPATH se concatena sin prefijo: un valor pelado llegaria tal cual a wdio.
    const bare = roundTrip('Ver todos', 'android', contract);
    assert.equal(bare.ok, false);
    assert.match(bare.reason, /XPath/);

    // CLASSCHAIN solo existe en el switch de iOS.
    const wrongPlatform = roundTrip('iosClassChain=**/Button', 'android', contract);
    assert.equal(wrongPlatform.ok, false);
    assert.match(wrongPlatform.reason, /no compone/);
});

test('el inspector de Android ya no emite selectores id=', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'recorder', 'src', 'mobileInspector.ts'), 'utf-8'
    );
    assert.equal(/`id=\$\{/.test(source), false,
        'id=<resource-id> funciona al grabar y no existe en TypeLocator: no puede llegar al JSON');
    assert.match(source, /new UiSelector\(\)\.resourceId/);
});

const os = require('node:os');
const { AutomationRecordingStore } = require('../dist/core/automationRecordingStore');

// Sin esto, actions.json guardaba solo el selector. El selector por si solo no
// dice si va como ID, XPATH o ANDROID, y de esa ambiguedad salian locators que
// no encontraban el elemento: la grabacion no servia como evidencia.
test('actions.json guarda el tipo y el valor del locator', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-locator-type-'));
    const store = new AutomationRecordingStore(root);
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    store.start(context);
    store.replaceActions([
        { action: 'CLICK', selector: 'id=com.yape.qa:id/btnFiltrar', variableName: 'filterButton' },
        { action: 'CLICK', selector: '~Ver todos', variableName: 'seeAll' },
        { action: 'VERIFICAR_EXISTE', selector: 'Ver todos', variableName: 'brokenOne' },
        { action: 'SCROLL_DOWN' },
    ], context);

    const saved = JSON.parse(
        fs.readFileSync(path.join(store.getActiveDirectory(), 'actions.json'), 'utf-8')
    );
    assert.equal(saved[0].locatorType, 'ANDROID');
    assert.equal(saved[0].locatorValue, 'new UiSelector().resourceId("com.yape.qa:id/btnFiltrar")');
    assert.equal(saved[0].locatorWarning, undefined);

    assert.equal(saved[1].locatorType, 'ID');
    assert.equal(saved[1].locatorValue, 'Ver todos');

    // Nunca se omite: si el par no reconstruye el selector, queda escrito al
    // lado de la accion que lo produjo.
    assert.equal(saved[2].locatorType, 'XPATH');
    assert.match(saved[2].locatorWarning, /XPath/);

    // Una accion sin selector no inventa estrategia.
    assert.equal(saved[3].locatorType, undefined);
});

test('actions.json conserva tildes del selector y las guarda como NFC', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-locator-unicode-'));
    const store = new AutomationRecordingStore(root);
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    store.start(context);
    store.replaceActions([{
        action: 'CLICK',
        selector: 'android=new UiSelector().text("U\u0301ltimos 30 di\u0301as")',
        variableName: 'filterLast30Days',
    }], context);
    const savedText = fs.readFileSync(
        path.join(store.getActiveDirectory(), 'actions.json'),
        'utf-8'
    );
    const saved = JSON.parse(savedText);
    assert.equal(savedText, savedText.normalize('NFC'));
    assert.equal(saved[0].locatorValue, 'new UiSelector().text("Últimos 30 días")');
    fs.rmSync(root, { recursive: true, force: true });
});

const { RecordingPlatformUpdater } = require('../dist/core/recordingPlatformUpdater');

// La segunda casuistica de "Completar una grabacion" escribe directo en el JSON
// del framework, asi que arrastraba el mismo fallo de `id=`.
test('completar un locator de la otra plataforma normaliza igual que el generador', () => {
    const updater = new RecordingPlatformUpdater(projectPaths.frameworkRoot);
    const normalize = (selector, platform) =>
        Reflect.apply(Object.getPrototypeOf(updater).normalizeSelector, updater, [selector, platform]);

    assert.deepEqual(normalize('id=com.yape.qa:id/btnFiltrar', 'android'), {
        value: 'new UiSelector().resourceId("com.yape.qa:id/btnFiltrar")',
        strategy: 'ANDROID',
    });
    assert.deepEqual(normalize('~Ver todos', 'ios'), { value: 'Ver todos', strategy: 'ID' });
    assert.throws(() => normalize('android=new UiSelector()', 'ios'), /no puede asignarse a iOS/);
    assert.throws(() => normalize('Ver todos', 'ios'), /XPath/);
});
