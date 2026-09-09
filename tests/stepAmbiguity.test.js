/**
 * Resolución de steps como la hace Cucumber: cada línea del Feature debe
 * resolver a exactamente una definición de TODO el framework.
 *
 * Caso real (TC-10239, enter-email-send-report): el recorder creó
 * `^el usuario ingresa su correo (.*) y selecciona enviar$` en payment, pero
 * `autenticacion/login/login.steps.ts` tiene `^el usuario ingresa su (.*) y (.*)$`,
 * que atrapa la misma frase. Cucumber carga todos los squads, no distingue
 * Given de When y falla con "Multiple step definitions match". El catálogo de
 * colisiones solo veía el squad del caso, así que nadie lo detectó.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { isolatedFramework } = require('./helpers/isolatedFramework');
isolatedFramework({ after: callback => test.after(callback) }, 'avr-step-matching-');
const {
    stepDefinitionRegExp,
    matchingStepDefinitions,
    swallowingStepDefinitions,
    stepTextAlternatives,
    stepTextEscaping,
    expandExampleRow,
} = require('../dist/core/shared');
const { disambiguateStepText, collidesWithFrameworkStep } = require('../dist/core/automation/application/resolver/stepReuse');
const { DeterministicResolver } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { ReuseAnalyzer } = require('../dist/core/indexing');
const { frameworkContract, projectPaths } = require('../dist/core/workspace');
const { locatorImportIdentifier } = require('../dist/core/automation');

const LOGIN_LAX = {
    keyword: 'Given',
    expression: '^el usuario ingresa su (.*) y (.*)$',
    file: 'features/yape-steps-definitions/autenticacion/login/login.steps.ts',
    squad: 'autenticacion',
    scope: 'squad',
};
const LOGIN_PREAMBLE = {
    keyword: 'Given',
    expression: '^el usuario (.*) inicia sesión en Yape$',
    file: 'features/yape-steps-definitions/autenticacion/login/login.steps.ts',
    squad: 'autenticacion',
    scope: 'squad',
};
const EMAIL_STEP = 'el usuario ingresa su correo <email> y selecciona enviar';

test('matching: Cucumber ignora el keyword y un regex laxo de otro squad atrapa la frase nueva', () => {
    const own = { expression: '^el usuario ingresa su correo (.*) y selecciona enviar$', file: 'payment/x.steps.ts' };
    const matches = matchingStepDefinitions(`When ${EMAIL_STEP.replace('<email>', 'qa@yape.com.pe')}`, [LOGIN_LAX, own]);
    assert.deepEqual(matches.map(item => item.file), [LOGIN_LAX.file, own.file]);
    // Solo la ajena "traga" la frase: la propia es la misma expresión canónica.
    assert.deepEqual(swallowingStepDefinitions(EMAIL_STEP, [LOGIN_LAX, own]).map(item => item.file), [LOGIN_LAX.file]);
    assert.equal(matchingStepDefinitions('el usuario selecciona atras', [LOGIN_LAX, own]).length, 0);
});

test('matching: acepta fuente interna, literal con flags y cucumber expression', () => {
    assert.equal(stepDefinitionRegExp('^el usuario (.*) inicia sesión en Yape$').test('el usuario Jose inicia sesión en Yape'), true);
    assert.equal(stepDefinitionRegExp('/^EL USUARIO SELECCIONA ATRAS$/i').test('el usuario selecciona atras'), true);
    assert.equal(stepDefinitionRegExp('el usuario ingresa {string} en {word}').test('el usuario ingresa "qa@yape.com.pe" en correo'), true);
    assert.equal(stepDefinitionRegExp('el usuario selecciona atras').test('el usuario selecciona atras y confirma'), false);
    assert.equal(stepDefinitionRegExp('^(el usuario$'), undefined);
    assert.equal(expandExampleRow('el usuario ingresa su correo <email> y <otro>', { email: 'a@b.pe' }), 'el usuario ingresa su correo a@b.pe y <otro>');
});

test('reformulación: cambiar el verbo saca la frase del regex laxo; los sufijos no', () => {
    const alternatives = stepTextAlternatives(EMAIL_STEP);
    assert.equal(alternatives[0], 'el usuario escribe su correo <email> y selecciona enviar');
    assert.ok(alternatives.includes('el usuario ingresa su correo <email>, luego selecciona enviar'));
    assert.equal(stepTextEscaping(EMAIL_STEP, [LOGIN_LAX]), 'el usuario escribe su correo <email> y selecciona enviar');
    // Ningún sufijo escapa de una captura final.
    assert.equal(collidesWithFrameworkStep(`${EMAIL_STEP} en movimientos`, [LOGIN_LAX]), true);
    assert.equal(collidesWithFrameworkStep(alternatives[0], [LOGIN_LAX]), false);
});

test('borrador: una frase atrapada por un regex ajeno se reformula en vez de sufijarse', () => {
    const used = new Set();
    const text = disambiguateStepText(EMAIL_STEP, used, [LOGIN_LAX, LOGIN_PREAMBLE], 'enter-email-send-report', 'TC-10239');
    assert.equal(text, 'el usuario escribe su correo <email> y selecciona enviar');
    // Un texto que solo repite otro (misma expresión canónica) sigue sufijándose.
    const duplicate = { expression: '^se muestran los movimientos esperados$', file: 'payment/movements.steps.ts' };
    assert.equal(
        disambiguateStepText('se muestran los movimientos esperados', new Set(), [duplicate], 'enter-email-send-report', 'TC-10239'),
        'se muestran los movimientos esperados en enter email send report',
    );
});

test('catálogo: frameworkStepDefinitions trae todos los squads; stepDefinitions sigue acotado al squad', () => {
    const catalog = new ReuseAnalyzer().getCatalog('payment', 'android', '');
    const login = catalog.frameworkStepDefinitions.filter(item => /autenticacion\/login\/login\.steps\.ts$/.test(item.file));
    assert.ok(login.length > 0, 'el framework padre debe aportar las definiciones de login');
    assert.equal(catalog.stepDefinitions.some(item => /autenticacion\//.test(item.file)), false);
    assert.ok(catalog.frameworkStepDefinitions.length > catalog.stepDefinitions.length);
    const lax = login.find(item => item.expression === LOGIN_LAX.expression);
    assert.ok(lax, 'login.steps.ts:28 sigue teniendo el regex laxo');
    assert.equal(matchingStepDefinitions(EMAIL_STEP.replace('<email>', 'qa@yape.com.pe'), [lax]).length, 1);
});

// ---- validador -------------------------------------------------------------

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);

function catalogWith(frameworkStepDefinitions) {
    return {
        getCatalog: () => ({
            stepDefinitions: [],
            frameworkStepDefinitions,
            screenMethods: [],
            locators: [],
            scenarios: [],
            features: [],
        }),
    };
}

function scenario(actions) {
    const enriched = actions.map((action, index) => ({
        sequence: index + 1,
        action: action.action,
        description: action.description || action.elementIntent || action.action,
        selector: action.selector || '',
        selectorType: action.selectorType || '',
        selectorValue: action.selectorValue || '',
        selectorVerified: action.selectorVerified ?? false,
        elementIntent: action.elementIntent || '',
        contextHint: action.contextHint || action.elementIntent || '',
        expectedOutcome: action.expectedOutcome || '',
        testData: action.testData || '',
        source: action.source || 'recorder',
        platform: action.platform || 'android',
        createdAt: '2026-08-30T00:00:00.000Z',
    }));
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-test',
        revision: 1,
        fingerprint: 'fp',
        createdAt: '2026-08-30T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Objetivo',
        acceptanceCriteria: 'Aceptación',
        request: {
            squad: 'payment',
            featureName: 'Consulta movimientos',
            scenarioName: 'Consulta',
            fileName: 'consulta-movimientos',
            locatorModule: 'consulta-movimientos',
            caseId: 'TC-1',
            pathType: 'Happy Path',
            tag: 'miflujo',
            dataName: 'QA',
            platform: 'android',
            scenarioRows: [
                { word: 'Given', text: 'el usuario <username> inicia sesión en Yape', wording: 'domain', status: 'reused' },
                { word: 'Then', text: 'se muestra la lista de movimientos', wording: 'domain', status: 'qa' },
            ],
            examples: [{ username: 'Usuario QA' }],
        },
        actions: enriched,
    };
}

function response(plan, { emailLine, emailDefinition }) {
    const screenPath = plan.files.find(file => file.layer === 'screen').path;
    const locatorPath = plan.files.find(file => file.layer === 'locators').path;
    const screenBase = screenPath.split('/').pop().replace(/\.screen\.(?:ts|js)$/i, '');
    const screenClass = screenBase.split(/[^A-Za-z0-9]+/).filter(Boolean)
        .map(segment => segment[0].toUpperCase() + segment.slice(1)).join('') + 'Screen';
    const screenAlias = screenClass[0].toLowerCase() + screenClass.slice(1);
    const screenImport = '@screenobjects/' + screenPath.replace(/^screenobjects\//, '');
    const locatorImport = '@locators/' + locatorPath.replace(/^resources\/locators\//, '');
    const locatorIdentifier = locatorImportIdentifier(locatorPath);
    const byLayer = {
        feature: 'Feature: Consulta de movimientos\n\n@miflujo @smoke_mobile @android\n  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta\n' +
            '    Given el usuario <username> inicia sesión en Yape\n' +
            (emailLine ? `    When ${emailLine}\n` : '') +
            '    Then se muestra la lista de movimientos\n\n    Examples:\n      | username   | email          |\n      | Usuario QA | qa@yape.com.pe |\n',
        steps: `import { When, Then } from '@wdio/cucumber-framework';\nimport ${screenAlias} from '${screenImport}';\n` +
            (emailDefinition ? `When(/^${emailDefinition}$/, async (email: string) => { await ${screenAlias}.sendReport(email); });\n` : '') +
            `Then(/^se muestra la lista de movimientos$/, async () => { await ${screenAlias}.verifyMovementsList(); });\n`,
        screen: `import ${CONTRACT.baseScreenClass} from '${CONTRACT.baseScreenImport}';\nimport ${CONTRACT.locatorFactorySymbol} from '${CONTRACT.locatorFactoryImport}';\nimport { ${CONTRACT.typeLocatorSymbol} } from '${CONTRACT.typeLocatorImport}';\nimport ${locatorIdentifier} from '${locatorImport}' with { type: 'json' };\nclass ${screenClass} extends ${CONTRACT.baseScreenClass} { private get movementsList(): string { return ${CONTRACT.locatorFactorySymbol}.getElement(${CONTRACT.typeLocatorSymbol}.XPATH, ${locatorIdentifier}.consultaMovimientosIos.movementsList, ${CONTRACT.typeLocatorSymbol}.XPATH, ${locatorIdentifier}.consultaMovimientosAndroid.movementsList); } public async sendReport(email: string): Promise<void> { await this.uiHelper.waitForElementDisplayedAndExpect(this.movementsList, 5000, email); } public async verifyMovementsList(): Promise<void> { await this.uiHelper.waitForElementDisplayedAndExpect(this.movementsList, 5000, 'ok'); } }\nexport default new ${screenClass}();\n`,
        locators: JSON.stringify({
            consultaMovimientosAndroid: { movementsList: '//*[@resource-id="movimientos"]' },
            consultaMovimientosIos: { movementsList: '' },
        }, null, 2),
    };
    return {
        schemaVersion: 1,
        recordingId: plan.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: [{
            sequence: 1,
            gherkinStep: 'Then se muestra la lista de movimientos',
            screenMethod: 'verifyMovementsList',
            locatorName: 'movementsList',
        }],
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, content: byLayer[file.layer] })),
    };
}

function validate(catalog, options) {
    const resolved = new DeterministicResolver(catalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
    }]));
    return new AutomationResponseValidator(undefined, catalog)
        .validate(resolved.scenario, resolved.plan, response(resolved.plan, options));
}

test('validador: step-ambiguous cuando un regex de otro squad resuelve la misma línea que la definición propia', () => {
    const catalog = catalogWith([LOGIN_PREAMBLE, LOGIN_LAX]);
    const validation = validate(catalog, {
        emailLine: EMAIL_STEP,
        emailDefinition: 'el usuario ingresa su correo (.*) y selecciona enviar',
    });
    const ambiguous = validation.errors.filter(error => error.code === 'step-ambiguous');
    assert.equal(ambiguous.length, 1, JSON.stringify(validation.errors));
    assert.match(ambiguous[0].message, /login\.steps\.ts → \^el usuario ingresa su \(\.\*\) y \(\.\*\)\$/);
    assert.match(ambiguous[0].message, /Multiple step definitions match/);
    assert.match(ambiguous[0].message, /«el usuario escribe su correo <email> y selecciona enviar»/);
    assert.equal(validation.errors.some(error => error.code === 'step-undefined'), false);
    assert.equal(validation.valid, false);
});

test('validador: la frase reformulada resuelve a una sola definición y el step reutilizado a la suya', () => {
    const catalog = catalogWith([LOGIN_PREAMBLE, LOGIN_LAX]);
    const validation = validate(catalog, {
        emailLine: 'el usuario escribe su correo <email> y selecciona enviar',
        emailDefinition: 'el usuario escribe su correo (.*) y selecciona enviar',
    });
    assert.deepEqual(validation.errors.filter(error => /^step-/.test(error.code)), []);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('validador: step-undefined cuando ninguna definición (propia ni del framework) resuelve la línea', () => {
    const catalog = catalogWith([LOGIN_PREAMBLE, LOGIN_LAX]);
    const validation = validate(catalog, {
        emailLine: 'el usuario escribe su correo <email> y selecciona enviar',
        emailDefinition: undefined,
    });
    const undefinedSteps = validation.errors.filter(error => error.code === 'step-undefined');
    assert.equal(undefinedSteps.length, 1, JSON.stringify(validation.errors));
    assert.match(undefinedSteps[0].message, /«el usuario escribe su correo <email> y selecciona enviar»/);
});

test('validador: sin catálogo del framework no se afirma que una línea quede undefined', () => {
    const validation = validate(catalogWith([]), {
        emailLine: 'el usuario escribe su correo <email> y selecciona enviar',
        emailDefinition: 'el usuario escribe su correo (.*) y selecciona enviar',
    });
    assert.equal(validation.errors.some(error => error.code === 'step-undefined'), false);
});
