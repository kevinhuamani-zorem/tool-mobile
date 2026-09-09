const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectPaths } = require('../dist/core/workspace');
const { AutomationApplier, GeneratedFileRegistry, AgentRunStore, AutomationHistoryStore } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { AutomationResponseImporter } = require('../dist/recorder/src/ipc/automation/responseImport');
const { applyReviewedAutomation } = require('../dist/recorder/src/ipc/automation/applyAutomation');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-f3-'));
    const original = { frameworkRoot: projectPaths.frameworkRoot, toolConfig: projectPaths.toolConfig };
    projectPaths.frameworkRoot = root;
    projectPaths.toolConfig = path.join(root, 'config');
    t.after(() => { Object.assign(projectPaths, original); fs.rmSync(root, { recursive: true, force: true }); });
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], strict: true, target: 'ES2022' } }));
    const scenario = { recordingId: 'rec-f3', createdAt: '2026-09-08T12:00:00Z', squad: 'payment', platform: 'android',
        request: { caseId: 'TC-3', scenarioRows: [] }, actions: [], gaps: [] };
    const plan = { recordingId: 'rec-f3', planId: 'plan-f3', files: [
        { layer: 'feature', path: 'features/case.feature', operation: 'create' },
        { layer: 'steps', path: 'features/case.steps.ts', operation: 'create' },
        { layer: 'screen', path: 'screenobjects/case.screen.ts', operation: 'create' },
        { layer: 'locators', path: 'resources/case.locator.json', operation: 'create' },
    ], resolutions: [], unresolvedGapIds: [], budgets: { maxRepairAttempts: 1 } };
    const recording = path.join(root, 'recording');
    const pkg = path.join(recording, 'generation/automation');
    fs.mkdirSync(pkg, { recursive: true });
    for (const [file, value] of [[path.join(recording, 'scenario.json'), scenario], [path.join(pkg, 'scenario.json'), scenario],
        [path.join(pkg, 'generation-plan.json'), plan]]) fs.writeFileSync(file, JSON.stringify(value));
    const state = { activeAutomationPackage: pkg, automationPreview: null };
    const registry = new GeneratedFileRegistry();
    const deps = { state, automationApplier: new AutomationApplier(undefined, undefined, registry, root),
        automationPackageBuilder: { requireTrustedScenarioPackage: () => scenario }, generatedFileRegistry: registry,
        automationResponseValidator: new AutomationResponseValidator(), emitProgress() {},
        automationMemory: { promote() { assert.fail('Export is not QA approval'); } } };
    const history = new AutomationHistoryStore(pkg);
    history.ensureRevision(scenario.recordingId, scenario.request.caseId);
    const runStore = new AgentRunStore(pkg);
    runStore.start(scenario.recordingId, plan.planId);
    runStore.mark('layered-generation-failed', true);
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'failed' });
    const importer = new AutomationResponseImporter(deps);
    const draft = { files: [{ layer: 'screen', path: plan.files[2].path,
        content: 'export class CaseScreen { public async verify() { return this.absentMethod(); } }\n', origin: 'agent', pass: 2 }],
        missingLayers: ['feature', 'steps', 'locators'], diagnostics: ['Dos pasadas agotadas'] };
    return { root, pkg, scenario, plan, deps, state, importer, draft, history, runStore, registry };
}

test('F3 exporta Screen incompleto: TS2339, recibo del único archivo, intento fallido y QA pendiente', async t => {
    const f = fixture(t);
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    const result = await applyReviewedAutomation(f.deps, preview.previewToken);
    assert.equal(result.success, true, result.error);
    assert.equal(result.exportStatus, 'exported-with-observations');
    assert.match(result.validation.errors.map(item => item.message).join('\n'), /TS2339/);
    const exported = fs.readFileSync(path.join(f.root, f.draft.files[0].path), 'utf8');
    assert.equal(exported, f.draft.files[0].content);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.pkg, 'application-receipt.json')));
    assert.equal(receipt.files.length, 1);
    assert.equal(receipt.files[0].beforeHash, null);
    assert.equal(receipt.files[0].afterHash, hash(exported));
    assert.deepEqual(receipt.files[0].symbols, ['verify']);
    assert.deepEqual(receipt.missingLayers, f.draft.missingLayers);
    assert.ok(receipt.attemptId);
    assert.equal(receipt.attemptId, f.runStore.read().runId);
    assert.equal(receipt.revisionId, f.history.current().revisionId);
    assert.equal(receipt.validation.valid, false);
    assert.deepEqual(receipt.generationDiagnostics, f.draft.diagnostics);
    assert.equal(f.history.lifecycle().generation, 'failed');
    assert.equal(f.history.lifecycle().export, 'exported-with-observations');
    assert.equal(f.history.lifecycle().qaApproval, 'pending');
    assert.equal(f.history.lifecycle().functionalVerification, 'not-reported');
    assert.equal(f.runStore.read().result, 'layered-generation-failed');
    assert.equal(f.runStore.read().exportResult, 'exported-with-observations');
    const manifest = JSON.parse(fs.readFileSync(f.registry.storagePath()));
    assert.deepEqual(Object.keys(manifest.files), [f.draft.files[0].path]);
    assert.equal(fs.existsSync(path.join(f.root, f.plan.files[0].path)), false);
    const repeated = await applyReviewedAutomation(f.deps, preview.previewToken);
    assert.equal(repeated.success, false, 'Un token consumido no se reutiliza');
});

test('F3 exporta una edición con sintaxis inválida y Unicode NFD exactamente como se revisó', async t => {
    const f = fixture(t);
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    const edited = 'export class CaseScreen {\r\n // Cafe\u0301\r\n public async verify( {\r\n';
    const file = path.join(f.root, f.draft.files[0].path);
    const result = await applyReviewedAutomation(f.deps, preview.previewToken, { [file]: edited });
    assert.equal(result.success, true, result.error);
    assert.equal(result.validation.valid, false);
    assert.deepEqual(fs.readFileSync(file), Buffer.from(edited));
    const receipt = JSON.parse(fs.readFileSync(path.join(f.pkg, 'application-receipt.json')));
    assert.equal(receipt.files[0].afterHash, hash(edited));
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.pkg, 'agent-response.json'))).files[0].content, edited);
    assert.equal(f.history.current().source, 'qa-edit');
});

test('F3 revalida una edición del borrador aunque no exista agent-response.json', async t => {
    const f = fixture(t);
    f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    const file = path.join(f.root, f.draft.files[0].path);
    const edited = 'export class CaseScreen { public async verify() { return true; } }\n';
    const reviewed = await f.importer.importFromPackage(f.pkg, { reviewedContents: { [file]: edited }, trackRepair: false });
    assert.equal(reviewed.success, false, 'Las otras tres capas siguen ausentes');
    assert.equal(reviewed.draft.exportReady, true, reviewed.draft.exportBlockers.join(' '));
    assert.equal(reviewed.draft.preview.screenContent, edited);
    assert.equal(reviewed.draft.preview.provenance[file].origin, 'qa');
    assert.equal(fs.existsSync(path.join(f.pkg, 'agent-response.json')), false);
    const result = await applyReviewedAutomation(f.deps, reviewed.draft.previewToken);
    assert.equal(result.success, true, result.error);
    assert.equal(fs.readFileSync(file, 'utf8'), edited);
});

test('F3 impide rutas fuera del plan, capas duplicadas, symlinks y escrituras concurrentes', async t => {
    const f = fixture(t);
    for (const files of [
        [{ ...f.draft.files[0], path: 'other.screen.ts' }],
        [f.draft.files[0], f.draft.files[0]],
        [{ ...f.draft.files[0], path: '../outside.ts' }],
    ]) {
        const result = f.importer.prepareRecoveredDraft(f.pkg, { ...f.draft, files });
        assert.equal(result.exportReady, false);
        assert.equal(f.state.automationPreview, null);
    }
    const folder = path.join(f.root, 'screenobjects');
    fs.symlinkSync(path.join(f.root, 'absent-folder'), folder);
    assert.equal(f.importer.prepareRecoveredDraft(f.pkg, f.draft).exportReady, false);
    fs.unlinkSync(folder);
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(f.root, f.draft.files[0].path), 'external QA edit');
    const result = await applyReviewedAutomation(f.deps, preview.previewToken);
    assert.equal(result.success, false);
    assert.match(result.error, /cambió después del preview/);
    assert.equal(fs.readFileSync(path.join(f.root, f.draft.files[0].path), 'utf8'), 'external QA edit');
    assert.equal(fs.existsSync(path.join(f.pkg, 'application-receipt.json')), false);
});

test('F3 amplía un Screen compartido sin alterar el método previo y registra hashes/símbolos propios', async t => {
    const f = fixture(t);
    const file = f.plan.files[2];
    const baseline = 'export class CaseScreen {\n    public async existing() { return "QA original"; }\n}\n';
    fs.mkdirSync(path.join(f.root, 'screenobjects'));
    fs.writeFileSync(path.join(f.root, file.path), baseline);
    Object.assign(file, { operation: 'update', baseHash: hash(baseline) });
    fs.writeFileSync(path.join(f.pkg, 'generation-plan.json'), JSON.stringify(f.plan));
    f.draft.files[0].content = 'export class CaseScreen {\n    public async existing() { return "agent overwrite"; }\n    public async verify() { return this.absentMethod(); }\n}\n';
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    assert.match(preview.preview.screenContent, /QA original/);
    assert.doesNotMatch(preview.preview.screenContent, /agent overwrite/);
    const result = await applyReviewedAutomation(f.deps, preview.previewToken);
    assert.equal(result.success, true, result.error);
    assert.equal(fs.readFileSync(path.join(f.root, file.path), 'utf8'), preview.preview.screenContent);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.pkg, 'application-receipt.json')));
    assert.equal(receipt.files[0].beforeHash, hash(baseline));
    assert.deepEqual(receipt.files[0].symbols, ['verify']);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.registry.storagePath())).files), [], 'No adopta archivo ajeno');
});

test('F3 Revisión habilita exportar con diagnóstico y solo bloquea por conflicto de escritura', async t => {
    const f = fixture(t);
    const fake = installFakeBrowserGlobals();
    t.after(() => fake.restore());
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: 0 };
    const feature = createGenerationFeature({ api: {}, state, setStatus() {}, isAutomationWorkflow: () => true });
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    feature.showPreviewDocuments(preview, false, false);
    assert.equal(fake.document.getElementById('btnGenerate').disabled, false);
    assert.match(fake.document.getElementById('btnGenerate').textContent, /Exportar al framework/);
    assert.match(fake.document.getElementById('lblGenerateResult').textContent, /Dos pasadas agotadas/);
    feature.showPreviewDocuments({ ...preview, exportReady: false, previewToken: '', exportBlockers: ['Cambio externo'] }, false, false);
    assert.equal(fake.document.getElementById('btnGenerate').disabled, true);
    assert.match(fake.document.getElementById('lblGenerateResult').textContent, /Cambio externo/);
});

test('F3 la importación normal separa su fallo de validación de la disponibilidad para exportar', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.pkg, 'agent-response.json'), JSON.stringify({ recordingId: f.scenario.recordingId,
        planId: f.plan.planId, files: f.draft.files.map(({ layer, path, content }) => ({ layer, path, content })), actionTrace: [], resolutions: [] }));
    const imported = await f.importer.importFromPackage(f.pkg, { trackRepair: false });
    assert.equal(imported.success, false);
    assert.equal(imported.validation.valid, false);
    assert.equal(imported.draft.exportReady, true, imported.draft.exportBlockers.join(' '));
    const result = await applyReviewedAutomation(f.deps, imported.draft.previewToken);
    assert.equal(result.success, true, result.error);
    assert.equal(result.exportStatus, 'exported-with-observations');
    assert.equal(f.history.lifecycle().generation, 'failed');
});

test('F3 el botón envía bytes inválidos al IPC sin exigir corrección local previa', async t => {
    const f = fixture(t);
    const fake = installFakeBrowserGlobals();
    t.after(() => fake.restore());
    const button = fake.document.getElementById('btnGenerate');
    let click;
    button.addEventListener = (type, handler) => { if (type === 'click') click = handler; };
    const { createGenerationFeature } = await import('../recorder/renderer/src/features/generation/generationFeature.js');
    const state = { previewDocuments: [], activePreviewDocumentIndex: 0 };
    let calls = 0;
    const feature = createGenerationFeature({ state, setStatus() {}, isAutomationWorkflow: () => true,
        api: { generateAutomationResponse: async (token, contents) => {
            calls++;
            assert.equal(token, 'export-token');
            assert.match(Object.values(contents)[0], /class Broken \{/);
            return { success: true, exportStatus: 'exported-with-observations', generated: { files: Object.keys(contents) },
                validation: { valid: false, errors: [{ message: 'TS1005: falta cierre' }] }, missingLayers: ['feature'] };
        } },
    });
    feature.mount();
    feature.showPreviewDocuments({ previewToken: 'export-token', exportReady: true, exportBlockers: [],
        preview: { screenPath: path.join(f.root, f.draft.files[0].path), screenContent: 'export class Broken {' },
        validation: { valid: false, errors: [{ message: 'TS1005: falta cierre' }] } }, false, false);
    await click();
    assert.equal(calls, 1);
    assert.equal(state.lastPreviewToken, '');
    assert.equal(button.disabled, true);
    assert.match(fake.document.getElementById('lblGenerateResult').textContent, /exportados con observaciones/);
    assert.match(fake.document.getElementById('lblGenerateResult').textContent, /TS1005/);
    feature.unmount();
});

test('F3 exports the reviewed Feature with a missing fixture user and preserves the diagnostic', async t => {
    const f = fixture(t);
    const data = path.join(f.root, 'resources/data'); fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'valid.yml'), 'name: Approved User\n');
    const feature = { layer: 'feature', path: f.plan.files[0].path, origin: 'agent', pass: 2,
        content: 'Feature: Sales\n Scenario Outline: [TC-3] Sales\n  Given el usuario <username> inicia sesión en Yape\n  Examples:\n   | username |\n   | Missing User |\n' };
    const preview = f.importer.prepareRecoveredDraft(f.pkg, { files: [feature], missingLayers: ['steps', 'screen', 'locators'], diagnostics: [] });
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    const result = await applyReviewedAutomation(f.deps, preview.previewToken);
    assert.equal(result.success, true, result.error);
    assert.equal(result.exportStatus, 'exported-with-observations');
    assert.ok(result.validation.errors.some(error => error.code === 'test-data-user-missing'));
    assert.equal(fs.readFileSync(path.join(f.root, feature.path), 'utf8'), feature.content);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.pkg, 'application-receipt.json')));
    assert.ok(receipt.validation.errors.some(error => error.code === 'test-data-user-missing'));
});


test('F3 conserva trazas y resoluciones de una entrega identificada al preparar, editar y exportar', async t => {
    const f = fixture(t);
    const response = { schemaVersion: 1, recordingId: f.scenario.recordingId, planId: f.plan.planId,
        files: f.draft.files.map(({ layer, path, content }) => ({ layer, path, content })),
        actionTrace: [{ sequence: 1, gherkinStep: 'Then se verifica el resultado', screenMethod: 'verify', locatorName: 'result' }],
        resolutions: [{ gapId: 'gap-result', decision: 'resolved', reason: 'Recorded result' }] };
    fs.writeFileSync(path.join(f.pkg, 'agent-response.json'), JSON.stringify(response));
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    assert.deepEqual(f.state.automationPreview.response.actionTrace, response.actionTrace);
    assert.deepEqual(f.state.automationPreview.response.resolutions, response.resolutions);
    // Once captured, metadata survives a missing mutable integration file and QA edits.
    fs.unlinkSync(path.join(f.pkg, 'agent-response.json'));
    const file = path.join(f.root, response.files[0].path);
    const content = 'export class CaseScreen { public async verify() { return true; } }\n';
    const edited = await f.importer.importFromPackage(f.pkg, { reviewedContents: { [file]: content }, trackRepair: false });
    assert.equal(edited.draft.exportReady, true, edited.draft.exportBlockers.join(' '));
    assert.deepEqual(f.state.automationPreview.response.actionTrace, response.actionTrace);
    assert.deepEqual(f.state.automationPreview.response.resolutions, response.resolutions);
    const exported = await applyReviewedAutomation(f.deps, edited.draft.previewToken);
    assert.equal(exported.success, true, exported.error);
    const saved = JSON.parse(fs.readFileSync(path.join(f.pkg, 'agent-response.json')));
    assert.deepEqual(saved.actionTrace, response.actionTrace);
    assert.deepEqual(saved.resolutions, response.resolutions);
    assert.ok(f.history.events().some(event => event.kind === 'generation-result' && event.result === 'failed'));
    assert.equal(f.history.events().some(event => event.kind === 'generation-result' && event.result === 'passed'), false);
});

test('F3 no toma trazas de otra identidad, bytes distintos o un sobre malformado', t => {
    const f = fixture(t);
    const response = { recordingId: f.scenario.recordingId, planId: f.plan.planId,
        files: f.draft.files, actionTrace: [{ sequence: 1, gherkinStep: 'Then result', screenMethod: 'verify' }], resolutions: [] };
    for (const candidate of [
        { ...response, recordingId: 'another-recording' },
        { ...response, planId: 'another-plan' },
        { ...response, files: [{ ...response.files[0], content: 'another delivery' }] },
        { ...response, actionTrace: [{ sequence: 'bad', gherkinStep: 'Then result' }] },
        { ...response, files: [...response.files, response.files[0]] },
    ]) {
        fs.writeFileSync(path.join(f.pkg, 'agent-response.json'), JSON.stringify(candidate));
        const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
        assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
        assert.deepEqual(f.state.automationPreview.response.actionTrace, []);
    }
});

test('F3 valida el contenido preparado desde el primer preview y conserva el método compartido', t => {
    const f = fixture(t);
    const file = f.plan.files[2];
    const baseline = 'export class CaseScreen { public async existing() { return "baseline"; } }\n';
    fs.mkdirSync(path.join(f.root, 'screenobjects'));
    fs.writeFileSync(path.join(f.root, file.path), baseline);
    Object.assign(file, { operation: 'update', baseHash: hash(baseline) });
    fs.writeFileSync(path.join(f.pkg, 'generation-plan.json'), JSON.stringify(f.plan));
    f.draft.files[0].content = 'export class CaseScreen { public async existing() { return "repair"; } public async verify() {} }\n';
    const validator = f.deps.automationResponseValidator;
    const originalValidate = validator.validate.bind(validator);
    let checked;
    validator.validate = (scenario, plan, response, ...rest) => {
        checked = response.files[0].content;
        return originalValidate(scenario, plan, response, ...rest);
    };
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    assert.equal(checked, preview.preview.screenContent);
    assert.match(checked, /baseline/);
    assert.doesNotMatch(checked, /return "repair"/);
    assert.ok(preview.validation.warnings.some(message => message.includes('existing')));
    assert.equal(fs.readFileSync(path.join(f.root, file.path), 'utf8'), baseline);
});


test('F3 un fallo del evaluador queda diagnosticado sin impedir exportar el borrador seguro', t => {
    const f = fixture(t);
    f.deps.automationResponseValidator.validate = () => { throw new Error('Incomplete evaluator input'); };
    const preview = f.importer.prepareRecoveredDraft(f.pkg, f.draft);
    assert.equal(preview.exportReady, true, preview.exportBlockers.join(' '));
    assert.equal(preview.validation.valid, false);
    assert.ok(preview.validation.errors.some(error => error.code === 'draft-validation'));
});
