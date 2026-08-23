const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { AutomationRecordingStore } = require('../dist/core/automationRecordingStore');
const { DeterministicResolver } = require('../dist/core/deterministicResolver');
const { AutomationResponseValidator } = require('../dist/core/automationResponseValidator');
const { AutomationMemory } = require('../dist/core/automationMemory');
const { AutomationPackageBuilder, BlockingGapError } = require('../dist/core/automationPackageBuilder');
const { AutomationAgentLauncher } = require('../dist/core/automationAgentLauncher');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');
const { RecordingCoverageAnalyzer } = require('../dist/core/recordingCoverageAnalyzer');
const { RecordingPlatformUpdater } = require('../dist/core/recordingPlatformUpdater');
const { FrameworkScanner } = require('../dist/core/frameworkScanner');
const { ReuseAnalyzer } = require('../dist/core/reuseAnalyzer');

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
        '../recorder/renderer/src/controller/recorderController.js'
    ), 'utf8');
    const preload = fs.readFileSync(path.join(__dirname, '../recorder/src/preload.ts'), 'utf8');

    assert.match(onboarding, /id="rdbCompleteSteps"/);
    assert.match(onboarding, /id="rdbCompleteLocators"/);
    assert.match(controller, /rdbCompleteSteps\?\.checked/);
    assert.match(controller, /await sessionReady;[\s\S]{0,200}api\.resumeRecording/);
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
        '../recorder/renderer/src/controller/recorderController.js'
    ), 'utf8');
    assert.match(configuration, /id="cmbFrameworkFeatureScope"/);
    assert.match(configuration, /Solo limita el mapa de Features/);
    assert.match(controller, /featureScope:\s*cmbFrameworkFeatureScope/);
});

test('scanner y catálogo resuelven las cuatro capas de un Feature anidado por relaciones', () => {
    const scanner = new FrameworkScanner().scan();
    const interoperabilidad = scanner.squads.find(squad => squad.name === 'interoperabilidad');
    assert.ok(interoperabilidad.featureScopes.some(scope => scope.path === 'tapp/payment'));
    const catalog = new ReuseAnalyzer().getCatalog('interoperabilidad', 'ios', 'tapp/payment');
    assert.equal(catalog.featureScope, 'tapp/payment');
    assert.equal(catalog.scenarios.length, 1);
    const related = catalog.scenarios[0].relatedArtifacts;
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

const emptyCatalog = {
    getCatalog: (squad, platform) => ({ squad, platform, stepDefinitions: [], screenMethods: [], locators: [], features: [] })
};

test('recording persiste datos funcionales y oculta únicamente secretos', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-recording-'));
    const store = new AutomationRecordingStore(root);
    store.start({ squad: 'payment', platform: 'android', environment: 'qa' });
    store.replaceActions([
        { action: 'ESCRIBIR', selector: 'id=phone', variableName: 'phone', contextHint: 'numero a yapear', value: '999111222' },
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
    assert.match(preview.screenContent, /Locators\["movementsFilterAndroid"\]\.verTodos/);
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
        screen: `import BaseScreen from '@screenobjects/commons/base.screen.ts';\nimport LocatorFactory from '@utils/LocatorFactory.ts';\nimport { TypeLocator } from '@utils/Enums.ts';\nimport Locators from '${locatorImport}' with { type: 'json' };\nclass ${screenClass} extends BaseScreen { private get movementsList(): string { return LocatorFactory.getElement(TypeLocator.XPATH, Locators.consultaIos.movementsList, TypeLocator.ID, Locators.consultaAndroid.movementsList); } public async verifyMovementsList(): Promise<void> { await this.uiHelper.waitForDisplayed(this.movementsList); } }\nexport default new ${screenClass}();\n`,
        locators: JSON.stringify({ consultaAndroid: { movementsList: 'id=movimientos' }, consultaIos: { movementsList: '' } }, null, 2)
    };
    return {
        schemaVersion: 1, recordingId, planId: plan.planId, resolutions: [],
        actionTrace: [{ sequence: 1, gherkinStep: 'Then se muestra la lista de movimientos', locatorName: 'movementsList' }],
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, content: content[file.layer] }))
    };
}

test('validator exige cuatro capas, trazabilidad y Then', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const validator = new AutomationResponseValidator(undefined, emptyCatalog);
    const validation = validator.validate(resolved.scenario, resolved.plan, validResponse(resolved.plan));
    assert.equal(validation.valid, true);
    assert.equal(validation.qualityScore, 100);
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
        true
    );
    completedIos.files.find(file => file.layer === 'feature').content =
        completedIos.files.find(file => file.layer === 'feature').content.replace('@android', '@android @ios');
    assert.equal(validator.validate(resolved.scenario, resolved.plan, completedIos).valid, true);

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
            .replace("'@screenobjects/commons/base.screen.ts'", "'../commons/base.screen.ts'");
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
                keyword: 'Then', expression: 'se muestra la lista de movimientos',
                file: 'features/yape-steps-definitions/payment/existing.steps.ts',
                squad: 'payment', scope: 'squad'
            }],
            locators: [{
                name: 'movimientosExistentes', selector: 'movimientos',
                androidSelector: 'movimientos', iosSelector: '',
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
// ser antes de escribir el paquete, o el agente arranca y gasta tokens igual.
test('una grabación sin verificación no llega a armar el paquete', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-sin-then-'));
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
    assert.equal(fs.existsSync(path.join(root, 'generation', 'automation')), false);
});

test('package builder limita el contexto y deja verificador autocontenido', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-package-'));
    const resolved = new DeterministicResolver(emptyCatalog);
    const builder = new AutomationPackageBuilder(resolved, new AutomationMemory(path.join(root, 'memory')));
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]), root);
    assert.equal(result.agentRequired, false);
    assert.equal(result.validation.valid, true);
    assert.equal(result.validation.qualityScore, 100);
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'generation-plan.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'reuse-context.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'collision-report.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'verify-package.js')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'agent-response.json')));
    const generatedResponse = JSON.parse(fs.readFileSync(
        path.join(result.packageDirectory, 'agent-response.json'),
        'utf8'
    ));
    assert.match(
        generatedResponse.files.find(file => file.layer === 'feature').content,
        /^# Generado por Appium Visual Recorder\n# Author: Kevinarnold\.zorem\n# Fecha de creación:/
    );
    assert.equal(
        JSON.parse(generatedResponse.files.find(file => file.layer === 'locators').content)
            ._metadata.author,
        'Kevinarnold.zorem'
    );
    const instructions = fs.readFileSync(path.join(result.packageDirectory, 'instructions.md'), 'utf8');
    const verifier = fs.readFileSync(path.join(result.packageDirectory, 'verify-package.js'), 'utf8');
    assert.match(instructions, /Gherkin declarativo/);
    assert.match(instructions, /Agrupa acciones técnicas consecutivas/);
    assert.match(instructions, /contextHint\/elementIntent es solo una pista libre/);
    // Los anclajes del framework llegan resueltos, no como convencion memorizada.
    assert.match(instructions, /@screenobjects\/commons\/base\.screen\.ts/);
    assert.match(instructions, /@utils\/LocatorFactory\.ts/);
    assert.match(instructions, /@utils\/Enums\.ts/);
    assert.match(instructions, /Importa browser.*únicamente si/);
    assert.match(verifier, /Gherkin técnico\/imperativo/);
    assert.match(verifier, /Acción técnica sin agrupar/);
    assert.match(verifier, /usa imports relativos/);
    assert.match(verifier, /importa browser pero no lo utiliza/);
    assert.match(verifier, /Pista contextual copiada literalmente como Step/);
    assert.doesNotThrow(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }));

    const responseFile = path.join(result.packageDirectory, 'agent-response.json');
    const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    const screen = response.files.find(file => file.layer === 'screen');
    screen.content = screen.content.replace(
        "'@screenobjects/commons/base.screen.ts'",
        "'../commons/base.screen.ts'"
    );
    fs.writeFileSync(responseFile, JSON.stringify(response));
    assert.throws(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }));
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

// El codigo va en ingles, el Gherkin en espanol. Solo se juzga lo que el agente
// agrega: el framework arrastra ~90 identificadores en espanol heredados.
test('rechaza identificadores en español y no toca el Gherkin ni lo heredado', () => {
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
    const errores = validator.validate(resolvedScenario, plan, enEspanol).errors
        .filter(error => error.code === 'non-english-identifier');
    assert.equal(errores.length, 1);
    assert.match(errores[0].message, /seMuestranLosMovimientosEsperados/);
    assert.match(errores[0].message, /está en español/);

    fs.writeFileSync(
        path.join(result.packageDirectory, 'agent-response.json'),
        JSON.stringify(enEspanol)
    );
    assert.throws(() => execFileSync(process.execPath, ['verify-package.js'], {
        cwd: result.packageDirectory,
        stdio: 'pipe'
    }), error => /Identificador en espanol/.test(String(error.stdout) + String(error.stderr)));

    const instructions = fs.readFileSync(
        path.join(result.packageDirectory, 'instructions.md'), 'utf8'
    );
    assert.match(instructions, /Todo el codigo va en INGLES/);
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
    const baseline = reuse.updateBaselines[0];
    assert.equal(result.agentRequired, true);
    assert.equal(Object.hasOwn(baseline, 'content'), false);
    assert.equal(baseline.preserve.count, 800);
    assert.equal(baseline.preserve.sample.length, 12);
    assert.ok(fs.statSync(path.join(result.packageDirectory, baseline.reference)).size > 20_000);
    const mandatoryBytes = [
        'scenario.json', 'generation-plan.json', 'reuse-context.json',
        'collision-report.json', 'unresolved-context.json', 'instructions.md'
    ].reduce((total, file) => total + fs.statSync(path.join(result.packageDirectory, file)).size, 0);
    assert.ok(mandatoryBytes <= 20_000);
});

test('reprocesar una grabación limpia solo el paquete y conserva la evidencia original', () => {
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
    fs.writeFileSync(path.join(packageDirectory, 'stale-agent-response.json'), '{}');
    fs.writeFileSync(path.join(evidenceDirectory, 'screen.xml'), '<hierarchy/>');

    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(emptyCatalog),
        new AutomationMemory(path.join(recording, 'memory'))
    );
    const result = builder.prepareRecordedScenario(recording, true);
    assert.equal(fs.existsSync(path.join(packageDirectory, 'stale-agent-response.json')), false);
    assert.equal(fs.existsSync(path.join(evidenceDirectory, 'screen.xml')), true);
    assert.equal(fs.existsSync(path.join(result.packageDirectory, 'generation-plan.json')), true);
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
    assert.match(result.prompt, /No leas resolved-context\.json/);
    assert.doesNotMatch(call.args.join(' '), /instructions\.md/);
});

test('el flujo de automatización cruza renderer, preload y main por IPC explícito', () => {
    const root = path.resolve(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf-8');
    const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf-8');
    const controller = fs.readFileSync(path.join(root, 'recorder/renderer/src/controller/recorderController.js'), 'utf-8');
    for (const channel of [
        'prepare-automation-package', 'prepare-automation-regeneration', 'launch-automation-agent',
        'import-automation-response', 'generate-automation-response'
    ]) {
        assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`));
        assert.match(preload, new RegExp(channel));
    }
    assert.match(controller, /prepareAutomationPackage/);
    assert.match(controller, /prepareAutomationRegeneration/);
    assert.match(controller, /generateAutomationResponse/);
    assert.match(controller, /showAutomationHandoff\(result\.handoff\)/);
    assert.match(controller, /btnLaunchAutomation\.disabled = false/);
    assert.match(controller, /navigator\.clipboard\.writeText\(prompt\)/);
});
