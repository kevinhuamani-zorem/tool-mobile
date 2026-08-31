const test = require('node:test');
const assert = require('node:assert/strict');

const { DeterministicResolver } = require('../dist/core/deterministicResolver');
const { AutomationResponseValidator } = require('../dist/core/automationResponseValidator');
const { frameworkContract } = require('../dist/core/frameworkContract');
const { projectPaths } = require('../dist/core/projectPaths');

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);

const emptyCatalog = {
    getCatalog: () => ({
        stepDefinitions: [],
        screenMethods: [],
        locators: [],
        scenarios: [],
        features: [],
    }),
};

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

function validResponse(plan) {
    const screenPath = plan.files.find(file => file.layer === 'screen').path;
    const locatorPath = plan.files.find(file => file.layer === 'locators').path;
    const screenBase = screenPath.split('/').pop().replace(/\.screen\.(?:ts|js)$/i, '');
    const screenClass = screenBase.split(/[^A-Za-z0-9]+/).filter(Boolean)
        .map(segment => segment[0].toUpperCase() + segment.slice(1)).join('') + 'Screen';
    const screenAlias = screenClass[0].toLowerCase() + screenClass.slice(1);
    const screenImport = '@screenobjects/' + screenPath.replace(/^screenobjects\//, '');
    const locatorImport = '@locators/' + locatorPath.replace(/^resources\/locators\//, '');
    const byLayer = {
        feature: 'Feature: Consulta de movimientos\n\n@miflujo @smoke_mobile @android\n  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta\n    Given el usuario <username> inicia sesión en Yape\n    Then se muestra la lista de movimientos\n\n    Examples:\n      | username   |\n      | Usuario QA |\n',
        steps: `import { Then } from '@wdio/cucumber-framework';\nimport ${screenAlias} from '${screenImport}';\nThen(/^se muestra la lista de movimientos$/, async () => { await ${screenAlias}.verifyMovementsList(); });\n`,
        screen: `import ${CONTRACT.baseScreenClass} from '${CONTRACT.baseScreenImport}';\nimport ${CONTRACT.locatorFactorySymbol} from '${CONTRACT.locatorFactoryImport}';\nimport { ${CONTRACT.typeLocatorSymbol} } from '${CONTRACT.typeLocatorImport}';\nimport Locators from '${locatorImport}' with { type: 'json' };\nclass ${screenClass} extends ${CONTRACT.baseScreenClass} { private get movementsList(): string { return ${CONTRACT.locatorFactorySymbol}.getElement(${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaMovimientosIos.movementsList, ${CONTRACT.typeLocatorSymbol}.XPATH, Locators.consultaMovimientosAndroid.movementsList); } public async verifyMovementsList(): Promise<void> { await this.uiHelper.waitForElementDisplayedAndExpect(this.movementsList, 5000, 'ok'); } }\nexport default new ${screenClass}();\n`,
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
        files: plan.files.map(file => ({
            layer: file.layer,
            path: file.path,
            content: byLayer[file.layer],
        })),
    };
}

test('validator marca sintaxis TypeScript inválida antes de aprobar', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE',
        selector: 'id=movimientos',
        selectorVerified: true,
        elementIntent: 'lista de movimientos',
    }]));
    const response = validResponse(resolved.plan);
    const stepsFile = response.files.find(file => file.layer === 'steps');
    stepsFile.content = stepsFile.content.replace(
        'Then(/^se muestra la lista de movimientos$/',
        'Then(../../../../../../../../../../../../^se muestra la lista de movimientos$/'
    );
    const validation = new AutomationResponseValidator(undefined, emptyCatalog)
        .validate(resolved.scenario, resolved.plan, response);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'typescript-syntax'), true);
});
