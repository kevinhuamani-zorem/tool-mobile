const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { FrameworkRecoveryService, AutomationHistoryStore, AgentRunStore, createAutomationApplicationReceipt } = require('../dist/core/automation');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-f4-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (file, value) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
    const paths = { feature: 'features/payment/case.feature', steps: 'features/steps/payment/case.steps.ts',
        screen: 'screenobjects/payment/case.screen.ts', locators: 'resources/locators/payment/case.locator.json' };
    write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@screenobjects/*': ['screenobjects/*'], '@locators/*': ['resources/locators/*'], '@utils/*': ['support/utils/*'] } } }));
    const baseline = 'import locators from "@locators/payment/case.locator.json";\nexport class CaseScreen {\n    public async otherCase() { return "old other"; }\n}\nexport default new CaseScreen();\n';
    const locatorBaseline = JSON.stringify({ caseAndroid: { other: 'old-other-selector' }, caseIos: { other: '' } }, null, 2);
    const feature = 'Feature: Payment\n  Scenario Outline: [TC-400] Result\n    Then el usuario observa <amount>\n    Examples:\n      | amount |\n      | 5      |\n';
    const steps = 'import { Then } from "@wdio/cucumber-framework";\nimport caseScreen from "@screenobjects/payment/case.screen";\nThen(/^el usuario observa (.*)$/, async (amount: string) => { await caseScreen.verify(amount); });\n';
    const screen = baseline.replace('\n}\n', '\n    public async verify(amount: string) { return locators.caseAndroid.result === amount; }\n}\n');
    const locators = JSON.stringify({ caseAndroid: { other: 'old-other-selector', result: 'old-result' }, caseIos: { other: '', result: '' } }, null, 2);
    const scenario = { recordingId: 'rec-f4', request: { caseId: 'TC-400' }, actions: [{ action: 'VERIFICAR_TEXTO', sequence: 1, value: '5' }] };
    const response = { recordingId: scenario.recordingId, planId: 'plan-f4', actionTrace: [{ sequence: 1, gherkinStep: 'Then el usuario observa <amount>', screenMethod: 'verify' }], resolutions: [],
        files: Object.entries({ feature, steps, screen, locators }).map(([layer, content]) => ({ layer, path: paths[layer], content })) };
    const plan = { recordingId: scenario.recordingId, planId: response.planId, files: response.files.map(file => ({ layer: file.layer, path: file.path,
        operation: ['screen', 'locators'].includes(file.layer) ? 'update' : 'create' })) };
    const recording = 'recordings/rec-f4';
    const packageRelative = `${recording}/generation/automation`;
    const pkg = path.join(root, packageRelative);
    write(`${recording}/scenario.json`, JSON.stringify(scenario));
    write(`${recording}/actions.json`, JSON.stringify(scenario.actions));
    for (const [file, value] of Object.entries({ 'scenario.json': scenario, 'generation-plan.json': plan, 'agent-response.json': response })) write(`${packageRelative}/${file}`, JSON.stringify(value));
    response.files.forEach(file => write(file.path, file.content));
    const history = new AutomationHistoryStore(pkg);
    history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request.caseId, source: 'recording' });
    new AgentRunStore(pkg).start(scenario.recordingId, plan.planId);
    const identity = history.identity();
    history.append({ ...identity, kind: 'generation-result', origin: 'recorder', result: 'failed' });
    const prepared = { files: response.files.map(file => ({ path: file.path, content: file.content,
        before: file.layer === 'screen' ? baseline : file.layer === 'locators' ? locatorBaseline : null })),
        outcomes: [{ file: paths.screen, added: ['verify'] }, { file: paths.locators, added: ['result'] }] };
    const receipt = createAutomationApplicationReceipt(root, scenario, plan, response, history.identity(), { prepared,
        validation: { valid: false, errors: [{ code: 'x', message: 'Observation' }], warnings: [] }, generationDiagnostics: [] });
    write(`${packageRelative}/application-receipt.json`, JSON.stringify(receipt));
    history.append({ ...identity, kind: 'export-result', origin: 'qa', result: 'exported-with-observations' }, [
        { name: 'application-receipt.json', content: JSON.stringify(receipt) },
        { name: 'agent-response.json', content: JSON.stringify(response) },
        { name: 'exported-files.json', content: JSON.stringify(prepared.files) },
    ]);
    return { root, write, paths, pkg, packageRelative, recording, scenario, response, plan, baseline, receipt, history, identity,
        service: new FrameworkRecoveryService(root) };
}
function correct(f) {
    const feature = f.response.files.find(file => file.layer === 'feature').content.replace(/amount/g, 'expected').replace('| 5 ', '| 9 ');
    f.write(f.paths.feature, feature);
    f.write(f.paths.steps, f.response.files.find(file => file.layer === 'steps').content.replace(/amount/g, 'expected').replace('caseScreen.verify(', 'caseScreen.assertResult('));
    const screen = f.response.files.find(file => file.layer === 'screen').content.replace('export class', 'import { assertEqual } from "@utils/case-helper";\nexport class')
        .replace('verify(amount: string)', 'assertResult(expected: string)').replace('return locators.caseAndroid.result === amount;', 'return assertEqual(locators.caseAndroid.result, expected);')
        .replace('old other', 'FOREIGN_QA_CHANGE');
    f.write(f.paths.screen, screen);
    f.write(f.paths.locators, f.response.files.find(file => file.layer === 'locators').content.replace('old-result', 'Cafe\u0301').replace('old-other-selector', 'FOREIGN_SELECTOR'));
    f.write('support/utils/case-helper.ts', 'export function assertEqual(actual: string, expected: string) { if (actual !== expected) throw new Error("QA assertion"); }\nexport function unrelated() { return "FOREIGN_HELPER"; }\n');
}

test('F4 recupera parámetros, método renombrado, aserción, locator y helper; excluye ediciones ajenas y conserva la evidencia', t => {
    const f = fixture(t);
    correct(f);
    const actionFile = path.join(f.root, f.recording, 'actions.json');
    const evidence = fs.readFileSync(actionFile);
    const previousEventCount = f.history.events().length;
    const beforeFiles = new Map(Object.values(f.paths).map(file => [file, fs.readFileSync(path.join(f.root, file))]));
    const preview = f.service.prepare(f.pkg, { prUrl: 'https://github.com/team/mobile/pull/400', notes: 'QA corrigió la aserción' });
    assert.equal(f.history.events().length, previousEventCount, 'Comparar no crea revisiones');
    assert.deepEqual(preview.parameters, ['expected']);
    const screen = preview.files.find(file => file.layer === 'screen');
    assert.match(screen.content, /assertResult\(expected: string\)/);
    assert.match(screen.content, /assertEqual\(/);
    assert.match(screen.content, /old other/);
    assert.doesNotMatch(screen.content, /FOREIGN/);
    assert.ok(screen.changes.some(change => change.symbol === 'otherCase' && change.scope === 'unrelated'));
    const locator = preview.files.find(file => file.layer === 'locators');
    assert.match(locator.content, /Cafe\u0301/);
    assert.doesNotMatch(locator.content, /FOREIGN_SELECTOR/);
    const helper = preview.files.find(file => file.layer === 'dependency');
    assert.match(helper.content, /assertEqual/);
    assert.doesNotMatch(helper.content, /unrelated|FOREIGN_HELPER/);
    assert.ok(preview.relations.some(link => link.to.symbol === 'assertResult'));
    assert.ok(preview.relations.some(link => link.kind === 'locator' && link.to.symbol === 'caseAndroid.result'));
    assert.equal(preview.traceAssociations[0].status, 'pending', 'Una edición no inventa equivalencia con un evento grabado');
    const result = f.service.save(f.pkg, preview.token);
    assert.equal(result.recordingId, f.scenario.recordingId);
    const current = f.history.current();
    assert.equal(current.revisionId, result.revisionId);
    assert.equal(current.parentRevisionId, f.identity.revisionId);
    assert.equal(current.basedOnAttemptId, f.identity.attemptId);
    assert.equal(current.source, 'framework-import');
    assert.equal(f.history.lifecycle(f.identity.revisionId).generation, 'failed');
    assert.equal(f.history.lifecycle().qaApproval, 'pending');
    assert.equal(f.history.lifecycle().functionalVerification, 'not-reported');
    const saved = fs.readFileSync(path.join(f.pkg, 'framework-recovery.json'), 'utf8');
    assert.doesNotMatch(saved, /FOREIGN/);
    assert.equal(JSON.parse(saved).context.prUrl, 'https://github.com/team/mobile/pull/400');
    assert.deepEqual(JSON.parse(saved).recordedTrace, f.response.actionTrace);
    assert.deepEqual(fs.readFileSync(actionFile), evidence);
    for (const [file, bytes] of beforeFiles) assert.deepEqual(fs.readFileSync(path.join(f.root, file)), bytes);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.pkg, 'agent-response.json'))).files[2].content, f.response.files[2].content);
    assert.throws(() => f.service.save(f.pkg, preview.token), /cambió/);
    assert.equal(new AutomationHistoryStore(f.pkg).current().revisionId, result.revisionId, 'Reabrir conserva la revisión');
});

test('F4 sigue las cuatro rutas movidas mediante caseId, expresión Gherkin e imports, sin usar basename', t => {
    const f = fixture(t);
    const renamed = { feature: 'features/new/another.feature', steps: 'features/steps/new/unrelated-name.ts',
        screen: 'screenobjects/new/actions.ts', locators: 'resources/locators/new/selectors.json' };
    for (const file of f.response.files) {
        const content = file.content.replace('@screenobjects/payment/case.screen', '@screenobjects/new/actions')
            .replace('@locators/payment/case.locator.json', '@locators/new/selectors.json');
        f.write(renamed[file.layer], content);
        fs.unlinkSync(path.join(f.root, file.path));
    }
    const preview = f.service.prepare(f.pkg);
    for (const [layer, file] of Object.entries(renamed)) {
        const recovered = preview.files.find(item => item.layer === layer);
        assert.equal(recovered.path, file);
        assert.equal(recovered.previousPath, f.paths[layer]);
        assert.notEqual(recovered.current, null);
    }
    assert.equal(preview.pending.filter(item => item.id.startsWith('path:')).length, 0);
    f.service.save(f.pkg, preview.token);
});

test('F4 permite guardar asociaciones pendientes y resolver rutas explícitamente sin inventar archivos', t => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.root, f.paths.feature));
    const original = f.response.files[0].content;
    f.write('features/one.feature', original);
    f.write('features/two.feature', original);
    const ambiguous = f.service.prepare(f.pkg);
    assert.ok(ambiguous.pending.some(item => item.id === `path:${f.paths.feature}` && item.candidates.length === 2));
    f.service.save(f.pkg, ambiguous.token);
    const explicit = f.service.prepare(f.pkg, { paths: { [f.paths.feature]: 'features/two.feature' } });
    assert.equal(explicit.files.find(file => file.layer === 'feature').path, 'features/two.feature');
    assert.equal(explicit.files.find(file => file.layer === 'feature').association, 'qa');
    assert.throws(() => f.service.prepare(f.pkg, { paths: { 'unrelated.ts': 'features/one.feature' } }), /ajena al caso/);
});

test('F4 rechaza cambios concurrentes en código, recibo, token y revisión antes de guardar', t => {
    const f = fixture(t);
    let preview = f.service.prepare(f.pkg);
    f.write(f.paths.steps, 'QA cambió después de comparar');
    assert.throws(() => f.service.save(f.pkg, preview.token), /Cambió/);
    assert.equal(fs.existsSync(path.join(f.pkg, 'framework-recovery.json')), false);
    f.write(f.paths.steps, f.response.files[1].content);
    preview = f.service.prepare(f.pkg);
    assert.throws(() => f.service.save(f.pkg, 'otro token'), /cambió/);
    f.history.beginRevision({ recordingId: f.scenario.recordingId, source: 'qa-edit' });
    assert.throws(() => f.service.save(f.pkg, preview.token), /revisión.*cambió/);
    preview = f.service.prepare(f.pkg);
    f.write(`${f.packageRelative}/application-receipt.json`, JSON.stringify({ ...f.receipt, exportId: 'other' }));
    assert.throws(() => f.service.save(f.pkg, preview.token), /Cambió/);
});

test('F4 no sigue symlinks, paths fuera del framework ni PR con credenciales', t => {
    const f = fixture(t);
    assert.throws(() => f.service.prepare(f.pkg, { paths: { [f.paths.feature]: '../outside.feature' } }), /Ruta no permitida/);
    assert.throws(() => f.service.prepare(f.pkg, { prUrl: 'https://user:secret@example.com/pull/1' }), /sin credenciales/);
    fs.unlinkSync(path.join(f.root, f.paths.screen));
    fs.symlinkSync('/etc/hosts', path.join(f.root, f.paths.screen));
    assert.throws(() => f.service.prepare(f.pkg), /Symlink/);
});

test('F4 revierte la vista mutable si falla la publicación de la revisión histórica', t => {
    const f = fixture(t);
    const preview = f.service.prepare(f.pkg);
    const count = f.history.events().length;
    const link = fs.linkSync;
    fs.linkSync = (from, to) => { if (to.includes(`${path.sep}events${path.sep}`)) throw new Error('history full'); return link(from, to); };
    try { assert.throws(() => f.service.save(f.pkg, preview.token), /history full/); } finally { fs.linkSync = link; }
    assert.equal(f.history.events().length, count);
    assert.equal(fs.existsSync(path.join(f.pkg, 'framework-recovery.json')), false);
    assert.equal(fs.readFileSync(path.join(f.root, f.paths.screen), 'utf8'), f.response.files[2].content);
});

test('F4 registra repo/rama/commit y cambios sin commit sin necesitar remoto ni PR', t => {
    const f = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', f.root, ...args], { stdio: 'pipe', encoding: 'utf8' }).trim();
    git('init', '-b', 'qa-f4'); git('add', 'features', 'screenobjects', 'resources', 'tsconfig.json');
    git('-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    const commit = git('rev-parse', 'HEAD');
    correct(f);
    const preview = f.service.prepare(f.pkg);
    assert.equal(preview.context.branch, 'qa-f4');
    assert.equal(preview.context.commit, commit);
    assert.equal(preview.context.dirty, true);
    assert.equal(preview.context.prUrl, undefined);
    assert.equal(fs.realpathSync(preview.context.repository), fs.realpathSync(f.root));
    f.service.save(f.pkg, preview.token);
});

test('F4 conserva asociación y PR al reabrir y crea otra revisión con nuevas correcciones', t => {
    const f = fixture(t);
    fs.renameSync(path.join(f.root, f.paths.feature), path.join(f.root, 'features/renamed.feature'));
    const first = f.service.prepare(f.pkg, { paths: { [f.paths.feature]: 'features/renamed.feature' }, prUrl: 'https://example.test/mobile/pull/1' });
    const saved = f.service.save(f.pkg, first.token);
    f.write('features/renamed.feature', f.response.files[0].content.replace('| 5 ', '| 8 '));
    const reopened = new FrameworkRecoveryService(f.root);
    const second = reopened.prepare(f.pkg);
    assert.equal(second.context.prUrl, first.context.prUrl);
    assert.equal(second.files.find(file => file.layer === 'feature').association, 'qa');
    reopened.save(f.pkg, second.token);
    assert.equal(f.history.current().parentRevisionId, saved.revisionId);
});

test('F4 detecta un checkout distinto aun con los mismos bytes', t => {
    const f = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', f.root, ...args], { stdio: 'pipe', encoding: 'utf8' }).trim();
    git('init', '-b', 'qa-before');
    git('add', 'features'); git('-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    const preview = f.service.prepare(f.pkg);
    git('checkout', '-b', 'qa-after');
    assert.throws(() => f.service.save(f.pkg, preview.token), /checkout cambió/);
});

test('F4 recupera un recibo parcial v2 anterior sin exigir cuatro capas ni inventar su baseline', t => {
    const f = fixture(t);
    const response = { ...f.response, files: [f.response.files[2]] };
    const receipt = { ...f.receipt, exportId: 'legacy-f3-export', responseHash: hash(JSON.stringify(response)), files: [f.receipt.files[2]] };
    delete receipt.files[0].beforeHash;
    f.write(`${f.packageRelative}/application-receipt.json`, JSON.stringify(receipt));
    f.write(`${f.packageRelative}/agent-response.json`, JSON.stringify(response));
    const preview = f.service.prepare(f.pkg);
    const screen = preview.files.find(file => file.layer === 'screen');
    assert.equal(screen.baseline, undefined);
    assert.ok(preview.pending.some(item => item.id === `baseline:${f.paths.screen}`));
    assert.ok(preview.pending.some(item => item.id === 'layer:feature'));
    f.service.save(f.pkg, preview.token);
});

test('F4 el IPC recupera un caso retomado sin dispositivo y rechaza un cambio de contexto', t => {
    const f = fixture(t);
    const { projectPaths } = require('../dist/core/workspace');
    const { FrameworkRecoveryController } = require('../dist/recorder/src/ipc/automation/frameworkRecovery');
    const original = { frameworkRoot: projectPaths.frameworkRoot, recordings: projectPaths.recordings };
    Object.assign(projectPaths, { frameworkRoot: f.root, recordings: path.join(f.root, 'recordings') });
    t.after(() => Object.assign(projectPaths, original));
    const state = { sessionActive: false, activeSquad: 'payment', activeEnvironment: 'qa', activeAutomationPackage: '' };
    const controller = new FrameworkRecoveryController({ state, recordingCoverageAnalyzer: { findRecordingDirectory: (squad, id, environment) => {
        assert.deepEqual([squad, id, environment], ['payment', 'rec-f4', 'qa']); return path.join(f.root, f.recording);
    } } });
    const preview = controller.prepare({ recordingId: 'rec-f4' });
    state.activeEnvironment = 'uat';
    assert.throws(() => controller.save(preview.preview.token), /contexto cambió/);
    state.activeEnvironment = 'qa';
    const result = controller.save(preview.preview.token);
    assert.equal(result.success, true);
    assert.equal(state.sessionActive, false);
    assert.throws(() => controller.prepare({ paths: [] }), /Asociaciones inválidas/);
});

test('F4 la interfaz compara, muestra pendientes y permite guardar sin aprobar golden', async t => {
    const f = fixture(t);
    correct(f);
    const { installFakeBrowserGlobals } = require('./helpers/fakeDom');
    const fake = installFakeBrowserGlobals(); t.after(() => fake.restore());
    const { createFrameworkRecoveryFeature } = await import('../recorder/renderer/src/features/framework-recovery/frameworkRecoveryFeature.js');
    const feature = createFrameworkRecoveryFeature({ getSquad: () => 'payment', api: {
        getExistingScenarios: async () => ({ success: true, scenarios: [{ id: 'rec-f4', caseId: 'TC-400', name: 'Result' }] }),
        previewFrameworkRecovery: async input => ({ success: true, preview: f.service.prepare(f.pkg, input) }),
        saveFrameworkRecovery: async token => ({ success: true, result: f.service.save(f.pkg, token) }),
    } });
    feature.mount();
    await feature.open('rec-f4');
    assert.equal(fake.document.getElementById('frameworkRecoveryModal').style.display, 'flex');
    await feature.preview();
    assert.equal(fake.document.getElementById('btnSaveFrameworkRecovery').disabled, false);
    assert.match(fake.document.getElementById('frameworkRecoveryFiles').innerHTML, /Cambio ajeno, no se guardará/);
    assert.match(fake.document.getElementById('frameworkRecoveryPending').innerHTML, /Acción grabada/);
    await feature.persist();
    assert.match(fake.document.getElementById('lblFrameworkRecoveryStatus').textContent, /Revisión QA guardada/);
    assert.equal(fake.document.getElementById('btnSaveFrameworkRecovery').disabled, true);
    assert.equal(f.history.lifecycle().qaApproval, 'pending');
    feature.unmount();
    assert.equal(fake.document.getElementById('btnSaveFrameworkRecovery').listenerCount(), 0);
});

test('F4 un Feature compartido conserva tags del caso y excluye cambios en otro Scenario', () => {
    const { projectRecoveryFile } = require('../dist/core/automation/infrastructure/frameworkRecovery/inspection');
    const before = 'Feature: Payment\n  @other\n  Scenario: Other\n    Then old unrelated\n\n  @case\n  Scenario Outline: [TC-400] Result\n    Then el usuario observa <amount>\n    Examples:\n      | amount |\n      | 5      |\n';
    const current = before.replace('@case', '@case @qa').replace('old unrelated', 'FOREIGN_SCENARIO').replace('| 5 ', '| 8 ');
    const result = projectRecoveryFile('feature', before, current, new Set(['[TC-400] Result']), true);
    assert.match(result.content, /@case @qa/);
    assert.match(result.content, /\| 8/);
    assert.doesNotMatch(result.content, /FOREIGN_SCENARIO/);
    assert.match(result.content, /old unrelated/);
    assert.ok(result.changes.some(change => change.symbol === 'Other' && change.scope === 'unrelated'));
});

test('F4 declara pendientes los cambios de estructura o sintaxis que no puede aislar en un módulo compartido', () => {
    const { projectRecoveryFile } = require('../dist/core/automation/infrastructure/frameworkRecovery/inspection');
    const before = 'export class Before { public async verify() { return true; } }';
    const renamed = projectRecoveryFile('screen', before, before.replace('class Before', 'class After'), new Set(['verify']), true);
    assert.match(renamed.problem, /estructurales/);
    const broken = projectRecoveryFile('screen', before, 'export class After { verify(', new Set(['verify']), true);
    assert.ok(broken.problem);
    assert.equal(broken.content, before);
    const associated = projectRecoveryFile('screen', before, 'export class After { verify(', new Set(['*']), true);
    assert.equal(associated.content, 'export class After { verify(');
});

test('F4 marca require y llamadas calculadas como pendientes sin ejecutar código del framework', t => {
    const f = fixture(t);
    const current = f.response.files[2].content.replace('return locators.caseAndroid.result === amount;', 'const helper = require("@utils/runtime-helper"); return this[helper.method](amount);');
    f.write(f.paths.screen, current);
    f.write('support/utils/runtime-helper.ts', 'throw new Error("NO EJECUTAR"); export const method = "otherCase";');
    const preview = f.service.prepare(f.pkg);
    assert.ok(preview.pending.some(item => item.id.startsWith('dynamic-import:')));
    assert.ok(preview.pending.some(item => item.id.startsWith('computed:')));
    f.service.save(f.pkg, preview.token);
    assert.equal(f.history.lifecycle().qaApproval, 'pending');
});

test('F4 conserva imports de tipos y sus declaraciones alcanzadas sin incluir tipos ajenos', t => {
    const f = fixture(t);
    correct(f);
    f.write('support/utils/case-helper.ts', 'import type { Amount } from "./case-types";\nexport function assertEqual(actual: Amount, expected: Amount) { return actual === expected; }\n');
    f.write('support/utils/case-types.ts', 'export type Amount = string;\nexport interface Unrelated { foreign: "FOREIGN_TYPE" }\n');
    const preview = f.service.prepare(f.pkg);
    const helper = preview.files.find(file => file.path === 'support/utils/case-helper.ts');
    const types = preview.files.find(file => file.path === 'support/utils/case-types.ts');
    assert.match(helper.content, /import type \{ Amount \}/);
    assert.match(types.content, /export type Amount = string/);
    assert.doesNotMatch(types.content, /FOREIGN_TYPE|Unrelated/);
    assert.ok(preview.relations.some(link => link.kind === 'import' && link.to.symbol === 'Amount'));
    f.service.save(f.pkg, preview.token);
});
