/**
 * Golden dataset: casos de referencia aprobados por el QA al terminar el flujo.
 *
 * Dos contratos. `saveGoldenCaseFromPackage` congela grabacion, plan,
 * catalogo, baselines y los archivos ACEPTADOS (lo que el QA corrigio tras
 * ejecutar el caso manda sobre lo que el agente entrego; la correccion se
 * valida y se escribe en el framework). Y el replay: con `catalog.json` y
 * los baselines el resolver reproduce el mismo plan sin depender del
 * framework vivo, y el validador vuelve a aceptar los archivos aprobados.
 * Al final, cada caso guardado bajo `tests/golden/` se reproduce.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationMemory,
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
const { saveGoldenCaseFromPackage } = require('../dist/recorder/src/ipc/automation/goldenCase');
const { inferredStrategy } = require('../dist/core/indexing');
const { isolatedFramework } = require('./helpers/isolatedFramework');

const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
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
    projectPaths.toolRoot = path.join(fixture.root, 'no-checkout');
    projectPaths.runtimeRoot = fixture.root;
    t.after(() => Object.assign(projectPaths, original));
    return path.join(fixture.root, 'runtime', 'golden');
}

test('guardar un caso aplicado sin cambios congela grabacion, plan, catalogo, baselines y archivos aceptados', t => {
    const f = appliedPackageFixture(t);
    const goldenRoot = withGoldenRoot(t, f);
    const saved = saveGoldenCaseFromPackage(f.deps(), { executed: 'passed', notes: 'corrido en Pixel 7' });
    assert.equal(saved.directory, path.join(goldenRoot, 'tc-1-lden0001'));
    assert.deepEqual(saved.appliedEdits, []);
    assert.equal(f.validatorCalls.length, 0, 'sin cambios se conserva la validacion con que se aplico');
    const manifest = saved.manifest;
    assert.equal(manifest.edited, false);
    assert.equal(manifest.executed, 'passed');
    assert.equal(manifest.notes, 'corrido en Pixel 7');
    assert.deepEqual(manifest.validation, { valid: true, qualityScore: 100, errorCounts: {}, source: 'apply' });
    assert.deepEqual(manifest.files.map(file => [file.layer, file.operation, file.expected]), [
        ['feature', 'update', 'feature-test.feature'], ['steps', 'create', 'steps-test.steps.ts'],
    ]);
    assert.equal(fs.readFileSync(path.join(saved.directory, 'expected', 'feature-test.feature'), 'utf8'), f.appliedFeature);
    assert.equal(fs.readFileSync(path.join(saved.directory, 'baselines', 'feature-test.feature'), 'utf8'), f.baseline);
    assert.ok(manifest.package.includes('scenario.json') && manifest.package.includes('baselines/feature-test.feature'));
    const catalog = JSON.parse(fs.readFileSync(path.join(saved.directory, 'catalog.json'), 'utf8'));
    assert.equal(catalog.frameworkMetrics, undefined, 'la telemetria no forma parte del caso');
    assert.equal(catalog.squad, 'payment');
    assert.deepEqual(listGoldenCases(goldenRoot), [saved.directory]);
    const reread = readGoldenCase(saved.directory);
    assert.equal(reread.manifest.recordingId, 'rec-golden-0001');
    assert.equal(reread.baselines.get(f.featurePath), f.baseline);
    assert.deepEqual(reread.gaps.map(gap => gap.id), ['gap-english-naming']);
});

test('una correccion del QA en el editor se valida, se escribe en el framework y es lo que queda en el dataset', t => {
    const f = appliedPackageFixture(t);
    withGoldenRoot(t, f);
    const fixedSteps = f.appliedSteps.replace('async () => {}', 'async () => { await screen.verify(); }');
    const saved = saveGoldenCaseFromPackage(f.deps(), {
        executed: 'failed',
        notes: 'fallo el step 1: faltaba la verificacion',
        reviewedContents: { [path.join(f.frameworkRoot, f.stepsPath)]: fixedSteps },
    });
    assert.deepEqual(saved.appliedEdits, ['steps']);
    assert.equal(saved.manifest.edited, true);
    assert.equal(saved.manifest.validation.source, 'golden');
    assert.equal(f.validatorCalls.length, 1, 'lo corregido se revalida antes de escribir');
    assert.equal(f.validatorCalls[0][2].files.find(file => file.layer === 'steps').content, fixedSteps);
    assert.equal(fs.readFileSync(path.join(f.frameworkRoot, f.stepsPath), 'utf8'), fixedSteps, 'la correccion llega al framework');
    assert.equal(fs.readFileSync(path.join(saved.directory, 'expected', 'steps-test.steps.ts'), 'utf8'), fixedSteps);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.packageDirectory, 'application-receipt.json'), 'utf8'));
    assert.equal(receipt.files.find(file => file.path === f.stepsPath).afterHash, sha256(fixedSteps), 'el recibo describe los bytes en disco');
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.packageDirectory, 'agent-response.json'), 'utf8')).files[1].content, fixedSteps);
    assert.equal(f.registry.registered, 1, 'el registro de archivos generados adopta el hash nuevo');
});

test('una correccion hecha en el framework tras ejecutar el caso tambien cuenta como aceptada', t => {
    const f = appliedPackageFixture(t);
    withGoldenRoot(t, f);
    const fixedFeature = f.appliedFeature.replace('Then new result', 'Then the new result is shown');
    fs.writeFileSync(path.join(f.frameworkRoot, f.featurePath), fixedFeature);
    const accepted = acceptedGoldenFiles(f.packageDirectory, f.frameworkRoot, {});
    assert.deepEqual(accepted.editedLayers, ['feature']);
    const saved = saveGoldenCaseFromPackage(f.deps(), { executed: 'passed' });
    assert.deepEqual(saved.appliedEdits, [], 'ya estaba en disco: no se reescribe');
    assert.equal(saved.manifest.edited, true);
    assert.equal(fs.readFileSync(path.join(saved.directory, 'expected', 'feature-test.feature'), 'utf8'), fixedFeature);
});

test('una correccion que no pasa la validacion no se guarda ni toca el framework', t => {
    const f = appliedPackageFixture(t);
    const goldenRoot = withGoldenRoot(t, f);
    const invalid = { valid: false, qualityScore: 40, errors: [{ code: 'step-undefined', message: 'sin definicion' }], warnings: [] };
    assert.throws(
        () => saveGoldenCaseFromPackage(f.deps(() => invalid), {
            reviewedContents: { [f.stepsPath]: '// roto' },
        }),
        error => error.name === 'GoldenValidationError' && /sin definicion/.test(error.message) && error.validation === invalid,
    );
    assert.equal(fs.readFileSync(path.join(f.frameworkRoot, f.stepsPath), 'utf8'), f.appliedSteps);
    assert.equal(fs.existsSync(goldenRoot), false);
});

test('goldenDatasetRoot usa tests/golden en un checkout y runtime/golden en la app empaquetada', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-root-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    assert.equal(goldenDatasetRoot({ toolRoot: root, runtimeRoot: root }), path.join(root, 'runtime', 'golden'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    assert.equal(goldenDatasetRoot({ toolRoot: root, runtimeRoot: root }), path.join(root, 'tests', 'golden'));
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
        root: path.join(root, 'golden'), packageDirectory: prepared.packageDirectory, frameworkRoot: path.join(root, 'no-framework'),
        catalog, accepted, validation: { valid: true, qualityScore: 100, errors: [], warnings: [] }, validationSource: 'apply', executed: 'not-run',
    });
    const goldenCase = readGoldenCase(saved.directory);
    assert.equal(goldenCase.plan.reuseTarget?.locators, CONTACT_LOCATORS);
    assert.ok(goldenCase.gaps.some(gap => gap.id === 'gap-platform-coverage'));

    const snapshot = goldenBaselineSnapshotPort(goldenCase);
    for (const file of goldenCase.effectivePlan.files) {
        assert.equal(snapshot.read(file.path).exists, file.operation === 'update', file.path);
    }
    const replay = new DeterministicResolver({ getCatalog: () => goldenCase.catalog }, snapshot).resolve(goldenCase.scenario);
    assert.deepEqual(
        goldenPlanProjection(replay.plan, replay.unresolvedContext.gaps),
        goldenPlanProjection(goldenCase.plan, goldenCase.gaps),
    );
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
    const cases = listGoldenCases(GOLDEN_ROOT);
    if (!cases.length) {
        t.diagnostic('sin casos golden todavia: guarda uno desde la revision («Guardar como dataset»)');
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
