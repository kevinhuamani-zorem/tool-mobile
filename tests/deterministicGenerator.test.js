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

// 49 de los 82 locators del framework nombran sus bloques fuera de la
// convencion `<camel>Android|Ios` (`yapearAndroid`, `salesiOS`, `Android`...).
// Las claves nuevas de un `update` van al bloque que ya existe para esa
// plataforma; un segundo par de bloques dejaba el getter y el validador
// leyendo un bloque sin la clave y el borrador abortaba (TC-10239).
test('mergeLocatorUpdate suma las claves nuevas a los bloques legacy de la misma plataforma', () => {
    const plan = {
        resolutions: [
            { sequence: 5, resolution: 'create', locatorName: 'emailButton' },
            { sequence: 6, resolution: 'create', locatorName: 'sendMovementsScreen' },
        ],
    };
    const merged = JSON.parse(mergeLocatorUpdate(
        JSON.stringify({
            yapearAndroid: { btnValidateCode: 'android-existente' },
            yapearIos: { btnValidateCode: 'ios-existente' },
        }),
        JSON.stringify({
            yapearOtpAndroid: { emailButton: 'Botón de enviar por correo', sendMovementsScreen: 'new UiSelector().text("Enviar movimientos")' },
            yapearOtpIos: { emailButton: '', sendMovementsScreen: '' },
        }),
        plan,
    ));
    assert.deepEqual(Object.keys(merged), ['yapearAndroid', 'yapearIos'], 'no aparece un segundo par de bloques');
    assert.equal(merged.yapearAndroid.btnValidateCode, 'android-existente');
    assert.equal(merged.yapearAndroid.emailButton, 'Botón de enviar por correo');
    assert.equal(merged.yapearAndroid.sendMovementsScreen, 'new UiSelector().text("Enviar movimientos")');
    assert.equal(merged.yapearIos.emailButton, '');
    assert.equal(merged.yapearIos.sendMovementsScreen, '');
});

test('la plataforma de un bloque se reconoce por sufijo sin distinguir mayúsculas', () => {
    const { locatorBlockPlatform, existingLocatorBlocks, targetLocatorBlock } = require('../dist/core/generation');
    assert.equal(locatorBlockPlatform('yapearAndroid'), 'android');
    assert.equal(locatorBlockPlatform('salesiOS'), 'ios');
    assert.equal(locatorBlockPlatform('winstateYapeasteIOs'), 'ios');
    assert.equal(locatorBlockPlatform('Android'), 'android');
    assert.equal(locatorBlockPlatform('helpers'), undefined);
    assert.deepEqual(
        existingLocatorBlocks({ salesAndroid: {}, salesiOS: {}, _notes: 'texto' }),
        { android: 'salesAndroid', ios: 'salesiOS' },
    );
    const baseline = { movementsAndroid: {}, movementsIos: {} };
    assert.equal(targetLocatorBlock('movementsAndroid', baseline), 'movementsAndroid', 'el homónimo manda');
    assert.equal(targetLocatorBlock('otherIos', baseline), 'movementsIos', 'si no, el bloque de la plataforma');
    assert.equal(targetLocatorBlock('otherIos', {}), 'otherIos', 'sin baseline, el propuesto');
});

test('el identificador del import se toma del Screen existente aunque use ruta relativa', () => {
    const { existingLocatorImportIdentifier } = require('../dist/core/generation');
    const screen = [
        "import BaseScreen from '../commons/base.screen.js';",
        'import LocatorOtp from "../../resources/locators/payment/yapear-otp.locator.json" with { type: "json" };',
        "import LocatorHome from '@locators/home/home.locator.json' with { type: 'json' };",
        'class yapearOTPScreen extends BaseScreen {}',
    ].join('\n');
    assert.equal(existingLocatorImportIdentifier(screen, 'resources/locators/payment/yapear-otp.locator.json'), 'LocatorOtp');
    assert.equal(existingLocatorImportIdentifier(screen, 'resources/locators/home/home.locator.json'), 'LocatorHome');
    assert.equal(existingLocatorImportIdentifier(screen, 'resources/locators/payment/movements.locator.json'), undefined);
});

// Regresion del recording 18167698 (TC-10239): Screen y Locators `update`
// sobre un modulo legacy. El borrador debe extender `yapearAndroid`/`yapearIos`,
// reutilizar `LocatorOtp` y materializar locator+getter de forma atomica.
test('el borrador extiende los bloques legacy del JSON existente y reutiliza el import del Screen', () => {
    const { configureWorkspacePaths, projectPaths: paths } = require('../dist/core/workspace');
    const originalRoot = paths.frameworkRoot;
    const framework = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-framework-'));
    for (const directory of [
        'features/yape-features/payment', 'features/yape-steps-definitions/payment',
        'resources/locators/payment', 'screenobjects/payment', 'screenobjects/commons', 'support/utils',
    ]) fs.mkdirSync(path.join(framework, directory), { recursive: true });
    fs.writeFileSync(path.join(framework, 'package.json'), '{"name":"legacy-fwk"}\n');
    fs.writeFileSync(path.join(framework, 'resources/locators/payment/yapear-otp.locator.json'), JSON.stringify({
        yapearAndroid: { btnValidateCode: 'new UiSelector().className("android.view.View").instance(7)' },
        yapearIos: { btnValidateCode: '**/XCUIElementTypeButton[`name == "Confirmar yapeo"`]' },
    }, null, 4));
    fs.writeFileSync(path.join(framework, 'screenobjects/payment/yapear-otp.screen.ts'), [
        'import BaseScreen from "../commons/base.screen.js";',
        "import { $ } from '@wdio/globals';",
        'import LocatorOtp from "../../resources/locators/payment/yapear-otp.locator.json" with { type: "json" };',
        'class yapearOTPScreen extends BaseScreen {',
        '    public async pressButtonValideCode() {',
        '        await $(LocatorOtp.yapearAndroid.btnValidateCode).click();',
        '    }',
        '}',
        'export default new yapearOTPScreen();',
        '',
    ].join('\n'));
    fs.writeFileSync(path.join(framework, 'features/yape-steps-definitions/payment/otp.steps.ts'), [
        "import { Given, When, Then } from '@wdio/cucumber-framework';",
        "import yapearOTPScreen from '../../../screenobjects/payment/yapear-otp.screen.ts';",
        '',
        'When(/^selecciona el boton de validacion$/, async () => {',
        '    await yapearOTPScreen.pressButtonValideCode();',
        '});',
        '',
    ].join('\n'));
    configureWorkspacePaths({ targetProject: framework, source: 'selected' });
    try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-draft-'));
        writeJson(path.join(dir, 'scenario.json'), {
            schemaVersion: 1,
            pipelineVersion: '1.0.0',
            recordingId: 'rec-legacy',
            revision: 1,
            fingerprint: 'fp-legacy',
            createdAt: new Date(0).toISOString(),
            squad: 'payment',
            platform: 'android',
            environment: 'qa',
            objective: 'Enviar movimientos por correo',
            acceptanceCriteria: 'Se envía el correo',
            request: {
                squad: 'payment',
                featureName: 'Enviar correo',
                scenarioName: 'Enviar correo',
                fileName: 'enviar-correo',
                locatorModule: 'yapear-otp',
                caseId: 'TC-10239',
                pathType: 'Happy Path',
                tag: 'enviar_correo',
                platform: 'android',
                scenarioRows: [{
                    keyword: 'When',
                    text: 'el usuario selecciona enviar por correo',
                    status: 'missing',
                    wording: 'template',
                    methodName: 'userSelectEmail',
                    actions: [{ sequence: 1 }],
                }],
            },
            actions: [{
                sequence: 1,
                action: 'CLICK',
                selector: '~Botón de enviar por correo',
                variableName: 'emailButton',
            }],
        });
        writeJson(path.join(dir, 'generation-plan.json'), {
            schemaVersion: 1,
            pipelineVersion: '1.0.0',
            planId: 'plan-legacy',
            recordingId: 'rec-legacy',
            fingerprint: 'fp-legacy',
            deterministicCoverage: 1,
            status: 'needs-agent',
            resolutions: [{
                sequence: 1,
                action: 'CLICK',
                intent: 'enviar por correo',
                resolution: 'create',
                locatorName: 'emailButton',
                selector: '~Botón de enviar por correo',
                confidence: 1,
                reason: 'create',
            }],
            files: [
                { layer: 'feature', path: 'features/yape-features/payment/enviar-correo.feature', operation: 'create' },
                { layer: 'steps', path: 'features/yape-steps-definitions/payment/otp.steps.ts', operation: 'update' },
                { layer: 'screen', path: 'screenobjects/payment/yapear-otp.screen.ts', operation: 'update' },
                { layer: 'locators', path: 'resources/locators/payment/yapear-otp.locator.json', operation: 'update' },
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

        const draft = new DeterministicDraftBuilder().build(dir);

        const locators = JSON.parse(draft.files.find(file => file.layer === 'locators').content);
        assert.deepEqual(Object.keys(locators), ['yapearAndroid', 'yapearIos']);
        assert.equal(locators.yapearAndroid.btnValidateCode, 'new UiSelector().className("android.view.View").instance(7)');
        assert.equal(locators.yapearAndroid.emailButton, 'Botón de enviar por correo');
        assert.equal(locators.yapearIos.emailButton, '');
        const screen = draft.files.find(file => file.layer === 'screen').content;
        assert.match(screen, /public get emailButton\(\)/);
        assert.match(screen, /LocatorOtp\.yapearAndroid\.emailButton/);
        assert.match(screen, /LocatorOtp\.yapearIos\.emailButton/);
        assert.doesNotMatch(screen, /yapearOtpAndroid|LocatorYapearOtp/);
        assert.equal((screen.match(/yapear-otp\.locator\.json/g) || []).length, 1, 'el import del JSON no se duplica');
        assert.match(screen, /public async pressButtonValideCode\(\)/, 'conserva la API existente');
        // Un update nunca moderniza un Screen escrito a mano: clase, BaseScreen e
        // imports relativos del baseline se conservan byte a byte; solo entran
        // los bindings nuevos.
        assert.match(screen, /class yapearOTPScreen extends BaseScreen/);
        assert.match(screen, /export default new yapearOTPScreen\(\);/);
        assert.match(screen, /import BaseScreen from "\.\.\/commons\/base\.screen\.js";/);
        assert.match(screen, /import LocatorOtp from "\.\.\/\.\.\/resources\/locators\/payment\/yapear-otp\.locator\.json" with \{ type: "json" \};/);
        assert.equal((screen.match(/import BaseScreen/g) || []).length, 1, 'BaseScreen no se duplica aunque el generador lo pida por alias');
        assert.doesNotMatch(screen, /YapearOtpScreen|@screenobjects\/commons/);
        // Steps legacy: la definicion nueva usa el binding existente y no se
        // importa el Screen por segunda vez.
        const steps = draft.files.find(file => file.layer === 'steps').content;
        assert.equal([...steps.matchAll(/yapear-otp\.screen\.ts/g)].length, 1);
        assert.match(steps, /await yapearOTPScreen\.userSelectEmail\(\)/);
        assert.match(steps, /selecciona el boton de validacion/, 'conserva las definiciones del baseline');
        // framework-api cuenta lo mismo a Lorem: el instanceName existente.
        const { existingStepsScreenImport } = require('../dist/core/automation/infrastructure/automationPackageBuilder');
        assert.deepEqual(
            existingStepsScreenImport(JSON.parse(fs.readFileSync(path.join(dir, 'generation-plan.json'), 'utf8')), 'screenobjects/payment/yapear-otp.screen.ts'),
            { instanceName: 'yapearOTPScreen', source: '../../../screenobjects/payment/yapear-otp.screen.ts' },
        );
        // Y el validador acepta el import y el alias heredados del Steps legacy.
        const { AutomationResponseValidator } = require('../dist/core/validation');
        const scenario = JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8'));
        const plan = JSON.parse(fs.readFileSync(path.join(dir, 'generation-plan.json'), 'utf8'));
        const validation = new AutomationResponseValidator().validate(scenario, plan, {
            recordingId: scenario.recordingId, planId: plan.planId, resolutions: [], actionTrace: draft.actionTrace, files: draft.files, assumptions: [],
        });
        const structural = validation.errors.filter(error => /^screen-(?:import-alias|alias|alias-usage)$/.test(error.code));
        assert.deepEqual(structural, [], JSON.stringify(validation.errors));
    } finally {
        configureWorkspacePaths({ targetProject: originalRoot, source: 'selected' });
    }
});

// framework-api.json debe contar a Zorem la misma verdad que usa el borrador:
// en un update legacy, el identificador con el que el Screen ya importa el
// JSON y sus bloques reales; en un modulo nuevo, nada (rige la convencion).
test('framework-api describe el identificador y los bloques reales de un módulo legacy en update', () => {
    const { existingLocatorNaming } = require('../dist/core/automation/infrastructure/automationPackageBuilder');
    const { configureWorkspacePaths, projectPaths: paths } = require('../dist/core/workspace');
    const originalRoot = paths.frameworkRoot;
    const framework = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-api-'));
    for (const directory of [
        'features/yape-features', 'features/yape-steps-definitions',
        'resources/locators/payment', 'screenobjects/payment', 'support',
    ]) fs.mkdirSync(path.join(framework, directory), { recursive: true });
    fs.writeFileSync(path.join(framework, 'package.json'), '{"name":"legacy-fwk"}\n');
    fs.writeFileSync(path.join(framework, 'resources/locators/payment/yapear-otp.locator.json'),
        JSON.stringify({ yapearAndroid: { a: 'x' }, yapearIos: { a: '' } }));
    fs.writeFileSync(path.join(framework, 'screenobjects/payment/yapear-otp.screen.ts'),
        'import LocatorOtp from "../../resources/locators/payment/yapear-otp.locator.json" with { type: "json" };\nclass yapearOTPScreen {}\n');
    configureWorkspacePaths({ targetProject: framework, source: 'selected' });
    try {
        const plan = { files: [
            { layer: 'screen', path: 'screenobjects/payment/yapear-otp.screen.ts', operation: 'update' },
            { layer: 'locators', path: 'resources/locators/payment/yapear-otp.locator.json', operation: 'update' },
        ] };
        assert.deepEqual(existingLocatorNaming(plan.files[1], plan), {
            identifier: 'LocatorOtp',
            blocks: { android: 'yapearAndroid', ios: 'yapearIos' },
        });
        assert.deepEqual(existingLocatorNaming({ ...plan.files[1], operation: 'create' }, plan), {});
        assert.deepEqual(
            existingLocatorNaming({ layer: 'locators', path: 'resources/locators/payment/missing.locator.json', operation: 'update' }, plan),
            { identifier: undefined },
        );
    } finally {
        configureWorkspacePaths({ targetProject: originalRoot, source: 'selected' });
    }
});


// Equivalencia de modulos entre el alias del generador y la ruta relativa de
// un Screen legacy: es lo que permite fusionar imports sin reescribir el baseline.
test('frameworkModuleResolver iguala alias y rutas relativas al mismo módulo del framework', () => {
    const { frameworkModuleResolver, missingImports } = require('../dist/core/generation');
    const resolve = frameworkModuleResolver('screenobjects/payment/yapear-otp.screen.ts');
    assert.equal(resolve('../commons/base.screen.js'), resolve('@screenobjects/commons/base.screen.ts'));
    assert.equal(resolve('../../resources/locators/payment/yapear-otp.locator.json'), resolve('@locators/payment/yapear-otp.locator.json'));
    assert.notEqual(resolve('@locators/payment/movements.locator.json'), resolve('@locators/payment/yapear-otp.locator.json'));
    assert.equal(resolve('@wdio/globals'), '@wdio/globals', 'los paquetes externos no se tocan');

    const baseline = [
        'import BaseScreen from "../commons/base.screen.js";',
        "import { $ } from '@wdio/globals';",
        'import LocatorOtp from "../../resources/locators/payment/yapear-otp.locator.json" with { type: "json" };',
    ].join('\n');
    const proposed = [
        "import { $, browser } from '@wdio/globals';",
        "import BaseScreen from '@screenobjects/commons/base.screen.ts';",
        "import LocatorOtp from '@locators/payment/yapear-otp.locator.json' with { type: 'json' };",
        "import { getTimeoutFromEnv } from '@common/utils/env/environment-config.js';",
    ].join('\n');
    assert.deepEqual(missingImports(baseline, proposed, resolve), [
        "import { $, browser } from '@wdio/globals';",
        "import { getTimeoutFromEnv } from '@common/utils/env/environment-config.js';",
    ], 'solo viajan los imports con algún binding nuevo (browser, getTimeoutFromEnv)');
});

// Steps escrito a mano (TC-10239: `otp.steps.ts`): importa el Screen por ruta
// relativa y con otro nombre (`yapearOTPScreen`). Las definiciones nuevas usan
// ese binding; importar el mismo modulo dos veces era lo que salia antes.
test('mergeStepsUpdate reutiliza el import legacy del Screen en vez de importarlo dos veces', () => {
    const { mergeStepsUpdate } = require('../dist/core/generation');
    const baseline = [
        "import { Given, When, Then } from '@wdio/cucumber-framework';",
        "import yapearOTPScreen from '../../../screenobjects/payment/yapear-otp.screen.ts';",
        '',
        'When(/^se valida con codigo OTP$/, async () => {',
        '    await yapearOTPScreen.validateConfirmaYapeoAltoScreen();',
        '});',
        '',
    ].join('\n');
    const generated = [
        "import { Then, When } from '@wdio/cucumber-framework';",
        "import { expect } from '@wdio/globals';",
        "import yapearOtpScreen from '@screenobjects/payment/yapear-otp.screen.ts';",
        '',
        'Then(/^se muestra correo enviado$/, async () => {',
        '    const actualText: string = await yapearOtpScreen.showEmailSent();',
        '    expect(actualText).toContain("Tu correo se estará enviando en los próximos minutos.");',
        '});',
        '',
    ].join('\n');
    const merged = mergeStepsUpdate(baseline, generated);
    assert.equal([...merged.matchAll(/yapear-otp\.screen\.ts/g)].length, 1, 'un solo import del Screen');
    assert.match(merged, /import yapearOTPScreen from '\.\.\/\.\.\/\.\.\/screenobjects\/payment\/yapear-otp\.screen\.ts';/);
    assert.match(merged, /await yapearOTPScreen\.showEmailSent\(\)/, 'la definicion nueva usa el binding existente');
    assert.doesNotMatch(merged, /yapearOtpScreen/);
    assert.ok(merged.startsWith(baseline.trimEnd()), 'el baseline se conserva byte a byte al inicio');
});

test('el borrador de un update funde el helper readRecordedText aunque sea private', () => {
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
        '    public async readTitle(): Promise<string> {',
        "        const actualText1 = await this.readRecordedText(await this.title, 'element');",
        '        return actualText1;',
        '    }',
        '    private async readRecordedText(element: Awaited<ReturnType<typeof $>>, source: string): Promise<string> {',
        '        return element.getText();',
        '    }',
        '}',
        '',
    ].join('\n');
    const merged = mergeScreenUpdate(baseline, generated, 'screenobjects/payment/existing.screen.ts');
    assert.match(merged, /public async readTitle\(\): Promise<string>/);
    assert.match(merged, /private async readRecordedText\(/, 'el helper private viaja con los metodos nuevos');
    assert.match(merged, /public async existingMethod\(\)/);
    const again = mergeScreenUpdate(merged, generated, 'screenobjects/payment/existing.screen.ts');
    assert.equal([...again.matchAll(/readRecordedText\(element/g)].length, 1, 'no se duplica al refinar');
});
