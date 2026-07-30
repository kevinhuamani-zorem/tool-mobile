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
    assert.match(preview.locatorContent, /btnMostrarMovimientos/);
    assert.match(preview.stepContent, /generatedScreen\.revisarMovimientos\(\)/);
    assert.match(preview.stepContent, /generatedScreen\.validarMovimiento\(movimiento\)/);
    assert.match(preview.screenContent, /public async revisarMovimientos/);
    assert.match(preview.screenContent, /public async validarMovimiento/);
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
