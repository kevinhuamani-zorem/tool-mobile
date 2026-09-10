const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

async function setup(t, overrides = {}) {
    const browser = installFakeBrowserGlobals();
    const el = id => browser.document.getElementById(id);
    const listeners = new Map();
    for (const id of ['btnSeedGoldenReferences', 'btnRebuildGolden', 'btnCloseGolden']) {
        const events = new Set(); listeners.set(id, events);
        el(id).addEventListener = (type, fn) => { if (type === 'click') events.add(fn); };
        el(id).removeEventListener = (type, fn) => { if (type === 'click') events.delete(fn); };
    }
    const calls = { rebuild: 0, list: 0, save: 0 };
    const entry = { caseId: 'TC-1', goldenId: 'g-1', platform: 'android', squad: 'payment', versionHash: 'a'.repeat(64), approval: { actor: 'qa', at: '2026-09-10T00:00:00Z' }, usage: 'reference' };
    const index = { entries: [entry, { ...entry, goldenId: 'g-2', caseId: 'TC-2', usage: 'evaluation' }], versions: 2, issues: [] };
    const api = {
        rebuildGoldenIndex: async () => ({ success: true, index, issues: [] }),
        listGoldenCases: async () => ({ success: true, index, datasetRoot: '/recorder/tests/golden' }),
        saveGoldenCase: async () => { calls.save++; throw new Error('Approval was not requested'); }, ...overrides,
    };
    const { createGoldenFeature } = await import('../recorder/renderer/src/features/golden/goldenFeature.js');
    const feature = createGoldenFeature({ api: { ...api,
        rebuildGoldenIndex: () => { calls.rebuild++; return api.rebuildGoldenIndex(); },
        listGoldenCases: () => { calls.list++; return api.listGoldenCases(); },
    } });
    feature.mount();
    t.after(() => { feature.unmount(); browser.restore(); });
    return { el, calls, feature, api, index, click: id => Promise.all([...listeners.get(id)].map(fn => fn({ target: el(id) }))) };
}

test('el botón del apartado QA actualiza referencias sin sesión, evita duplicados y muestra el resultado sin aprobar', async t => {
    let complete;
    const h = await setup(t, { rebuildGoldenIndex: () => new Promise(resolve => { complete = resolve; }) });
    const pending = h.click('btnSeedGoldenReferences');
    assert.equal(h.el('goldenModal').style.display, 'flex');
    assert.equal(h.el('btnSeedGoldenReferences').disabled, true);
    assert.equal(h.el('btnRebuildGolden').disabled, true);
    assert.equal(h.el('goldenModal').getAttribute('aria-busy'), 'true');
    assert.match(h.el('btnRebuildGolden').textContent, /Actualizando referencias/);
    assert.doesNotMatch(h.el('btnApproveGolden').textContent, /Guardando/);
    await h.click('btnRebuildGolden');
    await h.click('btnSeedGoldenReferences');
    assert.equal(h.calls.rebuild, 1);
    complete({ success: true, index: h.index, issues: [] }); await pending;
    assert.equal(h.calls.list, 1);
    assert.match(h.el('goldenStatus').textContent, /Referencias actualizadas · 1 caso aprobado para agentes · 1 para evaluación/);
    assert.match(h.el('goldenStatus').textContent, /compatibilidad/);
    assert.equal(h.el('goldenDatasetPath').textContent, '/recorder/tests/golden');
    assert.equal(h.el('btnRebuildGolden').disabled, false);
    assert.equal(h.el('goldenModal').getAttribute('aria-busy'), 'false');
    assert.equal(h.el('goldenApproved').checked, false);
    assert.equal(h.el('btnApproveGolden').disabled, true);
    assert.equal(h.calls.save, 0);
});

test('los problemas de retrieval permanecen visibles después de volver a listar los golden', async t => {
    const h = await setup(t, { rebuildGoldenIndex: async () => ({ success: true, issues: ['TC-1: evidencia no recuperable <archivo>'] }) });
    await h.click('btnSeedGoldenReferences');
    assert.match(h.el('goldenStatus').className, /warn/);
    assert.match(h.el('goldenIssues').innerHTML, /TC-1: evidencia no recuperable &lt;archivo&gt;/);
    assert.doesNotMatch(h.el('goldenStatus').textContent, /Referencias actualizadas/);
    assert.equal(h.calls.save, 0);
});

for (const response of ['reject', 'failure', 'list-failure']) {
    test(`actualizar informa ${response} y permite un reintento`, async t => {
        const h = await setup(t, response === 'list-failure' ? { listGoldenCases: async () => ({ success: false, error: 'Biblioteca no disponible' }) } : {
            rebuildGoldenIndex: async () => {
                if (response === 'reject') throw new Error('No se pudo leer el repositorio');
                return { success: false, error: 'Selecciona el repositorio del Recorder' };
            },
        });
        await h.click('btnSeedGoldenReferences');
        assert.match(h.el('goldenStatus').className, /err/);
        assert.ok(h.el('goldenStatus').textContent.length);
        assert.equal(h.el('goldenRepositoryDetails').open, true);
        assert.equal(h.el('btnRebuildGolden').disabled, false);
        h.api.rebuildGoldenIndex = async () => ({ success: true, index: h.index });
        h.api.listGoldenCases = async () => ({ success: true, index: { entries: [], versions: 0, issues: [] } });
        await h.click('btnRebuildGolden');
        assert.match(h.el('goldenStatus').textContent, /Todavía no hay ejemplos/);
        assert.equal(h.calls.rebuild, 2);
        assert.equal(h.calls.save, 0);
    });
}

test('unmount cancela el resultado visual pendiente y remontar no duplica el botón', async t => {
    let complete;
    const h = await setup(t, { rebuildGoldenIndex: () => new Promise(resolve => { complete = resolve; }) });
    const pending = h.click('btnSeedGoldenReferences');
    h.feature.unmount();
    const before = h.el('goldenStatus').textContent;
    complete({ success: true, index: h.index }); await pending;
    assert.equal(h.el('goldenStatus').textContent, before);
    assert.equal(h.calls.list, 0);
    await h.click('btnSeedGoldenReferences');
    assert.equal(h.calls.rebuild, 1);
    h.api.rebuildGoldenIndex = async () => ({ success: true, index: h.index });
    h.feature.mount();
    await h.click('btnSeedGoldenReferences');
    assert.equal(h.calls.rebuild, 2);
    assert.equal(h.calls.list, 1);
});
