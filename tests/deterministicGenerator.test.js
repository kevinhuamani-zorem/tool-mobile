const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    DeterministicDraftBuilder,
    DeterministicGenerator,
    mergeLocatorUpdate,
    mergeScreenUpdate,
} = require('../dist/core/generation');
const { projectPaths } = require('../dist/core/workspace');

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test('deterministic draft builder persiste una referencia estable de cuatro capas', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-draft-'));
    writeJson(path.join(dir, 'generation-plan.json'), {
        recordingId: 'rec-draft',
        planId: 'plan-draft',
        fingerprint: 'fingerprint-draft',
    });
    const files = ['feature', 'steps', 'screen', 'locators'].map(layer => ({
        layer,
        path: `${layer}.txt`,
        content: `${layer} content`,
    }));
    const builder = new DeterministicDraftBuilder({
        createDraft() {
            return {
                recordingId: 'rec-draft',
                planId: 'plan-draft',
                resolutions: [],
                actionTrace: [{ sequence: 1, gherkinStep: 'When acción' }],
                files,
            };
        },
    });

    const draft = builder.build(dir);

    assert.deepEqual(draft.files.map(file => file.layer), ['feature', 'steps', 'screen', 'locators']);
    assert.equal(draft.planFingerprint, 'fingerprint-draft');
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(dir, 'deterministic-draft.json'), 'utf8')),
        draft,
    );
});

test('deterministic generator aplica wording híbrido sin perder trazabilidad', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-generator-'));
    writeJson(path.join(dir, 'scenario.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        revision: 1,
        fingerprint: 'fp-1',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestran movimientos',
        request: {
            squad: 'payment',
            featureName: 'Flujo',
            scenarioName: 'Escenario',
            fileName: 'sample',
            locatorModule: 'sample',
            caseId: 'TC-10239',
            pathType: 'Happy Path',
            tag: 'sample',
            platform: 'android',
            scenarioRows: [{
                keyword: 'When',
                text: 'el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro',
                status: 'missing',
                wording: 'template',
                actions: [{ sequence: 1 }],
            }],
        },
        actions: [{
            sequence: 1,
            action: 'CLICK',
            selector: '~Movimientos',
            variableName: 'movementsButton',
        }],
    });
    writeJson(path.join(dir, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp-1',
        deterministicCoverage: 1,
        status: 'needs-agent',
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'consulta',
            resolution: 'create',
            locatorName: 'movementsButton',
            selector: '~Movimientos',
            confidence: 1,
            reason: 'create',
        }],
        files: [
            { layer: 'feature', path: 'features/yape-features/payment/sample.feature', operation: 'create' },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/sample.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/sample.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/sample.locator.json', operation: 'create' },
        ],
        unresolvedGapIds: [],
        budgets: {
            maxDurationMs: 300000,
            maxContextBytes: 20000,
            maxResponseBytes: 400000,
            maxAgentInvocations: 2,
            maxTotalQueries: 24,
            maxQueriesPerGap: 6,
            maxRepairAttempts: 1,
        },
    });

    const preview = {
        featurePath: path.join(projectPaths.frameworkRoot, 'features/yape-features/payment/sample.feature'),
        featureContent: 'Feature: Sample',
        stepPath: path.join(projectPaths.frameworkRoot, 'features/yape-steps-definitions/payment/sample.steps.ts'),
        stepContent: [
            "import { When } from '@wdio/cucumber-framework';",
            '',
            'When(/^el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro$/, async () => {',
            '    await sampleScreen.userViewAllMovements();',
            '});',
            '',
        ].join('\n'),
        screenPath: path.join(projectPaths.frameworkRoot, 'screenobjects/payment/sample.screen.ts'),
        screenContent: [
            'class SampleScreen {',
            '    public get movementsButton() { return $("~Movimientos"); }',
            '}',
        ].join('\n'),
        locatorPath: path.join(projectPaths.frameworkRoot, 'resources/locators/payment/sample.locator.json'),
        locatorContent: '{ "sampleAndroid": { "movementsButton": "Movimientos" }, "sampleIos": { "movementsButton": "" } }',
        files: [],
    };
    let capturedRequest;
    const generator = new DeterministicGenerator({
        preview: request => {
            capturedRequest = request;
            return { ...preview };
        },
    });
    const draft = generator.createDraft(dir);
    assert.deepEqual(draft.files.map(file => file.layer), ['feature', 'steps', 'screen', 'locators']);
    assert.equal(fs.existsSync(path.join(dir, 'effective-generation-plan.json')), false);

    const response = generator.generate(dir, [], [{
        keyword: 'When',
        text: 'el usuario consulta sus movimientos mediante los filtros disponibles',
        actionSequences: [1],
        reason: 'Consolida la acción técnica en un comportamiento de dominio.',
    }]);
    const steps = response.files.find(file => file.layer === 'steps').content;

    assert.equal(
        steps.includes('When(/^el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro$/'),
        true,
    );
    assert.equal(
        capturedRequest.scenarioRows[0].text,
        'el usuario consulta sus movimientos mediante los filtros disponibles',
    );
    assert.equal(capturedRequest.scenarioRows[0].wording, 'agent');
    assert.deepEqual(capturedRequest.scenarioRows[0].actions.map(action => action.sequence), [1]);
    assert.equal(
        response.actionTrace[0].gherkinStep,
        'When el usuario consulta sus movimientos mediante los filtros disponibles',
    );
});

test('merge de Screen update conserva el baseline y agrega getters junto con métodos', () => {
    const baseline = [
        "import BaseScreen from '@screenobjects/commons/base.screen.ts';",
        'class ExistingScreen extends BaseScreen {',
        '    public async existingMethod(): Promise<void> {}',
        '}',
        'export default new ExistingScreen();',
        '',
    ].join('\n');
    const generated = [
        'class GeneratedScreen extends BaseScreen {',
        '    public get newButton() { return $("~Elemento nuevo"); }',
        '    public async useNewButton(): Promise<void> { await this.newButton.click(); }',
        '}',
        '',
    ].join('\n');
    const merged = mergeScreenUpdate(
        baseline,
        generated,
        'screenobjects/payment/existing.screen.ts',
    );
    assert.match(merged, /public async existingMethod\(\)/);
    assert.match(merged, /public get newButton\(\)/);
    assert.match(merged, /public async useNewButton\(\)/);
});

test('reemplazo autorizado actualiza getter y conserva APIs existentes', () => {
    const baseline = [
        "import BaseScreen from '@screenobjects/commons/base.screen.ts';",
        'class ExistingScreen extends BaseScreen {',
        '    public get btntoday() {',
        '        return LocatorProvider.getElement(TypeLocator.XPATH, LocatorMovements.movementsIos.btntoday, TypeLocator.XPATH, LocatorMovements.movementsAndroid.btntoday);',
        '    }',
        '    public async existingMethod(): Promise<void> {}',
        '}',
        'export default new ExistingScreen();',
        '',
    ].join('\n');
    const generated = [
        'class GeneratedScreen extends BaseScreen {',
        '    public get btntoday() {',
        '        return LocatorProvider.getElement(TypeLocator.XPATH, LocatorMovements.movementsIos.btntoday, TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btntoday);',
        '    }',
        '}',
        '',
    ].join('\n');
    const merged = mergeScreenUpdate(
        baseline,
        generated,
        'screenobjects/payment/movements.screen.ts',
        new Set(['btntoday']),
    );
    assert.match(merged, /TypeLocator\.ANDROID, LocatorMovements\.movementsAndroid\.btntoday/);
    assert.match(merged, /public async existingMethod\(\)/);
    assert.equal((merged.match(/public get btntoday\(/g) || []).length, 1);
});

test('Screen update conserva imports auxiliares y timeout local sin duplicarlos al refinar', () => {
    const baseline = "import BaseScreen from '@screenobjects/commons/base.screen.ts';\nclass ExistingScreen extends BaseScreen {\n}\nexport default new ExistingScreen();\n";
    const generated = "import BaseScreen from '@screenobjects/commons/base.screen.ts';\nimport { getTimeoutFromEnv } from '@common/utils/environment-config.js';\nclass ExistingScreen extends BaseScreen {\n    public async verify(): Promise<void> {\n        const timeout: number = getTimeoutFromEnv();\n        await this.uiHelper.waitForElementDisplayedAndExpect(this.title, timeout, 'missing');\n    }\n}\n";
    const merged = mergeScreenUpdate(baseline, generated, 'screenobjects/payment/existing.screen.ts');
    assert.match(merged, /import \{ getTimeoutFromEnv \}/);
    assert.match(merged, /const timeout: number = getTimeoutFromEnv\(\)/);
    const repeated = mergeScreenUpdate(merged, generated, 'screenobjects/payment/existing.screen.ts');
    assert.equal((repeated.match(/import \{ getTimeoutFromEnv \}/g) || []).length, 1);
    assert.equal((repeated.match(/public async verify/g) || []).length, 1);
});

test('reemplazo autorizado modifica solo la plataforma grabada del locator', () => {
    const plan = {
        resolutions: [{
            sequence: 6,
            resolution: 'create',
            locatorName: 'btntoday',
            locatorReplacement: {
                file: 'resources/locators/payment/movements.locator.json',
                module: 'payment/movements',
                name: 'btntoday',
                platform: 'android',
                sequence: 6,
            },
        }],
    };
    const merged = JSON.parse(mergeLocatorUpdate(
        JSON.stringify({
            movementsAndroid: { btntoday: 'old-android' },
            movementsIos: { btntoday: 'existing-ios' },
        }),
        JSON.stringify({
            movementsAndroid: { btntoday: 'new-verified-android' },
            movementsIos: { btntoday: '' },
        }),
        plan,
    ));
    assert.equal(merged.movementsAndroid.btntoday, 'new-verified-android');
    assert.equal(merged.movementsIos.btntoday, 'existing-ios');
});

// Encadenar casos sin commitear: B reutiliza el Steps de A. La fusion conserva
// cada definicion de A, no duplica el import del Screen Object y solo suma lo
// que A todavia no tenia.
test('mergeStepsUpdate conserva las definiciones del baseline y agrega solo las nuevas', () => {
    const { mergeStepsUpdate } = require('../dist/core/generation');
    const baseline = [
        '// Generado por Appium Recorder',
        "import { Then, When } from '@wdio/cucumber-framework';",
        "import historyScreen from '@screenobjects/payment/history.screen.ts';",
        '',
        'When(/^el usuario consulta el historial$/, async () => {',
        '    await historyScreen.userViewHistory();',
        '});',
        '',
        'Then(/^se muestra el titulo del historial$/, async () => {',
        '    await historyScreen.showHistoryTitle();',
        '});',
        '',
    ].join('\n');
    const generated = [
        '// Generado por Appium Recorder',
        "import { Then, When } from '@wdio/cucumber-framework';",
        "import historyScreen from '@screenobjects/payment/history.screen.ts';",
        '',
        'When(/^el usuario descarga el historial$/, async () => {',
        '    await historyScreen.userDownloadHistory();',
        '});',
        '',
        'Then(/^se muestra el titulo del historial$/, async () => {',
        '    await historyScreen.showHistoryTitle();',
        '});',
        '',
    ].join('\n');
    const merged = mergeStepsUpdate(baseline, generated);
    assert.match(merged, /el usuario consulta el historial/);
    assert.match(merged, /el usuario descarga el historial/);
    assert.equal([...merged.matchAll(/se muestra el titulo del historial/g)].length, 1, 'la definicion repetida no se duplica');
    assert.equal([...merged.matchAll(/^import historyScreen/gm)].length, 1, 'el import no se duplica');
    assert.ok(merged.startsWith(baseline.trimEnd()), 'el baseline se conserva byte a byte al inicio');
    assert.equal(mergeStepsUpdate(baseline, baseline), baseline, 'sin novedades devuelve el baseline intacto');
});

test('mergeFeatureUpdate añade solo los Scenarios nuevos con sus tags y conserva el baseline', () => {
    const { mergeFeatureUpdate } = require('../dist/core/generation');
    const baseline = [
        '@payment',
        'Feature: Historial',
        '',
        '  @historial @android',
        '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta',
        '    Given el usuario <username> inicia sesión en Yape',
        '    Then se muestra el titulo',
        '',
        '    Examples:',
        '      | username |',
        '      | QA |',
        '',
    ].join('\n');
    const generated = [
        '@payment',
        'Feature: Historial',
        '',
        '  @historial @android',
        '  Scenario Outline: [TC-2][Happy Path][AUTO-FRONT] Descarga',
        '    Given el usuario <username> inicia sesión en Yape',
        '    When el usuario descarga el historial',
        '    Then se muestra el titulo',
        '',
        '    Examples:',
        '      | username |',
        '      | QA |',
        '',
    ].join('\n');
    const merged = mergeFeatureUpdate(baseline, generated);
    assert.ok(merged.startsWith(baseline.trimEnd()));
    assert.equal([...merged.matchAll(/^Feature:/gm)].length, 1);
    assert.equal([...merged.matchAll(/Scenario Outline:/g)].length, 2);
    assert.match(merged, /\n\n  @historial @android\n  Scenario Outline: \[TC-2\]/, 'el Scenario nuevo llega con sus tags');
    assert.equal(mergeFeatureUpdate(baseline, baseline), baseline, 'un Scenario ya existente no se duplica');
});

test('mergeFeatureUpdate sustituye el Scenario del mismo caso regenerado y conserva los demás', () => {
    const { mergeFeatureUpdate } = require('../dist/core/generation');
    const other = [
        '  @otro @android',
        '  Scenario Outline: [TC-9][Happy Path][AUTO-FRONT] Otro caso',
        '    Given el usuario <username> inicia sesión en Yape',
        '    Then se muestra otra cosa',
        '',
        '    Examples:',
        '      | username |',
        '      | QA |',
    ].join('\n');
    const baseline = ['@payment', 'Feature: Historial', '', other, '',
        '  @historial @android',
        '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta',
        '    Given el usuario <username> inicia sesión en Yape',
        '    Then se muestra el titulo viejo',
        '',
        '    Examples:',
        '      | username |',
        '      | QA |',
        ''].join('\n');
    const generated = ['@payment', 'Feature: Historial', '',
        '  @historial @android',
        '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta',
        '    Given el usuario <username> inicia sesión en Yape',
        '    When el usuario consulta el historial',
        '    Then se muestra el titulo nuevo',
        '',
        '    Examples:',
        '      | username |',
        '      | QA |',
        ''].join('\n');
    const merged = mergeFeatureUpdate(baseline, generated);
    assert.match(merged, /Otro caso/, 'el otro Scenario se conserva');
    assert.match(merged, /Then se muestra el titulo nuevo/);
    assert.doesNotMatch(merged, /titulo viejo/, 'el bloque del mismo TC se sustituye');
    assert.equal([...merged.matchAll(/Scenario Outline:/g)].length, 2);
    assert.ok(merged.indexOf('Otro caso') < merged.indexOf('titulo nuevo'), 'conserva la posicion del bloque');
});
