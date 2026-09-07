const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGeneratedGherkinKeywords } = require('../dist/core/automation');
const { normalizeAuthorResult, normalizeAutomationResponse } = require('../dist/core/automation/infrastructure/layered/artifacts');
const { gherkinKeywordProblems } = require('../dist/core/validation/infrastructure/rules/gherkinInspection');

function fixture() {
    const actions = [{ sequence: 1, action: 'CLICK' }, { sequence: 2, action: 'VERIFICAR_EXISTE' }, { sequence: 3, action: 'CLICK' }];
    const response = {
        schemaVersion: 1, role: 'behavior-author', recordingId: 'rec-1', planId: 'plan-1',
        files: [
            { layer: 'feature', path: 'features/case.feature', content: 'Feature: Confirmación\n  Scenario: Caso\n    Given el usuario inicia sesión\n    When el usuario confirma el yapeo\n    Then se muestra el yapeo confirmado\n    And el usuario cierra la confirmación del yapeo\n' },
            { layer: 'steps', path: 'features/case.steps.ts', content: "import { When } from '@wdio/cucumber-framework';\nWhen(/^el usuario cierra la confirmación del yapeo$/, async () => { await caseScreen.close(); });" },
            { layer: 'screen', content: 'class CaseScreen { async close() { await this.closeButton.click(); } }' },
            { layer: 'locators', content: '{"caseAndroid":{"closeButton":"Cerrar"}}' },
        ],
        actionTrace: [
            { sequence: 1, gherkinStep: 'When el usuario confirma el yapeo', screenMethod: 'confirm', locatorName: 'confirm' },
            { sequence: 2, gherkinStep: 'Then se muestra el yapeo confirmado', screenMethod: 'visible', locatorName: 'title' },
            { sequence: 3, gherkinStep: 'And el usuario cierra la confirmación del yapeo', screenMethod: 'close', locatorName: 'closeButton' },
        ],
    };
    return { response, actions };
}

test('corrige And tras Then sin cambiar grabación, texto, orden ni código de las otras capas', () => {
    const { response, actions } = fixture();
    const before = JSON.stringify({ response, actions });
    const result = normalizeGeneratedGherkinKeywords(response, { actions });
    assert.equal(result.changed, true);
    assert.equal(JSON.stringify({ response, actions }), before);
    assert.equal(result.response.files[0].content, response.files[0].content.replace('And el usuario cierra', 'When el usuario cierra'));
    assert.equal(result.response.actionTrace[2].gherkinStep, 'When el usuario cierra la confirmación del yapeo');
    assert.deepEqual(result.response.files.slice(1), response.files.slice(1));
    assert.deepEqual(result.response.actionTrace.map(({ gherkinStep, ...rest }) => rest), response.actionTrace.map(({ gherkinStep, ...rest }) => rest));
    assert.deepEqual(gherkinKeywordProblems(result.response.files[0].content, result.response.actionTrace, actions), []);
    assert.equal(normalizeGeneratedGherkinKeywords(result.response, { actions }).changed, false);
});

test('conserva trazas sin prefijo, formato CRLF, comentarios y keywords ya válidos', () => {
    const { response, actions } = fixture();
    response.actionTrace.forEach(trace => { trace.gherkinStep = trace.gherkinStep.replace(/^(When|Then|And) /, ''); });
    response.files[0].content = response.files[0].content.replaceAll('\n', '\r\n') + '    # And no es un step\r\n';
    const result = normalizeGeneratedGherkinKeywords(response, { actions });
    assert.deepEqual(result.response.actionTrace, response.actionTrace);
    assert.equal(result.response.files[0].content, response.files[0].content.replace('And el usuario cierra', 'When el usuario cierra'));
    actions[2].action = 'VERIFICAR_EXISTE';
    assert.equal(normalizeGeneratedGherkinKeywords(response, { actions }).changed, false, 'And tras Then sigue siendo válido si verifica');
});

test('no adivina ante trazas incompletas, repetidas o desconocidas', () => {
    for (const mutate of [
        x => x.response.actionTrace.pop(),
        x => x.response.actionTrace.push({ ...x.response.actionTrace[2] }),
        x => { x.response.actionTrace[2].sequence = 99; },
        x => x.actions.push({ ...x.actions[2] }),
        x => { x.response.actionTrace[2].gherkinStep = null; },
        x => { x.actions = []; },
    ]) {
        const x = fixture(); mutate(x);
        assert.equal(normalizeGeneratedGherkinKeywords(x.response, { actions: x.actions }).changed, false);
    }
});

test('preserva pasos reutilizados y textos repetidos entre escenarios', () => {
    const { response, actions } = fixture();
    const text = 'el usuario cierra la confirmación del yapeo';
    assert.equal(normalizeGeneratedGherkinKeywords(response, { actions, reusedStepTexts: [text] }).changed, false);
    response.files[0].content += `  Scenario: Otro caso existente\n    Given contexto\n    And ${text}\n`;
    assert.equal(normalizeGeneratedGherkinKeywords(response, { actions }).changed, false);
});

test('no convierte una fila mixta de resultado y cierre en una acción por su último evento', () => {
    const { response, actions } = fixture();
    response.files[0].content = response.files[0].content.replace('    And el usuario cierra la confirmación del yapeo\n', '');
    response.actionTrace[2].gherkinStep = response.actionTrace[1].gherkinStep;
    assert.equal(normalizeGeneratedGherkinKeywords(response, { actions }).changed, false);
});

test('ignora docstrings, tablas, Examples y Background; reinicia tipo por Scenario', () => {
    const { response, actions } = fixture();
    response.files[0].content = response.files[0].content.replace('  Scenario: Caso', '  Background:\n    And preparación ajena\n  Scenario: Caso')
        .replace('    And el usuario cierra', '    """\n    And el usuario cierra la confirmación del yapeo\n    """\n    | And texto de tabla |\n    And el usuario cierra')
        + '    Examples:\n      | texto |\n      | And ejemplo |\n  Scenario: Sin traza\n    And texto ajeno\n';
    const result = normalizeGeneratedGherkinKeywords(response, { actions });
    assert.equal(result.changed, true);
    assert.match(result.response.files[0].content, /"""\n    And el usuario cierra/);
    assert.match(result.response.files[0].content, /"""\n    \| And texto de tabla \|\n    When el usuario cierra/);
    assert.match(result.response.files[0].content, /Background:\n    And preparación ajena/);
    assert.match(result.response.files[0].content, /Scenario: Sin traza\n    And texto ajeno/);
});

test('usa la traza, no el orden del array, y mantiene But válido', () => {
    const { response, actions } = fixture();
    response.actionTrace.reverse();
    response.files[0].content = response.files[0].content.replace('    Then se muestra', '    And se muestra');
    const result = normalizeGeneratedGherkinKeywords(response, { actions });
    assert.match(result.response.files[0].content, /Then se muestra/);
    assert.match(result.response.files[0].content, /When el usuario cierra/);
    actions[2].action = 'VERIFICAR_EXISTE';
    response.files[0].content = response.files[0].content.replace('    And se muestra', '    Then se muestra').replace('    And el usuario cierra', '    But el usuario cierra');
    assert.equal(normalizeGeneratedGherkinKeywords(response, { actions }).changed, false);
});

test('las entradas del autor y del caché usan la misma normalización antes de validar', () => {
    const { response, actions } = fixture();
    const plan = { recordingId: 'rec-1', planId: 'plan-1', files: [] };
    const context = { actions, caseId: 'TC-1', pathType: 'Happy Path' };
    assert.equal(normalizeAuthorResult(response, 'behavior-author', plan, context), true);
    assert.match(response.files[0].content, /When el usuario cierra/);
    const cached = fixture().response;
    assert.equal(normalizeAutomationResponse(cached, context), true);
    assert.match(cached.files[0].content, /When el usuario cierra/);
    assert.equal(normalizeAutomationResponse(cached, context), false);
});
