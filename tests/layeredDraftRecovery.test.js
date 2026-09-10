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
    assert.match(fake.document.getElementById('caseCoveragePanel').innerHTML, /Sumrak no terminó/);
    assert.doesNotMatch(fake.document.getElementById('lblGenerateResult').textContent, /Sumrak no terminó/);
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


test('recovery retains hash-bound metadata only for the exact assembled delivery', t => {
    const { withRecoveredResponseMetadata, recoveredResponseMetadata } = require('../dist/core/automation');
    const plan = { recordingId: 'recording', planId: 'plan', files: [{ layer: 'screen', path: 'screenobjects/case.screen.ts' }] };
    const file = { ...plan.files[0], content: 'export class CaseScreen {}', origin: 'agent', pass: 2 };
    const draft = { files: [file], missingLayers: [], diagnostics: ['Failed checks'] };
    const response = { schemaVersion: 1, recordingId: plan.recordingId, planId: plan.planId, files: [file],
        actionTrace: [{ sequence: 1, gherkinStep: 'Then result', screenMethod: 'verify' }],
        resolutions: [{ gapId: 'gap-1', decision: 'resolved' }],
        completions: [{ file: 'resources/case.locator.json', name: 'result', platform: 'android', sequence: 1 }] };
    const saved = withRecoveredResponseMetadata(draft, response, plan);
    assert.deepEqual(recoveredResponseMetadata(saved, plan).actionTrace, response.actionTrace);
    assert.deepEqual(recoveredResponseMetadata(saved, plan).completions, response.completions);
    response.actionTrace[0].screenMethod = 'mutated';
    assert.equal(recoveredResponseMetadata(saved, plan).actionTrace[0].screenMethod, 'verify');
    assert.equal(recoveredResponseMetadata({ ...saved, files: [{ ...file, content: 'different bytes' }] }, plan), undefined);
    assert.equal(recoveredResponseMetadata(saved, { ...plan, planId: 'foreign' }), undefined);
    const duplicated = { ...saved, responseMetadata: { ...saved.responseMetadata, files: [saved.responseMetadata.files[0], saved.responseMetadata.files[0]] } };
    assert.equal(recoveredResponseMetadata(duplicated, plan), undefined);
    assert.equal(withRecoveredResponseMetadata(draft, { ...response, completions: [{}] }, plan).responseMetadata, undefined);
});


function metadataFixture(t) {
    const f = fixture(t);
    const files = f.plan.files.map(file => ({ ...file, content: file.layer === 'feature' ? 'Feature: Exact bytes' : 'class ExactScreen {}' }));
    const response = { schemaVersion: 1, recordingId: f.plan.recordingId, planId: f.plan.planId, files,
        actionTrace: [{ sequence: 1, gherkinStep: 'Then result', screenMethod: 'verify', locatorName: 'result' }],
        resolutions: [{ gapId: 'gap-1', decision: 'resolved' }] };
    const draft = { files: files.map(file => ({ ...file, origin: 'agent', pass: 2 })), missingLayers: [], diagnostics: ['Failed static check'] };
    const publish = (relative, value) => {
        const target = path.join(f.root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(value));
        return target;
    };
    return { ...f, files, response, draft, publish };
}

test('save retains associations from the one assembled response matching both author deliveries', t => {
    const f = metadataFixture(t);
    const { recoveredResponseMetadata } = require('../dist/core/automation');
    const capture = (layer, role, pass) => {
        const file = f.publish(`${role}.json`, { ...f.response, files: f.files.filter(item => item.layer === layer) });
        f.store.capture(file, 'agent', role, pass);
    };
    capture('feature', 'behavior-author', 1);
    capture('screen', 'interaction-author', 2);
    f.publish('agent-response.json', f.response);
    const saved = f.store.save(['Invalid method']);
    assert.deepEqual(recoveredResponseMetadata(saved, f.plan).actionTrace, f.response.actionTrace);
    const persisted = JSON.parse(fs.readFileSync(path.join(f.root, 'layered-draft.json'), 'utf8'));
    assert.deepEqual(recoveredResponseMetadata(persisted, f.plan).resolutions, f.response.resolutions);
    assert.deepEqual(saved.files.map(file => file.pass), [1, 2]);
    assert.deepEqual(saved.diagnostics, ['Invalid method'], 'retaining metadata does not mark a draft as passed');
});

test('legacy draft recovers exact Sumrak associations when exported root bytes differ, never mixed layers', t => {
    const f = metadataFixture(t);
    const { recoverDraftMetadata, recoveredResponseMetadata } = require('../dist/core/automation');
    f.publish('agent-response.json', { ...f.response, actionTrace: [], resolutions: [],
        files: f.files.map(file => file.layer === 'screen' ? { ...file, content: 'class SharedBaseline {}' } : file) });
    f.publish('agents/sumrak/agent-response.json', f.response);
    const recovered = recoverDraftMetadata(f.root, f.draft, f.plan);
    assert.deepEqual(recoveredResponseMetadata(recovered, f.plan).actionTrace, f.response.actionTrace);
    assert.deepEqual(recoveredResponseMetadata(recovered, f.plan).resolutions, f.response.resolutions);
    assert.deepEqual(recovered.files, f.draft.files, 'recovery cannot substitute generated bytes');
    f.publish('agents/sumrak/agent-response.json', { ...f.response,
        files: f.files.map(file => file.layer === 'feature' ? { ...file, content: file.content + '\n' } : file) });
    assert.equal(recoverDraftMetadata(f.root, f.draft, f.plan).responseMetadata, undefined,
        'matching Feature in root and Screen in Sumrak cannot be combined');
    f.publish('agents/sumrak/agent-response.json', { ...f.response, planId: 'foreign' });
    assert.equal(recoverDraftMetadata(f.root, f.draft, f.plan).responseMetadata, undefined);
});

test('metadata fallback refuses an ancestor symlink escaping the package and drops stale hashes', t => {
    const f = metadataFixture(t);
    const { recoverDraftMetadata, withRecoveredResponseMetadata } = require('../dist/core/automation');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-draft-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.mkdirSync(path.join(outside, 'sumrak'));
    fs.writeFileSync(path.join(outside, 'sumrak/agent-response.json'), JSON.stringify(f.response));
    fs.symlinkSync(outside, path.join(f.root, 'agents'));
    assert.equal(recoverDraftMetadata(f.root, f.draft, f.plan).responseMetadata, undefined);
    const bound = withRecoveredResponseMetadata(f.draft, f.response, f.plan);
    const changed = { ...bound, files: bound.files.map(file => ({ ...file, content: file.content + '\n' })) };
    assert.equal(recoverDraftMetadata(f.root, changed, f.plan).responseMetadata, undefined);
});


test('saved recovery keeps non-NFC code and metadata hashes unchanged across a UTF-8 round trip', t => {
    const f = metadataFixture(t);
    const { recoveredResponseMetadata } = require('../dist/core/automation');
    const source = 'Feature: Cafe\u0301';
    assert.notEqual(source, source.normalize('NFC'));
    f.response.files[0].content = source;
    f.response.actionTrace[0].gherkinStep = 'Then Cafe\u0301';
    const responseFile = f.publish('agent-response.json', f.response);
    f.store.capture(responseFile, 'agent');
    const saved = f.store.save(['Still needs QA review']);
    const persisted = readLayeredOutput(path.join(f.root, 'layered-draft.json'), true);
    assert.equal(persisted.files[0].content, source);
    assert.deepEqual(persisted, saved);
    assert.deepEqual(recoveredResponseMetadata(persisted, f.plan).actionTrace, f.response.actionTrace);
    assert.equal(fs.readdirSync(f.root).some(name => name.endsWith('.tmp')), false);
});
