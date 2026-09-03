const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const {
    AutomationRecordingStore,
    prepareRecordedStep,
} = require('../dist/core/automation');
const { DeterministicResolver } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { AutomationMemory } = require('../dist/core/automation');
const { AutomationPackageBuilder, BlockingGapError } = require('../dist/core/automation');
const { AutomationAgentLauncher } = require('../dist/core/automation');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { RecordingCoverageAnalyzer } = require('../dist/core/coverage');
const { frameworkContract } = require('../dist/core/workspace');
const { inferredStrategy } = require('../dist/core/indexing');
const { projectPaths } = require('../dist/core/workspace');
const { screenObjectNames } = require('../dist/core/shared');
const { locatorImportIdentifier } = require('../dist/core/automation');
const {
    defaultValidatorSourcePath,
    validatorRuleCodesFromSource,
} = require('../dist/core/validation');

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);
const { RecordingPlatformUpdater } = require('../dist/core/coverage');
const { FrameworkScanner } = require('../dist/core/workspace');
const { ReuseAnalyzer } = require('../dist/core/indexing');

test('la captura solicita contexto funcional y no un nombre técnico de locator', () => {
    const workspace = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/components/RecorderWorkspace.tsx'
    ), 'utf8');
    assert.match(workspace, /¿Qué función cumple este elemento\?/);
    assert.match(workspace, /id="txtElementContext"/);
    assert.match(workspace, /No se copiará como Step ni como nombre fijo del locator/);
    assert.doesNotMatch(workspace, /Buscar o asignar locator lógico/);
    assert.doesNotMatch(workspace, /Buscar locator del squad o crear uno/);
    const onboarding = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/components/SessionOnboarding.tsx'
    ), 'utf8');
    assert.match(onboarding, /Reprocesar o refinar una grabación/);
    assert.match(onboarding, /id="cmbOnboardingRegeneration"/);
    assert.match(onboarding, /id="txtRegenerationRefinement"/);
    assert.match(onboarding, /id="chkRegenerationClean"/);
});

// Completar tiene que ofrecer las dos salidas, y el reenganche tiene que
// esperar a que la sesión arranque: start-session crea una grabación nueva.
test('completar una grabación ofrece seguir grabando o completar locators', () => {
    const onboarding = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/components/SessionOnboarding.tsx'
    ), 'utf8');
    const controller = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/features/platform-completion/platformCompletionFeature.js'
    ), 'utf8');
    const preload = fs.readFileSync(path.join(__dirname, '../recorder/src/preload.ts'), 'utf8');

    assert.match(onboarding, /id="rdbCompleteSteps"/);
    assert.match(onboarding, /id="rdbCompleteLocators"/);
    assert.match(controller, /rdbCompleteSteps\?\.checked/);
    assert.match(controller, /await state\.sessionReady;[\s\S]{0,200}api\.resumeRecording/);
    assert.match(controller, /rdbCompleteLocators\.disabled = Boolean\(selected && !selected\.hasPlan\)/);
    assert.match(preload, /resumeRecording:.*'resume-recording'/);
});

test('configuración separa squad de la ruta anidada de Features', () => {
    const configuration = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/components/ConfigurationScreen.tsx'
    ), 'utf8');
    const controller = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/features/generation/generationFeature.js'
    ), 'utf8');
    assert.match(configuration, /id="cmbFrameworkFeatureScope"/);
    assert.match(configuration, /Solo limita el mapa de Features/);
    assert.match(controller, /featureScope:\s*cmbFrameworkFeatureScope/);
});

test('scanner y catálogo resuelven las cuatro capas de un Feature anidado por relaciones', () => {
    const scanner = new FrameworkScanner(new ReuseAnalyzer()).scan();
    const interoperabilidad = scanner.squads.find(squad => squad.name === 'interoperabilidad');
    assert.ok(interoperabilidad.featureScopes.some(scope => scope.path === 'tapp/payment'));
    const catalog = new ReuseAnalyzer().getCatalog('interoperabilidad', 'ios', 'tapp/payment');
    assert.equal(catalog.featureScope, 'tapp/payment');
    // Se ancla al escenario que interesa, no al conteo: el squad suma casos.
    const subhome = catalog.scenarios.find(item => /subhome/i.test(item.name || ''));
    assert.ok(subhome, 'el catálogo debe resolver el escenario de subhome');
    const related = subhome.relatedArtifacts;
    assert.ok(related.steps.includes('features/yape-steps-definitions/interoperabilidad/tapp-payments.steps.ts'));
    assert.ok(related.screens.includes('screenobjects/interoperabilidad/tapp-subhome.screen.ts'));
    assert.ok(related.locators.includes('resources/locators/interoperabilidad/tapp-subhome.locator.json'));
});

function request() {
    return {
        squad: 'payment', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado',
        fileName: 'flujo-mobile', locatorModule: 'nueva-pantalla', caseId: 'TC-10239',
        pathType: 'Happy Path', tag: 'miflujo', dataName: 'Usuario QA', platform: 'android'
    };
}

function scenario(actions) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-test', revision: 1,
        fingerprint: 'fingerprint-test', createdAt: new Date(0).toISOString(), squad: 'payment',
        platform: 'android', environment: 'qa', objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos', request: request(),
        actions: actions.map((action, index) => ({ ...action, sequence: index + 1 }))
    };
}

function selectorCandidate(candidateId, selector, locatorType, locatorValue, overrides = {}) {
    return {
        candidateId,
        selector,
        inspectorStrategy: selector.startsWith('~') ? 'accessibility id' : 'id',
        locatorType,
        locatorValue,
        priority: 0,
        stability: 'manual',
        sourceReason: 'Manual Inspector selection',
        primary: true,
        verification: {
            protocolVersion: 3,
            verifiedAt: '2026-08-27T00:00:00.000Z',
            matchCount: 1,
            sameElement: true,
        },
        ...overrides,
    };
}

const emptyCatalog = {
    getCatalog: (squad, platform) => ({ squad, platform, stepDefinitions: [], screenMethods: [], locators: [], features: [] })
};

test('recording persiste datos funcionales y oculta únicamente secretos', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-recording-'));
    const store = new AutomationRecordingStore(root);
    store.start({ squad: 'payment', platform: 'android', environment: 'qa' });
    store.replaceActions([
        {
            action: 'ESCRIBIR', selector: 'id=phone', selectorVerified: true,
            variableName: 'phone', contextHint: 'numero a yapear', value: '999111222',
            selectorCandidates: [selectorCandidate(
                'primary-phone',
                'id=phone',
                'XPATH',
                '//*[@resource-id="phone"]',
                { screenshot: 'forbidden', source: '<hierarchy />', attributes: { text: 'phone' } },
            )],
            screenshot: 'forbidden-top-level',
            source: '<hierarchy />',
        },
        { action: 'ESCRIBIR', selector: 'id=password', variableName: 'password', contextHint: 'contraseña', value: 'secreto' }
    ], {
        squad: 'payment', platform: 'android', environment: 'qa'
    });
    const actions = JSON.parse(fs.readFileSync(path.join(store.getActiveDirectory(), 'actions.json')));
    assert.equal(actions[0].sequence, 1);
    assert.equal(actions[0].value, '999111222');
    assert.equal(actions[1].value, '<password>');
    assert.equal(actions[0].selectorVerified, true);
    assert.equal(actions[0].contextHint, 'numero a yapear');
    assert.equal(actions[0].selectorCandidates, undefined);
    assert.equal(JSON.stringify(actions).includes('forbidden'), false);
    assert.equal(JSON.stringify(actions).includes('hierarchy'), false);
});

test('recording descarta backups derivados de secretos y rechaza un primary sensible', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-secret-locator-'));
    const store = new AutomationRecordingStore(root);
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    store.start(context);
    store.replaceActions([{
        action: 'ESCRIBIR',
        selector: 'id=password',
        selectorVerified: true,
        variableName: 'password',
        contextHint: 'contraseña',
        value: 'secreto',
        selectorCandidates: [
            selectorCandidate(
                'primary-password',
                'id=password',
                'XPATH',
                '//*[@resource-id="password"]',
            ),
            selectorCandidate(
                'backup-password-value',
                'android=new UiSelector().text("secreto")',
                'ANDROID',
                'new UiSelector().text("secreto")',
                { primary: false },
            ),
        ],
    }], context);
    const actions = JSON.parse(fs.readFileSync(path.join(store.getActiveDirectory(), 'actions.json')));
    assert.equal(actions[0].selectorCandidates, undefined);
    assert.equal(JSON.stringify(actions).includes('secreto'), false);

    assert.throws(() => store.replaceActions([{
        action: 'ESCRIBIR',
        selector: '~123',
        selectorVerified: true,
        variableName: 'pin',
        contextHint: 'PIN',
        value: '123',
    }], context), /selector que contiene el valor sensible/);
});

test('prevalidación sensible ocurre antes de ejecutar o mutar el recording', () => {
    let executed = false;
    const recorded = [];
    assert.throws(() => {
        const prepared = prepareRecordedStep({
            action: 'ESCRIBIR',
            selector: '~123',
            selectorVerified: true,
            variableName: 'pin',
            contextHint: 'PIN',
            value: '123',
        }, 1, 'android', false);
        executed = true;
        recorded.push(prepared);
    }, /selector que contiene el valor sensible/);
    assert.equal(executed, false);
    assert.deepEqual(recorded, []);
});

test('replaceActions revierte actions y manifest si falla la persistencia', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-recording-rollback-'));
    const store = new AutomationRecordingStore(root);
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    store.start(context);
    store.replaceActions([{ action: 'CLICK', selector: '~Inicial' }], context);
    const directory = store.getActiveDirectory();
    const actionsFile = path.join(directory, 'actions.json');
    const manifestFile = path.join(directory, 'manifest.json');
    const beforeActions = fs.readFileSync(actionsFile, 'utf-8');
    const beforeManifest = fs.readFileSync(manifestFile, 'utf-8');
    const originalRename = fs.renameSync;
    let failed = false;
    fs.renameSync = (source, target) => {
        if (!failed && target === manifestFile) {
            failed = true;
            throw new Error('disk full');
        }
        return originalRename(source, target);
    };
    try {
        assert.throws(
            () => store.replaceActions([{ action: 'CLICK', selector: '~Nuevo' }], context),
            /disk full/,
        );
    } finally {
        fs.renameSync = originalRename;
    }
    assert.equal(fs.readFileSync(actionsFile, 'utf-8'), beforeActions);
    assert.equal(fs.readFileSync(manifestFile, 'utf-8'), beforeManifest);
    assert.equal(store.replaceActions([{ action: 'CLICK', selector: '~Final' }], context).revision, 2);
});

test('al iniciar elimina únicamente placeholders sin scenario ni acciones', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-prune-'));
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    const emptyStore = new AutomationRecordingStore(root);
    emptyStore.start(context);
    const emptyDirectory = emptyStore.getActiveDirectory();
    emptyStore.reset();

    const withActions = new AutomationRecordingStore(root);
    withActions.start(context);
    withActions.replaceActions([
        { action: 'CLICK', selector: '~Yapear', contextHint: 'abrir yapear' },
    ], context);
    const actionsDirectory = withActions.getActiveDirectory();
    withActions.reset();

    const withScenario = new AutomationRecordingStore(root);
    withScenario.start(context);
    const scenarioDirectory = withScenario.getActiveDirectory();
    fs.writeFileSync(path.join(scenarioDirectory, 'scenario.json'), '{}');
    withScenario.reset();

    const withAdditionalEvidence = new AutomationRecordingStore(root);
    withAdditionalEvidence.start(context);
    const evidenceDirectory = withAdditionalEvidence.getActiveDirectory();
    fs.writeFileSync(path.join(evidenceDirectory, 'evidence.xml'), '<hierarchy />');
    withAdditionalEvidence.reset();

    const cleanup = new AutomationRecordingStore(root).pruneEmptyRecordings();

    assert.deepEqual(cleanup.removed, [path.basename(emptyDirectory)]);
    assert.equal(fs.existsSync(emptyDirectory), false);
    assert.equal(fs.existsSync(actionsDirectory), true);
    assert.equal(fs.existsSync(scenarioDirectory), true);
    assert.equal(fs.existsSync(evidenceDirectory), true);
    assert.equal(cleanup.skipped, 3);
});

test('la limpieza conserva el recording activo aunque todavía esté vacío', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-prune-active-'));
    const store = new AutomationRecordingStore(root);
    store.start({ squad: 'payment', platform: 'android', environment: 'qa' });
    const activeDirectory = store.getActiveDirectory();

    const cleanup = store.pruneEmptyRecordings();

    assert.deepEqual(cleanup.removed, []);
    assert.equal(cleanup.skipped, 1);
    assert.equal(fs.existsSync(activeDirectory), true);
});

// Las dos casuisticas de "Completar una grabacion" dependen de estos flags:
// sin plan no hay locators que asignar, y una grabacion sin Then nunca va a
// tener plan porque el builder la corta antes.
test('el listado dice si la grabación tiene plan y si tiene Then', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-flags-'));
    const recordings = path.join(root, 'runtime', 'recordings');
    const framework = path.join(root, 'framework');

    const write = (name, actions) => {
        const directory = path.join(recordings, name);
        fs.mkdirSync(directory, { recursive: true });
        const recorded = scenario(actions);
        recorded.recordingId = name;
        fs.writeFileSync(path.join(directory, 'scenario.json'), JSON.stringify(recorded));
        return directory;
    };

    write('rec-sin-then', [{ action: 'CLICK', selector: '~Yapear', selectorVerified: true }]);
    write('rec-con-then', [
        { action: 'CLICK', selector: '~Yapear', selectorVerified: true },
        { action: 'VERIFICAR_EXISTE', selector: '~Listo', selectorVerified: true },
    ]);

    const listed = new RecordingCoverageAnalyzer(recordings, framework, framework)
        .listRecordings('payment', 'qa');
    const byId = Object.fromEntries(listed.map(item => [item.id, item]));

    assert.equal(byId['rec-sin-then'].hasAssertion, false);
    assert.equal(byId['rec-sin-then'].hasPlan, false);
    assert.equal(byId['rec-con-then'].hasAssertion, true);
    assert.equal(byId['rec-con-then'].hasPlan, false);
});

// Continuar una grabacion tiene que caer en la MISMA carpeta: si creara una
// nueva, el QA terminaria con dos grabaciones a medias del mismo caso.
test('continuar una grabación reengancha su carpeta y conserva las acciones', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-resume-'));
    const store = new AutomationRecordingStore(root);
    const context = { squad: 'payment', platform: 'android', environment: 'qa' };
    store.start(context);
    store.replaceActions([
        { action: 'CLICK', selector: '~Yapear', contextHint: 'yapear' },
    ], context);
    const original = store.getActiveDirectory();
    const originalId = JSON.parse(fs.readFileSync(path.join(original, 'manifest.json'))).recordingId;

    // Simula el arranque de una sesión nueva, que crea otra grabación vacía.
    const fresh = new AutomationRecordingStore(root);
    fresh.start(context);
    assert.notEqual(fresh.getActiveDirectory(), original);

    const resumed = fresh.resume(original);
    assert.equal(fresh.getActiveDirectory(), original);
    assert.equal(resumed.manifest.recordingId, originalId);
    assert.deepEqual(resumed.actions.map(step => step.selector), ['~Yapear']);

    // El Then que faltaba se suma a las acciones previas, en la misma carpeta.
    fresh.replaceActions([
        ...resumed.actions,
        { action: 'VERIFICAR_EXISTE', selector: '~Listo', contextHint: 'confirmación' },
    ], context);
    const actions = JSON.parse(fs.readFileSync(path.join(original, 'actions.json')));
    assert.deepEqual(actions.map(step => step.action), ['CLICK', 'VERIFICAR_EXISTE']);
    assert.deepEqual(actions.map(step => step.sequence), [1, 2]);
    assert.equal(
        JSON.parse(fs.readFileSync(path.join(original, 'manifest.json'))).recordingId,
        originalId
    );
});

test('una grabación sin manifest ni scenario no se puede continuar', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-resume-bad-'));
    fs.mkdirSync(path.join(root, 'vacia'), { recursive: true });
    assert.throws(
        () => new AutomationRecordingStore(root).resume(path.join(root, 'vacia')),
        /no se puede continuar/
    );
});

test('completar caso lista solo recordings del ambiente y reconstruye su cobertura', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-coverage-'));
    const recordings = path.join(root, 'runtime', 'recordings');
    const framework = path.join(root, 'framework');
    const locatorsRoot = path.join(framework, 'resources', 'locators');
    const recording = path.join(recordings, 'recording-one');
    const automation = path.join(recording, 'generation', 'automation');
    fs.mkdirSync(automation, { recursive: true });
    fs.mkdirSync(path.join(locatorsRoot, 'payment'), { recursive: true });
    const recordedScenario = scenario([{
        action: 'CLICK', selector: '~Yapear', selectorVerified: true,
        elementIntent: 'yapear', sequence: 1
    }]);
    recordedScenario.recordingId = 'rec-runtime-only';
    recordedScenario.createdAt = '2026-08-21T18:00:00.000Z';
    recordedScenario.request.scenarioRows = [{
        keyword: 'When', text: 'el usuario ingresa a yapear', status: 'missing',
        actions: [{ ...recordedScenario.actions[0], sequence: 1 }]
    }];
    fs.writeFileSync(path.join(recording, 'scenario.json'), JSON.stringify(recordedScenario));
    fs.writeFileSync(path.join(automation, 'generation-plan.json'), JSON.stringify({
        schemaVersion: 1, pipelineVersion: '1.0.0', planId: 'plan-runtime',
        recordingId: recordedScenario.recordingId, fingerprint: 'fingerprint',
        deterministicCoverage: 1, status: 'deterministic', unresolvedGapIds: [],
        budgets: { maxDurationMs: 300000, maxContextBytes: 20000, maxRepairAttempts: 1 },
        resolutions: [{
            sequence: 1, action: 'CLICK', intent: 'yapear', resolution: 'create',
            locatorName: 'yapear', selector: '~Yapear', confidence: 1, reason: 'verified'
        }],
        files: [{
            layer: 'locators', path: 'resources/locators/payment/yapear.locator.json', operation: 'create'
        }]
    }));
    fs.writeFileSync(
        path.join(locatorsRoot, 'payment', 'yapear.locator.json'),
        JSON.stringify({ yapearAndroid: { yapear: 'Yapear' }, yapearIos: { yapear: '' } })
    );
    fs.mkdirSync(path.join(framework, 'features', 'yape-features', 'payment'), { recursive: true });
    fs.writeFileSync(
        path.join(framework, 'features', 'yape-features', 'payment', 'ignored.feature'),
        'Feature: No debe aparecer\nScenario: Caso del framework\n'
    );

    const analyzer = new RecordingCoverageAnalyzer(recordings, framework, locatorsRoot);
    const listed = analyzer.listRecordings('payment', 'qa');
    assert.deepEqual(listed.map(item => item.id), ['rec-runtime-only']);
    assert.equal(listed[0].canRegenerate, false);
    assert.equal(listed.some(item => item.name === 'Caso del framework'), false);
    const coverage = analyzer.analyze('payment', 'rec-runtime-only', 'qa');
    assert.equal(coverage.locators.length, 1);
    assert.equal(coverage.locators[0].androidSelector, 'Yapear');
    assert.equal(coverage.locators[0].iosSelector, '');
    assert.equal(coverage.steps[0].text, 'el usuario ingresa a yapear');
});

test('completar iOS conserva Android y sincroniza únicamente locator y estrategia generados', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-completion-'));
    const recordings = path.join(root, 'runtime', 'recordings');
    const framework = path.join(root, 'framework');
    const locatorsRoot = path.join(framework, 'resources', 'locators');
    const screensRoot = path.join(framework, 'screenobjects');
    const recording = path.join(recordings, 'recording-one');
    const automation = path.join(recording, 'generation', 'automation');
    const locatorRelative = 'resources/locators/payment/movements.locator.json';
    const screenRelative = 'screenobjects/payment/movements.screen.ts';
    const featureRelative = 'features/yape-features/payment/movements.feature';
    const stepsRelative = 'features/yape-steps-definitions/payment/movements.steps.ts';
    const locatorFile = path.join(framework, locatorRelative);
    const screenFile = path.join(framework, screenRelative);
    const featureFile = path.join(framework, featureRelative);
    const stepsFile = path.join(framework, stepsRelative);
    fs.mkdirSync(automation, { recursive: true });
    for (const file of [locatorFile, screenFile, featureFile, stepsFile]) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    const recordedScenario = scenario([{
        action: 'CLICK', selector: 'id=showMovements', selectorVerified: true,
        elementIntent: 'mostrar movimientos', sequence: 1
    }]);
    recordedScenario.recordingId = 'rec-complete-ios';
    const plan = {
        schemaVersion: 1, pipelineVersion: '1.0.0', planId: 'plan-complete-ios',
        recordingId: recordedScenario.recordingId, fingerprint: 'fingerprint',
        deterministicCoverage: 1, status: 'deterministic', unresolvedGapIds: [],
        budgets: { maxDurationMs: 300000, maxContextBytes: 20000, maxRepairAttempts: 1 },
        resolutions: [{
            sequence: 1, action: 'CLICK', intent: 'mostrar movimientos', resolution: 'create',
            locatorName: 'mostrarMovimientos', selector: 'id=showMovements', confidence: 1,
            reason: 'verified'
        }],
        files: [
            { layer: 'feature', path: featureRelative, operation: 'create' },
            { layer: 'steps', path: stepsRelative, operation: 'create' },
            { layer: 'screen', path: screenRelative, operation: 'create' },
            { layer: 'locators', path: locatorRelative, operation: 'create' }
        ]
    };
    const locatorContent = JSON.stringify({
        movementsAndroid: { mostrarMovimientos: 'showMovements' },
        movementsIos: { mostrarMovimientos: '' }
    }, null, 4) + '\n';
    const screenContent = [
        'private get mostrarMovimientos(): string {',
        '  return LocatorFactory.getElement(',
        '    TypeLocator.XPATH, Locators["movementsIos"].mostrarMovimientos,',
        '    TypeLocator.ID, Locators["movementsAndroid"].mostrarMovimientos',
        '  );',
        '}',
        ''
    ].join('\n');
    const response = {
        schemaVersion: 1, recordingId: recordedScenario.recordingId, planId: plan.planId,
        resolutions: [], actionTrace: [{ sequence: 1, gherkinStep: 'When abre movimientos' }],
        files: [
            { layer: 'feature', path: featureRelative, content: 'Feature: Movimientos\n\n  @miflujo @android\n  Scenario: [TC-10239][Happy Path][AUTO-FRONT] Movimientos\n    Then visualiza sus movimientos\n' },
            { layer: 'steps', path: stepsRelative, content: 'STEPS ORIGINAL' },
            { layer: 'screen', path: screenRelative, content: screenContent },
            { layer: 'locators', path: locatorRelative, content: locatorContent }
        ]
    };
    fs.writeFileSync(path.join(recording, 'scenario.json'), JSON.stringify(recordedScenario));
    fs.writeFileSync(path.join(automation, 'scenario.json'), JSON.stringify(recordedScenario));
    fs.writeFileSync(path.join(automation, 'generation-plan.json'), JSON.stringify(plan));
    fs.writeFileSync(path.join(automation, 'agent-response.json'), JSON.stringify(response));
    fs.writeFileSync(locatorFile, locatorContent);
    fs.writeFileSync(screenFile, screenContent);
    const originalFeature = response.files.find(file => file.layer === 'feature').content;
    fs.writeFileSync(featureFile, originalFeature);
    fs.writeFileSync(stepsFile, 'STEPS ORIGINAL');

    const updater = new RecordingPlatformUpdater(
        recordings, framework, locatorsRoot, screensRoot,
        path.join(framework, 'features', 'yape-features')
    );
    const result = updater.update({
        recordingId: recordedScenario.recordingId,
        squad: 'payment',
        file: locatorRelative,
        name: 'mostrarMovimientos',
        selector: '~Mostrar movimientos',
        platform: 'ios',
        androidBlock: 'movementsAndroid',
        iosBlock: 'movementsIos'
    });

    const locators = JSON.parse(fs.readFileSync(locatorFile));
    assert.equal(locators.movementsAndroid.mostrarMovimientos, 'showMovements');
    assert.equal(locators.movementsIos.mostrarMovimientos, 'Mostrar movimientos');
    assert.match(fs.readFileSync(screenFile, 'utf8'), /TypeLocator\.ID, Locators\["movementsIos"\]\.mostrarMovimientos/);
    assert.equal(fs.readFileSync(featureFile, 'utf8'), originalFeature);
    assert.equal(fs.readFileSync(stepsFile, 'utf8'), 'STEPS ORIGINAL');
    const savedResponse = JSON.parse(fs.readFileSync(path.join(automation, 'agent-response.json')));
    assert.match(savedResponse.files.find(file => file.layer === 'screen').content, /TypeLocator\.ID/);
    assert.equal(
        JSON.parse(savedResponse.files.find(file => file.layer === 'locators').content)
            .movementsIos.mostrarMovimientos,
        'Mostrar movimientos'
    );
    assert.equal(savedResponse.files.find(file => file.layer === 'feature').content, originalFeature);
    assert.equal(savedResponse.files.find(file => file.layer === 'steps').content, 'STEPS ORIGINAL');
    assert.deepEqual(result.updatedFiles.sort(), [locatorRelative, screenRelative].sort());
    const completedFiles = updater.markComplete(recordedScenario.recordingId, 'payment', 'ios');
    const status = JSON.parse(fs.readFileSync(path.join(automation, 'status.json')));
    assert.equal(status.platformCompletion.ios.state, 'complete');
    assert.deepEqual(completedFiles, [featureRelative]);
    assert.match(fs.readFileSync(featureFile, 'utf8'), /@miflujo @android @ios/);
    const completedResponse = JSON.parse(fs.readFileSync(path.join(automation, 'agent-response.json')));
    assert.match(completedResponse.files.find(file => file.layer === 'feature').content, /@android @ios/);
});

test('resolver propone dataName editable cuando el recording no lo especifica', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=resultado', selectorVerified: true,
        elementIntent: 'resultado esperado'
    }]);
    recorded.request.dataName = '';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    assert.equal(result.scenario.request.dataName, 'Usuario QA Temporal');
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id === 'gap-test-data'), false);
});

test('resolver filtra por featureScope y extiende artefactos relacionados sin duplicarlos', () => {
    let requestedScope = null;
    const catalog = {
        getCatalog: (squad, platform, featureScope) => {
            requestedScope = featureScope;
            return {
                squad, platform, featureScope,
                stepDefinitions: [], screenMethods: [], features: [], scenarios: [],
                locators: [{
                    name: 'btnFiltrarMovimientos', selector: 'id=filter',
                    androidSelector: 'id=filter', iosSelector: '',
                    // La estrategia la declara el getter que lo consume; sin ella
                    // el resolver no puede afirmar que el locator sirva.
                    androidStrategy: 'XPATH',
                    file: 'resources/locators/payment/filtro-movimientos.locator.json',
                    module: 'payment/filtro-movimientos', squad: 'payment',
                    scope: 'squad', platform: 'android'
                }],
                artifactBundles: [{
                    steps: 'features/yape-steps-definitions/payment/filtro-movimientos.steps.ts',
                    screens: ['screenobjects/payment/filtro-movimientos.screen.ts'],
                    locators: ['resources/locators/payment/filtro-movimientos.locator.json'],
                    stepExpressions: ['el usuario consulta sus movimientos'],
                    screenMethods: ['consultarMovimientos']
                }]
            };
        }
    };
    const recorded = scenario([{
        action: 'CLICK', selector: 'id=filter', selectorVerified: true,
        contextHint: 'permite filtrar los movimientos'
    }]);
    recorded.request.featureScope = 'tapp/payment';
    const result = new DeterministicResolver(catalog).resolve(recorded);
    assert.equal(requestedScope, 'tapp/payment');
    assert.match(result.plan.files.find(file => file.layer === 'feature').path,
        /^features\/yape-features\/payment\/tapp\/payment\/.+\.feature$/);
    assert.equal(result.plan.files.find(file => file.layer === 'steps').operation, 'update');
    assert.equal(result.plan.files.find(file => file.layer === 'screen').path,
        'screenobjects/payment/filtro-movimientos.screen.ts');
    assert.equal(result.plan.files.find(file => file.layer === 'locators').operation, 'update');
    assert.equal(result.plan.reuseTarget.locators,
        'resources/locators/payment/filtro-movimientos.locator.json');
    assert.ok(result.plan.unresolvedGapIds.includes('gap-extend-existing-artifacts'));
});

test('resolver extiende Screen y Locators relacionados aunque todavía no exista un Steps que los importe', () => {
    const screen = 'screenobjects/payment/movements.screen.ts';
    const locators = 'resources/locators/payment/movements.locator.json';
    const methods = [
        ['showMovements', ['showmovements']],
        ['ShowAll', ['seeall']],
        ['filtermovement', ['btnfilter']],
        ['filterday', ['btntoday', 'btn7days', 'btn15days', 'btn30days', 'btn90days']],
        ['validateMovementsScreen', ['titleMovements']],
    ].map(([name, locatorKeys]) => ({
        name,
        file: screen,
        squad: 'payment',
        locatorFiles: [locators, 'resources/locators/home/home.locator.json'],
        signature: name === 'filterday' ? 'filterday(filtro_dia: string)' : `${name}()`,
        locatorKeys,
        className: 'movementScreen',
    }));
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform,
            stepDefinitions: [], features: [], scenarios: [], artifactBundles: [],
            screenMethods: methods,
            locators: [],
        }),
    };
    const recorded = scenario([
        { action: 'CLICK', selector: 'android=new UiSelector().text("Mostrar movimientos")', selectorVerified: true, contextHint: 'boton de mostrar movimientos' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, contextHint: '' },
        { action: 'CLICK', selector: '~Ver todos', selectorVerified: true, contextHint: 'boton de ver todos los movimientos' },
        { action: 'CLICK', selector: '~Botón de filtrar', selectorVerified: true, contextHint: 'boton de filtro de movimientos' },
        { action: 'CLICK', selector: 'android=new UiSelector().text("Solo hoy")', selectorVerified: true, contextHint: 'filtrar por solo hoy' },
        { action: 'CLICK', selector: 'android=new UiSelector().text("Últimos 30 días")', selectorVerified: true, contextHint: 'filtrar por ultimos 30 dias' },
        { action: 'VERIFICAR_EXISTE', selector: '//android.view.View', selectorVerified: true, contextHint: 'se valida el titulo del contenedor movimientos' },
    ]);
    recorded.objective = 'el usuario debe poder usar todos los filtros de movimientos disponibles';
    recorded.acceptanceCriteria = 'se muestran los movimientos esperados';

    const result = new DeterministicResolver(catalog).resolve(recorded);

    assert.equal(result.plan.reuseTarget.screen, screen);
    assert.equal(result.plan.reuseTarget.locators, locators);
    assert.equal(result.plan.reuseTarget.steps, undefined);
    assert.equal(result.plan.files.find(file => file.layer === 'feature').operation, 'create');
    assert.equal(result.plan.files.find(file => file.layer === 'steps').operation, 'create');
    assert.deepEqual(
        result.plan.files.filter(file => ['screen', 'locators'].includes(file.layer))
            .map(file => [file.layer, file.path, file.operation]),
        [
            ['screen', screen, 'update'],
            ['locators', locators, 'update'],
        ],
    );
    assert.ok(result.plan.unresolvedGapIds.includes('gap-extend-existing-artifacts'));
    assert.equal(
        result.plan.resolutions.find(item => item.sequence === 6).existingMethod.name,
        'filterday',
    );
});

test('validator acepta reutilizar un Screen y Locator update sin reescribir su deuda legacy', t => {
    const screenPath = 'screenobjects/payment/movements.screen.ts';
    const locatorPath = 'resources/locators/payment/movements.locator.json';
    const screenContent = fs.readFileSync(path.join(projectPaths.frameworkRoot, screenPath), 'utf8');
    const locatorContent = fs.readFileSync(path.join(projectPaths.frameworkRoot, locatorPath), 'utf8');
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'android=new UiSelector().text("Movimientos")',
        selectorVerified: true,
        contextHint: 'valida que se muestre la pantalla de movimientos',
    }]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const plan = {
        ...resolved.plan,
        unresolvedGapIds: [],
        reuseTarget: {
            screen: screenPath,
            locators: locatorPath,
            score: 1,
            reason: 'Screen y locators existentes cubren la validación.',
        },
        files: resolved.plan.files.map(file => {
            if (file.layer === 'screen') return { ...file, path: screenPath, operation: 'update' };
            if (file.layer === 'locators') return { ...file, path: locatorPath, operation: 'update' };
            return file;
        }),
        resolutions: resolved.plan.resolutions.map(resolution => ({
            ...resolution,
            locatorName: 'generatedMovementsTitle',
            reuseCandidates: [{
                file: locatorPath,
                module: 'payment/movements',
                name: 'titleMovements',
            }],
            existingMethod: {
                name: 'validateMovementsScreen',
                signature: 'validateMovementsScreen()',
                file: screenPath,
                locatorKeys: ['titleMovements'],
                score: 1,
            },
        })),
    };
    const response = validResponse(plan);
    response.files.find(file => file.layer === 'feature').content =
        '@payment\nFeature: Consulta de movimientos\n\n@miflujo @android @ios\n' +
        '  Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] Consulta de movimientos\n' +
        '    Given el usuario <username> inicia sesión en Yape\n' +
        '    Then se muestra la lista de movimientos\n\n' +
        '    Examples:\n      | username   |\n      | Usuario QA |\n';
    response.files.find(file => file.layer === 'steps').content =
        "import { Then } from '@wdio/cucumber-framework';\n" +
        "import movementScreen from '@screenobjects/payment/movements.screen.ts';\n" +
        "Then(/^se muestra la lista de movimientos$/, async () => { " +
        'await movementScreen.validateMovementsScreen(); });\n';
    response.files.find(file => file.layer === 'screen').content = screenContent;
    response.files.find(file => file.layer === 'locators').content = locatorContent;
    response.actionTrace = [{
        sequence: 1,
        gherkinStep: 'Then se muestra la lista de movimientos',
        screenMethod: 'validateMovementsScreen',
        locatorName: 'titleMovements',
    }];

    const validation = new AutomationResponseValidator(undefined, {
        getCatalog: (squad, platform) => ({
            squad,
            platform,
            stepDefinitions: [],
            features: [],
            scenarios: [],
            artifactBundles: [],
            locators: [{
                name: 'titleMovements',
                selector: 'android=new UiSelector().text("Movimientos")',
                androidSelector: 'android=new UiSelector().text("Movimientos")',
                iosSelector: 'Movimientos',
                file: locatorPath,
                module: 'payment/movements',
                squad: 'payment',
                scope: 'squad',
                platform: 'android',
            }],
            screenMethods: [{
                name: 'validateMovementsScreen',
                signature: 'validateMovementsScreen()',
                file: screenPath,
                squad: 'payment',
                locatorFiles: [locatorPath],
                locatorKeys: ['titleMovements'],
                className: 'movementScreen',
            }],
        }),
    }).validate(resolved.scenario, plan, response);

    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    assert.equal(validation.qualityScore, 100);

    // El verificador que viaja dentro del paquete debe aplicar la misma regla.
    // De lo contrario Copilot obtiene PASS local y el recorder lo rechaza al
    // importar, o viceversa.
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-existing-screen-'));
    t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));
    const packagedPlan = {
        ...plan,
        status: 'needs-agent',
        unresolvedGapIds: ['gap-reuse-existing-screen'],
    };
    const packagedResult = {
        ...resolved,
        plan: packagedPlan,
        unresolvedContext: {
            ...resolved.unresolvedContext,
            planId: packagedPlan.planId,
            gaps: [{
                id: 'gap-reuse-existing-screen',
                type: 'framework-reuse',
                description: 'Reutilizar las APIs existentes de movimientos.',
                requiredOutput: 'Feature y Steps nuevos referenciando el Screen existente.',
                blocking: false,
                allowedQueries: [],
                maxQueries: 0,
                evidenceRequired: ['generation-plan'],
            }],
        },
    };
    const prepared = new AutomationPackageBuilder(
        { resolve: () => packagedResult },
        new AutomationMemory(path.join(packageRoot, 'memory')),
    ).prepare(recorded, packageRoot);
    const packagedResponse = {
        ...response,
        planId: packagedPlan.planId,
        resolutions: [{
            gapId: 'gap-reuse-existing-screen',
            decision: 'reuse-existing',
            reason: 'El Screen y Locator indexados ya cubren la acción.',
        }],
    };
    fs.writeFileSync(
        path.join(prepared.packageDirectory, 'agent-response.json'),
        JSON.stringify(packagedResponse, null, 2),
    );
    assert.doesNotThrow(() => execFileSync(
        process.execPath,
        ['verify-package.js'],
        { cwd: prepared.packageDirectory, stdio: 'pipe' },
    ));
});

test('generador escribe el Feature en su alcance y conserva otras capas en el squad', () => {
    const preview = new FwkMobileGenerator().preview({
        ...request(),
        featureScope: 'tapp/payment',
        scenarioRows: [{
            keyword: 'Then', text: 'se muestra el resultado esperado', status: 'missing',
            actions: [{
                action: 'VERIFICAR_EXISTE', selector: 'id=result', selectorVerified: true,
                variableName: 'resultado'
            }]
        }]
    }, [{ action: 'VERIFICAR_EXISTE', selector: 'id=result', variableName: 'resultado' }]);
    assert.match(preview.featurePath.replace(/\\/g, '/'),
        /features\/yape-features\/payment\/tapp\/payment\/flujo-mobile\.feature$/);
    assert.match(preview.stepPath.replace(/\\/g, '/'),
        /features\/yape-steps-definitions\/payment\/flujo-mobile\.steps\.ts$/);
    assert.match(preview.screenPath.replace(/\\/g, '/'),
        /screenobjects\/payment\/nueva-pantalla\.screen\.ts$/);
});

test('resolver convierte un teléfono grabado en parámetro y Example', () => {
    const recorded = scenario([{
        action: 'ESCRIBIR', selector: 'id=phone', selectorVerified: true,
        elementIntent: 'input de nuevo numero', value: '999111222'
    }]);
    recorded.objective = 'buscar usuario para yapear';
    recorded.acceptanceCriteria = 'mostrar el usuario encontrado';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const row = result.scenario.request.scenarioRows[1];
    // El parametro viaja al Gherkin, a Examples y a la variable del step: ingles.
    assert.equal(row.actions[0].value, '<number>');
    assert.equal(result.scenario.request.examples.number, '999111222');
});

test('resolver rechaza como completo un valor funcional perdido', () => {
    const recorded = scenario([{
        action: 'ESCRIBIR', selector: 'id=phone', selectorVerified: true,
        elementIntent: 'input de nuevo numero', value: '<valor>'
    }]);
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    assert.equal(result.plan.status, 'needs-agent');
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.type === 'test-input'), true);
});

test('resolver crea nombres semánticos y no solicita al agente cuando todo está verificado', () => {
    const resolver = new DeterministicResolver(emptyCatalog);
    const result = resolver.resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    assert.equal(result.plan.status, 'deterministic');
    assert.equal(result.plan.deterministicCoverage, 1);
    // "lista de movimientos" se traduce sin pasar por el agente: el camino
    // determinista sigue costando cero tokens.
    assert.equal(result.plan.resolutions[0].locatorName, 'movementsList');
    assert.equal(result.plan.files.length, 4);
    assert.equal(result.unresolvedContext.gaps.length, 0);
});

test('resolver delega la semántica de un saldo dinámico sin descartar el selector verificado', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_TEXTO', selector: 'id=saldo', selectorVerified: true,
        elementIntent: 'saldo disponible', value: 'S/ 760.59'
    }]));
    assert.equal(result.plan.resolutions[0].resolution, 'create');
    assert.equal(result.plan.status, 'needs-agent');
    assert.equal(result.unresolvedContext.gaps[0].type, 'verification-semantics');
    assert.match(result.unresolvedContext.gaps[0].requiredOutput, /contenido no vacío/);
});

test('generador consolida pasos repetidos y usa acceso seguro a bloques locator', () => {
    const repeatedScroll = {
        action: 'SCROLL_DOWN', selector: '', variableName: '', value: '',
        elementIntent: 'desplazar movimientos'
    };
    const click = {
        action: 'CLICK', selector: '~Ver todos', variableName: 'verTodos', value: '',
        elementIntent: 'ver todos los movimientos'
    };
    const preview = new FwkMobileGenerator().preview({
        ...request(),
        featureName: 'Movimientos', scenarioName: 'Consultar movimientos',
        fileName: 'movimientos', locatorModule: 'movements-filter',
        scenarioRows: [
            { keyword: 'When', text: 'el usuario desplaza movimientos', status: 'missing', actions: [repeatedScroll] },
            { keyword: 'And', text: 'el usuario desplaza movimientos', status: 'missing', actions: [repeatedScroll] },
            { keyword: 'Then', text: 'se muestra ver todos', status: 'missing', actions: [click] },
        ]
    }, [repeatedScroll, repeatedScroll, click]);
    assert.equal((preview.stepContent.match(/el usuario desplaza movimientos/g) || []).length, 1);
    // El step sigue en espanol; el metodo que lo implementa, no.
    assert.equal((preview.screenContent.match(/userScrollMovements\(/g) || []).length, 1);
    // Contrato vigente (locator-bracket-notation): el acceso es siempre por
    // notacion de punto, nunca por corchetes.
    assert.match(preview.screenContent, /LocatorMovementsFilter\.movementsFilterAndroid\.verTodos/);
});

test('resolver agrupa acciones técnicas en comportamiento y propone rutas compactas', () => {
    const recorded = scenario([
        { action: 'CLICK', selector: 'id=movements', selectorVerified: true, elementIntent: 'mostrar movimientos' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'CLICK', selector: '~Ver todos', selectorVerified: true, elementIntent: 'ver todos los movimientos' },
        { action: 'VERIFICAR_EXISTE', selector: '~Botón de filtrar', selectorVerified: true, elementIntent: 'verificar boton de filtro de movimientos' },
    ]);
    recorded.objective = 'el usuario debe poder ver todos sus movimientos y ubicar el boton de filtro';
    recorded.acceptanceCriteria = 'verificar que existe el filtro de movimientos';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    // El archivo va en ingles como el resto del framework; la linea Feature,
    // que deriva del mismo texto, se queda en espanol porque la lee el QA.
    assert.match(result.plan.files[0].path, /filter-movements\.feature$/);
    assert.equal(result.scenario.request.featureName, 'Filtro de movimientos');
    assert.equal(result.scenario.request.scenarioRows.length, 3);
    assert.equal(result.scenario.request.scenarioRows[1].text, 'el usuario consulta todos sus movimientos');
    assert.equal(result.scenario.request.scenarioRows[1].actions.length, 4);
    assert.equal(result.scenario.request.scenarioRows[2].text, 'se muestran los movimientos esperados');
});

test('resolver usa contextHint como pista sin copiarlo literalmente al Gherkin', () => {
    const contextHint = 'permite consultar el detalle consolidado de la cuenta seleccionada';
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'CLICK', selector: 'id=detalle', selectorVerified: true, contextHint
    }]));
    const generated = result.scenario.request.scenarioRows.map(row => row.text);
    assert.equal(generated.includes(contextHint), false);
    assert.equal(result.scenario.actions[0].contextHint, contextHint);
});

test('resolver reutiliza las cuatro capas cuando encuentra un caso equivalente del squad', () => {
    const paths = {
        feature: 'features/yape-features/payment/filtro-movimientos.feature',
        steps: 'features/yape-steps-definitions/payment/filtro-movimientos.steps.ts',
        screen: 'screenobjects/payment/filtro-movimientos.screen.ts',
        locators: 'resources/locators/payment/filtro-movimientos.locator.json'
    };
    const locator = (name, selector) => ({
        name, selector, androidSelector: selector, iosSelector: '', file: paths.locators,
        androidStrategy: inferredStrategy(selector) || 'ID',
        module: 'payment/filtro-movimientos', squad: 'payment', scope: 'squad', platform: 'android'
    });
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform, stepDefinitions: [], screenMethods: [], features: [],
            locators: [
                locator('mostrarMovimientos', 'new UiSelector().text("Mostrar movimientos")'),
                locator('verTodosLosMovimientos', 'Ver todos'),
                locator('botonDeFiltroDeMovimientos', 'Botón de filtrar')
            ],
            scenarios: [{
                feature: 'Filtro de movimientos',
                name: '[TC-10239][Happy Path][AUTO-FRONT] Filtro movimientos',
                caseId: 'TC-10239', file: paths.feature, artifacts: paths,
                steps: [
                    { keyword: 'Given', text: 'el usuario <username> inicia sesión en Yape' },
                    { keyword: 'When', text: 'el usuario consulta todos sus movimientos' },
                    { keyword: 'Then', text: 'se muestra el botón de filtro de movimientos' }
                ]
            }]
        })
    };
    const recorded = scenario([
        { action: 'CLICK', selector: 'android=new UiSelector().text("Mostrar movimientos")', selectorVerified: true, elementIntent: 'mostrar movimientos' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'CLICK', selector: '~Ver todos', selectorVerified: true, elementIntent: 'ver todos los movimientos' },
        { action: 'VERIFICAR_EXISTE', selector: '~Botón de filtrar', selectorVerified: true, elementIntent: 'verificar el filtro de movimientos' }
    ]);
    recorded.acceptanceCriteria = 'verifica que tenga filtro de movimientos';
    const result = new DeterministicResolver(catalog).resolve(recorded);
    assert.equal(result.plan.existingCase.paths.feature, paths.feature);
    assert.equal(result.resolvedContext.frameworkAwareness.decision, 'reuse-existing');
    assert.equal(result.plan.files.every(file => file.operation === 'update'), true);
    assert.deepEqual(result.plan.resolutions.filter(item => item.selector).map(item => item.resolution), [
        'reuse', 'reuse', 'reuse'
    ]);
});

function validResponse(plan, recordingId = 'rec-test') {
    const screenPath = plan.files.find(file => file.layer === 'screen').path;
    const locatorPath = plan.files.find(file => file.layer === 'locators').path;
    const screenBase = path.basename(screenPath).replace(/\.screen\.(?:ts|js)$/i, '');
    const screenClass = screenBase.split(/[^A-Za-z0-9]+/).filter(Boolean)
        .map(segment => segment[0].toUpperCase() + segment.slice(1)).join('') + 'Screen';
    const screenAlias = screenClass[0].toLowerCase() + screenClass.slice(1);
    const screenImport = '@screenobjects/' + screenPath.replace(/^screenobjects\//, '');
    const locatorImport = '@locators/' + locatorPath.replace(/^resources\/locators\//, '');
    const content = {
        // El Given viene de login.steps.ts: se copia literal y su usuario
        // viaja por Examples, nunca inlinado dentro del step.
        feature: 'Feature: Consulta de movimientos\n\n@miflujo @android\n  Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] Consulta\n    Given el usuario <username> inicia sesión en Yape\n    Then se muestra la lista de movimientos\n\n    Examples:\n      | username   |\n      | Usuario QA |\n',
        steps: `import { Then } from '@wdio/cucumber-framework';\nimport ${screenAlias} from '${screenImport}';\nThen(/^se muestra la lista de movimientos$/, async () => { await ${screenAlias}.verifyMovementsList(); });\n`,
        // El fixture se arma desde el contrato real del framework: si el
        // framework renombra o mueve un anclaje, el test lo sigue.
        screen: `import ${CONTRACT.baseScreenClass} from '${CONTRACT.baseScreenImport}';\nimport ${CONTRACT.locatorFactorySymbol} from '${CONTRACT.locatorFactoryImport}';\nimport { ${CONTRACT.typeLocatorSymbol} } from '${CONTRACT.typeLocatorImport}';\nimport Locators from '${locatorImport}' with { type: 'json' };\nclass ${screenClass} extends ${CONTRACT.baseScreenClass} { private get movementsList(): string { return ${CONTRACT.locatorFactorySymbol}.getElement(${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaIos.movementsList, ${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaAndroid.movementsList); } public async verifyMovementsList(): Promise<void> { await this.uiHelper.waitForDisplayed(this.movementsList); } }\nexport default new ${screenClass}();\n`,
        locators: JSON.stringify({ consultaAndroid: { movementsList: '//*[@resource-id="movimientos"]' }, consultaIos: { movementsList: '' } }, null, 2)
    };
    return {
        schemaVersion: 1, recordingId, planId: plan.planId, resolutions: [],
        actionTrace: [{
            sequence: 1,
            gherkinStep: 'Then se muestra la lista de movimientos',
            screenMethod: 'verifyMovementsList',
            locatorName: 'movementsList',
        }],
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, content: content[file.layer] }))
    };
}

// `validResponse` importa los locators con el alias genérico "Locators" por
// simplicidad de fixture; el contrato vigente (locator-import-identifier)
// exige el alias derivado del archivo. Los tests que verifican una respuesta
// completamente válida necesitan el identificador real para no chocar contra
// esa regla; los que solo buscan un código de error puntual no la necesitan.
function withPlanLocatorIdentifier(plan, response) {
    const locatorPath = plan.files.find(file => file.layer === 'locators').path;
    const identifier = locatorImportIdentifier(locatorPath);
    const screen = response.files.find(file => file.layer === 'screen');
    if (screen) screen.content = screen.content.replace(/\bLocators\b/g, identifier);
    return response;
}

test('validator exige clave contraparte y prohíbe literal vacío en getElement', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);

    const missingCounterpart = validResponse(resolved.plan);
    const missingCounterpartLocators = JSON.parse(
        missingCounterpart.files.find(file => file.layer === 'locators').content
    );
    delete missingCounterpartLocators.consultaIos;
    missingCounterpart.files.find(file => file.layer === 'locators').content =
        JSON.stringify(missingCounterpartLocators);
    const counterpartValidation = validator.validate(resolved.scenario, resolved.plan, missingCounterpart);
    assert.equal(counterpartValidation.valid, false);
    assert.equal(
        counterpartValidation.errors.some(error => error.code === 'platform-coverage'),
        true
    );

    const emptyLiteral = validResponse(resolved.plan);
    const emptyScreen = emptyLiteral.files.find(file => file.layer === 'screen');
    emptyScreen.content = emptyScreen.content
        .replace('Locators.consultaIos.movementsList', "''");
    const emptyLiteralValidation = validator.validate(resolved.scenario, resolved.plan, emptyLiteral);
    assert.equal(emptyLiteralValidation.valid, false);
    assert.equal(
        emptyLiteralValidation.errors.some(error =>
            error.code === 'getElement-order' && error.message.includes('literal vacío')
        ),
        true
    );
});

test('validator exige cuatro capas, trazabilidad y Then', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);
    const validation = validator.validate(
        resolved.scenario, resolved.plan,
        withPlanLocatorIdentifier(resolved.plan, validResponse(resolved.plan)),
    );
    assert.equal(validation.valid, true);
    assert.equal(validation.qualityScore, 100);

    const brokenSyntax = validResponse(resolved.plan);
    const brokenSteps = brokenSyntax.files.find(file => file.layer === 'steps');
    brokenSteps.content = brokenSteps.content
        .replace('Then(/^se muestra la lista de movimientos$/', 'Then(../../../../../../../../../../../../^se muestra la lista de movimientos$/');
    const syntaxValidation = validator.validate(resolved.scenario, resolved.plan, brokenSyntax);
    assert.equal(syntaxValidation.valid, false);
    const stepsPathPattern = resolved.plan.files.find(file => file.layer === 'steps').path
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.equal(
        syntaxValidation.errors.some(error =>
            error.code === 'typescript-syntax'
            && new RegExp(`${stepsPathPattern}:\\d+:\\d+`).test(error.message)
        ),
        true
    );

    const invented = validResponse(resolved.plan);
    const inventedLocators = JSON.parse(invented.files.find(file => file.layer === 'locators').content);
    inventedLocators.consultaAndroid.movementsList = '//*[@text="Inventado"]';
    invented.files.find(file => file.layer === 'locators').content = JSON.stringify(inventedLocators);
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, invented)
            .errors.some(error => error.code === 'invented-selector'),
        true,
    );

    const smuggled = validResponse(resolved.plan);
    smuggled.resolutions = [{ gapId: 'x', decision: 'reuse', selector: '//*[@text="Inventado"]' }];
    smuggled.completions = [{
        file: 'resources/locators/payment/existing.locator.json',
        name: 'existing',
        platform: 'android',
        sequence: 1,
        selector: '//*[@text="Inventado"]',
    }];
    const smuggledErrors = validator.validate(resolved.scenario, resolved.plan, smuggled).errors;
    assert.equal(smuggledErrors.some(error => error.code === 'resolution-shape'), true);
    assert.equal(smuggledErrors.some(error => error.code === 'completion-shape'), true);

    const androidOnly = validResponse(resolved.plan);
    const androidOnlyLocators = JSON.parse(
        androidOnly.files.find(file => file.layer === 'locators').content
    );
    delete androidOnlyLocators.consultaIos;
    androidOnly.files.find(file => file.layer === 'locators').content =
        JSON.stringify(androidOnlyLocators);
    const androidOnlyValidation = validator.validate(
        resolved.scenario, resolved.plan,
        withPlanLocatorIdentifier(resolved.plan, androidOnly),
    );
    // Contrato vigente (mismo caso que "validator exige clave contraparte..."):
    // a un locator creado le falta la clave contraparte, y eso es un error
    // bloqueante, no solo una advertencia. El warning de cobertura del
    // output-level validator convive con ese error.
    assert.equal(androidOnlyValidation.valid, false);
    assert.equal(
        androidOnlyValidation.errors.some(error => error.code === 'platform-coverage'),
        true
    );
    assert.equal(
        androidOnlyValidation.warnings.some(warning => warning.includes('Cobertura iOS pendiente')),
        true
    );

    const broken = validResponse(resolved.plan);
    broken.actionTrace = [];
    assert.equal(validator.validate(resolved.scenario, resolved.plan, broken).valid, false);

    const withoutAndroidTag = validResponse(resolved.plan);
    withoutAndroidTag.files.find(file => file.layer === 'feature').content =
        withoutAndroidTag.files.find(file => file.layer === 'feature').content.replace(' @android', '');
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, withoutAndroidTag)
            .errors.some(error => error.code === 'platform-tag'),
        true
    );

    const completedIos = validResponse(resolved.plan);
    const iosLocators = JSON.parse(completedIos.files.find(file => file.layer === 'locators').content);
    iosLocators.consultaIos.movementsList = 'Movimientos';
    completedIos.files.find(file => file.layer === 'locators').content = JSON.stringify(iosLocators);
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, completedIos)
            .errors.some(error => error.code === 'platform-tag' && error.message.includes('@ios')),
        false,
        'tener locators iOS históricos no demuestra que este Scenario Android se validó en iOS',
    );
    completedIos.files.find(file => file.layer === 'feature').content =
        completedIos.files.find(file => file.layer === 'feature').content.replace('@android', '@android @ios');
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, completedIos)
            .errors.some(error => error.code === 'invented-selector'),
        true,
    );

    const genericAlias = validResponse(resolved.plan);
    const genericSteps = genericAlias.files.find(file => file.layer === 'steps');
    const semanticAlias = genericSteps.content.match(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+\.screen\.ts['"]/
    )[1];
    genericSteps.content = genericSteps.content.replaceAll(semanticAlias, 'generatedScreen');
    const genericValidation = validator.validate(resolved.scenario, resolved.plan, genericAlias);
    assert.equal(genericValidation.valid, false);
    assert.equal(genericValidation.errors.some(error =>
        error.code === 'screen-alias' && error.message.includes('generatedScreen')
    ), true);

    const relativeImports = validResponse(resolved.plan);
    relativeImports.files.find(file => file.layer === 'screen').content =
        relativeImports.files.find(file => file.layer === 'screen').content
            .replace(`'${CONTRACT.baseScreenImport}'`, "'../commons/base.screen.ts'");
    const relativeValidation = validator.validate(resolved.scenario, resolved.plan, relativeImports);
    assert.equal(relativeValidation.valid, false);
    assert.equal(relativeValidation.errors.some(error =>
        error.code === 'output' && error.message.includes('imports relativos')
    ), true);

    const unusedBrowser = validResponse(resolved.plan);
    unusedBrowser.files.find(file => file.layer === 'screen').content =
        "import { browser } from '@wdio/globals';\n" +
        unusedBrowser.files.find(file => file.layer === 'screen').content;
    const browserValidation = validator.validate(resolved.scenario, resolved.plan, unusedBrowser);
    assert.equal(browserValidation.valid, false);
    assert.equal(browserValidation.errors.some(error =>
        error.code === 'output' && error.message.includes('no lo utiliza')
    ), true);
});

test('validator falla cuando falta un gap abierto en resolutions', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);
    const planWithOpenGap = {
        ...resolved.plan,
        unresolvedGapIds: ['gap-open-1'],
    };

    const missing = validResponse(planWithOpenGap);
    missing.resolutions = [];
    const missingErrors = validator.validate(resolved.scenario, planWithOpenGap, missing).errors;
    assert.equal(missingErrors.some(error => error.code === 'missing-gap-resolution'), true);

    const unresolvedWithoutReason = validResponse(planWithOpenGap);
    unresolvedWithoutReason.resolutions = [{ gapId: 'gap-open-1', decision: 'unresolved' }];
    const withoutReasonErrors = validator.validate(
        resolved.scenario,
        planWithOpenGap,
        unresolvedWithoutReason
    ).errors;
    assert.equal(withoutReasonErrors.some(error => error.code === 'unresolved-gap-without-reason'), true);

    const unresolvedWithReason = validResponse(planWithOpenGap);
    unresolvedWithReason.resolutions = [{
        gapId: 'gap-open-1',
        decision: 'unresolved',
        reason: 'No hubo tiempo suficiente para completar el gap en esta corrida.',
    }];
    assert.equal(
        validator.validate(resolved.scenario, planWithOpenGap, unresolvedWithReason)
            .errors.some(error => error.code === 'missing-gap-resolution'),
        false
    );
});

test('validator no permite intercambiar selectores verificados entre acciones', () => {
    const recorded = scenario([
        {
            action: 'CLICK',
            selector: 'id=movimientos',
            selectorVerified: true,
            elementIntent: 'abrir movimientos',
            selectorCandidates: [
                selectorCandidate(
                    'primary-movements',
                    'id=movimientos',
                    'XPATH',
                    '//*[@resource-id="movimientos"]',
                ),
            ],
        },
        {
            action: 'VERIFICAR_EXISTE',
            selector: 'id=saldo',
            selectorVerified: true,
            elementIntent: 'saldo disponible',
            selectorCandidates: [
                selectorCandidate(
                    'primary-balance',
                    'id=saldo',
                    'XPATH',
                    '//*[@resource-id="saldo"]',
                ),
            ],
        },
    ]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const [first, second] = resolved.plan.resolutions.filter(item => item.locatorName);
    const response = validResponse(resolved.plan);
    response.actionTrace = [
        {
            sequence: first.sequence,
            gherkinStep: 'When el usuario consulta sus movimientos',
            locatorName: first.locatorName,
        },
        {
            sequence: second.sequence,
            gherkinStep: 'Then se muestra el saldo disponible',
            locatorName: second.locatorName,
        },
    ];
    response.files.find(file => file.layer === 'locators').content = JSON.stringify({
        consultaAndroid: {
            [first.locatorName]: '//*[@resource-id="saldo"]',
            [second.locatorName]: '//*[@resource-id="movimientos"]',
        },
        consultaIos: {
            [first.locatorName]: '',
            [second.locatorName]: '',
        },
    });
    const errors = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response).errors;
    assert.equal(errors.filter(error => error.code === 'invented-selector').length, 2);
});

test('validator exige el par primary exacto para create y verifica el TypeLocator del getter', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
        selectorCandidates: [
            selectorCandidate(
                'primary-movements',
                'id=movimientos',
                'XPATH',
                '//*[@resource-id="movimientos"]',
            ),
            selectorCandidate(
                'backup-movements',
                '~Movimientos',
                'ID',
                'Movimientos',
                { primary: false, stability: 'stable', priority: 1 },
            ),
        ],
    }]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);

    const primary = validResponse(resolved.plan);
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, primary).errors
            .some(error => ['invented-selector', 'locator-type-mismatch'].includes(error.code)),
        false,
    );

    const backupCreate = validResponse(resolved.plan);
    const backupLocators = JSON.parse(
        backupCreate.files.find(file => file.layer === 'locators').content
    );
    backupLocators.consultaAndroid.movementsList = 'Movimientos';
    backupCreate.files.find(file => file.layer === 'locators').content =
        JSON.stringify(backupLocators);
    backupCreate.files.find(file => file.layer === 'screen').content =
        backupCreate.files.find(file => file.layer === 'screen').content.replace(
            `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaAndroid.movementsList`,
            `${CONTRACT.typeLocatorSymbol}.ID, Locators.consultaAndroid.movementsList`,
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, backupCreate).errors
            .some(error => error.code === 'invented-selector'),
        true,
    );

    const wrongType = validResponse(resolved.plan);
    wrongType.files.find(file => file.layer === 'screen').content =
        wrongType.files.find(file => file.layer === 'screen').content.replace(
            `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaAndroid.movementsList`,
            `${CONTRACT.typeLocatorSymbol}.ID, Locators.consultaAndroid.movementsList`,
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, wrongType).errors
            .some(error => error.code === 'locator-type-mismatch'),
        true,
    );

    const omitted = validResponse(resolved.plan);
    const omittedLocators = JSON.parse(
        omitted.files.find(file => file.layer === 'locators').content
    );
    delete omittedLocators.consultaAndroid.movementsList;
    omitted.files.find(file => file.layer === 'locators').content =
        JSON.stringify(omittedLocators);
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, omitted).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const decoyGetter = validResponse(resolved.plan);
    const decoyScreen = decoyGetter.files.find(file => file.layer === 'screen');
    decoyScreen.content = decoyScreen.content
        .replace(
            `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaAndroid.movementsList`,
            `${CONTRACT.typeLocatorSymbol}.ID, Locators.consultaAndroid.movementsList`,
        )
        .replace(
            ' public async verifyMovementsList',
            ` private get unrelatedLocator(): string { return ${CONTRACT.locatorFactorySymbol}.getElement(` +
            `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaIos.movementsList, ` +
            `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaAndroid.movementsList); }` +
            ' public async verifyMovementsList',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, decoyGetter).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const deadCall = validResponse(resolved.plan);
    const deadCallScreen = deadCall.files.find(file => file.layer === 'screen');
    const returnedCall = deadCallScreen.content.match(
        /private get movementsList\(\): string \{ return ([^;]+); \}/
    )[1];
    deadCallScreen.content = deadCallScreen.content.replace(
        `{ return ${returnedCall}; }`,
        `{ ${returnedCall}; return ${returnedCall.replace(
            'Locators.consultaAndroid.movementsList',
            'Locators.consultaAndroid.unrelatedLocator',
        )}; }`,
    );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, deadCall).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const shadowedImport = validResponse(resolved.plan);
    const shadowedScreen = shadowedImport.files.find(file => file.layer === 'screen');
    shadowedScreen.content = shadowedScreen.content.replace(
        'private get movementsList(): string {',
        'private get movementsList(): string { const Locators = ' +
        '{ consultaIos: { movementsList: "" }, consultaAndroid: ' +
        '{ movementsList: "//*[@resource-id=\\"movimientos\\"]" } };',
    );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, shadowedImport).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const typeOnlyImport = validResponse(resolved.plan);
    typeOnlyImport.files.find(file => file.layer === 'screen').content =
        typeOnlyImport.files.find(file => file.layer === 'screen').content.replace(
            'import Locators from',
            'import type Locators from',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, typeOnlyImport).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const nestedGetter = validResponse(resolved.plan);
    const nestedScreen = nestedGetter.files.find(file => file.layer === 'screen');
    const validReturnedCall = nestedScreen.content.match(
        /private get movementsList\(\): string \{ return ([^;]+); \}/
    )[1];
    nestedScreen.content = nestedScreen.content
        .replace(
            'Locators.consultaAndroid.movementsList); } public async',
            'Locators.consultaAndroid.unrelatedLocator); } public async',
        )
        .replace(
            'public async verifyMovementsList(): Promise<void> {',
            `public async verifyMovementsList(): Promise<void> { class Decoy { ` +
            `private get movementsList(): string { return ${validReturnedCall}; } }`,
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, nestedGetter).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );

    const hardcodedMethod = validResponse(resolved.plan);
    hardcodedMethod.files.find(file => file.layer === 'screen').content =
        hardcodedMethod.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'await this.uiHelper.waitForDisplayed("~Movimientos");',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, hardcodedMethod).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const literalDecoyUsage = validResponse(resolved.plan);
    // Contrato vigente: un único selector verificado por acción. El decoy ya
    // no viene de un backup retirado; es el propio selector primary
    // hardcodeado en paralelo al getter trazado.
    literalDecoyUsage.files.find(file => file.layer === 'screen').content =
        literalDecoyUsage.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'await this.uiHelper.waitForDisplayed(this.movementsList); ' +
            'await this.uiHelper.waitForDisplayed("id=movimientos");',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, literalDecoyUsage).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const otherGetterMethod = validResponse(resolved.plan);
    const otherGetterScreen = otherGetterMethod.files.find(file => file.layer === 'screen');
    otherGetterScreen.content = otherGetterScreen.content
        .replace(
            ' public async verifyMovementsList',
            ' private get alternativeElement(): string { return "//android.widget.TextView"; }' +
            ' public async verifyMovementsList',
        )
        .replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'await this.uiHelper.waitForDisplayed(this.movementsList); ' +
            'await this.uiHelper.waitForDisplayed(this.alternativeElement);',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, otherGetterMethod).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const localVariableMethod = validResponse(resolved.plan);
    localVariableMethod.files.find(file => file.layer === 'screen').content =
        localVariableMethod.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'const target = this.movementsList; await this.uiHelper.waitForDisplayed(target);',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, localVariableMethod).errors
            .some(error => error.code === 'trace-screen-method'),
        false,
    );

    const getterValueRead = validResponse(resolved.plan);
    getterValueRead.files.find(file => file.layer === 'screen').content =
        getterValueRead.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'const text = await this.movementsList.getText(); ' +
            'await expect(text).toBe("Movimientos disponibles");',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, getterValueRead).errors
            .some(error => error.code === 'trace-screen-method'),
        false,
    );

    const decoyValueRead = validResponse(resolved.plan);
    decoyValueRead.files.find(file => file.layer === 'screen').content =
        decoyValueRead.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'const text = "Movimientos disponibles"; await this.movementsList.getText(); ' +
            'await expect(text).toBe("Movimientos disponibles");',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, decoyValueRead).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    for (const decoyCall of [
        'console.log(this.movementsList);',
        'await Promise.resolve(this.movementsList);',
        'await this.customHelper.process(this.movementsList);',
        'await this.uiHelper.unknownOperation(this.movementsList);',
        'await unknownHelper(this.movementsList);',
    ]) {
        const decoy = validResponse(resolved.plan);
        decoy.files.find(file => file.layer === 'screen').content =
            decoy.files.find(file => file.layer === 'screen').content.replace(
                'await this.uiHelper.waitForDisplayed(this.movementsList);',
                decoyCall,
            );
        assert.equal(
            validator.validate(resolved.scenario, resolved.plan, decoy).errors
                .some(error => error.code === 'trace-screen-method'),
            true,
            `${decoyCall} no debe autorizar el getter`,
        );
    }

    for (const realSink of [
        'await this.movementsList.click();',
        'await this.uiHelper.waitForElementExistByLocator(this.movementsList, true);',
        'await this.keyboardHelper.submitOtp(this.movementsList, "123456");',
        'await expect(this.movementsList).toBeDisplayed();',
        'await expectWebdriverIO(await this.movementsList.getText()).toContain("disponibles");',
        'const text = await this.uiHelper.getElementText(this.movementsList); ' +
            'await expect(text).toContain("disponibles");',
    ]) {
        const validPattern = validResponse(resolved.plan);
        validPattern.files.find(file => file.layer === 'screen').content =
            validPattern.files.find(file => file.layer === 'screen').content.replace(
                'await this.uiHelper.waitForDisplayed(this.movementsList);',
                realSink,
            );
        assert.equal(
            validator.validate(resolved.scenario, resolved.plan, validPattern).errors
                .some(error => error.code === 'trace-screen-method'),
            false,
            `${realSink} debe conservar el provenance del getter`,
        );
    }

    const localLiteralDecoy = validResponse(resolved.plan);
    // Contrato vigente: mismo caso que arriba pero via variable local; ya no
    // depende de un backup retirado, usa el propio selector primary.
    localLiteralDecoy.files.find(file => file.layer === 'screen').content =
        localLiteralDecoy.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'const decoy = "id=movimientos"; ' +
            'await this.uiHelper.waitForDisplayed(this.movementsList); ' +
            'await this.uiHelper.waitForDisplayed(decoy);',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, localLiteralDecoy).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const nestedFunctionDecoy = validResponse(resolved.plan);
    nestedFunctionDecoy.files.find(file => file.layer === 'screen').content =
        nestedFunctionDecoy.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'const unused = async () => { ' +
            'await this.uiHelper.waitForDisplayed(this.movementsList); }; ' +
            'await this.gestureHelper.verticalScrollingToEnd();',
        );
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, nestedFunctionDecoy).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const missingScreenMethod = validResponse(resolved.plan);
    delete missingScreenMethod.actionTrace[0].screenMethod;
    assert.equal(
        validator.validate(resolved.scenario, resolved.plan, missingScreenMethod).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );
});

test('validator relaja trace-locator cuando conserva selector primary verificado', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
        selectorCandidates: [selectorCandidate(
            'primary-movements',
            'id=movimientos',
            'XPATH',
            '//*[@resource-id="movimientos"]',
        )],
    }]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const response = validResponse(resolved.plan);
    response.actionTrace[0].locatorName = 'movementsListAlias';

    const locators = JSON.parse(response.files.find(file => file.layer === 'locators').content);
    locators.consultaAndroid.movementsListAlias = locators.consultaAndroid.movementsList;
    locators.consultaIos.movementsListAlias = locators.consultaIos.movementsList;
    delete locators.consultaAndroid.movementsList;
    delete locators.consultaIos.movementsList;
    response.files.find(file => file.layer === 'locators').content = JSON.stringify(locators);

    response.files.find(file => file.layer === 'screen').content =
        response.files.find(file => file.layer === 'screen').content
            .replace(/Locators\.consultaIos\.movementsList/g, 'Locators.consultaIos.movementsListAlias')
            .replace(/Locators\.consultaAndroid\.movementsList/g, 'Locators.consultaAndroid.movementsListAlias');

    const previous = process.env.RECORDER_AGENT_RELAXED_CONTRACT;
    process.env.RECORDER_AGENT_RELAXED_CONTRACT = '1';
    try {
        const validation = new AutomationResponseValidator(undefined, emptyCatalog)
            .validate(resolved.scenario, resolved.plan, response);
        assert.equal(
            validation.errors.some(error => ['trace-locator', 'invented-selector'].includes(error.code)),
            false,
        );
        assert.equal(
            validation.warnings.some(warning => warning.includes('trace-locator relajado')),
            true,
        );
    } finally {
        if (previous === undefined) delete process.env.RECORDER_AGENT_RELAXED_CONTRACT;
        else process.env.RECORDER_AGENT_RELAXED_CONTRACT = previous;
    }
});

test('validator permite un screenMethod agrupado que consume varios getters create', () => {
    const recorded = scenario([
        {
            action: 'CLICK',
            selector: 'id=movimientos',
            selectorVerified: true,
            elementIntent: 'abrir movimientos',
            selectorCandidates: [selectorCandidate(
                'primary-movements',
                'id=movimientos',
                'XPATH',
                '//*[@resource-id="movimientos"]',
            )],
        },
        {
            action: 'VERIFICAR_EXISTE',
            selector: 'id=saldo',
            selectorVerified: true,
            elementIntent: 'saldo disponible',
            selectorCandidates: [selectorCandidate(
                'primary-balance',
                'id=saldo',
                'XPATH',
                '//*[@resource-id="saldo"]',
            )],
        },
    ]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const creates = resolved.plan.resolutions.filter(item =>
        item.resolution === 'create' && item.locatorName
    );
    const response = validResponse(resolved.plan);
    const screenFile = response.files.find(file => file.layer === 'screen');
    const locatorFile = response.files.find(file => file.layer === 'locators');
    const names = screenObjectNames(screenFile.path);
    const locatorImport = '@locators/' + locatorFile.path.replace(/^resources\/locators\//, '');
    const values = new Map(creates.map(item => [
        item.locatorName,
        recorded.actions[item.sequence - 1].selectorCandidates[0].locatorValue,
    ]));
    locatorFile.content = JSON.stringify({
        groupedAndroid: Object.fromEntries(creates.map(item => [
            item.locatorName,
            values.get(item.locatorName),
        ])),
        groupedIos: Object.fromEntries(creates.map(item => [item.locatorName, ''])),
    });

    const getters = creates.map(item =>
        `private get ${item.locatorName}(): string { return ${CONTRACT.locatorFactorySymbol}.getElement(` +
        `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.groupedIos.${item.locatorName}, ` +
        `${CONTRACT.typeLocatorSymbol}.XPATH, Locators.groupedAndroid.${item.locatorName}); }`
    ).join(' ');
    screenFile.content =
        `import ${CONTRACT.baseScreenClass} from '${CONTRACT.baseScreenImport}';\n` +
        `import ${CONTRACT.locatorFactorySymbol} from '${CONTRACT.locatorFactoryImport}';\n` +
        `import { ${CONTRACT.typeLocatorSymbol} } from '${CONTRACT.typeLocatorImport}';\n` +
        `import Locators from '${locatorImport}' with { type: 'json' };\n` +
        `class ${names.className} extends ${CONTRACT.baseScreenClass} { ${getters} ` +
        `public async executeGroupedFlow(): Promise<void> { ` +
        `await this.uiHelper.waitForDisplayed(this.${creates[0].locatorName}); ` +
        `const target = this.${creates[1].locatorName}; ` +
        `await this.uiHelper.waitForDisplayed(target); } }\n` +
        `export default new ${names.className}();\n`;
    response.actionTrace = creates.map(item => ({
        sequence: item.sequence,
        gherkinStep: 'When el usuario completa el flujo agrupado',
        screenMethod: 'executeGroupedFlow',
        locatorName: item.locatorName,
    }));
    const errors = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response).errors;
    assert.equal(errors.some(error => error.code === 'trace-screen-method'), false);
});

test('validator permite relajar create-locator-contract y trace-screen-method por flag experimental', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
        selectorCandidates: [selectorCandidate(
            'primary-movements',
            'id=movimientos',
            'XPATH',
            '//*[@resource-id="movimientos"]',
        )],
    }]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);

    const omitted = validResponse(resolved.plan);
    const omittedLocators = JSON.parse(
        omitted.files.find(file => file.layer === 'locators').content
    );
    delete omittedLocators.consultaAndroid.movementsList;
    omitted.files.find(file => file.layer === 'locators').content = JSON.stringify(omittedLocators);

    const hardcoded = validResponse(resolved.plan);
    hardcoded.files.find(file => file.layer === 'screen').content =
        hardcoded.files.find(file => file.layer === 'screen').content.replace(
            'await this.uiHelper.waitForDisplayed(this.movementsList);',
            'await this.uiHelper.waitForDisplayed("~Movimientos");',
        );

    const strictValidator = new AutomationResponseValidator(undefined, emptyCatalog);
    assert.equal(
        strictValidator.validate(resolved.scenario, resolved.plan, omitted).errors
            .some(error => error.code === 'create-locator-contract'),
        true,
    );
    assert.equal(
        strictValidator.validate(resolved.scenario, resolved.plan, hardcoded).errors
            .some(error => error.code === 'trace-screen-method'),
        true,
    );

    const previous = process.env.RECORDER_AGENT_RELAXED_CONTRACT;
    process.env.RECORDER_AGENT_RELAXED_CONTRACT = '1';
    try {
        const relaxedValidator = new AutomationResponseValidator(undefined, emptyCatalog);
        const relaxedCreateErrors = relaxedValidator
            .validate(resolved.scenario, resolved.plan, omitted).errors;
        const relaxedTraceErrors = relaxedValidator
            .validate(resolved.scenario, resolved.plan, hardcoded).errors;
        assert.equal(
            relaxedCreateErrors.some(error => error.code === 'create-locator-contract'),
            false,
        );
        assert.equal(
            relaxedTraceErrors.some(error => error.code === 'trace-screen-method'),
            false,
        );
    } finally {
        if (previous === undefined) delete process.env.RECORDER_AGENT_RELAXED_CONTRACT;
        else process.env.RECORDER_AGENT_RELAXED_CONTRACT = previous;
    }
});

test('validator autoriza completions solo por identidad exacta y getter trazado', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
        selectorCandidates: [selectorCandidate(
            'primary-movements',
            'id=movimientos',
            'XPATH',
            '//*[@resource-id="movimientos"]',
        )],
    }]);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const targetFile = 'resources/locators/payment/shared.locator.json';
    const homonymFile = 'resources/locators/commons/shared.locator.json';
    resolved.plan.resolutions[0].completionTargets = [{
        file: targetFile,
        module: 'payment/shared',
        name: 'sharedMovements',
        platform: 'android',
        block: 'sharedAndroid',
    }];
    const locatorPlan = resolved.plan.files.find(file => file.layer === 'locators');
    locatorPlan.path = targetFile;
    locatorPlan.operation = 'update';
    const response = validResponse(resolved.plan);
    response.files.find(file => file.layer === 'feature').content =
        response.files.find(file => file.layer === 'feature').content
            .replace('@miflujo @android', '@miflujo @android @ios');
    const locatorContent = JSON.stringify({
        sharedAndroid: { sharedMovements: '' },
        sharedIos: { sharedMovements: '//XCUIElementTypeStaticText[@name="Movimientos"]' },
    });
    response.files.find(file => file.layer === 'locators').content = locatorContent;
    const screen = response.files.find(file => file.layer === 'screen');
    screen.content = screen.content
        .replace(/Locators\.consultaIos\.movementsList/g, 'Locators.sharedIos.sharedMovements')
        .replace(/Locators\.consultaAndroid\.movementsList/g, 'Locators.sharedAndroid.sharedMovements')
        .replace(/movementsList/g, 'sharedMovements');
    withPlanLocatorIdentifier(resolved.plan, response);
    response.actionTrace[0].locatorName = 'sharedMovements';
    response.completions = [{
        file: targetFile,
        name: 'sharedMovements',
        platform: 'android',
        sequence: 1,
    }];

    const absoluteTarget = path.resolve(projectPaths.frameworkRoot, targetFile);
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    fs.existsSync = file => path.resolve(String(file)) === absoluteTarget || originalExistsSync(file);
    fs.readFileSync = (file, ...args) =>
        path.resolve(String(file)) === absoluteTarget
            ? locatorContent
            : originalReadFileSync(file, ...args);
    try {
        const validator = new AutomationResponseValidator(undefined, emptyCatalog);
        const acceptedErrors = validator.validate(resolved.scenario, resolved.plan, response).errors;
        assert.deepEqual(acceptedErrors, []);

        const arbitraryEmptyKey = structuredClone(response);
        arbitraryEmptyKey.completions[0].name = 'otraClave';
        assert.equal(
            validator.validate(resolved.scenario, resolved.plan, arbitraryEmptyKey).errors
                .some(error => error.code === 'completion-unauthorized'),
            true,
        );

        const homonymousModule = structuredClone(response);
        homonymousModule.completions[0].file = homonymFile;
        assert.equal(
            validator.validate(resolved.scenario, resolved.plan, homonymousModule).errors
                .some(error => error.code === 'completion-unauthorized'),
            true,
        );

        const untracedGetter = structuredClone(response);
        untracedGetter.files.find(file => file.layer === 'screen').content =
            untracedGetter.files.find(file => file.layer === 'screen').content
                .replace(
                    'await this.uiHelper.waitForDisplayed(this.sharedMovements);',
                    'await this.uiHelper.waitForDisplayed(this.otherElement);',
                )
                .replace(
                    ' public async verifyMovementsList',
                    ' private get otherElement(): string { return "~Otro"; } public async verifyMovementsList',
                );
        assert.equal(
            validator.validate(resolved.scenario, resolved.plan, untracedGetter).errors
                .some(error => error.code === 'trace-screen-method'),
            true,
        );
    } finally {
        fs.existsSync = originalExistsSync;
        fs.readFileSync = originalReadFileSync;
    }
});

test('informa caso existente cuando el agente reutiliza todos los locators', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    resolved.plan.resolutions = resolved.plan.resolutions.map(item => ({
        ...item,
        resolution: 'reuse',
        source: {
            file: 'resources/locators/home/home.locator.json',
            module: 'home/home',
            scope: 'home'
        }
    }));
    const response = validResponse(resolved.plan);
    response.files.find(file => file.layer === 'locators').content = JSON.stringify({
        consultaAndroid: {},
        consultaIos: {}
    });

    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);

    assert.equal(validation.valid, false);
    assert.deepEqual(validation.errors, [{
        code: 'existing-automation',
        message: 'El agente reutilizó todos los locators. Esta automatización ya existe y no se puede volver a crear.',
        file: resolved.plan.files.find(file => file.layer === 'locators').path
    }]);
});

test('conserva el error de locator vacío cuando todavía hay locators por crear', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const response = validResponse(resolved.plan);
    response.files.find(file => file.layer === 'locators').content = JSON.stringify({
        consultaAndroid: {},
        consultaIos: {}
    });

    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);

    assert.equal(validation.errors.some(error =>
        error.message === 'El archivo de locators no contiene ningún locator'
    ), true);
    assert.equal(validation.errors.some(error => error.code === 'existing-automation'), false);
});

test('validator rechaza Gherkin procedimental que narra acciones de interfaz', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'CLICK', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'consultar movimientos'
    }]));
    const response = validResponse(resolved.plan);
    response.files.find(file => file.layer === 'feature').content =
        'Feature: Consulta de movimientos\n\n@miflujo @android\n' +
        '  Scenario: [TC-10239][Happy Path][AUTO-FRONT] Consulta\n' +
        '    Given el usuario Usuario QA inicia sesión en Yape\n' +
        '    When el usuario hace click en el botón movimientos\n' +
        '    Then consulta sus movimientos\n';
    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'imperative-gherkin'), true);
});

test('validator rechaza una pareja genérica de steps generada por cada filtro', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'CLICK', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'consultar movimientos'
    }]));
    const response = validResponse(resolved.plan);
    response.files.find(file => file.layer === 'feature').content =
        'Feature: Consulta de movimientos\n\n@miflujo @android\n' +
        '  Scenario: [TC-10239][Happy Path][AUTO-FRONT] Consulta\n' +
        '    Given el usuario Usuario QA inicia sesión en Yape\n' +
        '    When el usuario consulta sus movimientos\n' +
        '    Then se obtiene el resultado esperado de movimientos según filtros\n';
    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'generic-template-gherkin'), true);
});

test('validator rechaza copiar contextHint literalmente como Step', () => {
    const hint = 'se muestra la lista de movimientos';
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        contextHint: hint
    }]));
    const response = validResponse(resolved.plan);
    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'verbatim-context-hint'), true);
});

test('validator exige englobar acciones técnicas en un step funcional', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([
        { action: 'CLICK', selector: 'id=movimientos', selectorVerified: true, elementIntent: 'consultar movimientos' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: 'recorrer movimientos' },
        { action: 'VERIFICAR_EXISTE', selector: 'id=filtro', selectorVerified: true, elementIntent: 'filtro de movimientos' }
    ]));
    const response = validResponse(resolved.plan);
    response.actionTrace = [
        { sequence: 1, gherkinStep: 'When el usuario consulta todos sus movimientos' },
        { sequence: 2, gherkinStep: 'And el usuario navega por la lista' },
        { sequence: 3, gherkinStep: 'Then puede filtrar sus movimientos' }
    ];
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);
    const ungrouped = validator.validate(resolved.scenario, resolved.plan, response);
    assert.equal(ungrouped.errors.some(error => error.code === 'ungrouped-technical-action'), true);

    response.actionTrace[1].gherkinStep = response.actionTrace[0].gherkinStep;
    const grouped = validator.validate(resolved.scenario, resolved.plan, response);
    assert.equal(grouped.errors.some(error => error.code === 'ungrouped-technical-action'), false);
});

test('validator bloquea steps y locators que duplican artefactos del framework', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform, screenMethods: [], features: [], scenarios: [],
            stepDefinitions: [{
                keyword: 'Then', expression: '^se muestra la lista de movimientos$',
                file: 'features/yape-steps-definitions/payment/existing.steps.ts',
                squad: 'payment', scope: 'squad'
            }],
            locators: [{
                name: 'movimientosExistentes', selector: '//*[@resource-id="movimientos"]',
                androidSelector: '//*[@resource-id="movimientos"]', iosSelector: '',
                file: 'resources/locators/payment/existing.locator.json',
                module: 'payment/existing', squad: 'payment', scope: 'squad', platform: 'android'
            }]
        })
    };
    const validation = new AutomationResponseValidator(undefined, catalog)
        .validate(resolved.scenario, resolved.plan, validResponse(resolved.plan));
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'framework-step-collision'), true);
    assert.equal(validation.errors.some(error => error.code === 'framework-locator-collision'), true);
});

test('memoria solo promociona calidad 100 y recupera la versión más reciente', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-memory-'));
    const memory = new AutomationMemory(root);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const response = validResponse(resolved.plan);
    assert.throws(() => memory.promote(resolved.scenario, resolved.plan, response, {
        valid: false, qualityScore: 90, errors: [], warnings: []
    }), /100%/);
    const entry = memory.promote(resolved.scenario, resolved.plan, response, {
        valid: true, qualityScore: 100, errors: [], warnings: []
    });
    assert.equal(entry.version, 1);
    assert.equal(memory.find(resolved.scenario.fingerprint).response.planId, resolved.plan.planId);
    assert.deepEqual(memory.stats(), { successfulCases: 1, versions: 1 });
});

// Regla ISTQB: sin resultado esperado no hay caso de prueba. El corte tiene que
// ser antes de escribir el paquete funcional. Solo queda la telemetría segura
// del intento fallido; no hay plan ni contexto que permita arrancar al agente.
test('una grabación sin verificación no llega a armar el paquete', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-sin-then-'));
    const failedPackage = path.join(root, 'generation', 'automation');
    fs.mkdirSync(failedPackage, { recursive: true });
    fs.writeFileSync(path.join(failedPackage, 'agent-response.json'), '{"stale":true}');
    fs.writeFileSync(path.join(failedPackage, 'effective-generation-plan.json'), '{"stale":true}');
    fs.writeFileSync(path.join(failedPackage, 'status.json'), '{"state":"ready-for-review"}');
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(root, 'memory'))
    );
    assert.throws(
        () => builder.prepare(scenario([
            { action: 'CLICK', selector: 'id=movimientos', selectorVerified: true, elementIntent: 'ver movimientos' }
        ]), root),
        error => error instanceof BlockingGapError && /VERIFICAR_TEXTO/.test(error.message)
    );
    assert.equal(fs.existsSync(path.join(failedPackage, 'generation-plan.json')), false);
    assert.equal(fs.existsSync(path.join(failedPackage, 'agent-response.json')), false);
    assert.equal(fs.existsSync(path.join(failedPackage, 'effective-generation-plan.json')), false);
    assert.equal(fs.existsSync(path.join(failedPackage, 'status.json')), false);
    assert.ok(fs.existsSync(path.join(failedPackage, 'hints.json')));
    const blockedGaps = JSON.parse(fs.readFileSync(path.join(failedPackage, 'gaps.json'), 'utf-8'));
    assert.equal(blockedGaps.gaps[0].status, 'blocked-qa');
    assert.deepEqual(blockedGaps.gaps[0].allowedQueries, []);
    const run = JSON.parse(fs.readFileSync(path.join(failedPackage, 'agent-run.json'), 'utf-8'));
    assert.equal(run.result, 'blocked');
    assert.ok(run.resolverDurationMs >= 0);
});

test('package builder limita el contexto y deja verificador autocontenido', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-package-'));
    const resolved = new DeterministicResolver(emptyCatalog);
    const builder = new AutomationPackageBuilder(resolved, new AutomationMemory(path.join(root, 'memory')));
    const candidate = selectorCandidate(
        'primary-movements',
        'id=movimientos',
        'XPATH',
        '//*[@resource-id="movimientos"]',
    );
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos',
        selectorCandidates: [candidate],
    }]), root);
    assert.equal(result.agentRequired, false);
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.errors));
    assert.equal(result.validation.qualityScore, 100);
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'generation-plan.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'reuse-context.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'collision-report.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'hints.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'gaps.json')));
    assert.equal(fs.existsSync(path.join(result.packageDirectory, 'query-requests.json')), false);
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'query-requests.schema.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'query-results.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'validation-contract.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'agent-package-manifest.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'english-vocabulary.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'verify-package.js')));
    // El verificador del sandbox carga las reglas del modulo compartido; sin la
    // copia se quedaria sin comprobar el contrato del Screen Object.
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'screen-object-contract.js')));
    // El agente no puede acertar el helper si nadie le dice cuales hay.
    const frameworkApi = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'framework-api.json'), 'utf8'
    ));
    const englishVocabulary = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'english-vocabulary.json'), 'utf8'
    ));
    assert.equal(englishVocabulary.lista, 'list');
    assert.equal(englishVocabulary.movimientos, 'movements');
    assert.deepEqual(
        frameworkApi.helpers.map(helper => helper.property),
        ['gestureHelper', 'keyboardHelper', 'uiHelper']
    );
    assert.ok(frameworkApi.helpers
        .find(helper => helper.property === 'gestureHelper').methods
        .some(method => method.name === 'scrollDown'));
    assert.equal(frameworkApi.locatorContract.typeLocator.import, CONTRACT.typeLocatorImport);
    assert.equal(frameworkApi.locatorContract.typeLocator.exportKind, 'named');
    assert.deepEqual(frameworkApi.locatorContract.typeLocator.members, [
        'ID', 'XPATH', 'ANDROID', 'PREDICATESTRING', 'CLASSCHAIN', 'CLASSNAME',
    ]);
    assert.equal(frameworkApi.locatorContract.locatorProvider.import, CONTRACT.locatorFactoryImport);
    assert.equal(frameworkApi.locatorContract.getElement.parameterCount, 4);
    assert.deepEqual(frameworkApi.locatorContract.getElement.platformOrder, ['ios', 'android']);
    assert.match(
        frameworkApi.locatorContract.getElement.signature,
        /getElement\(TypeLocator\.<IOS>, <valor ios>, TypeLocator\.<ANDROID>, <valor android>\)/
    );
    assert.equal(frameworkApi.locatorContract.constantsPrefixes.ID, '~');
    assert.equal(frameworkApi.locatorContract.constantsPrefixes.XPATH, '');
    assert.equal(frameworkApi.locatorContract.constantsPrefixes.ANDROID_LOCATOR, 'android=');
    assert.equal(frameworkApi.locatorContract.constantsPrefixes.PREDICATE_STRING, '-ios predicate string:');
    assert.equal(frameworkApi.locatorContract.constantsPrefixes.CLASS_CHAIN, '-ios class chain:');
    assert.equal(frameworkApi.locatorContract.accessPattern.notation, 'dot-only');
    assert.equal(frameworkApi.locatorContract.modules.length, 1);
    const locatorModule = frameworkApi.locatorContract.modules[0];
    assert.equal(locatorModule.identifier, locatorImportIdentifier(locatorModule.path));
    assert.equal(locatorModule.importSource,
        `@locators/${locatorModule.path.replace(/^resources\/locators\//, '')}`);
    assert.match(frameworkApi.locatorContract.accessPattern.validExample,
        /LocatorMovements\.movementsAndroid\.showMovements/);
    const agentInstructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(agentInstructions, /LocatorMovements\.movementsAndroid\.showMovements/);
    assert.match(agentInstructions, /framework-api\.json > locatorContract\.modules/);
    assert.match(agentInstructions, /decision:'replace-existing'/);
    assert.match(agentInstructions, /Tipo\/selector salen de la grabación y se conserva la otra plataforma/);
    assert.match(agentInstructions, /CORRECCIÓN: modifica gap-resolutions\.json, nunca agent-response\.json/);
    const gapResolutionSchema = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'gap-resolutions.schema.json'), 'utf8'
    ));
    assert.ok(gapResolutionSchema.properties.resolutions.items.properties.decision.enum
        .includes('replace-existing'));
    assert.equal(frameworkApi.screenObjects[0].path.endsWith('.screen.ts'), true);
    assert.equal(typeof frameworkApi.screenObjects[0].className, 'string');
    assert.equal(typeof frameworkApi.screenObjects[0].instanceName, 'string');
    assert.equal(typeof frameworkApi.screenObjects[0].importSource, 'string');
    const validationContract = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'validation-contract.json'), 'utf8'
    ));
    const validatorSource = fs.readFileSync(
        defaultValidatorSourcePath(),
        'utf8'
    );
    const validatorCodes = validatorRuleCodesFromSource(validatorSource);
    const declaredCodes = validationContract.rules.map(rule => rule.code).sort();
    assert.deepEqual(declaredCodes, validatorCodes);
    // El verificador se genera como texto: tsc no lo revisa, asi que un error de
    // sintaxis solo aparecia cuando el agente lo ejecutaba.
    assert.doesNotThrow(
        () => new vm.Script(fs.readFileSync(path.join(result.packageDirectory, 'verify-package.js'), 'utf8')),
        'verify-package.js tiene que ser JavaScript valido'
    );
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'agent-response.json')));
    const agentRun = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'agent-run.json'), 'utf8'
    ));
    assert.equal(agentRun.recordingId, result.recordingId);
    assert.equal(agentRun.planId, result.planId);
    assert.equal(agentRun.result, 'ready-for-review');
    assert.ok(agentRun.resolverDurationMs >= 0);
    assert.ok(agentRun.validatorDurationMs >= 0);
    assert.ok(agentRun.contextBytes > 0);
    assert.ok(agentRun.responseBytes > 0);
    assert.equal(agentRun.tokensInput, null);
    assert.equal(agentRun.tokensOutput, null);
    assert.equal(agentRun.agentExecutionMode, 'automatic');
    assert.equal(agentRun.agentInvocationCount, 0);
    assert.ok(agentRun.hintsGenerated > 0);
    assert.equal(agentRun.initialGapCount, 0);
    assert.equal(agentRun.finalGapCount, 0);
    assert.equal(agentRun.queriesAccepted, 0);
    const generatedResponse = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'agent-response.json'),
        'utf8'
    ));
    assert.match(
        generatedResponse.files.find(file => file.layer === 'feature').content,
        /^# Generado por Appium Recorder\n# Author: Kevinarnold\.zorem\n# Fecha de creación:/
    );
    // El JSON de locators viaja limpio: sin `_metadata`, solo los bloques.
    const locatorDoc = JSON.parse(
        generatedResponse.files.find(file => file.layer === 'locators').content
    );
    assert.equal(Object.prototype.hasOwnProperty.call(locatorDoc, '_metadata'), false);
    assert.equal(Object.keys(locatorDoc).every(block => /(?:Android|Ios)$/.test(block)), true);
    const instructions = fs.readFileSync(path.join(result.packageDirectory, 'instructions.md'), 'utf8');
    assert.match(instructions, /english-vocabulary\.json/);
    const verifier = fs.readFileSync(path.join(result.packageDirectory, 'verify-package.js'), 'utf8');
    assert.match(instructions, /Gherkin declarativo/);
    assert.match(instructions, /Agrupa acciones técnicas consecutivas/);
    assert.match(instructions, /contextHint\/elementIntent es solo una pista libre/);
    // Los anclajes llegan resueltos del framework real, no memorizados: el test
    // los lee del mismo contrato para no romperse cuando el framework se mueva.
    const contract = frameworkContract(projectPaths.frameworkRoot);
    assert.ok(instructions.includes(contract.baseScreenImport));
    assert.ok(instructions.includes(contract.locatorFactoryImport));
    assert.ok(instructions.includes(contract.typeLocatorImport));
    assert.ok(instructions.includes(contract.locatorFactorySymbol));
    assert.match(instructions, /`browser` solo si hay una llamada browser\./);
    assert.match(instructions, /Ninguna espera por tiempo/);
    assert.match(instructions, /getElement\(TypeLocator\.<IOS>, <valor ios>, TypeLocator\.<ANDROID>, <valor android>\)/);
    assert.match(instructions, /with \{ type: 'json' \}/);
    assert.match(instructions, /Copialos literalmente en vez de componerlos/);
    assert.match(instructions, /`scrollDown` esta en `gestureHelper`, no en `uiHelper`/);
    assert.match(instructions, /metodo del propio Screen Object para que quede reutilizable/);
    assert.match(instructions, /NO busques esos simbolos en el framework/);
    assert.match(instructions, /Nada de `_metadata`/);
    assert.match(instructions, /allowlist verificada e inmutable/);
    assert.match(instructions, /candidateId/);
    assert.match(instructions, /completionTargets/);
    assert.match(instructions, /key homonima de otro archivo o bloque no autoriza/);
    assert.match(instructions, /tier de ejecucion \(`@smoke_mobile`\)/);
    assert.match(instructions, /Si falta información, no la busques afuera/);
    assert.match(instructions, /NO uses comandos de shell \(cat, echo, redirecciones\)/);
    assert.match(instructions, /Las rutas exactas que puedes leer son/);
    assert.match(instructions, /Usa rutas RELATIVAS al directorio actual/);
    assert.match(verifier, /Gherkin técnico\/imperativo/);
    assert.match(verifier, /Acción técnica sin agrupar/);
    assert.match(verifier, /usa imports relativos/);
    assert.match(verifier, /importa browser pero no lo utiliza/);
    assert.match(verifier, /Pista contextual copiada literalmente como Step/);
    assert.match(verifier, /Completion no autorizado/);
    assert.match(verifier, /x\.target\.block/);
    assert.doesNotThrow(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }));
    const packagedScenario = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'scenario.json'), 'utf8'
    ));
    assert.equal(packagedScenario.actions[0].selectorCandidates, undefined);
    const accounted = [
        'scenario.json', 'generation-plan.json', 'hints.json', 'gaps.json',
        'reuse-context.json', 'collision-report.json',
        'instructions.md',
    ].reduce((total, name) =>
        total + fs.statSync(path.join(result.packageDirectory, name)).size, 0);
    assert.equal(result.contextBytes, accounted);

    const responseFile = path.join(result.packageDirectory, 'agent-response.json');
    const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    const screen = response.files.find(file => file.layer === 'screen');
    screen.content = screen.content.replace(
        `'${CONTRACT.baseScreenImport}'`,
        "'../commons/base.screen.ts'"
    );
    fs.writeFileSync(responseFile, JSON.stringify(response));
    assert.throws(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }));
});

test('package builder exige revisión funcional del agente cuando hay interacción y aserción', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-test-design-review-'));
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(root, 'memory')),
    );
    const recorded = scenario([
        {
            action: 'CLICK', selector: 'id=filter', selectorVerified: true,
            elementIntent: 'seleccionar filtro solo hoy',
        },
        {
            action: 'VERIFICAR_EXISTE', selector: 'id=today', selectorVerified: true,
            elementIntent: 'validar opción solo hoy',
        },
    ]);
    recorded.objective = 'Filtrar los movimientos del día actual';
    recorded.acceptanceCriteria = 'Mostrar únicamente movimientos del día actual';
    const result = builder.prepare(recorded, root);
    assert.equal(result.testDesignReviewRequired, true);
    assert.equal(result.agentRequired, true);
    assert.equal(result.responseAvailable, false);
    assert.equal(fs.existsSync(path.join(result.packageDirectory, 'agent-response.json')), false);
});

test('package builder publica expresiones reservadas para evitar colisiones de step', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-reserved-steps-'));
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos',
    }]);
    const base = new DeterministicResolver(emptyCatalog).resolve(recorded);
    base.plan.status = 'needs-agent';
    base.plan.unresolvedGapIds = ['gap-step-collision'];
    base.unresolvedContext.gaps = [{
        id: 'gap-step-collision',
        type: 'semantic-naming',
        description: 'Evitar colisión de step',
        requiredOutput: 'Definir wording único',
        status: 'open',
        blocking: false,
        allowedQueries: ['findExistingStep'],
        maxQueries: 1,
        evidenceRequired: ['framework-step-index'],
    }];
    base.resolvedContext.frameworkAwareness = {
        ...(base.resolvedContext.frameworkAwareness || {}),
        exactStepDefinitions: [{
            expression: '^el usuario consulta todos sus movimientos$',
            file: 'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts',
            scope: 'squad',
        }],
        selectorCollisions: [],
        candidates: [],
        decision: 'create-new',
    };
    const fakeResolver = { resolve: () => base };
    const builder = new AutomationPackageBuilder(
        fakeResolver,
        new AutomationMemory(path.join(root, 'memory'))
    );
    const result = builder.prepare(recorded, root);
    const collision = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'collision-report.json'), 'utf8'
    ));
    assert.equal(Array.isArray(collision.reservedStepExpressions), true);
    assert.equal(collision.reservedStepExpressions[0].canonical, 'el usuario consulta todos sus movimientos');
    assert.match(collision.reservedStepExpressions[0].reason, /step ambiguo/i);
    const instructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(instructions, /reservedStepExpressions/);
    assert.match(instructions, /DataTable NO desambigua/i);
});

// Caso real: el agente inlinó el usuario dentro del Given y perdió la tilde de
// "sesión", así que el step dejó de enlazar con login.steps.ts. Cucumber lo
// habría reportado como undefined recién al ejecutar el caso.
test('rechaza el Given reutilizado reescrito y el parámetro sin Examples', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-reused-'));
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(root, 'memory'))
    );
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]), root);
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);
    const plan = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'generation-plan.json'), 'utf8'
    ));
    const resolvedScenario = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'scenario.json'), 'utf8'
    ));

    const inlined = validResponse(plan);
    const featureFile = inlined.files.find(file => file.layer === 'feature');
    featureFile.content = featureFile.content
        .replace('Given el usuario <username> inicia sesión en Yape',
                 'Given el usuario Usuario QA Temporal inicia sesion en Yape')
        .replace(/\n\n    Examples:[\s\S]*$/, '\n')
        .replace('Scenario Outline:', 'Scenario:');
    const inlinedErrors = validator.validate(resolvedScenario, plan, inlined).errors;
    assert.equal(inlinedErrors.some(error => error.code === 'reused-step-rewritten'), true);

    // Mantener <username> pero sin Examples es el otro lado del mismo error.
    const sinExamples = validResponse(plan);
    const sinExamplesFile = sinExamples.files.find(file => file.layer === 'feature');
    sinExamplesFile.content = sinExamplesFile.content
        .replace(/\n\n    Examples:[\s\S]*$/, '\n')
        .replace('Scenario Outline:', 'Scenario:');
    const sinExamplesErrors = validator.validate(resolvedScenario, plan, sinExamples).errors;
    assert.equal(sinExamplesErrors.some(error => error.code === 'missing-examples'), true);
    assert.equal(
        sinExamplesErrors.some(error => /Scenario Outline/.test(error.message)),
        true
    );
    assert.equal(sinExamplesErrors.some(error => error.code === 'reused-step-rewritten'), false);

    // Perder solo la tilde de "sesión" ya rompe el enlace con login.steps.ts,
    // asi que la comparacion no puede normalizar tildes ni mayusculas.
    const sinTilde = validResponse(plan);
    const sinTildeFile = sinTilde.files.find(file => file.layer === 'feature');
    sinTildeFile.content = sinTildeFile.content.replace('inicia sesión en Yape', 'inicia sesion en Yape');
    assert.equal(
        validator.validate(resolvedScenario, plan, sinTilde).errors
            .some(error => error.code === 'reused-step-rewritten'),
        true
    );

    // El mismo corte tiene que existir dentro del sandbox del agente, o gasta
    // una iteración completa antes de enterarse.
    fs.writeFileSync(
        path.join(result.packageDirectory, 'agent-response.json'),
        JSON.stringify(inlined)
    );
    assert.throws(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }), error => /Step reutilizado reescrito/.test(String(error.stdout) + String(error.stderr)));

    const instructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(instructions, /se copian LITERALES/);
    assert.match(instructions, /Scenario Outline/);

    // Un step definition que ningun Scenario invoca es codigo muerto.
    const conMuerto = validResponse(plan);
    const stepsFile = conMuerto.files.find(file => file.layer === 'steps');
    stepsFile.content += 'Then(/^se muestra el boton de filtro$/, async () => { return; });\n';
    assert.equal(
        validator.validate(resolvedScenario, plan, conMuerto).warnings
            .some(warning => /Step definition sin uso: "se muestra el boton de filtro"/.test(warning)),
        true
    );
    assert.equal(
        validator.validate(resolvedScenario, plan, validResponse(plan)).warnings
            .some(warning => /Step definition sin uso/.test(warning)),
        false
    );
});

// El codigo va en ingles, el Gherkin en espanol. Se advierte lo nuevo en
// espanol, pero no se bloquea la propuesta por este criterio.
test('advierte identificadores en español y no toca el Gherkin ni lo heredado', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-english-'));
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(root, 'memory'))
    );
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]), root);
    const plan = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'generation-plan.json'), 'utf8'
    ));
    const resolvedScenario = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'scenario.json'), 'utf8'
    ));
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);

    // La propuesta correcta pasa: su Gherkin es español y su código inglés.
    const limpio = validator.validate(resolvedScenario, plan, validResponse(plan));
    assert.equal(limpio.errors.some(error => error.code === 'non-english-identifier'), false);
    assert.match(
        validResponse(plan).files.find(file => file.layer === 'feature').content,
        /Then se muestra la lista de movimientos/,
        'el texto del step sigue en español'
    );

    const enEspanol = validResponse(plan);
    const screenFile = enEspanol.files.find(file => file.layer === 'screen');
    screenFile.content = screenFile.content.replace(
        'public async verifyMovementsList()',
        'public async seMuestranLosMovimientosEsperados()'
    );
    withPlanLocatorIdentifier(plan, enEspanol);
    const semantica = validator.validate(resolvedScenario, plan, enEspanol);
    const errores = semantica.errors.filter(error => error.code === 'non-english-identifier');
    assert.equal(errores.length, 0);
    assert.equal(
        semantica.warnings.some(warning =>
            /non-english-identifier/.test(warning)
            && /seMuestranLosMovimientosEsperados/.test(warning)
            && /está en español/.test(warning)
        ),
        true
    );

    fs.writeFileSync(
        path.join(result.packageDirectory, 'agent-response.json'),
        JSON.stringify(enEspanol)
    );
    assert.doesNotThrow(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }));

    const instructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(instructions, /Todo el codigo va en INGLES/);
});

// Sin type/group/reference el agente sabe que debe reutilizar pero no puede
// escribir el getter, y su unica salida es copiar el valor a un modulo nuevo.
test('reuse-context declara los elementos existentes que el caso toca', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-elements-'));
    const existente = {
        name: 'shortcutTapp', module: 'home/home', squad: 'home', scope: 'home', platform: 'android',
        file: 'resources/locators/home/home.locator.json',
        androidSelector: '//android.widget.Button[@content-desc="Tapp"]',
        iosSelector: '', androidBlock: 'homeAndroid', iosBlock: 'homeIos',
        androidStrategy: 'XPATH',
    };
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform, stepDefinitions: [], screenMethods: [], features: [],
            locators: [existente],
        }),
    };
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(catalog),
        new AutomationMemory(path.join(root, 'memory'))
    );
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: '//android.widget.Button[@content-desc="Tapp"]',
        selectorVerified: true, elementIntent: 'acceso a tapp'
    }]), root);

    const reuse = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'reuse-context.json'), 'utf8'
    ));
    // Agrupado por módulo: import e identificador se dicen una vez.
    const grupo = reuse.elements.find(item => item.module === 'home/home');
    assert.ok(grupo, 'el módulo del locator reutilizado debe llegar declarado');
    assert.match(grupo.import, /^@locators\/home\/home\.locator\.json$/);
    const declarado = grupo.elements.find(element => element.name === 'shortcutTapp');
    assert.ok(declarado, 'el locator reutilizado debe llegar declarado');
    assert.equal(declarado.locators.android.type, 'XPATH');
    assert.equal(grupo.groups.android, 'homeAndroid');
    assert.equal(declarado.locators.android.reference, `${grupo.identifier}.homeAndroid.shortcutTapp`);
    assert.equal(declarado.locators.ios.status, 'missing');

    const instructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(instructions, /NUNCA copiar el `value`/);
    assert.match(instructions, /La lista es completa/);
    assert.match(instructions, /status: "missing"/);
});

test('package builder mantiene baselines grandes fuera del contexto mínimo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-update-package-'));
    const framework = path.join(root, 'framework');
    const recording = path.join(root, 'recording');
    const baselinePath = 'screenobjects/payment/movements.screen.ts';
    const baselineFile = path.join(framework, baselinePath);
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
    const methods = Array.from({ length: 800 }, (_, index) =>
        `  public async existingMethod${index}(): Promise<void> { return; }`
    ).join('\n');
    fs.writeFileSync(baselineFile, `export class MovementsScreen {\n${methods}\n}\n`);

    const recorded = scenario([{
        action: 'CLICK', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'mostrar movimientos'
    }]);
    const plan = {
        schemaVersion: 1, pipelineVersion: '1.0.0', planId: 'plan-update-large',
        recordingId: recorded.recordingId, fingerprint: recorded.fingerprint,
        deterministicCoverage: 0.75, status: 'agent-required',
        unresolvedGapIds: ['gap-screen'],
        budgets: { maxDurationMs: 300000, maxContextBytes: 20000, maxRepairAttempts: 1 },
        resolutions: [],
        files: [{
            layer: 'screen', path: baselinePath, operation: 'update', baseHash: 'hash-screen'
        }],
        reuseTarget: { screen: baselinePath }
    };
    const fakeResolver = {
        resolve: () => ({
            scenario: recorded,
            plan,
            resolvedContext: {
                schemaVersion: 1, recordingId: recorded.recordingId, planId: plan.planId,
                frameworkAwareness: { decision: 'update-existing', candidates: [] }
            },
            unresolvedContext: {
                schemaVersion: 1, recordingId: recorded.recordingId,
                planId: plan.planId, gaps: [{ id: 'gap-screen', type: 'screen' }]
            }
        })
    };
    const builder = new AutomationPackageBuilder(
        fakeResolver,
        new AutomationMemory(path.join(root, 'memory')),
        undefined,
        undefined,
        framework
    );
    const result = builder.prepare(recorded, recording);
    const reuse = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'reuse-context.json'), 'utf8'
    ));
    const gapsProjection = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'gaps.json'), 'utf8'
    ));
    const baseline = reuse.updateBaselines[0];
    assert.equal(result.agentRequired, true);
    assert.equal(Object.hasOwn(baseline, 'content'), false);
    assert.equal(baseline.preserve.count, 800);
    assert.equal(baseline.preserve.sample.length, 12);
    assert.ok(fs.statSync(path.join(result.packageDirectory, baseline.reference)).size > 20_000);
    assert.equal(typeof gapsProjection.gaps[0].allowedQueryArgsSchemas, 'object');
    const mandatoryBytes = [
        'scenario.json', 'generation-plan.json', 'reuse-context.json',
        'collision-report.json', 'unresolved-context.json', 'instructions.md'
    ].reduce((total, file) => total + fs.statSync(path.join(result.packageDirectory, file)).size, 0);
    assert.ok(mandatoryBytes <= 20_000, `contexto obligatorio: ${mandatoryBytes} bytes`);
});

test('reprocesar una grabación siempre reconstruye el paquete y conserva evidencia e historial', () => {
    const recording = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-reprocess-'));
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]);
    fs.writeFileSync(path.join(recording, 'scenario.json'), JSON.stringify(recorded));
    const packageDirectory = path.join(recording, 'generation', 'automation');
    const evidenceDirectory = path.join(recording, 'actions', '001');
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const historyDirectory = path.join(packageDirectory, 'history', 'regeneration-001');
    fs.mkdirSync(historyDirectory, { recursive: true });
    fs.writeFileSync(path.join(historyDirectory, 'agent-response.json'), '{"archived":true}');
    for (const stale of [
        'agent-response.json', 'effective-generation-plan.json', 'validation.json',
        'repair-context.json', 'context-breakdown.json', 'agent-execution.log',
        'baseline-response.json',
    ]) {
        fs.writeFileSync(path.join(packageDirectory, stale), '{"stale":true}');
    }
    fs.mkdirSync(path.join(packageDirectory, '.gap-runs', 'old-gap'), { recursive: true });
    fs.writeFileSync(path.join(packageDirectory, '.gap-runs', 'old-gap', 'output.json'), '{}');
    fs.writeFileSync(path.join(evidenceDirectory, 'screen.xml'), '<hierarchy/>');

    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(recording, 'memory'))
    );
    const result = builder.prepareRecordedScenario(recording, false);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'effective-generation-plan.json')), false);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'repair-context.json')), false);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'context-breakdown.json')), false);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'agent-execution.log')), false);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'baseline-response.json')), false);
    assert.equal(fs.existsSync(path.join(packageDirectory, '.gap-runs')), false);
    assert.equal(fs.existsSync(path.join(evidenceDirectory, 'screen.xml')), true);
    assert.equal(fs.existsSync(path.join(historyDirectory, 'agent-response.json')), true);
    assert.equal(fs.existsSync(path.join(result.packageDirectory, 'generation-plan.json')), true);
    const status = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'status.json'), 'utf8'));
    const plan = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'generation-plan.json'), 'utf8'));
    assert.equal(status.planId, plan.planId);
});

test('regeneración versiona la propuesta anterior y conserva las cuatro rutas importadas', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-regeneration-'));
    const framework = path.join(root, 'framework');
    const recording = path.join(root, 'recordings', 'session-one');
    const automation = path.join(recording, 'generation', 'automation');
    fs.mkdirSync(automation, { recursive: true });
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const response = validResponse(resolved.plan);
    const validation = { valid: true, qualityScore: 100, errors: [], warnings: [] };
    fs.writeFileSync(path.join(recording, 'scenario.json'), JSON.stringify(resolved.scenario));
    fs.writeFileSync(path.join(automation, 'scenario.json'), JSON.stringify(resolved.scenario));
    fs.writeFileSync(path.join(automation, 'generation-plan.json'), JSON.stringify(resolved.plan));
    fs.writeFileSync(path.join(automation, 'agent-response.json'), JSON.stringify(response));
    fs.writeFileSync(path.join(automation, 'validation.json'), JSON.stringify(validation));
    fs.writeFileSync(path.join(automation, 'status.json'), JSON.stringify({
        state: 'generated', regenerationIteration: 0
    }));
    fs.writeFileSync(path.join(automation, 'agent-execution.log'), 'old provider output');
    fs.writeFileSync(path.join(automation, 'context-breakdown.json'), '{"stale":true}');
    fs.writeFileSync(path.join(automation, 'effective-generation-plan.json'), '{"stale":true}');
    fs.mkdirSync(path.join(automation, '.gap-runs', 'old-gap'), { recursive: true });
    response.files.forEach(file => {
        const target = path.join(framework, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
    });

    const analyzer = new RecordingCoverageAnalyzer(
        path.join(root, 'recordings'), framework, path.join(framework, 'resources', 'locators')
    );
    assert.equal(analyzer.listRecordings('payment')[0].canRegenerate, true);
    assert.equal(
        analyzer.findRecordingDirectory('payment', resolved.scenario.recordingId),
        recording
    );

    const builder = new AutomationPackageBuilder(
        undefined, undefined, undefined, undefined, framework
    );
    // El alcance del caso lo decide el QA: un refinamiento largo encarece la
    // corrida pero no se rechaza, solo se informa el sobrecosto. Como sí procede,
    // consume el paquete: se restaura para seguir probando el flujo normal.
    const snapshot = fs.readdirSync(automation, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => [entry.name, fs.readFileSync(path.join(automation, entry.name), 'utf8')]);
    const oversized = builder.prepareRegeneration(recording, 'x'.repeat(30_000));
    assert.ok(oversized.contextBytes > 20_000);
    assert.match(oversized.contextWarning, /supera el objetivo/);
    for (const entry of fs.readdirSync(automation, { withFileTypes: true })) {
        if (entry.isFile() && !snapshot.some(([name]) => name === entry.name)) {
            fs.rmSync(path.join(automation, entry.name));
        }
    }
    snapshot.forEach(([name, content]) => fs.writeFileSync(path.join(automation, name), content));
    fs.rmSync(path.join(automation, 'history'), { recursive: true, force: true });

    const result = builder.prepareRegeneration(
        recording,
        ''
    );
    const revisedPlan = JSON.parse(fs.readFileSync(path.join(automation, 'generation-plan.json')));
    const baseline = JSON.parse(fs.readFileSync(path.join(automation, 'baseline-response.json')));
    const unresolved = JSON.parse(fs.readFileSync(path.join(automation, 'unresolved-context.json')));
    assert.equal(result.agentRequired, true);
    assert.equal(result.status, 'regeneration');
    assert.notEqual(revisedPlan.planId, resolved.plan.planId);
    assert.equal(revisedPlan.files.every(file => file.operation === 'update'), true);
    assert.deepEqual(revisedPlan.unresolvedGapIds, ['gap-regeneration-refinement']);
    assert.equal(baseline.planId, resolved.plan.planId);
    assert.match(unresolved.gaps[0].description, /revisión general/);
    assert.equal(fs.existsSync(path.join(automation, 'agent-response.json')), false);
    assert.equal(fs.existsSync(path.join(automation, 'effective-generation-plan.json')), false);
    assert.equal(fs.existsSync(path.join(automation, 'agent-execution.log')), false);
    assert.equal(fs.existsSync(path.join(automation, 'context-breakdown.json')), false);
    assert.equal(fs.existsSync(path.join(automation, '.gap-runs')), false);
    assert.equal(fs.existsSync(path.join(
        automation, 'history', 'regeneration-001', 'agent-response.json'
    )), true);
    assert.match(fs.readFileSync(path.join(automation, 'instructions.md'), 'utf8'), /baseline-response\.json/);
    response.files.forEach(file => {
        assert.equal(fs.readFileSync(path.join(framework, file.path), 'utf8'), file.content);
    });
});

test('launcher abre una terminal en el paquete sin ejecutar automáticamente el agente', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-launcher-'));
    let call;
    const launcher = new AutomationAgentLauncher((command, args, options) => {
        call = { command, args, options };
        return { unref() {} };
    });
    const result = launcher.openTerminal('copilot', root);
    assert.equal(call.options.cwd, root);
    assert.equal(call.command, process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd.exe' : 'x-terminal-emulator');
    assert.ok(call.args.some(value => String(value).includes(root)));
    assert.match(result.prompt, /instructions\.md/);
    // Contrato vigente: sin repair-context.json el modo por defecto es
    // deterministic (DEFAULT_RECORDER_GENERATION_MODE), cuyo prompt inicial
    // confina al agente a gaps.json/gap-resolutions.json y no menciona
    // resolved-context.json (eso solo aplica al modo legacy).
    assert.match(result.prompt, /Puedes usar node, python o python3 solo para validar archivos autorizados/);
    assert.match(result.prompt, /No explores fwk-mobile-test/);
    assert.doesNotMatch(call.args.join(' '), /instructions\.md/);
});

test('launcher puede abrir terminal y ejecutar copilot con prompt automático', () => {
    if (process.platform !== 'darwin') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-launcher-visible-'));
    let call;
    const launcher = new AutomationAgentLauncher((command, args, options) => {
        call = { command, args, options };
        return { unref() {} };
    });
    const result = launcher.openTerminalWithPrompt('copilot', root);
    assert.equal(call.command, 'osascript');
    assert.equal(call.options.cwd, root);
    assert.equal(Array.isArray(call.args), true);
    const joined = call.args.join(' ');
    assert.match(joined, /Terminal/);
    assert.match(joined, /copilot/);
    assert.match(joined, /agent-task\.md/);
    assert.doesNotMatch(joined, /\/bin\/cat/);
    assert.match(joined, /\/bin\/rm -f/);
    assert.match(joined, /'-i'/);
    assert.match(joined, /--allow-tool=shell\(node\)/);
    assert.match(joined, /--allow-tool=shell\(python3\)/);
    assert.doesNotMatch(joined, /--deny-tool=bash/);
    assert.match(joined, /--no-custom-instructions/);
    assert.doesNotMatch(joined, /--output-format json/);
    assert.doesNotMatch(joined, /Lee instructions\.md/);
    assert.equal(
        fs.readFileSync(path.join(root, 'agent-task.md'), 'utf8'),
        result.prompt,
    );
    assert.equal(fs.statSync(path.join(root, 'agent-task.md')).mode & 0o777, 0o600);
    assert.equal(result.packageDirectory, root);
});

test('launcher no incrusta JSON ni comillas del contexto en AppleScript', () => {
    if (process.platform !== 'darwin') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-launcher-safe-prompt-'));
    let call;
    const launcher = new AutomationAgentLauncher((command, args, options) => {
        call = { command, args, options };
        return { unref() {} };
    });
    const prompt = `PASS 2: user's selector\nBEGIN_AGENT_CONTEXT_JSON\n{"text":"Útimos 7 días"}`;
    launcher.openInteractiveTerminalWithPrompt('copilot', root, prompt);
    const appleScript = call.args.join(' ');
    assert.doesNotMatch(appleScript, /BEGIN_AGENT_CONTEXT_JSON/);
    assert.doesNotMatch(appleScript, /user's selector/);
    assert.match(appleScript, /Lee agent-task\.md/);
    assert.equal(fs.readFileSync(path.join(root, 'agent-task.md'), 'utf8'), prompt);
});

test('launcher abre monitor legible de ejecución automática en macOS', () => {
    if (process.platform !== 'darwin') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-launcher-monitor-'));
    let call;
    const launcher = new AutomationAgentLauncher((command, args, options) => {
        call = { command, args, options };
        return { unref() {} };
    });
    launcher.openExecutionMonitor(root);
    assert.equal(call.command, 'osascript');
    assert.equal(call.options.cwd, root);
    const joined = call.args.join(' ');
    assert.match(joined, /Copilot en vivo \(resumen\)/);
    assert.match(joined, /grep --line-buffered/);
    assert.match(joined, /assistant\.turn_end/);
    assert.match(joined, /tail -n 200 -F agent-execution\.log/);
});

test('el flujo de automatización cruza renderer, preload y main por IPC explícito', () => {
    const root = path.resolve(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf-8');
    const automationHandlers = fs.readFileSync(
        path.join(root, 'recorder/src/ipc/automationHandlers.ts'),
        'utf-8',
    );
    const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf-8');
    const controller = fs.readFileSync(path.join(root, 'recorder/renderer/src/controller/recorderController.js'), 'utf-8');
    const featuresDir = path.join(root, 'recorder/renderer/src/features');
    const rendererCombined = [controller, ...fs.readdirSync(featuresDir, { recursive: true })
        .filter(file => file.endsWith('.js'))
        .map(file => fs.readFileSync(path.join(featuresDir, file), 'utf-8'))]
        .join('\n');
    // main.ts es el composition root: arma servicios/estado y delega el
    // registro de los canales de automatización a `ipc/automationHandlers.ts`.
    assert.match(main, /registerAutomationHandlers\(\{/);
    for (const channel of [
        'prepare-automation-package', 'prepare-automation-regeneration', 'launch-automation-agent',
        'import-automation-response', 'revalidate-automation-response', 'generate-automation-response'
    ]) {
        assert.match(automationHandlers, new RegExp(`ipcMain\\.handle\\('${channel}'`));
        assert.doesNotMatch(main, new RegExp(`ipcMain\\.handle\\('${channel}'`));
        assert.match(preload, new RegExp(channel));
    }
    assert.match(rendererCombined, /prepareAutomationPackage/);
    assert.match(rendererCombined, /prepareAutomationRegeneration/);
    assert.match(rendererCombined, /generateAutomationResponse/);
    assert.match(
        rendererCombined,
        /launchAutomationAgent\(\{[\s\S]*mode: 'automatic',[\s\S]*qaRoastMode: isQaRoastModeEnabled\(\)[\s\S]*\}\)/,
    );
    assert.match(rendererCombined, /importAutomationResponse\(true\)/);
    assert.match(rendererCombined, /updateAutomationProgress\(/);
    assert.match(rendererCombined, /on\(btnReimportAutomationCorrection, 'click'/);
    assert.doesNotMatch(rendererCombined, /showAutomationHandoff/);
    assert.doesNotMatch(rendererCombined, /btnLaunchAutomation/);
});
