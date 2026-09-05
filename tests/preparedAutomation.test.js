const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutomationApplier, AutomationPatchWriter, AutomationMemory } = require('../dist/core/automation');

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

test('memoria revierte una promoción parcial si falla el índice', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-memory-tx-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const memory = new AutomationMemory(root);
    const scenario = { fingerprint: 'test', squad: 'payment', actions: [], request: { scenarioRows: [] } };
    const original = fs.renameSync;
    fs.renameSync = (from, to) => {
        if (to === path.join(root, 'index.json')) throw new Error('index failed');
        return original(from, to);
    };
    try {
        assert.throws(() => memory.promote(scenario, { resolutions: [] }, { files: [], actionTrace: [] }, { valid: true, qualityScore: 100 }), /index failed/);
    } finally { fs.renameSync = original; }
    assert.equal(fs.existsSync(path.join(root, 'cases/test/v1/agent-response.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'fragments.json')), false);
});

test('handler aplica el preview final y entrega esos mismos bytes a memoria y recibo', async t => {
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
    let memorized;
    const result = await applyReviewedAutomation({ state, automationApplier: f.applier,
        generatedFileRegistry: { assess: () => ({ conflicts: [] }) },
        automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }),
            toPreview: response => ({ ...f.preview, featureContent: response.files[0].content, stepContent: response.files[1].content }) },
        automationMemory: { promote: (scenario, plan, response, validation, gaps, callback) => {
            memorized = response; callback({ version: 1 }); return { version: 1 };
        } }, emitProgress: () => {},
    }, 'token', Object.fromEntries(prepared.files.map(file => [path.join(f.root, file.path), file.content])));
    assert.equal(result.success, true, result.error);
    for (const file of memorized.files) assert.equal(file.content, fs.readFileSync(path.join(f.root, file.path), 'utf8'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(packageDirectory, 'agent-response.json'))), memorized);
    assert.equal(JSON.parse(fs.readFileSync(path.join(packageDirectory, 'status.json'))).memoryVersion, 1);
    assert.equal(state.automationPreview, null);
});

test('handler rechaza errores semánticos antes de escribir o promover memoria', async t => {
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
        automationResponseValidator: { validate: () => ({ valid: true, qualityScore: 100, errors: [], warnings: [] }), toPreview: () => f.preview },
        automationMemory: { promote: () => assert.fail('must not learn invalid code') },
        emitProgress: () => {},
    }, 'token');
    assert.equal(result.success, false);
    assert.match(result.error, /TS2322/);
    assert.equal(fs.readFileSync(prepared.preview.featurePath, 'utf8'), f.original);
    assert.equal(fs.existsSync(prepared.preview.stepPath), false);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), 'original registry');
    assert.equal(JSON.parse(fs.readFileSync(path.join(packageDirectory, 'framework-compilation.json'))).status, 'failed');
    assert.ok(state.automationPreview, 'QA retains editable preview');
});
