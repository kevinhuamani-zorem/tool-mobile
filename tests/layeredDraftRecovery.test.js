const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RecoverableDraftStore, readLayeredOutput } = require('../dist/core/automation');
const { layeredDraftPreview } = require('../dist/recorder/src/ipc/automation/layeredDraftPreview');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-draft-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const plan = { recordingId: 'rec-1', planId: 'plan-1', files: [
        { layer: 'feature', path: 'features/a.feature' },
        { layer: 'screen', path: 'screenobjects/a.screen.ts' },
    ] };
    return { root, plan, file: path.join(root, 'output.json'), store: new RecoverableDraftStore(root, plan) };
}

test('la recuperación excluye rutas ajenas, duplicadas y entregas de otro intento sin inventar archivos', t => {
    const { file, store } = fixture(t);
    const publish = files => fs.writeFileSync(file, JSON.stringify({ recordingId: 'rec-1', planId: 'plan-1', files }));
    publish([{ layer: 'screen', path: 'screenobjects/a.screen.ts', content: 'class A {}' }]);
    store.capture(file, 'agent', 'interaction-author', 1);
    publish([{ layer: 'feature', path: '../secret.feature', content: 'Feature: unrelated' },
        { layer: 'screen', path: 'screenobjects/a.screen.ts', content: 'duplicate 1' },
        { layer: 'screen', path: 'screenobjects/a.screen.ts', content: 'duplicate 2' }]);
    store.capture(file, 'agent', undefined, 2);
    fs.writeFileSync(file, JSON.stringify({ recordingId: 'another', files: [
        { layer: 'feature', path: 'features/a.feature', content: 'Feature: other' },
    ] }));
    store.capture(file, 'agent');
    const draft = store.save(['Entregas inválidas']);
    assert.deepEqual(draft.missingLayers, ['feature']);
    assert.equal(draft.files.length, 1);
    assert.equal(draft.files[0].content, 'class A {}');
    assert.equal(draft.files[0].pass, 1);
});

test('el límite de transporte se comprueba antes de parsear y conserva los bytes en disco', t => {
    const { file, store } = fixture(t);
    fs.writeFileSync(file, Buffer.alloc(4 * 1024 * 1024 + 1, 'x'));
    assert.throws(() => readLayeredOutput(file), /hasta 4 MiB/);
    store.capture(file, 'agent');
    assert.equal(store.save(['demasiado grande']).files.length, 0);
    assert.equal(fs.statSync(file).size, 4 * 1024 * 1024 + 1);
});

test('Revisión muestra un Screen sin Feature y declara capas faltantes y procedencia', async t => {
    const { root } = fixture(t);
    const fake = installFakeBrowserGlobals();
    t.after(() => fake.restore());
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: 0, lastPreviewToken: 'old' };
    const feature = createGenerationFeature({ api: {}, state, setStatus() {}, isAutomationWorkflow: () => true });
    const payload = layeredDraftPreview({ files: [{ layer: 'screen', path: 'screenobjects/a.screen.ts', content: 'export class A {}', origin: 'agent', pass: 1 }],
        missingLayers: ['feature', 'steps', 'locators'], diagnostics: ['Sumrak no terminó'] }, root);
    feature.showPreviewDocuments(payload, false, false);
    assert.equal(state.previewDocuments.length, 1);
    assert.equal(state.previewDocuments[0].content, 'export class A {}');
    assert.equal(state.previewDocuments[0].provenance.origin, 'agent');
    assert.equal(state.lastPreviewToken, '');
    assert.match(fake.document.getElementById('lblGenerationFileCount').textContent, /Capas faltantes: feature, steps, locators/);
    assert.match(fake.document.getElementById('lblGenerationFileCount').textContent, /pasada 1/);
    assert.equal(fake.document.getElementById('codeReviewWorkspace').style.display, 'grid');
    assert.match(fake.document.getElementById('lblCodeFileState').textContent, /Agente.*pasada 1/);
    assert.match(fake.document.getElementById('lblGenerateResult').textContent, /Sumrak no terminó/);
    feature.showPreviewDocuments(layeredDraftPreview({ files: [], missingLayers: ['feature', 'steps', 'screen', 'locators'], diagnostics: ['Sin entrega'] }, root), false, false);
    assert.equal(fake.document.getElementById('txtGherkin').value, '', 'no muestra código del intento anterior si la recuperación está vacía');
    assert.equal(fake.document.getElementById('lblCodeFilePath').textContent, '');
});

test('IPC entrega el borrador fallido sin importarlo como un éxito ni perderlo por ausencia de Feature', async t => {
    const { root } = fixture(t);
    const { AutomationAgentLaunchService } = require('../dist/recorder/src/ipc/automation/agentLaunch');
    const state = { activeAutomationPackage: root, automationPreview: { token: 'stale' } };
    const progress = [];
    const service = new AutomationAgentLaunchService({ state,
        layeredGenerationOrchestrator: { run: async () => ({ success: false, reportFile: path.join(root, 'missing-report.json'), error: 'Dos pasadas agotadas',
            draft: { files: [{ layer: 'screen', path: 'screenobjects/a.screen.ts', content: 'class A {}', origin: 'agent', pass: 2 }], missingLayers: ['feature'], diagnostics: ['Sin Feature'] } }) },
        responseImporter: { importFromPackage() { assert.fail('Un fallo recuperado no se reimporta como generación exitosa'); },
            prepareRecoveredDraft(directory, draft) {
                assert.equal(directory, root);
                state.automationPreview = { token: 'safe-export' };
                return { ...layeredDraftPreview(draft, root), previewToken: 'safe-export', exportReady: true };
            } },
        emitProgress: (...args) => progress.push(args),
    });
    const result = await service.launch({ mode: 'automatic', pipeline: 'layered' });
    assert.equal(result.success, false);
    assert.equal(result.draft.preview.screenContent, 'class A {}');
    assert.deepEqual(result.draft.missingLayers, ['feature']);
    assert.equal(state.automationPreview.token, 'safe-export');
    assert.equal(result.draft.exportReady, true);
    assert.ok(progress.some(args => args[0] === 'READY_FOR_REVIEW'));
});
