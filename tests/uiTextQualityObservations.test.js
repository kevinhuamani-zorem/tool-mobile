const test = require('node:test');
const assert = require('node:assert/strict');

const {
    analyzeUiTextQuality,
} = require('../dist/core/automation/domain/uiTextQualityObservations.js');

test('reporta texto visible defectuoso sin modificar el selector capturado', () => {
    const selector = 'new UiSelector().text("Útimos 7 días")';
    const artifact = analyzeUiTextQuality('recording-1', [{
        sequence: 8,
        action: 'CLICK',
        platform: 'android',
        locatorType: 'ANDROID',
        locatorValue: selector,
        selector,
    }], '2026-09-01T00:00:00.000Z');

    assert.equal(artifact.observations.length, 1);
    assert.deepEqual(artifact.observations[0], {
        id: 'missing-l-ultimos-8',
        type: 'ui-text-quality',
        severity: 'warning',
        platform: 'android',
        actual: 'Útimos 7 días',
        expected: 'Últimos 7 días',
        message: 'Posible error ortográfico en el texto visible de la aplicación.',
        actionSequence: 8,
        selector,
    });
});

test('no genera observaciones para el texto correcto', () => {
    const artifact = analyzeUiTextQuality('recording-2', [{
        sequence: 1,
        action: 'CLICK',
        platform: 'android',
        locatorValue: 'new UiSelector().text("Últimos 7 días")',
    }]);
    assert.deepEqual(artifact.observations, []);
});

test('usa la plataforma del escenario en recordings antiguos que no la guardaron por acción', () => {
    const artifact = analyzeUiTextQuality('recording-3', [{
        sequence: 2,
        action: 'CLICK',
        locatorValue: 'label == "Útimos 30 días"',
    }], '2026-09-01T00:00:00.000Z', 'ios');
    assert.equal(artifact.observations[0].platform, 'ios');
});
