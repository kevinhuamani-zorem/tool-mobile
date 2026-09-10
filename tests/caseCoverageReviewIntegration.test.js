const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

function dispatchable(element) {
    const handlers = new Map();
    element.addEventListener = (event, handler) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(handler);
    };
    element.removeEventListener = (event, handler) => handlers.get(event)?.delete(handler);
    element.emit = event => Promise.all([...(handlers.get(event) || [])].map(handler => handler({ target: element })));
    return element;
}
const warning = { id: 'action-14', code: 'recording-selector-unverified', message: 'Verifica el selector de la acción 14.',
    source: 'recording', severity: 'warning', sequences: [14], passes: [], status: 'pending' };
const preserved = { schemaVersion: 1, caseId: 'TC-10240', platform: 'android', status: 'preserved',
    baselineHash: 'before', candidateHash: 'after', checkedExamples: 1, differences: [],
    mappings: [{ beforeStepIndices: [1], afterStepIndices: [1], exampleIndex: 1 }] };
const preview = { previewToken: 'token', exportReady: true,
    preview: { featurePath: 'case.feature', featureContent: 'Feature: Yapeo' },
    validation: { valid: true, qualityScore: 100, errors: [], warnings: [], caseCoverage: preserved }, reviewDiagnostics: [warning] };

async function setup(t) {
    const browser = installFakeBrowserGlobals();
    const el = id => browser.document.getElementById(id);
    const editor = dispatchable(el('txtGherkin'));
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: -1 };
    const generation = createGenerationFeature({ state, isAutomationWorkflow: () => true });
    generation.mount(); t.after(() => { generation.unmount(); browser.restore(); });
    return { generation, state, editor, el };
}

test('review carries QA alerts alongside preserved coverage and export remains available', async t => {
    const h = await setup(t);
    h.generation.showPreviewDocuments(preview);
    assert.match(h.el('caseCoveragePanel').innerHTML, /TC-10240/);
    assert.match(h.el('caseCoveragePanel').innerHTML, /Verifica el selector/);
    assert.equal(h.el('btnGenerate').disabled, false);
    assert.doesNotMatch(h.el('lblGenerateResult').textContent, /Verifica el selector/);
});

test('editing invalidates coverage display; revalidation replaces it and a new case clears it', async t => {
    const h = await setup(t);
    h.generation.showPreviewDocuments(preview);
    h.editor.value = 'Feature: Edición QA'; await h.editor.emit('input');
    assert.match(h.el('caseCoveragePanel').innerHTML, /revalid/i);
    const lost = { ...preserved, status: 'lost', mappings: [], differences: [{ code: 'required-operation-missing',
        message: 'Falta una comprobación previa', beforeStepIndices: [1], afterStepIndices: [] }] };
    h.generation.showPreviewDocuments({ ...preview, preview: { ...preview.preview, featureContent: h.editor.value },
        validation: { ...preview.validation, valid: false, caseCoverage: lost } }, false, false);
    assert.match(h.el('caseCoveragePanel').innerHTML, /Falta una comprobación previa/);
    assert.equal(h.el('btnGenerate').disabled, false);
    h.generation.invalidatePreview();
    assert.equal(h.el('caseCoveragePanel').style.display, 'none');
    assert.doesNotMatch(h.el('caseCoveragePanel').innerHTML, /TC-10240/);
});

test('invalid legacy drafts keep diagnostics visible once without a long repeated banner', async t => {
    const h = await setup(t);
    h.generation.showPreviewDocuments({ ...preview, reviewDiagnostics: undefined,
        validation: { valid: false, errors: [{ code: 'trace', message: 'Acción 3 sin trazabilidad' }] } }, false, false);
    assert.match(h.el('caseCoveragePanel').innerHTML, /Acción 3 sin trazabilidad/);
    assert.doesNotMatch(h.el('lblGenerateResult').textContent, /Acción 3 sin trazabilidad/);
    assert.equal(h.el('btnGenerate').disabled, false);
});


test('importing grouped review clears contradictory legacy design claims without invoking an agent', async t => {
    const browser = installFakeBrowserGlobals(); t.after(() => browser.restore());
    const el = id => browser.document.getElementById(id);
    el('testDesignSuggestionsPanel').style.display = 'block';
    el('testDesignSuggestionSummary').textContent = 'Todas las comprobaciones están cubiertas';
    const { createReviewFeature } = await import('../recorder/renderer/src/features/review/reviewFeature.js');
    let displayed;
    const review = createReviewFeature({ state: {}, setStatus() {}, stepSummary: () => '',
        api: { importAutomationResponse: async () => ({ ...preview, success: true }),
            getAutomationModelUsage: async () => null,
            launchAutomationAgent: () => assert.fail('Review must not start generation') },
        generation: { invalidatePreview() {}, showPreviewDocuments: result => { displayed = result; } },
    });
    t.after(() => review.unmount());
    const result = await review.importAutomationResponse();
    assert.equal(result.success, true);
    assert.equal(el('testDesignSuggestionsPanel').style.display, 'none');
    assert.equal(el('testDesignSuggestionSummary').textContent, '');
    assert.deepEqual(displayed.reviewDiagnostics, [warning]);
    assert.equal(displayed.exportReady, true);
});
