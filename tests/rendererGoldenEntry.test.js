const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

// Exercise the handler registered on the real entry button, including its
// async completion. Opening the golden feature directly misses broken wiring.
async function setup(t, openGoldenReview) {
    const browser = installFakeBrowserGlobals();
    const cleanup = [];
    t.after(() => { try { cleanup.forEach(fn => fn()); } finally { browser.restore(); } });
    const el = id => browser.document.getElementById(id);
    const button = el('btnSaveGolden');
    const listeners = new Set();
    button.textContent = 'Revisar y guardar golden →';
    button.addEventListener = (event, handler) => { if (event === 'click') listeners.add(handler); };
    button.removeEventListener = (event, handler) => { if (event === 'click') listeners.delete(handler); };
    const click = () => Promise.all([...listeners].map(handler => handler({ target: button })));
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [
        { path: 'case.feature', originalContent: 'before', content: 'after QA' },
        { path: 'case.steps.ts', originalContent: 'same', content: 'same' },
        { path: 'shared.screen.ts', originalContent: 'before', content: 'dependency', readOnly: true },
    ] };
    const generation = createGenerationFeature({ state, isAutomationWorkflow: () => true, openGoldenReview });
    generation.mount();
    cleanup.push(() => generation.unmount());
    return { el, button, click, generation, state, cleanup };
}

test('golden entry opens review with QA edits and metadata, without approving or duplicating the preview', async t => {
    let golden, resolvePreview;
    const h = await setup(t, input => golden.open(input));
    const calls = [], saves = [];
    const { createGoldenFeature } = await import('../recorder/renderer/src/features/golden/goldenFeature.js');
    golden = createGoldenFeature({ api: {
        previewGoldenCase: input => {
            calls.push(input);
            return new Promise(resolve => { resolvePreview = resolve; });
        },
        saveGoldenCase: async input => { saves.push(input); },
    } });
    golden.mount();
    h.cleanup.push(() => golden.unmount());
    h.el('cmbGoldenExecution').value = 'passed';
    h.el('txtGoldenNotes').value = 'Verificado por QA';

    const pending = h.click();
    assert.equal(h.el('goldenModal').style.display, 'flex');
    assert.equal(h.button.disabled, true);
    assert.match(h.button.textContent, /Abriendo/);
    await h.click(); // Also protect against programmatic duplicate dispatch.
    assert.deepEqual(calls, [{ executed: 'passed', notes: 'Verificado por QA', reviewedContents: { 'case.feature': 'after QA' } }]);
    resolvePreview({ success: true, preview: {
        token: 'review-token', caseId: 'TC-10251', source: 'review',
        files: [{ path: 'case.feature', content: 'after QA', layer: 'feature' }],
        diagnostics: { valid: true, qualityScore: 100 },
        executionDeclaration: calls[0].executed, notes: calls[0].notes,
    } });
    await pending;
    assert.equal(h.el('goldenReview').style.display, 'block');
    assert.match(h.el('goldenFiles').innerHTML, /after QA/);
    assert.equal(h.el('goldenExecution').value, 'passed');
    assert.equal(h.el('goldenNotes').value, 'Verificado por QA');
    assert.equal(h.el('btnApproveGolden').disabled, true);
    assert.equal(h.el('goldenApproved').checked, false);
    assert.equal(h.button.disabled, false);
    assert.equal(h.button.textContent, 'Revisar y guardar golden →');
    await golden.approve();
    assert.deepEqual(saves, []);
    h.generation.unmount();
    await h.click();
    assert.equal(calls.length, 1, 'unmount must remove the entry listener');
});

test('golden entry reports a missing review dependency instead of silently failing', async t => {
    const h = await setup(t, undefined);
    await h.click();
    assert.match(h.el('lblGoldenStatus').textContent, /No se pudo abrir.*no está disponible/);
    assert.match(h.el('lblGoldenStatus').className, /err/);
    assert.equal(h.button.disabled, false);
    assert.equal(h.button.textContent, 'Revisar y guardar golden →');
});

test('golden entry reports a rejected review and allows retry with the latest edits', async t => {
    const calls = [];
    const h = await setup(t, async input => {
        calls.push(input);
        if (calls.length === 1) throw new Error('No se pudo preparar la revisión');
    });
    await h.click();
    assert.match(h.el('lblGoldenStatus').textContent, /No se pudo preparar la revisión/);
    assert.equal(h.button.disabled, false);
    h.state.previewDocuments[0].content = 'latest QA edit';
    h.generation.unmount();
    h.generation.mount();
    await h.click();
    assert.equal(calls.length, 2, 'remount must not duplicate the entry listener');
    assert.equal(calls[1].executed, 'not-run');
    assert.deepEqual(calls[1].reviewedContents, { 'case.feature': 'latest QA edit' });
    assert.equal(h.el('lblGoldenStatus').textContent, '');
    assert.equal(h.button.disabled, false);
});
