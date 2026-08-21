const test = require('node:test');
const assert = require('node:assert/strict');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');

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
    assert.match(preview.featureContent, /@movimientos @android/);
    assert.match(preview.locatorContent, /btnMostrarMovimientos/);
    const locatorDocument = JSON.parse(preview.locatorContent);
    assert.deepEqual(locatorDocument._metadata, {
        generator: 'Appium Visual Recorder',
        author: 'Kevinarnold.zorem',
        createdAt: '2026-08-21T18:30:00.000Z'
    });
    assert.match(preview.stepContent, /^\/\/ Generado por Appium Visual Recorder\n\/\/ Author: Kevinarnold\.zorem\n\/\/ Fecha de creación: 2026-08-21T18:30:00\.000Z/m);
    assert.match(preview.stepContent, /movementsScreen\.revisarMovimientos\(\)/);
    assert.match(preview.stepContent, /movementsScreen\.validarMovimiento\(movimiento\)/);
    assert.match(preview.stepContent, /import movementsScreen from/);
    assert.match(preview.stepContent, /from '@screenobjects\/payment\/movements\.screen\.ts'/);
    assert.doesNotMatch(preview.stepContent, /generatedScreen/);
    assert.match(preview.screenContent, /from '@screenobjects\/commons\/base\.screen\.ts'/);
    assert.match(preview.screenContent, /^\/\/ Generado por Appium Visual Recorder\n\/\/ Author: Kevinarnold\.zorem\n\/\/ Fecha de creación: 2026-08-21T18:30:00\.000Z/m);
    assert.match(preview.screenContent, /from '@utils\/LocatorFactory\.ts'/);
    assert.match(preview.screenContent, /from '@utils\/Enums\.ts'/);
    assert.match(preview.screenContent, /from '@locators\/payment\/movements\.locator\.json'/);
    assert.doesNotMatch(preview.screenContent, /@wdio\/globals/);
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
