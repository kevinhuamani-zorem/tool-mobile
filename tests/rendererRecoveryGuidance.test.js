const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const comparison = (token = 'review-token') => ({ success: true, preview: {
    token, context: { branch: 'qa-case', dirty: true }, pending: [{ message: 'Un helper requiere asociación' }],
    files: [{ layer: 'feature', path: 'features/case.feature', current: 'after', content: 'after', exported: 'before',
        changes: [{ scope: 'case', symbol: 'TC-1', before: 'before', after: 'after' }] }],
} });
async function setup(t, overrides = {}, openGoldenReview) {
    const browser = installFakeBrowserGlobals();
    const bindings = new Map();
    const el = id => {
        const node = browser.document.getElementById(id);
        if (!bindings.has(id)) {
            const handlers = new Map(); bindings.set(id, handlers);
            node.addEventListener = (event, handler) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(handler); };
            node.removeEventListener = (event, handler) => handlers.get(event)?.delete(handler);
            node.focus = () => { browser.document.activeElement = node; };
        }
        return node;
    };
    ['frameworkRecoveryModal', 'lblFrameworkRecoveryStatus', 'btnSaveFrameworkRecovery', 'btnPreviewFrameworkRecovery',
        'btnRecoveryGolden', 'cmbFrameworkRecoveryCase', 'txtFrameworkRecoveryPr', 'txtFrameworkRecoveryNotes',
        'txtFrameworkRecoveryPaths', 'txtFrameworkRecoverySymbols', 'btnCloseFrameworkRecovery',
        'btnRecoverFramework', 'btnRecoverFrameworkCurrent', 'btnOnboardingRecoverFramework'].forEach(el);
    const calls = { list: [], preview: [], save: [], onSaved: [] };
    const api = {
        getExistingScenarios: async squad => { calls.list.push(squad); return { success: true, scenarios: [{ id: 'rec-1', caseId: 'TC-1', name: 'Movimientos' }] }; },
        previewFrameworkRecovery: async input => { calls.preview.push(input); return comparison(); },
        saveFrameworkRecovery: async token => { calls.save.push(token); return { success: true, result: { files: 1, pending: 1 } }; },
        ...overrides,
    };
    const { createFrameworkRecoveryFeature } = await import('../recorder/renderer/src/features/framework-recovery/frameworkRecoveryFeature.js');
    const feature = createFrameworkRecoveryFeature({ api, getSquad: () => 'payment', openGoldenReview, onSaved: result => calls.onSaved.push(result) });
    feature.mount();
    t.after(() => { feature.unmount(); browser.restore(); });
    const dispatch = (id, event = 'click', data = {}) => Promise.all([...(bindings.get(id)?.get(event) || [])]
        .map(handler => handler({ target: el(id), preventDefault() {}, stopPropagation() {}, ...data })));
    return { feature, el, dispatch, calls, browser };
}

test('recovery guides compare, save and explicit golden review without requiring a PR or hiding pending associations', async t => {
    const golden = [];
    const h = await setup(t, {}, async input => golden.push(input));
    await h.feature.open('rec-1');
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, true);
    assert.equal(h.el('btnRecoveryGolden').disabled, true);
    assert.match(h.el('frameworkRecoverySaveHelp').textContent, /después de comparar/);
    await h.dispatch('btnRecoveryGolden');
    await h.dispatch('btnSaveFrameworkRecovery');
    assert.deepEqual(golden, []);
    assert.deepEqual(h.calls.save, []);
    await h.dispatch('btnPreviewFrameworkRecovery');
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, false);
    assert.equal(h.el('btnRecoveryGolden').disabled, true);
    assert.match(h.el('frameworkRecoveryPending').innerHTML, /requiere asociación/);
    assert.equal(h.calls.preview[0].prUrl, undefined);
    assert.equal(h.el('frameworkRecoveryStepSave').getAttribute('aria-current'), 'step');
    await h.dispatch('btnSaveFrameworkRecovery');
    assert.deepEqual(h.calls.save, ['review-token']);
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, true);
    assert.equal(h.el('btnRecoveryGolden').disabled, false);
    assert.equal(h.el('frameworkRecoveryStepGolden').getAttribute('aria-current'), 'step');
    assert.match(h.el('lblFrameworkRecoveryStatus').textContent, /grabación original se conserva/);
    assert.deepEqual(golden, [], 'saving a QA revision must not approve or open a golden automatically');
    await h.dispatch('btnRecoveryGolden');
    assert.deepEqual(golden, [{ recordingId: 'rec-1', squad: 'payment', source: 'recovery' }]);
    h.el('txtFrameworkRecoveryNotes').value = 'Nueva corrección';
    await h.dispatch('txtFrameworkRecoveryNotes', 'input');
    assert.equal(h.el('btnRecoveryGolden').disabled, true);
    assert.match(h.el('lblFrameworkRecoveryStatus').textContent, /Vuelve a comparar/);
});

test('recovery catches rejected scenario listing and restores actionable controls', async t => {
    const h = await setup(t, { getExistingScenarios: async () => { throw new Error('No se pudo leer el catálogo'); } });
    await h.dispatch('btnRecoverFramework');
    assert.equal(h.el('frameworkRecoveryModal').style.display, 'flex');
    assert.match(h.el('lblFrameworkRecoveryStatus').textContent, /No se pudieron cargar.*catálogo/);
    assert.equal(h.el('lblFrameworkRecoveryStatus').getAttribute('role'), 'alert');
    assert.equal(h.el('btnPreviewFrameworkRecovery').disabled, false);
    assert.equal(h.el('btnCloseFrameworkRecovery').disabled, false);
    assert.equal(h.el('frameworkRecoveryModal').getAttribute('aria-busy'), 'false');
});

test('preview and save suppress duplicate dispatches and keep the saved token bound to the reviewed files', async t => {
    const preview = defer(), save = defer(); let previewCalls = 0; const tokens = [];
    const h = await setup(t, {
        previewFrameworkRecovery: () => { previewCalls++; return preview.promise; },
        saveFrameworkRecovery: token => { tokens.push(token); return save.promise; },
    });
    await h.feature.open('rec-1');
    const comparing = h.dispatch('btnPreviewFrameworkRecovery');
    await h.dispatch('btnPreviewFrameworkRecovery');
    assert.equal(previewCalls, 1);
    assert.match(h.el('btnPreviewFrameworkRecovery').textContent, /Comparando/);
    preview.resolve(comparison('exact-reviewed-token'));
    await comparing;
    const saving = h.dispatch('btnSaveFrameworkRecovery');
    await h.dispatch('btnSaveFrameworkRecovery');
    await h.dispatch('btnPreviewFrameworkRecovery');
    assert.deepEqual(tokens, ['exact-reviewed-token']);
    assert.equal(previewCalls, 1);
    assert.equal(h.el('cmbFrameworkRecoveryCase').disabled, true);
    assert.equal(h.el('btnCloseFrameworkRecovery').disabled, true);
    await h.dispatch('frameworkRecoveryModal', 'keydown', { key: 'Escape' });
    assert.equal(h.el('frameworkRecoveryModal').style.display, 'flex');
    save.resolve({ success: true, result: { files: 1, pending: 1 } });
    await saving;
    assert.equal(h.el('btnCloseFrameworkRecovery').disabled, false);
    assert.equal(h.el('btnRecoveryGolden').disabled, false);
});

test('changing review metadata invalidates preview and requires another comparison after a failed save', async t => {
    const h = await setup(t, { saveFrameworkRecovery: async () => ({ success: false, error: 'Los archivos cambiaron' }) });
    await h.feature.open('rec-1');
    await h.feature.preview();
    h.el('txtFrameworkRecoveryPr').value = 'https://example.test/pr/1';
    await h.dispatch('txtFrameworkRecoveryPr', 'change');
    await h.feature.persist();
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, true);
    await h.feature.preview();
    await h.feature.persist();
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, true);
    assert.equal(h.el('btnRecoveryGolden').disabled, true);
    assert.equal(h.el('btnPreviewFrameworkRecovery').disabled, false);
    assert.match(h.el('lblFrameworkRecoveryStatus').textContent, /Los archivos cambiaron/);
    assert.match(h.el('frameworkRecoverySaveHelp').textContent, /después de comparar/);
});

test('closing during comparison discards late results and restores focus to the entry', async t => {
    const pending = defer();
    const h = await setup(t, { previewFrameworkRecovery: () => pending.promise });
    h.el('btnRecoverFramework').focus();
    await h.dispatch('btnRecoverFramework');
    assert.equal(h.browser.document.activeElement.id, 'btnCloseFrameworkRecovery');
    const comparing = h.feature.preview();
    await h.dispatch('frameworkRecoveryModal', 'keydown', { key: 'Escape' });
    assert.equal(h.el('frameworkRecoveryModal').style.display, 'none');
    assert.equal(h.browser.document.activeElement.id, 'btnRecoverFramework');
    pending.resolve(comparison()); await comparing;
    assert.equal(h.el('btnSaveFrameworkRecovery').disabled, true);
    assert.equal(h.el('frameworkRecoveryFiles').innerHTML, '');
});

test('a stale list response cannot replace the newly selected recovery case', async t => {
    const first = defer(), second = defer(); let n = 0;
    const h = await setup(t, { getExistingScenarios: () => (++n === 1 ? first : second).promise });
    const one = h.feature.open('rec-old');
    const two = h.feature.open('rec-new');
    second.resolve({ success: true, scenarios: [{ id: 'rec-new', caseId: 'TC-2', name: 'Actual' }] }); await two;
    first.resolve({ success: true, scenarios: [{ id: 'rec-old', caseId: 'TC-1', name: 'Anterior' }] }); await one;
    assert.equal(h.el('cmbFrameworkRecoveryCase').value, 'rec-new');
    assert.equal(h.el('frameworkRecoveryModal').getAttribute('aria-busy'), 'false');
});

test('golden review opening failures are visible and retryable, without duplicate callbacks', async t => {
    const pending = defer(); let calls = 0;
    const h = await setup(t, {}, () => { calls++; return pending.promise; });
    await h.feature.open('rec-1'); await h.feature.preview(); await h.feature.persist();
    const opening = h.dispatch('btnRecoveryGolden');
    await h.dispatch('btnRecoveryGolden');
    assert.equal(calls, 1);
    pending.reject(new Error('Repositorio no disponible')); await opening;
    assert.match(h.el('lblFrameworkRecoveryStatus').textContent, /No se pudo abrir.*Repositorio no disponible/);
    assert.equal(h.el('btnRecoveryGolden').disabled, false);
});

test('recovery entry listeners survive remount without duplicates and preserve onboarding selection', async t => {
    const h = await setup(t);
    h.feature.mount();
    await h.dispatch('btnRecoverFrameworkCurrent');
    assert.equal(h.calls.list.length, 1);
    h.feature.unmount(); await h.dispatch('btnRecoverFrameworkCurrent');
    assert.equal(h.calls.list.length, 1);
    h.feature.mount();
    h.el('cmbOnboardingScenario').value = 'rec-1';
    await h.dispatch('btnOnboardingRecoverFramework');
    assert.equal(h.calls.list.length, 2);
    assert.equal(h.el('cmbFrameworkRecoveryCase').value, 'rec-1');
});
