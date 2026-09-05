const test = require('node:test');
const assert = require('node:assert/strict');

const {
    enforceAgentResponsePlatformTags,
} = require('../dist/core/automation');

function sampleResponse() {
    return {
        schemaVersion: 1,
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [],
        actionTrace: [],
        files: [
            {
                layer: 'feature',
                path: 'features/payment/demo.feature',
                content: [
                    'Feature: Demo',
                    '',
                    '  Scenario: caso demo',
                    '',
                ].join('\n'),
            },
            {
                layer: 'steps',
                path: 'features/payment/demo.steps.ts',
                content: 'export {};\n',
            },
            {
                layer: 'screen',
                path: 'screenobjects/payment/demo.screen.ts',
                content: 'export default class Demo {}\n',
            },
            {
                layer: 'locators',
                path: 'resources/locators/payment/demo.locator.json',
                content: JSON.stringify({
                    demoAndroid: { ok: 'id=ok' },
                    demoIos: { ok: '' },
                }, null, 2),
            },
        ],
    };
}

test('agrega @android cuando el feature no trae tag de plataforma', () => {
    const result = enforceAgentResponsePlatformTags(sampleResponse(), 'android');
    assert.deepEqual(result.added, ['android']);
    const feature = result.response.files.find(file => file.layer === 'feature');
    assert.match(feature.content, /^@android\s*\nFeature:/m);
});

test('agrega @ios cuando locators tienen cobertura iOS completa', () => {
    const response = sampleResponse();
    response.files.find(file => file.layer === 'locators').content = JSON.stringify({
        demoAndroid: { ok: 'id=ok' },
        demoIos: { ok: 'id=ok-ios' },
    }, null, 2);
    const result = enforceAgentResponsePlatformTags(response, 'android');
    assert.deepEqual(result.added, ['android', 'ios']);
    const feature = result.response.files.find(file => file.layer === 'feature');
    assert.match(feature.content, /^@android$/m);
    assert.match(feature.content, /^@ios$/m);
});


// `@android @ventas` (plataforma primero) es tan valido como `@ventas @android`.
// La expresion anterior exigia algo antes de `@android` y lo daba por ausente:
// el validador pedia un tag que ya estaba y Lorem quemaba rondas sin nada que
// corregir (TC-10239, gpt-5.5 + sonnet, 456 s).
test('reconoce el tag de plataforma aunque sea el primero de la linea', () => {
    const { hasPlatformTag } = require('../dist/core/validation/infrastructure/rules/gherkinInspection.js');
    assert.equal(hasPlatformTag('@android @ventas\nFeature: x', 'android'), true);
    assert.equal(hasPlatformTag('@ventas @android\nFeature: x', 'android'), true);
    assert.equal(hasPlatformTag('  @payment @android\n  Scenario: x', 'android'), true);
    assert.equal(hasPlatformTag('@androidx @ventas\nFeature: x', 'android'), false);
    assert.equal(hasPlatformTag('@ventas\nFeature: x', 'android'), false);
    const response = sampleResponse();
    response.files.find(file => file.layer === 'feature').content = '@android @ventas\nFeature: Demo\n\n  Scenario: caso demo\n';
    const result = enforceAgentResponsePlatformTags(response, 'android');
    assert.deepEqual(result.added, [], 'no duplica un tag que ya esta');
});
