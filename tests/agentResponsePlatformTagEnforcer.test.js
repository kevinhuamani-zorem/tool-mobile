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

