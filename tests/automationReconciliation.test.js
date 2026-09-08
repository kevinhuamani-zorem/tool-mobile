const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { projectPaths } = require('../dist/core/workspace');
const { AutomationPackageBuilder, AutomationApplier, GeneratedFileRegistry, AutomationHistoryStore, AgentRunStore,
    DeterministicResolver, createAutomationApplicationReceipt, loadFrameworkBaseline, planForReconciliation, mergeFrameworkText } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { AutomationResponseImporter } = require('../dist/recorder/src/ipc/automation/responseImport');
const { applyReviewedAutomation } = require('../dist/recorder/src/ipc/automation/applyAutomation');
const { RecordingCoverageAnalyzer } = require('../dist/core/coverage');
const catalog = { getCatalog: (squad, platform) => ({ squad, platform, stepDefinitions: [], screenMethods: [], locators: [], features: [] }) };
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-f5-'));
    const original = { frameworkRoot: projectPaths.frameworkRoot, toolConfig: projectPaths.toolConfig };
    projectPaths.frameworkRoot = root; projectPaths.toolConfig = path.join(root, 'config');
    t.after(() => { Object.assign(projectPaths, original); fs.rmSync(root, { recursive: true, force: true }); });
    const write = (file, content) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    write('tsconfig.json', JSON.stringify({ compilerOptions: { types: [], baseUrl: '.', paths: { '@screenobjects/*': ['screenobjects/*'], '@locators/*': ['resources/locators/*'], '@utils/*': ['support/utils/*'] } } }));
    const scenario = { schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-f5', revision: 1, fingerprint: 'fp-f5',
        createdAt: '2026-09-08T12:00:00Z', squad: 'payment', platform: 'android', environment: 'qa', objective: 'Consultar resultado', acceptanceCriteria: 'Se muestra el resultado',
        request: { squad: 'payment', featureName: 'Resultado', scenarioName: 'Resultado', fileName: 'case', locatorModule: 'case', caseId: 'TC-500', pathType: 'Happy Path', tag: 'payment', platform: 'android' },
        actions: [{ action: 'VERIFICAR_EXISTE', sequence: 1, selector: 'id=result', selectorVerified: true, contextHint: 'resultado' }] };
    const resolved = new DeterministicResolver(catalog).resolve(scenario);
    const paths = { feature: 'features/payment/case.feature', steps: 'features/steps/payment/case.steps.ts', screen: 'screenobjects/payment/case.screen.ts', locators: 'resources/locators/payment/case.locator.json' };
    const beforeScreen = 'import locators from "@locators/payment/case.locator.json";\nexport class CaseScreen {\n    public async foreign() { return "foreign-original"; }\n}\nexport default new CaseScreen();\n';
    const contents = { feature: 'Feature: Resultado\n  Scenario: [TC-500] Resultado\n    Then el usuario observa el resultado\n',
        steps: 'import { Then } from "@wdio/cucumber-framework";\nimport caseScreen from "@screenobjects/payment/case.screen";\nThen(/^el usuario observa el resultado$/, async () => { await caseScreen.verify(); });\n',
        screen: beforeScreen.replace('\n}\n', '\n    public async verify() {\n        const actual = locators.caseAndroid.result;\n        return actual === "5";\n    }\n}\n'),
        locators: JSON.stringify({ caseAndroid: { result: 'result', foreign: 'foreign-original' }, caseIos: { result: '' } }, null, 2) + '\n' };
    const plan = { ...resolved.plan, files: Object.entries(paths).map(([layer, file]) => ({ layer, path: file, operation: ['screen', 'locators'].includes(layer) ? 'update' : 'create' })) };
    const response = { schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId, files: Object.entries(contents).map(([layer, content]) => ({ layer, path: paths[layer], content })),
        resolutions: [], actionTrace: [{ sequence: 1, gherkinStep: 'Then el usuario observa el resultado', screenMethod: 'verify', locatorName: 'result' }] };
    const recording = path.join(root, 'recordings/rec-f5'); const pkg = path.join(recording, 'generation/automation');
    write('recordings/rec-f5/scenario.json', JSON.stringify(resolved.scenario)); write('recordings/rec-f5/actions.json', JSON.stringify(scenario.actions));
    fs.mkdirSync(pkg, { recursive: true });
    const json = (name, value) => fs.writeFileSync(path.join(pkg, name), JSON.stringify(value));
    json('scenario.json', resolved.scenario); json('generation-plan.json', plan); json('agent-response.json', response);
    json('validation.json', { valid: false, qualityScore: 0, errors: [], warnings: [] });
    for (const file of response.files) write(file.path, file.content);
    const history = new AutomationHistoryStore(pkg); history.ensureRevision(scenario.recordingId, scenario.request.caseId);
    new AgentRunStore(pkg).start(scenario.recordingId, plan.planId);
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'failed' });
    const prepared = { files: response.files.map(file => ({ path: file.path, content: file.content, before: file.layer === 'screen' ? beforeScreen : file.layer === 'locators' ? '{"caseAndroid":{"foreign":"foreign-original"}}' : null })),
        outcomes: [{ file: paths.screen, added: ['verify'] }, { file: paths.locators, added: ['result'] }] };
    const receipt = createAutomationApplicationReceipt(root, resolved.scenario, plan, response, history.identity(), { prepared, validation: { valid: false, errors: [], warnings: [] }, generationDiagnostics: ['Dos pasadas agotadas'] });
    json('application-receipt.json', receipt);
    history.append({ ...history.identity(), kind: 'export-result', origin: 'qa', result: 'exported-with-observations' }, [
        { name: 'application-receipt.json', content: JSON.stringify(receipt) }, { name: 'agent-response.json', content: JSON.stringify(response) }, { name: 'exported-files.json', content: JSON.stringify(prepared.files) }]);
    const registry = new GeneratedFileRegistry(); const applier = new AutomationApplier(undefined, undefined, registry, root);
    const builder = new AutomationPackageBuilder(new DeterministicResolver(catalog), undefined, undefined, undefined, root);
    const state = { activeAutomationPackage: pkg, automationPreview: null };
    const deps = { state, automationPackageBuilder: builder, automationApplier: applier, generatedFileRegistry: registry, automationResponseValidator: new AutomationResponseValidator(undefined, catalog), emitProgress() {}, automationMemory: { promote() { assert.fail('No approval'); } } };
    const importer = new AutomationResponseImporter(deps);
    return { root, paths, scenario: resolved.scenario, plan, response, pkg, recording, contents, write, read, json, history, registry, applier, builder, importer, deps, state };
}
function proposal(f, edit = files => files) {
    const plan = JSON.parse(fs.readFileSync(path.join(f.pkg, 'generation-plan.json')));
    const baseline = JSON.parse(fs.readFileSync(path.join(f.pkg, 'baseline-response.json')));
    const response = { schemaVersion: 1, recordingId: plan.recordingId, planId: plan.planId, files: edit(baseline.files), actionTrace: baseline.actionTrace,
        resolutions: [{ gapId: 'gap-regeneration-refinement', decision: 'create', reason: 'Refinamiento QA' }] };
    f.json('agent-response.json', response); return { plan, response };
}

test('F5 combina cambios no solapados y conserva un conflicto real con sus tres versiones', () => {
    const base = 'a\nb\nc\nd\ne\nf\ng\n';
    assert.deepEqual(mergeFrameworkText(base, base.replace('a\n', 'AGENT\n'), base.replace('g\n', 'QA\n')), { content: 'AGENT\nb\nc\nd\ne\nf\nQA\n', conflict: false });
    const conflict = mergeFrameworkText(base, base.replace('b\n', 'AGENT\n'), base.replace('b\n', 'QA\n'));
    assert.equal(conflict.conflict, true); assert.match(conflict.content, /PROPUESTA/); assert.match(conflict.content, /BASELINE_QA/); assert.match(conflict.content, /FRAMEWORK/);
});

test('F5 ejecuta dos ciclos con correcciones QA, PR, renombres, cambio de rama y código compartido intacto', async t => {
    const f = fixture(t);
    f.write(f.paths.screen, f.read(f.paths.screen).replace('verify()', 'assertResult()').replace('"5"', '"9"').replace('foreign-original', 'foreign-QA'));
    f.write(f.paths.steps, f.read(f.paths.steps).replace('verify()', 'assertResult()'));
    f.write(f.paths.locators, f.read(f.paths.locators).replace('foreign-original', 'foreign-QA'));
    const { FrameworkRecoveryService } = require('../dist/core/automation');
    const recovery = new FrameworkRecoveryService(f.root); const preview = recovery.prepare(f.pkg, { prUrl: 'https://github.com/team/mobile/pull/500' }); recovery.save(f.pkg, preview.token);
    execFileSync('git', ['init', '-q', f.root]);
    execFileSync('git', ['-C', f.root, 'symbolic-ref', 'HEAD', 'refs/heads/qa-review']);
    const evidence = f.read('recordings/rec-f5/actions.json');
    for (let cycle = 1; cycle <= 2; cycle++) {
        if (cycle === 2) execFileSync('git', ['-C', f.root, 'symbolic-ref', 'HEAD', 'refs/heads/after-merge']);
        f.builder.prepareRegeneration(f.recording, `Mejora ${cycle}`);
        const baseline = JSON.parse(fs.readFileSync(path.join(f.pkg, 'baseline-response.json')));
        assert.match(baseline.files.find(file => file.layer === 'screen').content, /assertResult/);
        assert.match(baseline.files.find(file => file.layer === 'screen').content, /"9"/);
        const { plan } = proposal(f, files => files.map(file => file.layer === 'screen' ? { ...file, content: file.content.replace('const actual =', `// improvement ${cycle}\n        const actual =`) } : file));
        const saved = loadFrameworkBaseline(f.pkg, plan);
        assert.equal(saved.context.prUrl, 'https://github.com/team/mobile/pull/500');
        assert.equal(saved.context.branch, cycle === 1 ? 'qa-review' : 'after-merge');
        f.write(f.paths.screen, f.read(f.paths.screen).replace('foreign-QA', `foreign-QA-${cycle}`));
        const imported = await f.importer.importFromPackage(f.pkg, { trackRepair: false });
        assert.equal(imported.exportReady, true, JSON.stringify(imported.exportBlockers));
        const result = await applyReviewedAutomation(f.deps, imported.previewToken);
        assert.equal(result.success, true, result.error);
        assert.match(f.read(f.paths.screen), new RegExp(`improvement ${cycle}`));
        assert.match(f.read(f.paths.screen), /assertResult/); assert.match(f.read(f.paths.screen), /"9"/);
        assert.match(f.read(f.paths.screen), new RegExp(`foreign-QA-${cycle === 1 ? '1' : '2-1'}`));
        assert.equal((f.read(f.paths.feature).match(/Scenario:/g) || []).length, 1);
        assert.equal(f.history.lifecycle().qaApproval, 'pending');
    }
    assert.equal(f.read('recordings/rec-f5/actions.json'), evidence);
    assert.equal(f.history.events().find(event => event.kind === 'generation-result').result, 'failed');
});

test('F5 muestra conflicto en IPC, permite resolver en editor y rechaza cambios concurrentes después de revisión', async t => {
    const f = fixture(t); f.builder.prepareRegeneration(f.recording, 'Cambiar el resultado');
    proposal(f, files => files.map(file => file.layer === 'screen' ? { ...file, content: file.content.replace('"5"', '"AGENT"') } : file));
    f.write(f.paths.screen, f.read(f.paths.screen).replace('"5"', '"QA"'));
    const result = await f.importer.importFromPackage(f.pkg, { trackRepair: false });
    assert.equal(result.exportReady, false); assert.match(result.draft.preview.screenContent, /<<<<<<< PROPUESTA/);
    assert.equal((await applyReviewedAutomation(f.deps, '')).success, false);
    const resolved = f.read(f.paths.screen).replace('"QA"', '"ACCEPTED"');
    const reviewed = await f.importer.importFromPackage(f.pkg, { trackRepair: false, reviewedContents: { [path.join(f.root, f.paths.screen)]: resolved } });
    assert.equal(reviewed.exportReady, true, JSON.stringify(reviewed.exportBlockers));
    f.write(f.paths.screen, f.read(f.paths.screen) + '// concurrent\n');
    const failed = await applyReviewedAutomation(f.deps, reviewed.previewToken);
    assert.equal(failed.success, false); assert.match(failed.error, /después del preview/);
    assert.match(f.read(f.paths.screen), /"QA"/);
});

test('F5 recupera rutas movidas y la regrabación conserva identidad y nuevas acciones', t => {
    const f = fixture(t);
    const moved = 'screenobjects/payment/renamed.screen.ts'; f.write(moved, f.read(f.paths.screen)); fs.unlinkSync(path.join(f.root, f.paths.screen));
    f.write(f.paths.steps, f.read(f.paths.steps).replace('payment/case.screen', 'payment/renamed.screen'));
    const recording = { ...f.scenario, revision: 2, actions: [...f.scenario.actions, { ...f.scenario.actions[0], sequence: 2 }] };
    f.write('recordings/rec-f5/scenario.json', JSON.stringify(recording));
    const result = f.builder.prepare(recording, f.recording);
    const plan = JSON.parse(fs.readFileSync(path.join(f.pkg, 'generation-plan.json')));
    assert.equal(result.recordingId, f.scenario.recordingId); assert.equal(plan.files.find(file => file.layer === 'screen').path, moved);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.pkg, 'scenario.json'))).actions.length, 2);
    assert.equal(f.history.current().source, 'regeneration');
    assert.equal(plan.resolutions.length, 2);
    assert.ok(plan.reconciliation);
});

test('F5 detecta alteración del baseline histórico y checkout cambiado después del preview', t => {
    const f = fixture(t); f.builder.prepareRegeneration(f.recording, 'Ajustar');
    const { plan, response } = proposal(f);
    const baseline = loadFrameworkBaseline(f.pkg, plan);
    f.json('framework-baseline.json', { ...baseline, files: [] });
    f.history.checkpoint('before-layered-execution');
    assert.deepEqual(loadFrameworkBaseline(f.pkg, plan).files, baseline.files, 'Ni la vista mutable ni un checkpoint posterior autorizan sobrescrituras');
    execFileSync('git', ['init', '-q', f.root]);
    const currentPlan = planForReconciliation(f.root, plan, baseline);
    const prepared = f.applier.prepare(f.scenario, currentPlan, response, f.deps.automationResponseValidator.toPreview(response), new Map(), { baseline });
    execFileSync('git', ['-C', f.root, 'symbolic-ref', 'HEAD', 'refs/heads/another']);
    assert.throws(() => f.applier.commit(prepared, f.scenario, currentPlan), /checkout cambió/);
    const artifact = f.history.events().flatMap(event => event.artifacts).find(item => item.name === 'framework-baseline.json');
    const blob = path.join(f.pkg, 'history/v1/blobs', artifact.sha256);
    // Locate the persisted blob by its public artifact reference rather than guessing storage names.
    assert.ok(artifact);
    assert.throws(() => loadFrameworkBaseline(f.pkg, { ...plan, reconciliation: { revisionId: 'other' } }), /ajeno/);
    fs.writeFileSync(blob, '{}');
    assert.throws(() => loadFrameworkBaseline(f.pkg, plan), /alterado/);
});

test('F5 reexporta rutas renombradas y permite recuperar de nuevo las asociaciones heredadas', async t => {
    const f = fixture(t);
    const { FrameworkRecoveryService } = require('../dist/core/automation');
    const moved = 'screenobjects/payment/reviewed.screen.ts'; f.write(moved, f.read(f.paths.screen)); fs.unlinkSync(path.join(f.root, f.paths.screen));
    f.write(f.paths.steps, f.read(f.paths.steps).replace('payment/case.screen', 'payment/reviewed.screen'));
    const service = new FrameworkRecoveryService(f.root);
    const recovery = service.prepare(f.pkg, { paths: { [f.paths.screen]: moved } }); service.save(f.pkg, recovery.token);
    for (let cycle = 0; cycle < 2; cycle++) {
        f.builder.prepareRegeneration(f.recording, 'Conservar la ruta vigente'); proposal(f);
        const imported = await f.importer.importFromPackage(f.pkg, { trackRepair: false });
        assert.equal(imported.exportReady, true, JSON.stringify(imported.exportBlockers));
        const applied = await applyReviewedAutomation(f.deps, imported.previewToken); assert.equal(applied.success, true, applied.error);
        assert.equal(fs.existsSync(path.join(f.root, f.paths.screen)), false);
        assert.equal(JSON.parse(fs.readFileSync(path.join(f.pkg, 'application-receipt.json'))).files.find(file => file.path === moved).operation, 'update');
    }
});

test('F5 conserva métodos y locators ajenos aunque el agente entregue versiones antiguas', t => {
    const f = fixture(t); f.builder.prepareRegeneration(f.recording, 'Mejorar'); const { plan, response } = proposal(f);
    const baseline = loadFrameworkBaseline(f.pkg, plan);
    response.files.find(file => file.layer === 'screen').content = response.files.find(file => file.layer === 'screen').content.replace('foreign-original', 'agent-foreign-change').replace('"5"', '"7"');
    response.files.find(file => file.layer === 'locators').content = response.files.find(file => file.layer === 'locators').content.replace('foreign-original', 'agent-foreign-selector');
    const currentPlan = planForReconciliation(f.root, plan, baseline);
    const prepared = f.applier.prepare(f.scenario, currentPlan, response, f.deps.automationResponseValidator.toPreview(response), new Map(), { baseline });
    assert.match(prepared.preview.screenContent, /foreign-original/); assert.match(prepared.preview.screenContent, /"7"/);
    assert.doesNotMatch(prepared.preview.locatorContent, /agent-foreign/);
    assert.throws(() => f.applier.prepare(f.scenario, currentPlan, response, f.deps.automationResponseValidator.toPreview(response), new Map(), { baseline, reviewed: true }), /ajenos/);
});

test('F5 admite regenerar una exportación parcial y conserva borradores fallidos exportables', async t => {
    const f = fixture(t);
    // Build a legitimate F3 partial export with its own receipt/history, not a forged receipt.
    const partial = { ...f.response, files: f.response.files.filter(file => file.layer === 'screen') };
    const prepared = { files: [{ path: f.paths.screen, content: partial.files[0].content, before: null }], outcomes: [] };
    const receipt = createAutomationApplicationReceipt(f.root, f.scenario, f.plan, partial, f.history.identity(), { prepared, validation: { valid: false, errors: [], warnings: [] }, generationDiagnostics: ['missing layers'] });
    f.json('agent-response.json', partial); f.json('application-receipt.json', receipt);
    f.history.append({ ...f.history.identity(), kind: 'export-result', origin: 'qa', result: 'exported-with-observations' }, [
        { name: 'agent-response.json', content: JSON.stringify(partial) }, { name: 'application-receipt.json', content: JSON.stringify(receipt) }, { name: 'exported-files.json', content: JSON.stringify(prepared.files) }]);
    for (const layer of ['feature', 'steps', 'locators']) fs.unlinkSync(path.join(f.root, f.paths[layer]));
    const analyzer = new RecordingCoverageAnalyzer(path.join(f.root, 'recordings'), f.root, path.join(f.root, 'resources/locators'));
    assert.equal(analyzer.listRecordings('payment')[0].canRegenerate, true);
    f.builder.prepareRegeneration(f.recording, 'Completar faltantes');
    const { plan } = proposal(f);
    assert.equal(plan.files.filter(file => file.operation === 'create').length, 3);
    const draft = { files: [{ ...partial.files[0], origin: 'agent', pass: 2 }], missingLayers: ['feature', 'steps', 'locators'], diagnostics: ['2 pasadas'] };
    const imported = f.importer.prepareRecoveredDraft(f.pkg, draft);
    assert.equal(imported.exportReady, true, JSON.stringify(imported.exportBlockers));
    const result = await applyReviewedAutomation(f.deps, imported.previewToken); assert.equal(result.success, true, result.error);
    assert.deepEqual(result.missingLayers, ['feature', 'steps', 'locators']);
});

test('F5 proyecta baseline QA por autor y conserva los bytes de Unicode', t => {
    const f = fixture(t); f.write(f.paths.screen, f.read(f.paths.screen).replace('"5"', '"Cafe\u0301"'));
    f.builder.prepareRegeneration(f.recording, 'Conservar QA');
    const { copyRoleInput } = require('../dist/core/automation/infrastructure/layered/projections');
    const { gapJudgment } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
    const plan = JSON.parse(fs.readFileSync(path.join(f.pkg, 'generation-plan.json')));
    for (const role of ['behavior-author', 'interaction-author']) {
        const destination = path.join(f.pkg, role); fs.mkdirSync(destination);
        copyRoleInput(f.pkg, destination, 'baseline-response.json', role, gapJudgment(f.pkg, plan));
        const projected = JSON.parse(fs.readFileSync(path.join(destination, 'baseline-response.json')));
        assert.deepEqual(projected.files.map(file => file.layer), role === 'behavior-author' ? ['feature', 'steps'] : ['screen', 'locators']);
        if (role === 'interaction-author') assert.match(projected.files[0].content, /Cafe\u0301/);
    }
});

test('F5 usa el checkout real después de rebase y merge, también con nuevas correcciones sin commit', async t => {
    const f = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', f.root, '-c', 'commit.gpgsign=false', '-c', 'user.name=QA Fixture', '-c', 'user.email=qa@example.invalid', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q'); git('checkout', '-qb', 'main'); git('add', 'features', 'screenobjects', 'resources', 'tsconfig.json'); git('commit', '-qm', 'baseline');
    git('checkout', '-qb', 'qa-pr'); f.write(f.paths.screen, f.read(f.paths.screen).replace('"5"', '"9"')); git('commit', '-qam', 'QA fixes');
    git('checkout', 'main'); f.write('support/utils/new.ts', 'export const helper = true;\n'); git('add', 'support'); git('commit', '-qm', 'main helper');
    git('checkout', 'qa-pr'); git('rebase', 'main');
    for (const branch of ['qa-pr', 'main']) {
        if (branch === 'main') { git('checkout', 'main'); git('merge', '--no-ff', 'qa-pr', '-m', 'merge QA PR'); }
        f.write(f.paths.screen, f.read(f.paths.screen).replace('foreign-original', 'foreign-after-review'));
        f.builder.prepareRegeneration(f.recording, 'Mejora posterior al review'); const { plan } = proposal(f);
        const baseline = loadFrameworkBaseline(f.pkg, plan);
        assert.equal(baseline.context.branch, branch); assert.equal(baseline.context.commit, git('rev-parse', 'HEAD'));
        assert.match(baseline.files.find(file => file.layer === 'screen').content, /"9"/);
        const result = await f.importer.importFromPackage(f.pkg, { trackRepair: false }); assert.equal(result.exportReady, true, JSON.stringify(result.exportBlockers));
        const applied = await applyReviewedAutomation(f.deps, result.previewToken); assert.equal(applied.success, true, applied.error);
        assert.match(f.read(f.paths.screen), /foreign-after-review/);
        git('add', 'features', 'screenobjects', 'resources');
        // The preview may preserve all bytes; create a fixture commit only when content changed.
        if (git('diff', '--cached', '--name-only')) git('commit', '-qm', 'recorder reviewed update');
    }
});

test('F5 revierte las cuatro capas, registry y recibo si falla publicar el evento de exportación', async t => {
    const f = fixture(t); f.builder.prepareRegeneration(f.recording, 'Ajustar');
    proposal(f, files => files.map(file => file.layer === 'screen' ? { ...file, content: file.content.replace('"5"', '"7"') } : file));
    const imported = await f.importer.importFromPackage(f.pkg, { trackRepair: false }); assert.equal(imported.exportReady, true);
    const before = new Map(Object.values(f.paths).map(file => [file, f.read(file)]));
    const append = AutomationHistoryStore.prototype.append;
    AutomationHistoryStore.prototype.append = function(input, artifacts) {
        if (input.kind === 'export-result' && input.result !== 'failed') throw new Error('history storage failure');
        return append.call(this, input, artifacts);
    };
    t.after(() => { AutomationHistoryStore.prototype.append = append; });
    const result = await applyReviewedAutomation(f.deps, imported.previewToken); assert.equal(result.success, false); assert.match(result.error, /history storage/);
    for (const [file, content] of before) assert.equal(f.read(file), content);
    assert.equal(fs.existsSync(f.registry.storagePath()), false);
    assert.equal(fs.existsSync(path.join(f.pkg, 'application-receipt.json')), false);
});

test('F5 puede preparar otra solicitud sin exportar ni heredar salidas, conservando helper y traza QA', t => {
    const f = fixture(t);
    f.write('support/utils/check.ts', 'export function check(value: string) { return value === "5"; }\nexport function unrelated() { return "FOREIGN_HELPER"; }\n');
    f.write(f.paths.screen, f.read(f.paths.screen).replace('export class', 'import { check } from "@utils/check";\nexport class').replace('return actual === "5";', 'return check(actual);'));
    const attempts = [];
    for (let iteration = 0; iteration < 2; iteration++) {
        f.builder.prepareRegeneration(f.recording, 'Conservar helper');
        attempts.push(new AgentRunStore(f.pkg).read().runId);
        const baseline = JSON.parse(fs.readFileSync(path.join(f.pkg, 'baseline-response.json')));
        assert.match(baseline.dependencies[0].content, /function check/);
        assert.doesNotMatch(baseline.dependencies[0].content, /unrelated|FOREIGN_HELPER/);
        assert.deepEqual(baseline.actionTrace, f.response.actionTrace);
        assert.equal(fs.existsSync(path.join(f.pkg, 'agent-response.json')), false);
    }
    assert.notEqual(attempts[0], attempts[1]);
});
