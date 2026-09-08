const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutomationApplier, AutomationPatchWriter, AutomationHistoryStore } = require('../dist/core/automation');

function fixture(t, Applier = AutomationApplier) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-prepared-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const registryFile = path.join(root, 'registry.json');
    fs.writeFileSync(registryFile, 'original registry');
    const registry = {
        storagePath: () => registryFile,
        assess: () => ({ conflicts: [], writable: new Set() }),
        register: () => fs.writeFileSync(registryFile, 'registered'),
        registerPatch: () => {},
    };
    const applier = new Applier(new AutomationPatchWriter(), undefined, registry, root);
    const scenario = { recordingId: 'rec-a', createdAt: '2026-01-01T00:00:00Z', squad: 'payment', actions: [] };
    const original = 'Feature: Test\n  @original\n  Scenario: Existing\n    Then old result\n';
    const relative = 'features/test.feature';
    fs.mkdirSync(path.join(root, 'features'));
    fs.writeFileSync(path.join(root, relative), original);
    const response = { recordingId: 'rec-a', planId: 'plan-a', files: [
        { layer: 'feature', path: relative, content: original + '\n  @payment @android\n  Scenario: New\n    Then new result\n' },
        { layer: 'steps', path: 'features/new.steps.ts', content: "import { Then } from '@wdio/cucumber-framework';\n" },
    ] };
    const plan = { files: response.files.map(file => ({ layer: file.layer, path: file.path, operation: file.layer === 'feature' ? 'update' : 'create' })), resolutions: [] };
    const preview = { featurePath: path.join(root, relative), featureContent: response.files[0].content,
        stepPath: path.join(root, response.files[1].path), stepContent: response.files[1].content,
        files: response.files.map(file => path.join(root, file.path)) };
    return { root, registryFile, scenario, original, relative, response, plan, preview, applier };
}

test('prepare no escribe; commit aplica exactamente los bytes revisados', t => {
    const f = fixture(t);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.existsSync(p.preview.stepPath), false);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), 'original registry');
    assert.match(p.preview.featureContent, /@payment @android/);
    const repeated = f.applier.prepare(f.scenario, f.plan, p.response, p.preview);
    assert.equal(repeated.preview.featureContent, p.preview.featureContent, 'revalidar no duplica procedencia');
    f.applier.commit(p, f.scenario, f.plan);
    for (const file of p.files) assert.equal(fs.readFileSync(path.join(f.root, file.path), 'utf8'), file.content);
    assert.equal(p.response.files[0].content, p.preview.featureContent);
});

test('completion externo aparece en preview y participa en el mismo rollback', t => {
    const f = fixture(t);
    const external = 'features/external.locator.json';
    const original = JSON.stringify({ extAndroid: { button: '' }, extIos: { button: 'ios' } });
    fs.writeFileSync(path.join(f.root, external), original);
    f.scenario.actions = [{ sequence: 1, locatorValue: 'Recorded' }];
    f.plan.resolutions = [{ sequence: 1, completionTargets: [{ file: external, name: 'button', platform: 'android', block: 'extAndroid' }] }];
    f.response.completions = [{ sequence: 1, file: external, name: 'button', platform: 'android' }];
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    assert.equal(p.preview.additionalFiles.length, 1);
    assert.equal(JSON.parse(p.preview.additionalFiles[0].content).extAndroid.button, 'Recorded');
    assert.equal(fs.readFileSync(path.join(f.root, external), 'utf8'), original);
    assert.throws(() => f.applier.commit(p, f.scenario, f.plan, () => { throw new Error('failed'); }), /failed/);
    assert.equal(fs.readFileSync(path.join(f.root, external), 'utf8'), original);
});

test('preparar otra vez Screen y Steps ya revisados no cambia sus bytes', t => {
    const f = fixture(t);
    const baseline = 'class Screen {\n    public async old() {}\n}\n';
    const target = 'features/test.screen.ts';
    fs.writeFileSync(path.join(f.root, target), baseline);
    f.plan.files.push({ layer: 'screen', path: target, operation: 'update' });
    f.response.files.push({ layer: 'screen', path: target, content: 'class Screen {\n    public async old() {}\n    public async added() {\n        await this.old();\n    }\n}\n' });
    f.preview.screenPath = path.join(f.root, target);
    f.preview.files.push(f.preview.screenPath);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    const next = f.applier.prepare(f.scenario, f.plan, p.response, p.preview);
    assert.deepEqual(next.response.files, p.response.files);
});

test('un cambio externo o creación concurrente invalida el preview antes de escribir', t => {
    const f = fixture(t);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    fs.writeFileSync(p.preview.stepPath, 'QA edit');
    assert.throws(() => f.applier.commit(p, f.scenario, f.plan), /cambió después del preview/);
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.readFileSync(p.preview.stepPath, 'utf8'), 'QA edit');
});

test('Screen update conserva imports auxiliares en preview, revalidación y commit', t => {
    const f = fixture(t);
    const baseline = 'class Screen {\n    public async old() {}\n}\n';
    const target = 'features/test.screen.ts';
    fs.writeFileSync(path.join(f.root, target), baseline);
    f.plan.files.push({ layer: 'screen', path: target, operation: 'update' });
    const content = "import {\n    getTimeoutFromEnv\n} from '@common/utils/env/environment-config.js';\n" + baseline.replace('    public async old()', '    public async verify() { const timeout = getTimeoutFromEnv(); return timeout; }\n    public async old()');
    f.response.files.push({ layer: 'screen', path: target, content });
    f.preview.screenPath = path.join(f.root, target);
    f.preview.files.push(f.preview.screenPath);
    const prepared = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    assert.match(prepared.preview.screenContent, /import \{\s*getTimeoutFromEnv\s*\} from/);
    assert.match(prepared.preview.screenContent, /const timeout = getTimeoutFromEnv\(\)/);
    assert.equal(fs.readFileSync(f.preview.screenPath, 'utf8'), baseline);
    const repeated = f.applier.prepare(f.scenario, f.plan, prepared.response, prepared.preview);
    assert.equal(repeated.preview.screenContent, prepared.preview.screenContent);
    f.applier.commit(prepared, f.scenario, f.plan);
    assert.equal(fs.readFileSync(f.preview.screenPath, 'utf8'), prepared.preview.screenContent);
});

test('fallo al escribir la segunda capa restaura la primera', t => {
    class Fails extends AutomationApplier {
        writeTarget(file, content) {
            if (file.endsWith('.steps.ts')) throw new Error('disk full');
            super.writeTarget(file, content);
        }
    }
    const f = fixture(t, Fails);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    assert.throws(() => f.applier.commit(p, f.scenario, f.plan), /disk full/);
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.existsSync(p.preview.stepPath), false);
});

test('fallo de finalización restaura archivos nuevos, modificados, recibos y registry', t => {
    const f = fixture(t);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    const receipt = path.join(f.root, 'receipt.json');
    assert.throws(() => f.applier.commit(p, f.scenario, f.plan, () => {
        fs.writeFileSync(receipt, 'partial');
        throw new Error('memory failed');
    }, [receipt]), /memory failed/);
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.existsSync(p.preview.stepPath), false);
    assert.equal(fs.existsSync(receipt), false);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), 'original registry');
});

test('corrección se prepara desde baseline sin restaurarlo sobre el framework', t => {
    const f = fixture(t);
    const p = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    f.applier.commit(p, f.scenario, f.plan);
    const corrected = structuredClone(f.response);
    corrected.files[0].content = corrected.files[0].content.replace('new result', 'corrected result');
    const next = f.applier.prepare(f.scenario, f.plan, corrected, f.preview, new Map([[f.relative, f.original]]));
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), p.preview.featureContent);
    assert.match(next.preview.featureContent, /corrected result/);
    f.applier.commit(next, f.scenario, f.plan);
    assert.equal(fs.readFileSync(p.preview.featurePath, 'utf8'), next.preview.featureContent);
});

test('handler aplica el preview final y registra el recibo sin aprender del resultado', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], strict: true } }));
    f.response.files[1].content = 'export const verified: number = 1;';
    const { projectPaths } = require('../dist/core/workspace');
    const originalRoot = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.root;
    t.after(() => { projectPaths.frameworkRoot = originalRoot; });
    const { applyReviewedAutomation } = require('../dist/recorder/src/ipc/automation/applyAutomation');
    f.plan.planId = 'plan-a';
    const prepared = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    const packageDirectory = path.join(f.root, 'package');
    fs.mkdirSync(packageDirectory);
    const state = { activeAutomationPackage: packageDirectory, automationPreview: {
        token: 'token', scenario: f.scenario, plan: f.plan, response: prepared.response, prepared,
    } };
    fs.writeFileSync(path.join(packageDirectory, 'status.json'), JSON.stringify({ memoryVersion: 7 }));
    const result = await applyReviewedAutomation({ state, automationApplier: f.applier,
        generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
        automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }),
            toPreview: response => ({ ...f.preview, featureContent: response.files[0].content, stepContent: response.files[1].content }) },
        automationMemory: { promote: () => assert.fail('exportar no es aprobación golden') }, emitProgress: () => {},
    }, 'token', Object.fromEntries(prepared.files.map(file => [path.join(f.root, file.path), file.content])));
    assert.equal(result.success, true, result.error);
    const applied = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'agent-response.json')));
    for (const file of applied.files) assert.equal(file.content, fs.readFileSync(path.join(f.root, file.path), 'utf8'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(packageDirectory, 'status.json'))).memoryVersion, undefined);
    assert.equal(result.memoryVersion, undefined);
    const history = new AutomationHistoryStore(packageDirectory);
    assert.equal(history.lifecycle().export, 'exported');
    assert.equal(history.lifecycle().qaApproval, 'pending');
    assert.equal(history.lifecycle().functionalVerification, 'not-reported');
    const receipt = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'application-receipt.json')));
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.revisionId, history.current().revisionId);
    assert.ok(receipt.exportId);
    assert.equal(state.automationPreview, null);
});

test('handler exporta errores semánticos con diagnóstico sin promover memoria', async t => {
    const f = fixture(t);
    const { projectPaths } = require('../dist/core/workspace');
    const originalRoot = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.root;
    t.after(() => { projectPaths.frameworkRoot = originalRoot; });
    fs.writeFileSync(path.join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], strict: true } }));
    f.response.files[1].content = 'export const broken: number = "wrong";';
    const prepared = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    const packageDirectory = path.join(f.root, 'package');
    fs.mkdirSync(packageDirectory);
    const state = { activeAutomationPackage: packageDirectory, automationPreview: {
        token: 'token', scenario: f.scenario, plan: f.plan, response: prepared.response, prepared,
    } };
    const { applyReviewedAutomation } = require('../dist/recorder/src/ipc/automation/applyAutomation');
    const result = await applyReviewedAutomation({ state, automationApplier: f.applier,
        generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
        automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }), toPreview: () => f.preview },
        automationMemory: { promote: () => assert.fail('must not learn invalid code') },
        emitProgress: () => {},
    }, 'token');
    assert.equal(result.success, true, result.error);
    assert.equal(result.exportStatus, 'exported-with-observations');
    assert.match(result.validation.errors.map(item => item.message).join(' '), /TS2322/);
    assert.equal(fs.readFileSync(prepared.preview.stepPath, 'utf8'), f.response.files[1].content);
    assert.equal(JSON.parse(fs.readFileSync(path.join(packageDirectory, 'framework-compilation.json'))).status, 'failed');
    const history = new AutomationHistoryStore(packageDirectory);
    assert.equal(history.lifecycle().export, 'exported-with-observations');
    assert.equal(history.lifecycle().qaApproval, 'pending');
    assert.equal(history.lifecycle().generation, 'not-started');
    assert.equal(state.automationPreview, null);

});

test('fallar el evento de exportación revierte framework y recibo sin inventar éxito', async t => {
    const f = fixture(t);
    const { projectPaths } = require('../dist/core/workspace');
    const originalRoot = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.root;
    t.after(() => { projectPaths.frameworkRoot = originalRoot; });
    fs.writeFileSync(path.join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], strict: true } }));
    f.response.files[1].content = 'export const verified: number = 1;';
    f.plan.planId = 'plan-a';
    const prepared = f.applier.prepare(f.scenario, f.plan, f.response, f.preview);
    const packageDirectory = path.join(f.root, 'package');
    fs.mkdirSync(packageDirectory);
    const state = { activeAutomationPackage: packageDirectory, automationPreview: {
        token: 'token', scenario: f.scenario, plan: f.plan, response: prepared.response, prepared,
    } };
    const link = fs.linkSync;
    fs.linkSync = (source, target) => {
        if (target.includes(`${path.sep}events${path.sep}`)) {
            const event = JSON.parse(fs.readFileSync(source));
            if (event.kind === 'export-result' && event.result === 'exported') throw new Error('history disk full');
        }
        return link(source, target);
    };
    const { applyReviewedAutomation } = require('../dist/recorder/src/ipc/automation/applyAutomation');
    let result;
    try {
        result = await applyReviewedAutomation({ state, automationApplier: f.applier,
            generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
            automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }),
                toPreview: response => ({ ...f.preview, featureContent: response.files[0].content, stepContent: response.files[1].content }) },
            emitProgress: () => {},
        }, 'token');
    } finally { fs.linkSync = link; }
    assert.equal(result.success, false);
    assert.match(result.error, /history disk full/);
    assert.equal(fs.readFileSync(prepared.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.existsSync(prepared.preview.stepPath), false);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), 'original registry');
    assert.equal(fs.existsSync(path.join(packageDirectory, 'application-receipt.json')), false);
    const history = new AutomationHistoryStore(packageDirectory);
    assert.equal(history.lifecycle().export, 'failed');
    assert.equal(history.events().some(event => event.kind === 'export-result' && event.result === 'exported'), false);
});

test('importar una corrección QA conserva los bytes previos a NFC y el fallo del intento original', async t => {
    const f = fixture(t);
    const { projectPaths } = require('../dist/core/workspace');
    const { AgentRunStore } = require('../dist/core/automation');
    const originalRoot = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.root;
    t.after(() => { projectPaths.frameworkRoot = originalRoot; });
    fs.writeFileSync(path.join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], strict: true } }));
    f.response.files[1].content = 'export const verified: number = 1;';
    f.response.files[0].content += '\n# Cafe\u0301\n';
    f.response.actionTrace = [];
    f.response.resolutions = [];
    f.scenario.platform = 'android';
    f.scenario.request = { caseId: 'TC-1', scenarioRows: [] };
    f.plan.planId = 'plan-a';
    const recordingDirectory = path.join(f.root, 'recording');
    const packageDirectory = path.join(recordingDirectory, 'generation/automation');
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(path.join(recordingDirectory, 'scenario.json'), JSON.stringify(f.scenario));
    fs.writeFileSync(path.join(packageDirectory, 'scenario.json'), JSON.stringify(f.scenario));
    fs.writeFileSync(path.join(packageDirectory, 'generation-plan.json'), JSON.stringify(f.plan));
    const raw = Buffer.from(JSON.stringify(f.response));
    fs.writeFileSync(path.join(packageDirectory, 'agent-response.json'), raw);
    const history = new AutomationHistoryStore(packageDirectory);
    history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-1', source: 'recording' });
    new AgentRunStore(packageDirectory).start('rec-a', 'plan-a');
    const identity = history.identity();
    history.append({ ...identity, kind: 'generation-result', origin: 'recorder', result: 'failed' });
    const { AutomationResponseImporter } = require('../dist/recorder/src/ipc/automation/responseImport');
    const importer = new AutomationResponseImporter({ state: {}, automationApplier: f.applier,
        automationPackageBuilder: { requireTrustedScenarioPackage: () => f.scenario },
        generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
        automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }),
            toPreview: response => ({ ...f.preview, featureContent: response.files[0].content, stepContent: response.files[1].content }) },
        emitProgress: () => {},
    });
    const result = await importer.importFromPackage(packageDirectory, { manualCorrection: true });
    assert.equal(result.success, true, result.error);
    const captured = history.events().find(event => event.stage === 'import:original');
    assert.deepEqual(history.readArtifact(captured.artifacts[0]), raw);
    assert.equal(history.current().source, 'qa-edit');
    assert.equal(history.current().parentRevisionId, identity.revisionId);
    assert.equal(history.lifecycle(identity.revisionId).generation, 'failed');
    assert.equal(history.lifecycle().qaApproval, 'pending');
    assert.equal(history.events().filter(event => event.revisionId === history.current().revisionId && event.kind === 'generation-result').length, 0);
});

test('importar un envelope inválido prepara sus capas seguras para exportar', async t => {
    const f = fixture(t);
    f.scenario.request = { caseId: 'TC-1' };
    Object.assign(f.plan, { recordingId: 'rec-a', planId: 'plan-a' });
    const recordingDirectory = path.join(f.root, 'recording');
    const packageDirectory = path.join(recordingDirectory, 'generation/automation');
    fs.mkdirSync(packageDirectory, { recursive: true });
    for (const [file, value] of [[path.join(recordingDirectory, 'scenario.json'), f.scenario],
        [path.join(packageDirectory, 'scenario.json'), f.scenario],
        [path.join(packageDirectory, 'generation-plan.json'), f.plan]]) fs.writeFileSync(file, JSON.stringify(value));
    const raw = JSON.stringify({ recordingId: 'rec-a', planId: 'plan-a', files: [null, f.response.files[1]], actionTrace: [null] });
    fs.writeFileSync(path.join(packageDirectory, 'agent-response.json'), raw);
    const { AutomationResponseImporter } = require('../dist/recorder/src/ipc/automation/responseImport');
    const state = { automationPreview: { token: 'old' } };
    const { projectPaths } = require('../dist/core/workspace');
    const { AutomationResponseValidator } = require('../dist/core/validation');
    const oldRoot = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.root;
    t.after(() => { projectPaths.frameworkRoot = oldRoot; });
    const importer = new AutomationResponseImporter({ state, automationApplier: f.applier,
        generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
        automationPackageBuilder: { requireTrustedScenarioPackage: () => f.scenario },
        automationResponseValidator: new AutomationResponseValidator(),
        emitProgress() {},
    });
    const result = await importer.importFromPackage(packageDirectory);
    assert.equal(result.success, false);
    assert.match(result.error, /output-envelope/);
    assert.equal(result.draft.preview.stepContent, f.response.files[1].content);
    assert.equal(result.draft.preview.featurePath, '');
    assert.deepEqual(result.draft.missingLayers, ['feature']);
    assert.ok(result.draft.previewToken);
    assert.equal(result.draft.exportReady, true);
    assert.equal(state.automationPreview.token, result.draft.previewToken);
    assert.equal(fs.readFileSync(path.join(f.root, f.relative), 'utf8'), f.original);
    const history = new AutomationHistoryStore(packageDirectory);
    const original = history.events().find(event => event.stage === 'import:original');
    assert.equal(history.readArtifact(original.artifacts[0]).toString(), raw);
});
