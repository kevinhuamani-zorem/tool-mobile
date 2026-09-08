const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationMemory,
    AutomationHistoryStore,
    ApprovedGoldenStore,
    AutomationPackageBuilder,
    DeterministicResolver,
    acceptedGoldenFiles,
    goldenBaselineSnapshotPort,
    goldenCaseDirectoryName,
    goldenDatasetRoot,
    goldenPlanProjection,
    listGoldenCases,
    readGoldenCase,
    saveGoldenCase,
} = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { saveGoldenCaseFromPackage, GoldenCaseReview, GoldenCaseController } = require('../dist/recorder/src/ipc/automation/goldenCase');
const { inferredStrategy } = require('../dist/core/indexing');
const { isolatedFramework } = require('./helpers/isolatedFramework');

const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
const { git, recorderRepository } = require('./helpers/goldenRepository');
const GOLDEN_ROOT = path.join(process.cwd(), 'tests', 'golden');

// ---- fixture: un paquete aplicado sobre un framework minimo -----------------

function appliedPackageFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-fixture-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const frameworkRoot = path.join(root, 'framework');
    const packageDirectory = path.join(root, 'recording', 'generation', 'automation');
    const goldenRoot = path.join(root, 'golden');
    fs.mkdirSync(path.join(frameworkRoot, 'features'), { recursive: true });
    fs.mkdirSync(path.join(packageDirectory, 'baselines'), { recursive: true });

    const featurePath = 'features/test.feature';
    const stepsPath = 'features/test.steps.ts';
    const baseline = 'Feature: Test\n  @original\n  Scenario: Existing\n    Then old result\n';
    const appliedFeature = baseline + '\n  @payment @android\n  Scenario: New\n    Then new result\n';
    const appliedSteps = "import { Then } from '@wdio/cucumber-framework';\nThen(/^new result$/, async () => {});\n";
    fs.writeFileSync(path.join(frameworkRoot, featurePath), appliedFeature);
    fs.writeFileSync(path.join(frameworkRoot, stepsPath), appliedSteps);
    fs.writeFileSync(path.join(packageDirectory, 'baselines', 'feature-test.feature'), baseline);

    const scenario = {
        schemaVersion: 1, recordingId: 'rec-golden-0001', squad: 'payment', platform: 'android',
        objective: 'ver el resultado', acceptanceCriteria: 'se muestra el resultado', fingerprint: 'f'.repeat(64),
        createdAt: '2026-09-07T00:00:00.000Z',
        request: { caseId: 'TC-1', squad: 'payment', featureName: 'Test', scenarioName: 'New', fileName: 'test', locatorModule: 'test', platform: 'android' },
        actions: [{ sequence: 1, action: 'VERIFICAR_EXISTE', selector: '~result', selectorVerified: true, contextHint: 'resultado' }],
    };
    const plan = {
        planId: 'plan-golden', recordingId: scenario.recordingId,
        files: [
            { layer: 'feature', path: featurePath, operation: 'update', baseHash: sha256(baseline) },
            { layer: 'steps', path: stepsPath, operation: 'create' },
        ],
        resolutions: [{ sequence: 1, action: 'VERIFICAR_EXISTE', resolution: 'create', locatorName: 'result', selector: '~result' }],
        unresolvedGapIds: [],
        reuseTarget: { reason: 'fixture', score: 1, steps: stepsPath },
    };
    const response = {
        recordingId: scenario.recordingId, planId: plan.planId, resolutions: [], actionTrace: [{ sequence: 1, gherkinStep: 'Then new result' }],
        files: [
            { layer: 'feature', path: featurePath, content: appliedFeature },
            { layer: 'steps', path: stepsPath, content: appliedSteps },
        ],
    };
    const validation = { valid: true, qualityScore: 100, errors: [], warnings: [] };
    fs.writeFileSync(path.join(packageDirectory, 'scenario.json'), JSON.stringify(scenario, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'generation-plan.json'), JSON.stringify(plan, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'agent-response.json'), JSON.stringify(response, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'validation.json'), JSON.stringify(validation, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'unresolved-context.json'), JSON.stringify({ gaps: [{ id: 'gap-english-naming', type: 'semantic-naming', description: 'x', requiredOutput: 'y' }] }));
    fs.writeFileSync(path.join(packageDirectory, 'application-receipt.json'), JSON.stringify({
        schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId, responseHash: 'h', appliedAt: 'now',
        files: plan.files.map(file => ({ path: file.path, operation: file.operation, afterHash: sha256(fs.readFileSync(path.join(frameworkRoot, file.path))) })),
    }));
    const catalog = { squad: 'payment', platform: 'android', featureScope: '', locators: [], stepDefinitions: [], frameworkStepDefinitions: [], screenMethods: [], features: [], scenarios: [], artifactBundles: [], frameworkMetrics: { queryCount: 3 } };
    const validatorCalls = [];
    const registry = { registered: 0, register() { this.registered += 1; return {}; } };
    const deps = (validate = () => validation) => ({
        packageDirectory,
        frameworkRoot,
        reuseAnalyzer: { getCatalog: () => catalog },
        automationResponseValidator: {
            validate: (...args) => { validatorCalls.push(args); return validate(...args); },
            toPreview: current => ({ files: current.files.map(file => path.join(frameworkRoot, file.path)) }),
        },
        generatedFileRegistry: registry,
    });
    return { root, frameworkRoot, packageDirectory, goldenRoot, featurePath, stepsPath, baseline, appliedFeature, appliedSteps, scenario, plan, response, catalog, deps, validatorCalls, registry };
}

function withGoldenRoot(t, fixture) {
    // goldenDatasetRoot lee projectPaths; el fixture apunta la raiz a su tmp.
    const { projectPaths } = require('../dist/core/workspace');
    const original = { toolRoot: projectPaths.toolRoot, runtimeRoot: projectPaths.runtimeRoot };
    projectPaths.toolRoot = recorderRepository(path.join(fixture.root, 'recorder'));
    projectPaths.runtimeRoot = fixture.root;
    t.after(() => Object.assign(projectPaths, original));
    return path.join(projectPaths.toolRoot, 'tests', 'golden');
}

const expectedFile = (saved, layer) => path.join(saved.directory, 'expected', saved.manifest.files.find(file => file.layer === layer).expected);

test('F6 approval freezes exact bytes, context and diagnostics without altering framework or response', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    assert.throws(() => saveGoldenCaseFromPackage(f.deps(), {}), /aprobación QA/);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true, executed: 'passed', notes: 'Pixel 7' });
    assert.equal(saved.manifest.schemaVersion, 2);
    assert.equal(saved.manifest.approval.source, 'qa-declaration');
    assert.equal(saved.manifest.executed, 'passed');
    assert.equal(f.validatorCalls.length, 0);
    assert.deepEqual(saved.appliedEdits, []);
    const reread = readGoldenCase(saved.directory);
    assert.equal(reread.baselines.get(f.featurePath), f.baseline);
    assert.deepEqual(reread.gaps.map(gap => gap.id), ['gap-english-naming']);
    assert.equal(fs.readFileSync(expectedFile(saved, 'feature'), 'utf8'), f.appliedFeature);
    assert.equal(JSON.parse(fs.readFileSync(path.join(saved.directory, 'catalog.json'))).frameworkMetrics, undefined);
    assert.equal(JSON.parse(fs.readFileSync(path.join(saved.directory, 'execution.json'))).automaticVerification, 'not-reported');
    assert.deepEqual(listGoldenCases(root), [saved.directory]);
});

test('F6 accepts explicit QA approval with failing diagnostics, keeping original response and framework untouched', t => {
    const f = appliedPackageFixture(t); withGoldenRoot(t, f);
    const invalid = { valid: false, qualityScore: 40, errors: [{ code: 'step-undefined', message: 'sin definición' }], warnings: [] };
    const fixed = '// Cafe\u0301 correction\r\n';
    const saved = saveGoldenCaseFromPackage(f.deps(() => invalid), { approved: true, reviewedContents: { [f.stepsPath]: fixed }, executed: 'failed' });
    assert.equal(saved.manifest.validation.qualityScore, 40);
    assert.equal(saved.manifest.validation.errorCounts['step-undefined'], 1);
    assert.equal(fs.readFileSync(expectedFile(saved, 'steps'), 'utf8'), fixed);
    assert.equal(fs.readFileSync(path.join(f.frameworkRoot, f.stepsPath), 'utf8'), f.appliedSteps);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.packageDirectory, 'agent-response.json'))), f.response);
    assert.equal(f.registry.registered, 0);
    const changes = JSON.parse(fs.readFileSync(path.join(saved.directory, 'qa-changes.json')));
    assert.equal(changes.find(file => file.path === f.stepsPath).before, f.appliedSteps);
    assert.equal(readGoldenCase(saved.directory).response.files[1].content, fixed, 'NFD and CRLF survive read');
});

test('F6 preview rejects stale package, checkout files, absent approval and tampered tokens', t => {
    const f = appliedPackageFixture(t); withGoldenRoot(t, f);
    const review = new GoldenCaseReview(f.deps()); let p = review.prepare();
    assert.throws(() => review.save({ token: p.token }), /aprobación QA/);
    assert.throws(() => review.save({ token: 'forged', approved: true }), /aprobación QA/);
    p.files[0].content = 'mutated renderer object';
    const saved = review.save({ token: p.token, approved: true });
    assert.equal(fs.readFileSync(expectedFile(saved, 'feature'), 'utf8'), f.appliedFeature);
    p = review.prepare(); fs.appendFileSync(path.join(f.frameworkRoot, f.stepsPath), '// external');
    assert.throws(() => review.save({ token: p.token, approved: true }), /Cambió/);
    p = review.prepare(); fs.appendFileSync(path.join(f.packageDirectory, 'scenario.json'), ' ');
    assert.throws(() => review.save({ token: p.token, approved: true }), /caso cambió/);
});

test('F6 same bytes are idempotent, new approval supersedes, index is disposable, revocation retains history', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f); const store = new ApprovedGoldenStore(root);
    const first = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    const firstBytes = fs.readFileSync(path.join(first.directory, 'manifest.json'));
    const duplicate = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.equal(duplicate.duplicate, true); assert.equal(store.stats().versions, 1);
    const second = saveGoldenCaseFromPackage(f.deps(), { approved: true, reviewedContents: { [f.stepsPath]: '// QA' } });
    assert.notEqual(second.directory, first.directory);
    assert.deepEqual(fs.readFileSync(path.join(first.directory, 'manifest.json')), firstBytes);
    assert.equal(store.stats().versions, 2); assert.equal(store.stats().approvedCases, 1);
    assert.equal(store.read(first.manifest.goldenId, first.manifest.versionHash).manifest.active, false);
    const index = store.index(); fs.writeFileSync(path.join(root, 'approved-index.json'), '{"entries":["forged"]}');
    assert.deepEqual(store.rebuildIndex(), index);
    fs.unlinkSync(path.join(root, 'approved-index.json')); assert.deepEqual(store.rebuildIndex(), index);
    store.revoke(second.manifest.goldenId, second.manifest.versionHash, 'qa');
    assert.equal(store.index().entries.length, 0);
    assert.equal(store.read(second.manifest.goldenId, second.manifest.versionHash).manifest.active, false);
    saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.equal(store.index().entries[0].versionHash, first.manifest.versionHash);
});

test('F6 corrupt version or publication fails closed without falling back to an old approval', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f); const store = new ApprovedGoldenStore(root);
    saveGoldenCaseFromPackage(f.deps(), { approved: true });
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true, reviewedContents: { [f.stepsPath]: '// v2' } });
    fs.appendFileSync(expectedFile(saved, 'steps'), 'tampered');
    assert.throws(() => readGoldenCase(saved.directory), /alterado/);
    assert.equal(store.index().entries.length, 0); assert.equal(store.index().issues.length, 1);
    assert.throws(() => saveGoldenCaseFromPackage(f.deps(), { approved: true, reviewedContents: { [f.stepsPath]: '// v2' } }), /alterado/);
});

test('F6 publication failure leaves no active reference; retry recovers orphan version; index failure keeps committed approval', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const original = ApprovedGoldenStore.prototype.publishRecord;
    ApprovedGoldenStore.prototype.publishRecord = () => { throw new Error('publication failed'); };
    try { assert.throws(() => saveGoldenCaseFromPackage(f.deps(), { approved: true }), /publication failed/); }
    finally { ApprovedGoldenStore.prototype.publishRecord = original; }
    const store = new ApprovedGoldenStore(root); assert.equal(store.index().entries.length, 0);
    const rebuild = ApprovedGoldenStore.prototype.rebuildIndex;
    ApprovedGoldenStore.prototype.rebuildIndex = () => { throw new Error('index failed'); };
    let saved;
    try { saved = saveGoldenCaseFromPackage(f.deps(), { approved: true }); }
    finally { ApprovedGoldenStore.prototype.rebuildIndex = rebuild; }
    assert.ok(saved.indexWarning); assert.equal(store.index().entries.length, 1); assert.equal(store.index().versions, 1);
    assert.equal(store.rebuildIndex().entries[0].versionHash, saved.manifest.versionHash);
});

test('F6 confines reviewed paths and rejects symlink artifacts and package links', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    assert.throws(() => saveGoldenCaseFromPackage(f.deps(), { approved: true, reviewedContents: { '../outside.ts': 'x' } }), /ajeno/);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    const expected = expectedFile(saved, 'steps'); fs.unlinkSync(expected); fs.symlinkSync(path.join(f.frameworkRoot, f.stepsPath), expected);
    assert.throws(() => readGoldenCase(saved.directory), /symlink/i);
    assert.equal(new ApprovedGoldenStore(root).index().entries.length, 0);
    fs.symlinkSync(path.join(f.frameworkRoot, f.stepsPath), path.join(f.packageDirectory, 'external.ts'));
    assert.throws(() => new GoldenCaseReview(f.deps()).prepare(), /symlink/i);
});

test('F6 historical approval never transfers to changed framework, scope or contract', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true }); const store = new ApprovedGoldenStore(root);
    const scope = { squad: 'payment', platform: 'android', contract: saved.manifest.contract };
    assert.equal(store.compatible(scope, f.frameworkRoot).length, 1);
    assert.equal(store.compatible({ ...scope, platform: 'ios' }, f.frameworkRoot).length, 0);
    assert.equal(store.compatible({ ...scope, contract: 'v2' }, f.frameworkRoot).length, 0);
    fs.appendFileSync(path.join(f.frameworkRoot, f.stepsPath), '// PR changes');
    assert.equal(store.compatible(scope, f.frameworkRoot).length, 0);
    assert.equal(store.index().entries.length, 1, 'historical approved bytes remain available');
});

test('golden case names retain recording identity', () => {
    assert.equal(goldenCaseDirectoryName({ recordingId: 'rec-f98d051e-c07d-4f6a-9577-a1ff85a9110f', request: { caseId: 'TC-10240' } }), 'tc-10240-85a9110f');
});

// ---- replay con un caso real: el resolver reproduce el plan desde catalog.json ----

const CONTACT_SCREEN = 'screenobjects/payment/contacts.screen.ts';
const CONTACT_LOCATORS = 'resources/locators/payment/yapear-contact.locator.json';
const CONTACT_STEPS = 'features/yape-steps-definitions/payment/payment.steps.ts';

function contactsCatalog() {
    const locator = (name, androidSelector, iosSelector = '') => ({
        name, selector: androidSelector, androidSelector, iosSelector,
        androidStrategy: androidSelector ? (inferredStrategy(androidSelector) || 'ANDROID') : undefined,
        androidBlock: 'yapearAndroid', iosBlock: 'yapearIos',
        file: CONTACT_LOCATORS, module: 'payment/yapear-contact', squad: 'payment', scope: 'squad', platform: 'android',
    });
    const method = (name, locatorKeys) => ({ name, file: CONTACT_SCREEN, squad: 'payment', locatorFiles: [CONTACT_LOCATORS], signature: `${name}()`, locatorKeys, className: 'ContactsScreen' });
    const locators = [
        locator('titleYapear', 'new UiSelector().text("Yapear")', 'Yapear'),
        locator('inputNumberToYapear', 'new UiSelector().resourceId("textfield-filtrar-contacto")', '**/XCUIElementTypeTextField[`value == "Busca"`]'),
        locator('btnselectNumber', 'new UiSelector().resourceId("contentContactItem")', '**/XCUIElementTypeCell[`name == "A nuevo"`]'),
        locator('inputContactToYapear', '', '**/XCUIElementTypeButton[`name == "Editar casilla"`]'),
    ];
    const screenMethods = [method('validateSelectContactScreen', ['titleYapear']), method('inputNumberToYapear', ['inputNumberToYapear', 'btnselectNumber'])];
    const stepDefinitions = [{ keyword: 'When', expression: '^el usuario selecciona el contacto a yapear$', file: CONTACT_STEPS, squad: 'payment', scope: 'squad', screenMethods: [{ file: CONTACT_SCREEN, method: 'inputNumberToYapear' }] }];
    return {
        squad: 'payment', featureScope: '', platform: 'android',
        locators, stepDefinitions, frameworkStepDefinitions: stepDefinitions, features: [], scenarios: [], screenMethods,
        artifactBundles: [{ steps: CONTACT_STEPS, screens: [CONTACT_SCREEN], locators: [CONTACT_LOCATORS], stepExpressions: stepDefinitions.map(item => item.expression), screenMethods: screenMethods.map(item => item.name) }],
        frameworkMetrics: { queryCount: 1 },
    };
}

function yapeoScenario() {
    const action = (kind, contextHint, selector, value = '') => ({ action: kind, contextHint, elementIntent: '', selector, value, selectorVerified: Boolean(selector) });
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-f98d051e-c07d-4f6a-9577-a1ff85a9110f', revision: 1,
        fingerprint: 'a'.repeat(64), createdAt: '2026-09-06T21:51:23.848Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'realizar el flujo de yapeo', acceptanceCriteria: 'el usuario realiza un yapeo y se visualiza el yapeo exitoso',
        request: { squad: 'payment', featureName: 'Flujo yapeo', scenarioName: 'Yapeo', fileName: 'flujo-yapeo', locatorModule: 'flujo-yapeo', caseId: 'TC-10240', pathType: 'Happy Path', tag: 'yapeo_sin_otp', dataName: 'Jose Mendoza Dni10', platform: 'android', examples: {}, scenarioRows: [] },
        actions: [
            action('VERIFICAR_EXISTE', 'pantalla yapear', 'android=new UiSelector().text("Yapear")'),
            action('ESCRIBIR', 'ingresar numero destino', 'android=new UiSelector().resourceId("textfield-filtrar-contacto")', '955528219'),
            action('CLICK', 'boton seleccionar numero destino', 'android=new UiSelector().resourceId("contentContactItem")'),
            action('VERIFICAR_EXISTE', 'pantalla yapear a', 'android=new UiSelector().text("Yapear a")'),
        ].map((item, index) => ({ ...item, sequence: index + 1 })),
    };
}

test('el replay reproduce el plan de un caso real desde catalog.json y los baselines, sin el framework vivo', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-replay-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const catalog = contactsCatalog();
    const provider = { getCatalog: () => catalog };
    const builder = new AutomationPackageBuilder(new DeterministicResolver(provider), new AutomationMemory(path.join(root, 'memory')));
    const prepared = builder.prepare(yapeoScenario(), root);
    const { unsupportedSchemaKeywords } = require('../dist/core/automation');
    for (const name of fs.readdirSync(prepared.packageDirectory).filter(name => name.endsWith('.schema.json'))) {
        assert.deepEqual(unsupportedSchemaKeywords(JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, name), 'utf8'))), [], name);
    }
    // El caso queda "aplicado" con los archivos que el paquete deja como
    // referencia: aqui basta con que existan para congelarlos.
    const plan = JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, 'generation-plan.json'), 'utf8'));
    const response = {
        recordingId: prepared.recordingId, planId: plan.planId, resolutions: [], actionTrace: [],
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, content: `// ${file.layer}\n` })),
    };
    fs.writeFileSync(path.join(prepared.packageDirectory, 'agent-response.json'), JSON.stringify(response));
    const accepted = acceptedGoldenFiles(prepared.packageDirectory, path.join(root, 'no-framework'), {});
    const saved = saveGoldenCase({
        approved: true, savedBy: 'qa', revisionId: 'revision-replay', root: path.join(root, 'golden'), packageDirectory: prepared.packageDirectory, frameworkRoot: path.join(root, 'no-framework'),
        catalog, accepted, validation: { valid: true, qualityScore: 100, errors: [], warnings: [] }, validationSource: 'apply', executed: 'not-run',
    });
    const goldenCase = readGoldenCase(saved.directory);
    assert.equal(goldenCase.plan.reuseTarget?.locators, CONTACT_LOCATORS);
    assert.ok(goldenCase.gaps.some(gap => gap.id === 'gap-platform-coverage'));

    const snapshot = goldenBaselineSnapshotPort(goldenCase);
    for (const file of goldenCase.effectivePlan.files) {
        assert.equal(snapshot.read(file.path).exists, file.operation === 'update', file.path);
    }
    let snapshotReads = 0;
    const replay = new DeterministicResolver({ getCatalog: () => goldenCase.catalog }, { read(file) { snapshotReads++; return snapshot.read(file); } }).resolve(goldenCase.scenario);
    assert.ok(snapshotReads > 0, 'the infrastructure resolver must honor an explicitly supplied frozen baseline');
    assert.deepEqual(
        goldenPlanProjection(replay.plan, replay.unresolvedContext.gaps),
        goldenPlanProjection(goldenCase.plan, goldenCase.gaps),
    );
    // Exercise the real CLI engine against a pinned local commit. This deliberately
    // invalid synthetic response must remain discrepant; never rewrite expected files.
    const frameworkRoot = require('./helpers/isolatedFramework').SOURCE_FRAMEWORK_ROOT;
    const pinned = saveGoldenCase({
        approved: true, savedBy: 'qa-fixture', revisionId: 'revision-pinned', root: path.join(root, 'pinned-golden'),
        packageDirectory: prepared.packageDirectory, frameworkRoot, catalog, accepted,
        validation: { valid: true, qualityScore: 100, errors: [], warnings: [] }, validationSource: 'apply', executed: 'not-run',
    });
    const expectedBefore = fs.readFileSync(expectedFile(pinned, 'steps'));
    const report = require('../scripts/golden-replay').replayGoldenDataset({ root: path.join(root, 'pinned-golden'), frameworkRoot });
    assert.equal(report.results[0].status, 'discrepant', JSON.stringify(report));
    assert.equal(report.results[0].planEquivalent, true);
    assert.equal(report.results[0].qaApproval.source, 'qa-declaration');
    assert.deepEqual(fs.readFileSync(expectedFile(pinned, 'steps')), expectedBefore);
});

// ---- los casos del repositorio ---------------------------------------------

function overlayBaselines(frameworkRoot, goldenCase) {
    for (const file of goldenCase.effectivePlan.files) {
        const absolute = path.join(frameworkRoot, file.path);
        const baseline = goldenCase.baselines.get(file.path);
        if (file.operation === 'update' && baseline !== undefined) {
            fs.mkdirSync(path.dirname(absolute), { recursive: true });
            fs.writeFileSync(absolute, baseline);
        } else if (file.operation === 'create') {
            fs.rmSync(absolute, { force: true });
        }
    }
}

test('cada caso de tests/golden se reproduce: mismo plan y los archivos aceptados siguen validos', async t => {
    const index = new ApprovedGoldenStore(GOLDEN_ROOT).index();
    assert.deepEqual(index.issues, [], 'El dataset versionado contiene publicaciones o snapshots corruptos');
    const cases = index.entries.map(entry => entry.directory);
    if (!cases.length) {
        t.diagnostic('sin casos golden todavia: guarda uno desde la revision («Guardar como golden verificado por QA»)');
        return;
    }
    const { frameworkRoot } = isolatedFramework(t, 'avr-golden-');
    for (const directory of cases) {
        const goldenCase = readGoldenCase(directory);
        const name = path.basename(directory);
        const provider = { getCatalog: () => goldenCase.catalog };
        const replay = new DeterministicResolver(provider, goldenBaselineSnapshotPort(goldenCase)).resolve(goldenCase.scenario);
        assert.deepEqual(
            goldenPlanProjection(replay.plan, replay.unresolvedContext.gaps),
            goldenPlanProjection(goldenCase.plan, goldenCase.gaps),
            `${name}: el resolver cambio el plan`,
        );
        // El framework aislado vuelve al estado previo a aplicar el caso: los
        // `update` con su baseline y sin los `create`, como cuando se valido.
        overlayBaselines(frameworkRoot, goldenCase);
        const validation = new AutomationResponseValidator(undefined, provider)
            .validate(goldenCase.scenario, goldenCase.effectivePlan, goldenCase.response);
        const errorCounts = {};
        for (const error of validation.errors) errorCounts[error.code] = (errorCounts[error.code] || 0) + 1;
        assert.deepEqual(
            { valid: validation.valid, errorCounts },
            { valid: goldenCase.manifest.validation.valid, errorCounts: goldenCase.manifest.validation.errorCounts },
            `${name}: el validador ya no acepta los archivos aprobados: ${validation.errors.map(error => error.message).join(' | ')}`,
        );
    }
});

test('F6 recovered QA revision uses immutable code and helpers, preserves failed attempt and PR, supports another approval', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const history = new AutomationHistoryStore(f.packageDirectory);
    history.ensureRevision(f.scenario.recordingId, 'TC-1');
    const failed = history.identity();
    history.append({ ...failed, kind: 'generation-result', origin: 'recorder', result: 'failed' });
    history.capture('agents/interaction-author/interaction-result.json', '{"files":[]}', 'agent', 'interaction-author:provider-output', 2);
    const fixed = '// QA assert Cafe\u0301\r\n';
    const helper = { layer: 'dependency', path: 'support/utils/qa.ts', content: 'export const expected = 1;\n' };
    fs.mkdirSync(path.dirname(path.join(f.frameworkRoot, helper.path)), { recursive: true }); fs.writeFileSync(path.join(f.frameworkRoot, helper.path), helper.content);
    fs.writeFileSync(path.join(f.frameworkRoot, f.stepsPath), fixed);
    const recovery = { recordedTrace: f.response.actionTrace, context: { prUrl: 'https://github.com/team/mobile/pull/1' }, pending: [{ id: 'trace:1', message: 'association pending' }],
        files: [...f.response.files.map(file => ({ ...file, content: file.layer === 'steps' ? fixed : file.content, currentHash: sha256(file.layer === 'steps' ? fixed : file.content) })), { ...helper, currentHash: sha256(helper.content) }] };
    const bytes = JSON.stringify(recovery);
    fs.writeFileSync(path.join(f.packageDirectory, 'framework-recovery.json'), bytes);
    const revision = history.beginRevision({ recordingId: f.scenario.recordingId, caseId: 'TC-1', source: 'framework-import' }, [{ name: 'framework-recovery.json', content: bytes }]);
    const review = new GoldenCaseReview(f.deps()); const preview = review.prepare({ source: 'recovery' });
    assert.equal(preview.revisionId, revision.revisionId); assert.equal(preview.files.length, 3);
    assert.equal(preview.context.prUrl, recovery.context.prUrl); assert.equal(preview.pending.length, 1);
    const saved = review.save({ token: preview.token, approved: true, executed: 'passed' });
    assert.equal(fs.readFileSync(expectedFile(saved, 'steps'), 'utf8'), fixed);
    assert.equal(JSON.parse(fs.readFileSync(path.join(saved.directory, 'dependency-files.json')))[0].content, helper.content);
    assert.equal(history.lifecycle(failed.revisionId).generation, 'failed');
    assert.equal(history.lifecycle().qaApproval, 'approved');
    assert.equal(history.lifecycle().functionalVerification, 'not-reported');
    const events = JSON.parse(fs.readFileSync(path.join(saved.directory, 'provenance/events.json')));
    const delivered = events.find(event => event.stage === 'interaction-author:provider-output');
    assert.equal(delivered.pass, 2); assert.equal(delivered.artifacts.length, 1);
    const store = new ApprovedGoldenStore(root); const scope = { squad: 'payment', platform: 'android', contract: saved.manifest.contract };
    assert.equal(store.compatible(scope, f.frameworkRoot).length, 1);
    helper.content = 'export const expected = 2;\n'; fs.writeFileSync(path.join(f.frameworkRoot, helper.path), helper.content);
    assert.equal(store.compatible(scope, f.frameworkRoot).length, 0);
    const next = { ...recovery, files: [...recovery.files.slice(0, -1), { ...helper, currentHash: sha256(helper.content) }] };
    fs.writeFileSync(path.join(f.packageDirectory, 'framework-recovery.json'), JSON.stringify(next));
    history.beginRevision({ recordingId: f.scenario.recordingId, caseId: 'TC-1', source: 'framework-import' }, [{ name: 'framework-recovery.json', content: JSON.stringify(next) }]);
    const second = saveGoldenCaseFromPackage(f.deps(), { approved: true, source: 'recovery' });
    assert.notEqual(second.manifest.versionHash, saved.manifest.versionHash);
    assert.equal(store.index().versions, 2); assert.equal(store.index().entries.length, 1);
});

test('F6 legacy cases remain excluded until explicit review and approval; context switch invalidates IPC preview', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const legacyDir = path.join(root, 'old-case'); fs.mkdirSync(legacyDir, { recursive: true });
    fs.cpSync(f.packageDirectory, path.join(legacyDir, 'package'), { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, caseId: 'TC-1', executed: 'passed', validation: { qualityScore: 100 } }));
    fs.writeFileSync(path.join(legacyDir, 'catalog.json'), JSON.stringify(f.catalog));
    fs.writeFileSync(path.join(legacyDir, 'agent-response.json'), JSON.stringify(f.response));
    const original = fs.readFileSync(path.join(legacyDir, 'manifest.json'));
    const { projectPaths } = require('../dist/core/workspace'); const previousFramework = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.frameworkRoot; t.after(() => { projectPaths.frameworkRoot = previousFramework; });
    const deps = { ...f.deps(), state: { activeSquad: 'payment', activeEnvironment: 'qa' } };
    const controller = new GoldenCaseController(deps);
    assert.equal(controller.list().index.entries.length, 0); assert.equal(controller.list().legacy.length, 1);
    let preview = controller.prepare({ legacyId: 'old-case' }).preview;
    assert.equal(preview.source, 'legacy-review');
    assert.throws(() => controller.save({ token: preview.token }), /aprobación QA/);
    deps.state.activeEnvironment = 'staging';
    assert.throws(() => controller.save({ token: preview.token, approved: true }), /contexto/);
    deps.state.activeEnvironment = 'qa';
    preview = controller.prepare({ legacyId: 'old-case' }).preview;
    const saved = controller.save({ token: preview.token, approved: true });
    assert.equal(saved.success, true); assert.equal(controller.list().index.entries.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(legacyDir, 'manifest.json')), original);
    assert.ok(fs.existsSync(path.join(saved.directory, 'package/legacy-manifest.json')));
    assert.throws(() => controller.prepare({ legacyId: '../old-case' }), /no encontrado/);
});

test('F6 UI requires an explicit checkbox, renders exact code and pending diagnostics, and publishes via preview token', async t => {
    const f = appliedPackageFixture(t); withGoldenRoot(t, f);
    const { installFakeBrowserGlobals } = require('./helpers/fakeDom'); const fake = installFakeBrowserGlobals(); t.after(() => fake.restore());
    const { createGoldenFeature } = await import('../recorder/renderer/src/features/golden/goldenFeature.js');
    const review = new GoldenCaseReview(f.deps()); let saves = 0;
    const feature = createGoldenFeature({ api: {
        previewGoldenCase: async input => ({ success: true, preview: review.prepare(input) }),
        saveGoldenCase: async input => { saves++; return { success: true, ...review.save(input) }; },
    } });
    feature.mount(); await feature.open({});
    const el = id => fake.document.getElementById(id);
    assert.equal(el('goldenModal').style.display, 'flex');
    assert.equal(el('btnApproveGolden').disabled, true);
    assert.match(el('goldenFiles').innerHTML, /new result/);
    assert.match(el('goldenDiagnostics').textContent, /no reportada/);
    await feature.approve(); assert.equal(saves, 0);
    el('goldenApproved').checked = true; el('goldenExecution').value = 'passed';
    await feature.approve(); assert.equal(saves, 1);
    assert.match(el('goldenStatus').textContent, /Golden aprobado/);
    assert.equal(el('goldenApproved').checked, false);
    feature.unmount(); assert.equal(el('btnApproveGolden').listenerCount(), 0);
});

test('F6 changing execution declaration retains one immutable code version and records the latest explicit approval', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const first = saveGoldenCaseFromPackage(f.deps(), { approved: true, executed: 'not-run' });
    const second = saveGoldenCaseFromPackage(f.deps(), { approved: true, executed: 'passed', notes: 'QA confirmed' });
    assert.equal(second.directory, first.directory); assert.equal(second.duplicate, true);
    const store = new ApprovedGoldenStore(root); assert.equal(store.index().versions, 1);
    assert.equal(store.read(second.manifest.goldenId).manifest.executed, 'passed');
    assert.equal(store.read(second.manifest.goldenId).manifest.notes, 'QA confirmed');
});

test('F6 context and diagnostics changes create a new immutable snapshot even when accepted code is unchanged', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const first = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    fs.writeFileSync(path.join(f.packageDirectory, 'validation.json'), JSON.stringify({ valid: false, qualityScore: 75, errors: [{ code: 'new-rule', message: 'Rule changed' }], warnings: [] }));
    const second = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.notEqual(first.manifest.versionHash, second.manifest.versionHash);
    assert.equal(readGoldenCase(second.directory).manifest.validation.errorCounts['new-rule'], 1);
    assert.equal(new ApprovedGoldenStore(root).index().entries[0].versionHash, second.manifest.versionHash);
    assert.equal(readGoldenCase(first.directory).manifest.validation.qualityScore, 100);
});

test('F7 selects compatible approved references by intention/actions, separates layers and hides failed original code', t => {
    const { selectGoldenExamples, writeGoldenRoleExamples } = require('../dist/core/automation');
    const f = appliedPackageFixture(t); withGoldenRoot(t, f);
    const { projectPaths } = require('../dist/core/workspace'); const before = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.frameworkRoot; t.after(() => { projectPaths.frameworkRoot = before; });
    const correction = '// QA corrected verification';
    fs.writeFileSync(path.join(f.frameworkRoot, f.stepsPath), correction);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true, notes: 'Añadir aserción del resultado' });
    const scenario = { ...f.scenario, recordingId: 'rec-target', request: { ...f.scenario.request, caseId: 'TC-TARGET' } };
    const selected = selectGoldenExamples(scenario);
    assert.equal(selected.examples.length, 1); assert.equal(selected.examples[0].versionHash, saved.manifest.versionHash);
    assert.equal(selected.examples[0].lessons[0].reason, 'Añadir aserción del resultado');
    const pkg = path.join(f.root, 'target'); const stage = path.join(pkg, 'lorem'); fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'scenario.json'), JSON.stringify(scenario));
    new AutomationHistoryStore(pkg).ensureRevision(scenario.recordingId, 'TC-TARGET');
    const prepared = writeGoldenRoleExamples(pkg, stage, 'behavior-author', 1);
    const payload = JSON.parse(fs.readFileSync(prepared.file));
    assert.equal(payload.examples.length, 1); assert.deepEqual(payload.examples[0].files.map(file => file.layer), ['feature', 'steps']);
    assert.doesNotMatch(fs.readFileSync(prepared.file, 'utf8'), /async \(\) => \{\}/, 'failed source is not a positive example');
    assert.equal(payload.examples[0].automaticReuse, false);
    assert.match(payload.instructions, /selectores autorizados/);
    assert.equal(selectGoldenExamples({ ...scenario, objective: 'administrar tarjetas bloqueadas', acceptanceCriteria: 'tarjeta cerrada' }).examples.length, 0);
    assert.equal(selectGoldenExamples({ ...scenario, platform: 'ios' }).examples.length, 0);
    assert.equal(selectGoldenExamples(f.scenario).examples.length, 0, 'same recording/case solution is never disclosed');
    const emptyIntegration = writeGoldenRoleExamples(pkg, stage, 'integration-reviewer', 1);
    assert.equal(JSON.parse(fs.readFileSync(emptyIntegration.file)).examples.length, 0, 'no integration gap means no examples');
});

test('F7 reserved cases, disabled examples, superseded versions and changed framework never leak into new prompts', t => {
    const { selectGoldenExamples, writeGoldenRoleExamples } = require('../dist/core/automation');
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const { projectPaths } = require('../dist/core/workspace'); const before = projectPaths.frameworkRoot;
    projectPaths.frameworkRoot = f.frameworkRoot; t.after(() => { projectPaths.frameworkRoot = before; });
    const scenario = { ...f.scenario, recordingId: 'rec-target', request: { ...f.scenario.request, caseId: 'TC-TARGET' } };
    const first = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.equal(selectGoldenExamples(scenario).examples.length, 1);
    assert.equal(selectGoldenExamples(scenario, { enabled: false }).examples.length, 0);
    saveGoldenCaseFromPackage(f.deps(), { approved: true, usage: 'evaluation' });
    assert.equal(selectGoldenExamples(scenario).examples.length, 0);
    new ApprovedGoldenStore(root).revoke(first.manifest.goldenId, first.manifest.versionHash, 'qa');
    const nextPreview = new GoldenCaseReview(f.deps()).prepare(); assert.equal(nextPreview.usage, 'evaluation');
    saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.equal(selectGoldenExamples(scenario).examples.length, 0, 'a new QA approval preserves the reserved split');
    saveGoldenCaseFromPackage(f.deps(), { approved: true, usage: 'reference' });
    fs.writeFileSync(path.join(f.frameworkRoot, f.stepsPath), '// QA new version');
    assert.equal(selectGoldenExamples(scenario).examples.length, 0);
    const second = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    assert.notEqual(second.manifest.versionHash, first.manifest.versionHash);
    assert.equal(selectGoldenExamples(scenario).examples[0].versionHash, second.manifest.versionHash);
    new ApprovedGoldenStore(root).revoke(second.manifest.goldenId, second.manifest.versionHash, 'qa');
    assert.equal(selectGoldenExamples(scenario).examples.length, 0);
});


test('F7 deterministic golden fragments require preserved traces, exact data, unique current definitions and active approval', t => {
    const { goldenFragmentMemory, selectGoldenExamples, writeGoldenRoleExamples } = require('../dist/core/automation');
    const { actionIdentity } = require('../dist/core/automation/domain/memoryFragments');
    const { projectPaths } = require('../dist/core/workspace');
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const previous = { ...projectPaths }; t.after(() => Object.assign(projectPaths, previous));
    Object.assign(projectPaths, { frameworkRoot: f.frameworkRoot, stepDefinitions: path.join(f.frameworkRoot, 'features/yape-steps-definitions'),
        features: path.join(f.frameworkRoot, 'features/yape-features'), screenobjects: path.join(f.frameworkRoot, 'screenobjects'),
        locators: path.join(f.frameworkRoot, 'resources/locators'), codeGraphCache: path.join(f.root, 'graph.json') });
    const stepPath = 'features/yape-steps-definitions/payment/result.steps.ts', screenPath = 'screenobjects/payment/result.screen.ts';
    const files = [f.response.files[0], { layer: 'steps', path: stepPath,
        content: "import { Then } from '@wdio/cucumber-framework';\nimport result from '@screenobjects/payment/result.screen';\nThen(/^new result$/, async () => { await result.checkResult(); });\n" },
        { layer: 'screen', path: screenPath, content: 'class ResultScreen { async checkResult() {} }\nexport default new ResultScreen();\n' }];
    for (const file of files) { fs.mkdirSync(path.dirname(path.join(f.frameworkRoot, file.path)), { recursive: true }); fs.writeFileSync(path.join(f.frameworkRoot, file.path), file.content); }
    f.response.files = files; f.response.actionTrace[0].screenMethod = 'checkResult';
    f.scenario.actions[0].action = 'ESCRIBIR'; f.scenario.actions[0].value = 'Exact QA value';
    for (const [name, value] of [['scenario.json', f.scenario], ['agent-response.json', f.response]]) fs.writeFileSync(path.join(f.packageDirectory, name), JSON.stringify(value));
    const history = new AutomationHistoryStore(f.packageDirectory); history.ensureRevision(f.scenario.recordingId, 'TC-1');
    const recovery = { recordedTrace: f.response.actionTrace, traceAssociations: [{ sequence: 1, status: 'preserved' }],
        relations: [{ from: { path: stepPath }, to: { path: screenPath, symbol: 'checkResult' } }], pending: [{ message: 'pending' }],
        files: files.map(file => ({ ...file, currentHash: sha256(file.content) })) };
    const publish = () => {
        const content = JSON.stringify(recovery); fs.writeFileSync(path.join(f.packageDirectory, 'framework-recovery.json'), content);
        history.beginRevision({ recordingId: f.scenario.recordingId, caseId: 'TC-1', source: 'framework-import' }, [{ name: 'framework-recovery.json', content }]);
        return saveGoldenCaseFromPackage(f.deps(), { approved: true, source: 'recovery' });
    };
    publish();
    const scenario = { ...f.scenario, recordingId: 'rec-target', request: { ...f.scenario.request, caseId: 'TC-TARGET' } };
    assert.equal(selectGoldenExamples(scenario).examples.length, 1, 'pending trace remains a QA reference');
    assert.equal(goldenFragmentMemory(scenario), undefined, 'pending trace cannot become deterministic reuse');
    recovery.pending = []; const approved = publish();
    const memory = goldenFragmentMemory(scenario); assert.ok(memory, 'unique imported framework relation permits exact fragment');
    const identities = scenario.actions.map(action => actionIdentity(action, scenario.platform));
    assert.equal(memory.recallInteractions('payment', identities)[0].fragment.text, 'new result');
    assert.equal(memory.recallGap(), undefined);
    assert.equal(goldenFragmentMemory({ ...scenario, actions: [{ ...scenario.actions[0], value: 'different input' }] }), undefined);
    assert.equal(goldenFragmentMemory({ ...scenario, actions: [{ ...scenario.actions[0], selectorVerified: false }] }), undefined);
    const pkg = path.join(f.root, 'target'), stage = path.join(pkg, 'integration'); fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'scenario.json'), JSON.stringify(scenario));
    const unrelated = writeGoldenRoleExamples(pkg, stage, 'integration-reviewer', 1, ['unrelated gap']);
    assert.equal(JSON.parse(fs.readFileSync(unrelated.file)).examples.length, 0);
    const prepared = writeGoldenRoleExamples(pkg, stage, 'integration-reviewer', 1, ['[integration-contract] checkResult relation']);
    const payload = JSON.parse(fs.readFileSync(prepared.file)); assert.equal(payload.examples.length, 1); assert.equal(payload.examples[0].files.length, 0);
    const duplicate = path.join(projectPaths.stepDefinitions, 'payment/duplicate.steps.ts'); fs.copyFileSync(path.join(f.frameworkRoot, stepPath), duplicate);
    assert.equal(goldenFragmentMemory(scenario), undefined, 'another current definition makes the phrase ambiguous');
    assert.ok(!memory.recallInteractions('payment', identities)?.some(item => item.fragment), 'the existing port also rechecks newly added definitions');
    fs.rmSync(duplicate);
    new ApprovedGoldenStore(root).revoke(approved.manifest.goldenId, approved.manifest.versionHash, 'qa');
    assert.equal(memory.recallInteractions('payment', identities), undefined);
});

test('F7 replay reports an empty corpus and unpinned snapshots explicitly without changing golden bytes', t => {
    const { replayGoldenDataset } = require('../scripts/golden-replay');
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    assert.equal(replayGoldenDataset({ root, frameworkRoot: f.frameworkRoot }).status, 'not-evaluated');
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    const before = fs.readFileSync(expectedFile(saved, 'steps'));
    const report = replayGoldenDataset({ root, frameworkRoot: f.frameworkRoot });
    assert.equal(report.status, 'requires-review'); assert.equal(report.corpusSize, 1);
    assert.equal(report.results[0].status, 'unreproducible'); assert.match(report.results[0].reason, /commit/);
    assert.deepEqual(fs.readFileSync(expectedFile(saved, 'steps')), before);
    assert.equal(readGoldenCase(saved.directory).manifest.approval.source, 'qa-declaration');
});


test('shared golden survives Git commit/clone with autocrlf, selects QA corrections and receives revocation', t => {
    const f = appliedPackageFixture(t); const root = withGoldenRoot(t, f);
    const { projectPaths } = require('../dist/core/workspace');
    const { selectGoldenExamples } = require('../dist/core/automation');
    const before = projectPaths.frameworkRoot; t.after(() => { projectPaths.frameworkRoot = before; });
    projectPaths.frameworkRoot = f.frameworkRoot;
    const repository = path.resolve(root, '../..');
    // Exercise both LF and CRLF artifacts under a checkout that normally converts LF to CRLF.
    git(repository, 'config', 'core.autocrlf', 'true');
    const correction = '// QA corrigió Cafe\u0301\r\n';
    fs.writeFileSync(path.join(f.frameworkRoot, f.stepsPath), correction);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true, executed: 'passed' });
    fs.mkdirSync(path.join(root, 'approved/.pending-fixture'), { recursive: true });
    fs.writeFileSync(path.join(root, 'approved/.pending-fixture/data.json'), '{}');
    fs.writeFileSync(path.join(root, '.publication.lock'), 'temporary');
    git(repository, 'add', '.');
    const tracked = git(repository, 'ls-files');
    assert.match(tracked, /publications\//); assert.match(tracked, /versions\//);
    assert.doesNotMatch(tracked, /approved-index|publication.lock|pending-fixture/);
    git(repository, 'commit', '-qm', 'QA approves fixture');
    const clone = path.join(f.root, 'qa-two');
    git(repository, '-c', 'core.autocrlf=true', 'clone', '-q', repository, clone);
    const receivedRoot = goldenDatasetRoot({ toolRoot: path.join(f.root, 'app'), runtimeRoot: clone });
    const received = new ApprovedGoldenStore(receivedRoot).read(saved.manifest.goldenId);
    assert.equal(received.manifest.versionHash, saved.manifest.versionHash);
    assert.equal(fs.readFileSync(expectedFile(received, 'steps'), 'utf8'), correction);
    assert.equal(new ApprovedGoldenStore(receivedRoot).rebuildIndex().issues.length, 0);
    const target = { ...f.scenario, recordingId: 'qa-two-recording', request: { ...f.scenario.request, caseId: 'TC-2' } };
    assert.equal(selectGoldenExamples(target, { root: receivedRoot }).examples[0].versionHash, saved.manifest.versionHash);
    assert.equal(fs.existsSync(path.join(clone, 'runtime')), false, 'no recorder runtime is needed by a receiving QA');
    // A later Git update changes the references available to the other QA without copying an index.
    fs.rmSync(path.join(root, '.publication.lock'));
    new ApprovedGoldenStore(root).revoke(saved.manifest.goldenId, saved.manifest.versionHash, 'qa');
    git(repository, 'add', 'tests/golden'); git(repository, 'commit', '-qm', 'QA withdraws fixture');
    git(clone, 'pull', '--ff-only', '-q');
    assert.equal(selectGoldenExamples(target, { root: receivedRoot }).examples.length, 0);
    assert.equal(new ApprovedGoldenStore(receivedRoot).read(saved.manifest.goldenId).manifest.active, false);
});

test('packaged app without a recorder checkout still prepares agents without golden examples', t => {
    const f = appliedPackageFixture(t);
    const { projectPaths } = require('../dist/core/workspace');
    const previous = { ...projectPaths }; t.after(() => Object.assign(projectPaths, previous));
    Object.assign(projectPaths, { toolRoot: path.join(f.root, 'app'), runtimeRoot: f.root });
    const { prepareGoldenExamples, writeGoldenRoleExamples } = require('../dist/core/automation');
    const selected = prepareGoldenExamples(f.packageDirectory);
    assert.equal(selected.examples.length, 0); assert.match(selected.issues[0], /Selecciona el repositorio/);
    const stage = path.join(f.root, 'agent'); fs.mkdirSync(stage);
    assert.ok(writeGoldenRoleExamples(f.packageDirectory, stage, 'behavior-author', 1).file);
    assert.equal(fs.existsSync(path.join(f.root, 'runtime/golden')), false);
});

test('Golden UI can select the repository after a missing-checkout error, and cancel keeps a reviewed token', async t => {
    const { installFakeBrowserGlobals } = require('./helpers/fakeDom'); const fake = installFakeBrowserGlobals(); t.after(() => fake.restore());
    const { createGoldenFeature } = await import('../recorder/renderer/src/features/golden/goldenFeature.js');
    let available = false, canceled = false, previews = 0, saved;
    const feature = createGoldenFeature({ api: {
        previewGoldenCase: async () => {
            previews++;
            return available ? { success: true, preview: { token: `review-${previews}`, datasetRoot: '/recorder/tests/golden',
                files: [], diagnostics: { valid: true, qualityScore: 100 }, notes: '', executionDeclaration: 'not-run' } }
                : { success: false, error: 'Selecciona el repositorio' };
        },
        selectGoldenRepository: async () => { if (canceled) return { success: false, canceled: true }; available = true; return { success: true }; },
        saveGoldenCase: async input => { saved = input; return { success: true, manifest: { versionHash: 'a'.repeat(64) } }; },
    } });
    feature.mount(); await feature.open({ recordingId: 'rec-case' });
    const el = id => fake.document.getElementById(id);
    assert.match(el('goldenStatus').textContent, /Selecciona/);
    await feature.selectRepository();
    assert.equal(previews, 2); assert.equal(el('goldenDatasetPath').textContent, '/recorder/tests/golden');
    el('goldenApproved').checked = true;
    canceled = true; await feature.selectRepository();
    assert.equal(previews, 2); assert.equal(el('goldenApproved').checked, true);
    assert.equal(el('btnApproveGolden').disabled, false);
    canceled = false; await feature.selectRepository();
    assert.equal(previews, 3); assert.equal(el('goldenApproved').checked, false);
    await feature.approve(); assert.equal(saved, undefined);
    el('goldenApproved').checked = true; await feature.approve();
    assert.equal(saved.token, 'review-3'); assert.match(el('goldenStatus').textContent, /commit y PR/);
    feature.unmount(); assert.equal(el('btnSelectGoldenRepository').listenerCount(), 0);
});


test('changing the shared recorder repository invalidates a pending approval on the main process', t => {
    const f = appliedPackageFixture(t); const firstRoot = withGoldenRoot(t, f);
    const { projectPaths, saveGoldenRepository } = require('../dist/core/workspace');
    const previous = { ...projectPaths }; t.after(() => Object.assign(projectPaths, previous));
    Object.assign(projectPaths, { frameworkRoot: f.frameworkRoot, recordings: path.join(f.root, 'recording') });
    const controller = new GoldenCaseController({ ...f.deps(), state: { activeSquad: 'payment', activeEnvironment: 'qa', activeAutomationPackage: f.packageDirectory } });
    const first = controller.prepare().preview;
    assert.equal(first.datasetRoot, firstRoot);
    const nextRepository = recorderRepository(path.join(f.root, 'other-recorder'));
    const nextRoot = saveGoldenRepository(nextRepository).datasetRoot;
    assert.throws(() => controller.save({ token: first.token, approved: true }), /Cambió el contexto/);
    assert.equal(new ApprovedGoldenStore(firstRoot).index().entries.length, 0);
    assert.equal(new ApprovedGoldenStore(nextRoot).index().entries.length, 0);
    const fresh = controller.prepare().preview;
    assert.equal(fresh.datasetRoot, nextRoot);
    assert.equal(controller.save({ token: fresh.token, approved: true }).success, true);
    assert.equal(controller.list().datasetRoot, nextRoot);
});
