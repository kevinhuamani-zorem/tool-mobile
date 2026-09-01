const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calculateGenerationQuality
} = require('../dist/core/generation');

test('obtiene calidad 100 cuando todas las acciones están enlazadas', () => {
    const metrics = calculateGenerationQuality([
        { text: 'el usuario inicia sesión', actionIndices: [0] },
        { text: 'visualiza su saldo', actionIndices: [1] }
    ], 2);

    assert.deepEqual(metrics, {
        actionCoverage: 1,
        linkedRows: 2,
        totalRows: 2,
        duplicateRows: 0,
        qualityScore: 100,
        passed: true
    });
});

test('falla cuando una acción no está enlazada o hay líneas duplicadas', () => {
    const metrics = calculateGenerationQuality([
        { text: 'el usuario inicia sesión', actionIndices: [0] },
        { text: 'EL USUARIO   INICIA SESIÓN', actionIndices: [0] }
    ], 2);

    assert.equal(metrics.actionCoverage, 0.5);
    assert.equal(metrics.duplicateRows, 1);
    assert.equal(metrics.passed, false);
});
