const test = require('node:test');
const assert = require('node:assert/strict');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { frameworkContract } = require('../dist/core/workspace');
const { projectPaths } = require('../dist/core/workspace');

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);
const EXT = CONTRACT.importExtension;

test('genera Feature, Steps, Locators y Screen Object para filas nuevas', () => {
    const actions = [
        {
            action: 'CLICK',
            variableName: 'btnMostrarMovimientos',
            selector: 'id=mostrar-movimientos'
        },
        {
            action: 'VERIFICAR_TEXTO',
            variableName: 'lblPrimerMovimiento',
            selector: '~Primer movimiento',
            value: '<movimiento>'
        }
    ];
    const request = {
        squad: 'payment',
        featureName: 'Consulta de movimientos',
        scenarioName: 'Mostrar movimientos',
        fileName: 'consulta-movimientos',
        locatorModule: 'movements',
        caseId: 'TC-10239',
        pathType: 'Happy Path',
        tag: 'movimientos',
        platform: 'android',
        createdAt: '2026-08-21T18:30:00.000Z',
        examples: { movimiento: 'Primer yapeo' },
        scenarioRows: [
            {
                keyword: 'Given',
                text: 'el usuario revisa sus movimientos',
                status: 'missing',
                methodName: 'revisarMovimientos',
                actions: [actions[0]]
            },
            {
                keyword: 'Then',
                text: 'visualiza el movimiento <movimiento>',
                status: 'missing',
                methodName: 'validarMovimiento',
                actions: [actions[1]]
            }
        ]
    };

    const preview = new FwkMobileGenerator().preview(request, actions);

    assert.equal(preview.files.length, 4);
    assert.match(preview.featureContent, /\[TC-10239\]\[Happy Path\]\[AUTO-FRONT\]/);
    assert.match(preview.featureContent, /^# Generado por Appium Visual Recorder\n# Author: Kevinarnold\.zorem\n# Fecha de creación: 2026-08-21T18:30:00\.000Z/m);
    // Tags segun el estandar: dominio sobre `Feature:`, funcionalidad + tier de
    // ejecucion en el Scenario. Sin tier el review bloquea el merge.
    assert.match(preview.featureContent, /^@payment\nFeature: /m);
    assert.match(preview.featureContent, /@movimientos @smoke_mobile @android/);
    assert.match(preview.locatorContent, /btnMostrarMovimientos/);
    const locatorDocument = JSON.parse(preview.locatorContent);
    assert.equal(Object.prototype.hasOwnProperty.call(locatorDocument, '_metadata'), false,
        'JSON no admite comentarios y `_metadata` es lo mismo con otro nombre');
    assert.deepEqual(Object.keys(locatorDocument), ['movementsAndroid', 'movementsIos']);
    assert.match(preview.stepContent, /^\/\/ Generado por Appium Visual Recorder\n\/\/ Author: Kevinarnold\.zorem\n\/\/ Fecha de creación: 2026-08-21T18:30:00\.000Z/m);
    assert.match(preview.stepContent, /movementsScreen\.revisarMovimientos\(\)/);
    assert.match(preview.stepContent, /movementsScreen\.validarMovimiento\(movimiento\)/);
    assert.match(preview.stepContent, /import movementsScreen from/);
    assert.ok(preview.stepContent.includes(`from '@screenobjects/payment/movements.screen${EXT}'`));
    assert.doesNotMatch(preview.stepContent, /generatedScreen/);
    // Imports y símbolos salen del framework real, no de una constante del test.
    assert.ok(preview.screenContent.includes(`from '${CONTRACT.baseScreenImport}'`));
    assert.match(preview.screenContent, /^\/\/ Generado por Appium Visual Recorder\n\/\/ Author: Kevinarnold\.zorem\n\/\/ Fecha de creación: 2026-08-21T18:30:00\.000Z/m);
    assert.ok(preview.screenContent.includes(`from '${CONTRACT.locatorFactoryImport}'`));
    assert.ok(preview.screenContent.includes(`from '${CONTRACT.typeLocatorImport}'`));
    assert.ok(preview.screenContent.includes(`${CONTRACT.locatorFactorySymbol}.getElement(`),
        'el getter invoca la clase con el nombre que usa este framework');
    assert.match(preview.screenContent, /from '@locators\/payment\/movements\.locator\.json'/);
    assert.match(preview.screenContent,
        /import LocatorMovements from '@locators\/payment\/movements\.locator\.json'/);
    assert.match(preview.screenContent, /LocatorMovements\.movementsAndroid\.btnMostrarMovimientos/);
    assert.match(preview.screenContent, /LocatorMovements\.movementsIos\.btnMostrarMovimientos/);
    assert.doesNotMatch(preview.screenContent, /LocatorMovements\s*\[/);
    assert.doesNotMatch(preview.screenContent, /import Locators from/);
    // Patron documentado: el getter devuelve `$(locator)`, asi que `$` se
    // importa siempre; `expect` solo cuando una verificacion lo usa. Faltaba y
    // cualquier VERIFICAR_TEXTO generaba un Screen Object que no compilaba.
    assert.match(preview.screenContent, /^import \{ \$, expect \} from '@wdio\/globals';$/m);
    assert.match(preview.screenContent, /public get btnMostrarMovimientos\(\) \{/);
    assert.match(preview.screenContent, /return \$\(locator\);/);
    assert.doesNotMatch(preview.screenContent, /browser\.pause/);
    assert.doesNotMatch(preview.screenContent, /from ['"]\.\.?\//);
    assert.match(preview.screenContent, /public async revisarMovimientos/);
    assert.match(preview.screenContent, /public async validarMovimiento/);
});

test('importa browser una sola vez únicamente para acciones que lo utilizan', () => {
    const actions = [{ action: 'VOLVER' }];
    const request = {
        squad: 'payment',
        featureName: 'Navegación',
        scenarioName: 'Volver',
        fileName: 'navegacion',
        locatorModule: 'navigation-view',
        caseId: 'TC-10241',
        pathType: 'Happy Path',
        tag: 'navegacion',
        platform: 'android',
        scenarioRows: [{
            keyword: 'When',
            text: 'el usuario regresa a la pantalla anterior',
            status: 'missing',
            methodName: 'regresar',
            actions
        }]
    };

    const preview = new FwkMobileGenerator().preview(request, actions);

    assert.equal((preview.screenContent.match(/@wdio\/globals/g) || []).length, 1);
    assert.match(preview.screenContent, /await browser\.back\(\)/);
    assert.match(preview.stepContent, /@screenobjects\/payment\/navigation-view\.screen\.ts/);
});

test('aplica ediciones revisadas únicamente a archivos incluidos en el preview', () => {
    const generator = new FwkMobileGenerator();
    const actions = [{
        action: 'CLICK',
        variableName: 'btnContinuar',
        selector: 'id=continuar'
    }];
    const request = {
        squad: 'default',
        featureName: 'Acceso',
        scenarioName: 'Continuar',
        fileName: 'acceso',
        locatorModule: 'login',
        caseId: 'TC-10239',
        pathType: 'Happy Path',
        tag: 'acceso',
        platform: 'android',
        scenarioRows: [{
            keyword: 'Given',
            text: 'el usuario continúa',
            status: 'missing',
            methodName: 'continuar',
            actions
        }]
    };
    const preview = generator.preview(request, actions);
    const editedFeature = preview.featureContent.replace(
        'Feature: Acceso',
        'Feature: Acceso revisado'
    );
    const reviewed = generator.withReviewedContents(preview, {
        [preview.featurePath]: editedFeature
    });

    assert.match(reviewed.featureContent, /Feature: Acceso revisado/);
    assert.equal(reviewed.locatorContent, preview.locatorContent);
    assert.throws(
        () => generator.withReviewedContents(preview, {
            '/tmp/fuera-del-preview.feature': 'Feature: No permitido'
        }),
        /fuera del preview/
    );
});


// El camino sin agente copiaba el valor a su propio modulo aunque el plan dijera
// `reuse`: el duplicado del PR lo producia el recorder, y ahi no hay nadie que
// lo note porque el agente no llega a correr.
const REUTILIZADO = [{
    name: 'shortcutTapp',
    import: '@locators/home/home.locator.json',
    identifier: 'LocatorHome',
    reference: {
        android: 'LocatorHome.homeAndroid.shortcutTapp',
        ios: 'LocatorHome.homeIos.shortcutTapp',
    },
    type: { android: 'XPATH', ios: 'XPATH' },
}];

function conReutilizacion(reused) {
    const actions = [
        { action: 'CLICK', selector: '//android.widget.Button[@content-desc="Tapp"]',
          variableName: 'shortcutTapp', value: '', contextHint: 'ingresar a tapp' },
        { action: 'VERIFICAR_EXISTE', selector: 'android=new UiSelector().text("TAPP")',
          variableName: 'tappScreen', value: '', contextHint: 'pantalla tapp' },
    ];
    return new FwkMobileGenerator().preview({
        squad: 'interoperabilidad', featureName: 'F', scenarioName: 'S',
        fileName: 'tapp-accounts', locatorModule: 'tapp-accounts', caseId: 'TC-1',
        pathType: 'Happy Path', tag: 't', dataName: 'A', platform: 'android',
        scenarioRows: [{ keyword: 'When', text: 'el usuario ingresa a tapp', status: 'missing', actions }],
    }, actions, reused);
}

test('referencia el locator reutilizado en vez de copiarlo a su módulo', () => {
    const preview = conReutilizacion(REUTILIZADO);

    // No se copia el valor.
    const locators = JSON.parse(preview.locatorContent);
    assert.equal(locators.tappAccountsAndroid.shortcutTapp, undefined);
    assert.ok(locators.tappAccountsAndroid.tappScreen, 'el locator nuevo sí se crea');

    // Se importa el módulo de origen y se usa su expresión.
    assert.ok(preview.screenContent.includes(
        `import LocatorHome from '@locators/home/home.locator.json' with { type: 'json' };`));
    assert.match(preview.screenContent, /LocatorHome\.homeAndroid\.shortcutTapp/);
    assert.match(preview.screenContent, /LocatorHome\.homeIos\.shortcutTapp/);
    // Un solo getter, no uno por cada origen.
    assert.equal((preview.screenContent.match(/public get shortcutTapp/g) || []).length, 1);
    // El locator propio sigue apuntando a su bloque.
    assert.match(preview.screenContent, /LocatorTappAccounts\.tappAccountsAndroid\.tappScreen/);
});

test('sin reutilización el comportamiento no cambia', () => {
    const preview = conReutilizacion([]);
    const locators = JSON.parse(preview.locatorContent);
    assert.ok(locators.tappAccountsAndroid.shortcutTapp, 'se crea en su propio módulo');
    assert.doesNotMatch(preview.screenContent, /LocatorHome/);
});

// El contrato son cuatro capas; el módulo conserva su archivo aunque hoy no
// tenga locators propios, que es donde irán los próximos.
test('conserva el archivo de locators aunque todo se reutilice', () => {
    const actions = [{ action: 'CLICK', selector: '//android.widget.Button[@content-desc="Tapp"]',
        variableName: 'shortcutTapp', value: '', contextHint: 'ingresar a tapp' }];
    const preview = new FwkMobileGenerator().preview({
        squad: 'interoperabilidad', featureName: 'F', scenarioName: 'S',
        fileName: 'tapp-accounts', locatorModule: 'tapp-accounts', caseId: 'TC-1',
        pathType: 'Happy Path', tag: 't', dataName: 'A', platform: 'android',
        scenarioRows: [{ keyword: 'When', text: 'el usuario ingresa a tapp', status: 'missing', actions }],
    }, actions, REUTILIZADO);

    assert.equal(preview.files.length, 4);
    const locators = JSON.parse(preview.locatorContent);
    assert.deepEqual(locators.tappAccountsAndroid, {});
    assert.deepEqual(locators.tappAccountsIos, {});
});

// Si el plan no trae referencia para la plataforma del caso no hay nada que
// escribir: es mas seguro crear el locator que emitir una referencia vacía.
test('ignora una reutilización sin referencia para la plataforma activa', () => {
    const preview = conReutilizacion([{ ...REUTILIZADO[0], reference: { ios: 'LocatorHome.homeIos.shortcutTapp' } }]);
    const locators = JSON.parse(preview.locatorContent);
    assert.ok(locators.tappAccountsAndroid.shortcutTapp, 'cae a crearlo');
    assert.doesNotMatch(preview.screenContent, /LocatorHome/);
});

// Reglas del review de PR que antes se incumplian y bloqueaban el merge:
// pausa fija, falta del tier de ejecucion, falta del tag de dominio y
// metadatos dentro del JSON de locators.
function esperaYVerificacion(actions, rows) {
    return new FwkMobileGenerator().preview({
        squad: 'payment', featureName: 'Espera', scenarioName: 'Espera',
        fileName: 'wait-case', locatorModule: 'wait-case', caseId: 'TC-1',
        pathType: 'Unhappy Path', tag: 'espera', platform: 'android',
        scenarioRows: rows,
    }, actions);
}

test('una espera fija se convierte en espera explicita sobre el elemento siguiente', () => {
    const actions = [
        { action: 'ESPERAR', value: '3' },
        { action: 'CLICK', variableName: 'continueButton', selector: '~Continuar' },
    ];
    const preview = esperaYVerificacion(actions, [{
        keyword: 'When', text: 'el usuario continua', status: 'missing',
        methodName: 'continueFlow', actions,
    }]);
    assert.doesNotMatch(preview.screenContent, /browser\.pause|driver\.pause/,
        'una pausa por tiempo es un hallazgo High que bloquea el merge');
    assert.match(preview.screenContent, /waitForElementDisplayedAndExpect\(this\.continueButton, timeout/);
});

test('un Unhappy Path va a regresion y el Feature lleva su tag de dominio', () => {
    const actions = [{ action: 'VERIFICAR_EXISTE', variableName: 'errorLabel', selector: '~lblError' }];
    const preview = esperaYVerificacion(actions, [{
        keyword: 'Then', text: 'se muestra el error', status: 'missing',
        methodName: 'showError', actions,
    }]);
    assert.match(preview.featureContent, /^@payment\nFeature: /m);
    assert.match(preview.featureContent, /@espera @regression_mobile @android/);
    // El Then afirma, no solo espera.
    assert.match(preview.screenContent, /waitForElementDisplayedAndExpect/);
});

test('el tier de ejecucion se puede fijar desde la peticion', () => {
    const actions = [{ action: 'VERIFICAR_EXISTE', variableName: 'errorLabel', selector: '~lblError' }];
    const preview = new FwkMobileGenerator().preview({
        squad: 'payment', featureName: 'X', scenarioName: 'X', fileName: 'x',
        locatorModule: 'x', caseId: 'TC-2', pathType: 'Happy Path', tag: 'x',
        executionTag: '@regression_mobile', platform: 'android',
        scenarioRows: [{ keyword: 'Then', text: 'ok', status: 'missing', methodName: 'ok', actions }],
    }, actions);
    assert.match(preview.featureContent, /@x @regression_mobile @android/);
});

test('renderiza DataTable cuando la fila del escenario la incluye', () => {
    const actions = [
        { action: 'CLICK', variableName: 'openFilters', selector: '~Filtrar' },
        { action: 'CLICK', variableName: 'selectToday', selector: 'android=new UiSelector().text("Solo hoy")' },
        { action: 'CLICK', variableName: 'openFilters', selector: '~Filtrar' },
        { action: 'CLICK', variableName: 'selectLast7Days', selector: 'android=new UiSelector().text("Ultimos 7 dias")' },
        { action: 'CLICK', variableName: 'openFilters', selector: '~Filtrar' },
        { action: 'CLICK', variableName: 'selectLast30Days', selector: 'android=new UiSelector().text("Ultimos 30 dias")' },
    ];
    const withSequence = actions.map((action, index) => ({ ...action, sequence: index + 1 }));
    const preview = new FwkMobileGenerator().preview({
        squad: 'payment',
        featureName: 'Movimientos',
        scenarioName: 'Filtros',
        fileName: 'movimientos-filtros',
        locatorModule: 'movimientos-filtros',
        caseId: 'TC-3',
        pathType: 'Happy Path',
        tag: 'movimientos',
        platform: 'android',
        scenarioRows: [{
            keyword: 'When',
            text: 'el usuario consulta sus movimientos',
            status: 'missing',
            methodName: 'consultarMovimientos',
            dataTable: {
                headers: ['filtro'],
                rows: [['Solo hoy'], ['Ultimos 7 dias']],
            },
            actions: withSequence,
        }],
    }, withSequence);

    assert.match(preview.featureContent, /\|\s*filtro\s*\|/);
    assert.match(preview.featureContent, /\|\s*Solo hoy\s*\|/);
    assert.match(preview.featureContent, /\|\s*Ultimos 7 dias\s*\|/);
    assert.match(preview.stepContent, /import \{ DataTable, When \} from '@wdio\/cucumber-framework';/);
    assert.match(preview.stepContent, /dataTable\.hashes\(\)\.map\(\(row\) => row\["filtro"\]\)/);
    assert.match(preview.stepContent, /await movimientosFiltrosScreen\.consultarMovimientos\(filtroValues\);/);
    assert.match(preview.screenContent, /public selectToday\(filtro: string\)/);
    assert.match(preview.screenContent, /for \(const filtroValue of filtroValues\)/);
    assert.match(preview.screenContent, /this\.selectToday\(filtroValue\)/);
});
