const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals, createElementStub } = require('./helpers/fakeDom');

function dispatchable(element) {
    const listeners = new Map();
    const add = element.addEventListener.bind(element), remove = element.removeEventListener.bind(element);
    element.addEventListener = (event, handler, options) => {
        add(event, handler, options);
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
    };
    element.removeEventListener = (event, handler) => { remove(event, handler); listeners.get(event)?.delete(handler); };
    element.emit = (event, target = element) => Promise.all([...(listeners.get(event) || [])].map(handler => handler({ target })));
    return element;
}

async function controls(t) {
    const browser = installFakeBrowserGlobals();
    const el = id => browser.document.getElementById(id);
    const list = dispatchable(el('acceptanceChecksList')), add = dispatchable(el('btnAddAcceptanceCheck'));
    const state = { previewDocuments: [] }; let invalidations = 0;
    const { createAcceptanceControls } = await import('../recorder/renderer/src/features/review/acceptanceControls.js');
    const controls = createAcceptanceControls({ document: browser.document, state, invalidatePreview: () => invalidations++ });
    controls.mount();
    t.after(() => { controls.unmount(); browser.restore(); });
    const field = (name, value, index = 0) => ({ dataset: { checkField: name }, value,
        checked: Boolean(value), closest: () => ({ dataset: { checkIndex: String(index) } }) });
    return { controls, state, list, add, el, field, invalidations: () => invalidations };
}

test('QA creates and edits criteria with the form; request captures an independent copy', async t => {
    const h = await controls(t);
    h.controls.setActions([{ sequence: 8, action: 'VERIFICAR_EXISTE', contextHint: 'Fecha' }, { sequence: 9, action: 'CLICK' }, { sequence: 10, action: 'VERIFY_TEXT' }, { sequence: 11, action: 'VERIFICAR_NO_EXISTE' }]);
    await h.add.emit('click');
    assert.match(h.controls.validate(), /Describe/);
    await h.list.emit('input', h.field('description', '  Fechas de los últimos 30 días  '));
    await h.list.emit('change', h.field('kind', 'date-range'));
    await h.list.emit('change', h.field('sequence', '8'));
    await h.list.emit('input', h.field('days', '30'));
    assert.equal(h.controls.validate(), '');
    assert.match(h.list.innerHTML, /Acción 8/);
    assert.doesNotMatch(h.list.innerHTML, /Acción 9|Acción 10|Acción 11/);
    await h.list.emit('change', h.field('sequence', '10'));
    assert.match(h.controls.validate(), /Selecciona una comprobación/);
    await h.list.emit('change', h.field('sequence', '8'));
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const generation = createGenerationFeature({ state: h.state, isAutomationWorkflow: () => true });
    const request = generation.buildGenerationRequest();
    assert.deepEqual(request.acceptanceChecks[0], { id: h.state.acceptanceChecks[0].id,
        description: 'Fechas de los últimos 30 días', critical: true, kind: 'date-range', sequence: 8, days: 30 });
    await h.list.emit('input', h.field('days', '90'));
    assert.equal(request.acceptanceChecks[0].days, 30);
    assert.ok(h.invalidations() >= 6);
    await h.list.emit('input', h.field('days', '-1'));
    assert.match(h.controls.validate(), /número entero/);
});

test('hydration preserves IDs, choices and pending checks; switching recordings clears prior criteria', async t => {
    const h = await controls(t);
    const request = { acceptanceChecks: [{ id: 'qa-range', description: '<img src=x onerror=alert(1)>',
        kind: 'date-range', sequence: 12, days: 90, critical: false }] };
    h.controls.restore(request, [{ sequence: 12, action: 'VERIFICAR_EXISTE', contextHint: '<script>bad</script>' }]);
    assert.equal(h.controls.validate(), '');
    assert.match(h.list.innerHTML, /&lt;img/);
    assert.match(h.list.innerHTML, /&lt;script&gt;/);
    assert.doesNotMatch(h.list.innerHTML, /<img|<script/);
    await h.list.emit('change', h.field('critical', true));
    assert.equal(request.acceptanceChecks[0].critical, false);
    h.controls.setActions([]);
    assert.match(h.list.innerHTML, /Acción 12 · no disponible/);
    assert.match(h.controls.validate(), /Selecciona una comprobación/);
    h.controls.restore({});
    assert.deepEqual(h.state.acceptanceChecks, []);
    assert.equal(h.controls.validate(), '');
    h.controls.unmount();
    await h.add.emit('click');
    assert.deepEqual(h.state.acceptanceChecks, []);
    h.controls.mount(); await h.add.emit('click');
    assert.equal(h.state.acceptanceChecks.length, 1, 'remount must register only one listener');
});

test('unknown business criteria stay unevaluated; assessment never claims device success', async () => {
    const { renderAcceptanceAssessment } = await import('../recorder/renderer/src/features/generation/assessmentSummary.js');
    const panel = createElementStub();
    renderAcceptanceAssessment(panel, undefined);
    assert.match(panel.innerHTML, /sin evaluar/);
    assert.doesNotMatch(panel.innerHTML, /0%|100%/);
    renderAcceptanceAssessment(panel, { acceptance: { total: 2, passed: 0, failed: 1, notEvaluated: 1, rate: 0,
        criticalFailures: 1, criteria: [{ id: 'manual', description: 'Saldo correcto', critical: true, status: 'not-evaluated', message: 'Revisión QA pendiente' },
        { id: 'range', description: '<script>rango</script>', critical: true, status: 'failed', message: 'Solo comprueba presencia' }] } });
    assert.match(panel.innerHTML, /0 implementado\(s\) · 1 con fallos · 1 sin evaluar/);
    assert.match(panel.innerHTML, /&lt;script&gt;rango/);
    assert.match(panel.innerHTML, /Ejecución funcional: pendiente/);
    assert.match(panel.innerHTML, /Indispensable/);
    renderAcceptanceAssessment(panel, { acceptance: { total: 1, passed: 1, failed: 0, notEvaluated: 0, rate: 1, criteria: [] } }, true);
    assert.match(panel.innerHTML, /pendientes de revalidación/);
    assert.doesNotMatch(panel.innerHTML, /100%/);
});

test('preview separates technical validation from acceptance and keeps export available with failed criteria', async t => {
    const browser = installFakeBrowserGlobals(); t.after(() => browser.restore());
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: -1 };
    const generation = createGenerationFeature({ state, isAutomationWorkflow: () => true });
    generation.showPreviewDocuments({ previewToken: 'token', exportReady: true, preview: { featurePath: 'case.feature', featureContent: 'Feature: Movimientos' },
        validation: { assessment: { acceptance: { total: 1, passed: 0, failed: 1, notEvaluated: 0, criticalFailures: 1,
            criteria: [{ id: 'range', description: 'Rango correcto', critical: true, status: 'failed', message: 'Solo presencia' }] } } } }, false, false);
    const el = id => browser.document.getElementById(id);
    assert.equal(el('btnGenerate').disabled, false);
    assert.match(el('reviewValidationTitle').textContent, /Validación técnica/);
    assert.doesNotMatch(el('lblGenerationFileCount').textContent, /100%/);
    assert.match(el('acceptanceAssessment').innerHTML, /1 criterio\(s\) indispensable\(s\) requieren corrección/);
});

test('actual regenerate UI restores saved criteria before reanalysis sends its request', async t => {
    let prepared;
    const actions = [{ sequence: 1, action: 'VERIFICAR_EXISTE', contextHint: 'Fecha' }];
    const scenario = { objective: 'Consultar movimientos', acceptanceCriteria: 'Fechas dentro de 30 días', actions,
        request: { featureName: 'Movimientos', scenarioName: 'Rango', caseId: 'TC-10140', acceptanceChecks: [
            { id: 'range-30', description: 'Rango 30 días', critical: true, kind: 'date-range', sequence: 1, days: 30 }] } };
    const browser = installFakeBrowserGlobals({ api: {
        prepareAutomationRegeneration: async () => ({ success: true, mode: 'refinement', scenario }),
        getSteps: async () => ({ steps: actions }),
        prepareAutomationPackage: async input => { prepared = input; return { success: false, error: 'Stop after capture' }; },
    } });
    const el = id => browser.document.getElementById(id);
    const regenerate = dispatchable(el('btnOnboardingRegeneratePrepare'));
    const open = dispatchable(el('btnEnlazar')), run = dispatchable(el('btnRunAutomationPipeline'));
    const { initializeRecorder, disposeRecorder } = await import('../recorder/renderer/src/controller/recorderController.js');
    t.after(() => { disposeRecorder(); browser.restore(); });
    await initializeRecorder();
    el('cmbOnboardingRegeneration').value = 'recording-1';
    await regenerate.emit('click');
    assert.equal(el('txtAutomationObjective').value, scenario.objective);
    assert.match(el('acceptanceChecksList').innerHTML, /Rango 30 días/);
    assert.match(el('enlazarStepsList').children.map(child => child.textContent).join(' '), /Fecha/);
    await run.emit('click');
    assert.deepEqual(prepared.request.acceptanceChecks, scenario.request.acceptanceChecks);
    await open.emit('click'); await run.emit('click');
    assert.deepEqual(prepared.request.acceptanceChecks, scenario.request.acceptanceChecks);
    assert.equal(prepared.acceptanceCriteria, scenario.acceptanceCriteria);
});


test('Revalidar sends edited bytes even when the original preview was valid', async t => {
    const browser = installFakeBrowserGlobals();
    const el = id => browser.document.getElementById(id);
    const revalidate = dispatchable(el('btnPreview')), editor = dispatchable(el('txtGherkin'));
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: -1 }; let submitted;
    const generation = createGenerationFeature({ state, isAutomationWorkflow: () => true,
        hasInvalidAutomationDraft: () => false,
        revalidateReviewedAutomation: async () => { submitted = generation.getReviewedContents(); },
        importAutomationResponse: () => { throw new Error('Must not replace editor content by reimporting'); } });
    generation.mount(); t.after(() => { generation.unmount(); browser.restore(); });
    generation.showPreviewDocuments({ previewToken: 'token', preview: { featurePath: 'case.feature', featureContent: 'Feature: original' },
        validation: { assessment: { acceptance: { total: 1, passed: 1, failed: 0, notEvaluated: 0, rate: 1, criteria: [] } } } });
    editor.value = 'Feature: after QA edit'; await editor.emit('input');
    assert.match(el('reviewValidationTitle').textContent, /pendiente de revalidar/);
    assert.match(el('acceptanceAssessment').innerHTML, /pendientes de revalidación/);
    assert.doesNotMatch(el('acceptanceAssessment').innerHTML, /100%/);
    await revalidate.emit('click');
    assert.deepEqual(submitted, { 'case.feature': 'Feature: after QA edit' });
});
