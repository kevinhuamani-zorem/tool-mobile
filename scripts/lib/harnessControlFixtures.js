'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { FwkMobileGenerator } = require('../../dist/core/generation');
const { projectPaths } = require('../../dist/core/workspace');
const { controlledMutations } = require('../validator-evaluate');

const CONTROL_DEFINITIONS = Object.freeze([
    { id: 'duplicate-case', expectedCode: 'case-duplicate', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'locator-type', expectedCode: 'locator-type-mismatch', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'remove-text-assertion', expectedCode: 'recorded-text-assertion-steps', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'locator-value-invented', expectedCode: 'invented-selector', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'test-data-user-missing', expectedCode: 'test-data-user-missing', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'duplicate-step', expectedCode: 'duplicate-step-definition', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'mechanical-gherkin', expectedCode: 'imperative-gherkin', fixture: 'generated-contract', caseIds: ['sales-empty', 'movements-period', 'yapeo-recipient'] },
    { id: 'reused-method-changed', expectedCode: 'reuse-implementation-changed', fixture: 'frozen-method', caseIds: ['movements-period'] },
    { id: 'trace-getter-changed', expectedCode: 'trace-locator', fixture: 'generated-contract', caseIds: ['yapeo-recipient'] },
    { id: 'date-range-weakened', expectedCode: 'acceptance-date-range', fixture: 'date-range', caseIds: ['movements-period'] },
]);
const FIXTURE_IDS = ['generated-contract', 'frozen-method', 'date-range'];
const clone = value => JSON.parse(JSON.stringify(value));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const catalog = { getCatalog: (squad, platform) => ({ squad, platform, stepDefinitions: [], screenMethods: [], locators: [], features: [], scenarios: [] }) };

/** Writes only to the caller-owned temporary checkout; never executes fixture code. */
function writeFixtureFile(relative, content) {
    const destination = path.join(projectPaths.frameworkRoot, relative);
    if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== content) throw new Error(`Synthetic fixture path is occupied: ${relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
}
function installSyntheticInputs() {
    writeFixtureFile('resources/data/recorder-harness/control-users.yml', '- name: Recorder Harness User\n');
    writeFixtureFile('features/yape-steps-definitions/recorder-harness/harness-login.steps.ts',
        "import { Given } from '@wdio/cucumber-framework';\nGiven(/^el usuario (.*) inicia sesión en Yape$/, async (username: string) => { void username; });\n");
}
function fromRows(id, actions, rows) {
    const request = { squad: 'recorder-harness', featureName: 'Controles de validación', scenarioName: 'Consulta de movimientos de control',
        fileName: id, locatorModule: id, caseId: id === 'date-range' ? 'TC-990003' : id === 'frozen-method' ? 'TC-990002' : 'TC-990001',
        pathType: 'Happy Path', tag: 'harness', dataName: 'Recorder Harness User', platform: 'android', scenarioRows: [
            { keyword: 'Given', text: 'el usuario <username> inicia sesión en Yape', status: 'reused',
                file: 'features/yape-steps-definitions/recorder-harness/harness-login.steps.ts', actions: [] }, ...rows,
        ] };
    const preview = new FwkMobileGenerator().preview(request, actions);
    const scenario = { schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: id, revision: 1, fingerprint: hash(id),
        createdAt: new Date(0).toISOString(), squad: request.squad, platform: 'android', environment: 'qa',
        objective: 'Consultar movimientos de control', acceptanceCriteria: 'Se muestra el mensaje grabado', request, actions };
    const files = [['feature', 'featurePath', 'featureContent'], ['steps', 'stepPath', 'stepContent'],
        ['screen', 'screenPath', 'screenContent'], ['locators', 'locatorPath', 'locatorContent']].map(([layer, file, content]) => ({
        layer, path: path.relative(projectPaths.frameworkRoot, preview[file]).split(path.sep).join('/'),
        // The generated header timestamp is not test evidence. Freeze it for stable control hashes.
        content: preview[content].replace(/^# Fecha de creación:.*$/m, '# Fecha de creación: 1970-01-01T00:00:00.000Z'),
    }));
    const plan = { schemaVersion: 1, planId: `harness-${id}`, recordingId: id, status: 'ready', unresolvedGapIds: [],
        files: files.map(({ layer, path }) => ({ layer, path, operation: 'create' })),
        resolutions: actions.map(action => ({ sequence: action.sequence, resolution: 'create', locatorName: action.variableName })) };
    const response = { schemaVersion: 1, planId: plan.planId, recordingId: id, resolutions: [],
        actionTrace: rows.flatMap(row => row.actions.map(action => ({ sequence: action.sequence, gherkinStep: row.text,
            screenMethod: row.methodName, locatorName: action.variableName }))), files };
    return { id, scenario, plan, response, catalog, baselineExpectedValid: true };
}
function generatedFixture(id = 'generated-contract') {
    const actions = [
        { sequence: 1, action: 'CLICK', selector: 'android=new UiSelector().text("Movimientos de control")', selectorVerified: true,
            locatorType: 'ANDROID', locatorValue: 'new UiSelector().text("Movimientos de control")', variableName: 'movementsButton' },
        { sequence: 2, action: 'VERIFICAR_TEXTO', selector: 'android=new UiSelector().resourceId("harness:result")', selectorVerified: true,
            locatorType: 'ANDROID', locatorValue: 'new UiSelector().resourceId("harness:result")', variableName: 'resultMessage', value: 'Selecciona cerrar',
            textAssertion: { version: 1, source: 'container', operator: 'contains' } },
    ];
    return fromRows(id, actions, [
        { keyword: 'When', text: 'el usuario consulta sus movimientos de control', methodName: 'viewMovements', status: 'missing', actions: [actions[0]] },
        // Quoted UI text must remain valid business wording, even when its literal label is procedural.
        { keyword: 'Then', text: 'se muestra el mensaje "Selecciona cerrar"', methodName: 'checkResultMessage', status: 'missing', actions: [actions[1]] },
    ]);
}
function freezeMethod(fixture, row, methodName, dependencies = []) {
    const screen = fixture.response.files.find(file => file.layer === 'screen');
    const source = ts.createSourceFile(screen.path, screen.content, ts.ScriptTarget.Latest, true);
    const owner = source.statements.find(ts.isClassDeclaration);
    const methods = owner.members.filter(ts.isMethodDeclaration);
    const methodHash = name => hash(methods.find(member => member.name.getText(source) === name).getText(source));
    row.reuse = { kind: 'method', methodName, signature: `${methodName}(): Promise<void>`, className: owner.name.text,
        screenFile: screen.path, sourceHash: methodHash(methodName), sequences: row.actions.map(action => action.sequence),
        dependencies: Object.fromEntries(dependencies.map(name => [name, methodHash(name)])), helpers: [], returnType: 'void' };
    for (const file of fixture.response.files.filter(file => ['screen', 'locators'].includes(file.layer))) {
        fixture.plan.files.find(item => item.layer === file.layer).operation = 'update';
        writeFixtureFile(file.path, file.content);
    }
}
function rangeFixture() {
    const fixtureRoot = path.join(__dirname, '../../tests/fixtures/acceptance-framework');
    const locators = fs.readFileSync(path.join(fixtureRoot, 'resources/locators/payment/movements.locator.json'), 'utf8');
    const value = JSON.parse(locators).movementsAndroid.movementDates;
    const actions = [{ sequence: 1, action: 'VERIFICAR_EXISTE', selector: `android=${value}`, selectorVerified: true,
        locatorType: 'ANDROID', locatorValue: value, variableName: 'movementDates' }];
    const fixture = fromRows('date-range', actions, [{ keyword: 'Then', text: 'se muestran los movimientos dentro de los últimos 30 días',
        methodName: 'userViewMovementsLast30DaysConfirmaDateMostrada', status: 'missing', actions }]);
    fixture.scenario.request.acceptanceChecks = [{ id: 'range-30', description: 'Fecha más antigua dentro de 30 días', critical: true,
        kind: 'date-range', sequence: 1, days: 30 }];
    for (const relative of ['support/utils/payment.ts', 'support/common/assertions/assertions.ts']) {
        writeFixtureFile(relative, fs.readFileSync(path.join(fixtureRoot, relative), 'utf8'));
    }
    const screen = fixture.response.files.find(file => file.layer === 'screen');
    screen.content = fs.readFileSync(path.join(fixtureRoot, 'screenobjects/payment/movements.screen.ts'), 'utf8');
    // Keep the pinned import/getter profile; only the synthetic screen path differs.
    fixture.response.files.find(file => file.layer === 'locators').content = locators;
    writeFixtureFile('resources/locators/payment/movements.locator.json', locators);
    const steps = fixture.response.files.find(file => file.layer === 'steps');
    steps.content = steps.content.replace(/dateRangeScreen/g, 'movementsScreen');
    fixture.plan.resolutions[0] = { sequence: 1, resolution: 'reuse', locatorName: 'movementDates',
        source: { file: 'resources/locators/payment/movements.locator.json', module: 'payment/movements', scope: 'squad' } };
    freezeMethod(fixture, fixture.scenario.request.scenarioRows[1], 'userViewMovementsLast30DaysConfirmaDateMostrada',
        ['validateOldestMovementWithinDays', 'scrollToOldestMovement', 'getVisibleMovementDates']);
    return fixture;
}
function buildControlFixture(id) {
    installSyntheticInputs();
    if (id === 'date-range') return rangeFixture();
    const fixture = generatedFixture(id);
    if (id === 'frozen-method') freezeMethod(fixture, fixture.scenario.request.scenarioRows[1], 'viewMovements');
    return fixture;
}
function mutationsFor(fixture) {
    const required = CONTROL_DEFINITIONS.filter(control => control.fixture === fixture.id);
    const standard = controlledMutations(fixture.scenario, fixture.response);
    const mutations = standard.filter(mutation => required.some(control => control.id === mutation.id));
    const mutate = (id, apply) => {
        const definition = required.find(control => control.id === id);
        if (!definition) return;
        const response = clone(fixture.response);
        if (apply(response) === false) return;
        mutations.push({ id, expectedCode: definition.expectedCode, response });
    };
    mutate('locator-value-invented', response => {
        const file = response.files.find(file => file.layer === 'locators'), data = JSON.parse(file.content);
        data.generatedContractAndroid.movementsButton = 'new UiSelector().text("Inventado por agente")';
        file.content = JSON.stringify(data, null, 2);
    });
    mutate('test-data-user-missing', response => {
        const file = response.files.find(file => file.layer === 'feature');
        file.content = file.content.replace('| Recorder Harness User |', '| Recorder Harness Missing User |');
    });
    mutate('duplicate-step', response => {
        const file = response.files.find(file => file.layer === 'steps');
        const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
        const statement = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression));
        if (!statement) return false;
        file.content += '\n' + statement.getText(source) + '\n';
    });
    mutate('mechanical-gherkin', response => {
        const before = 'el usuario consulta sus movimientos de control', after = 'el usuario selecciona cerrar';
        for (const file of response.files.filter(file => ['feature', 'steps'].includes(file.layer))) file.content = file.content.replace(before, after);
        response.actionTrace[0].gherkinStep = after;
    });
    mutate('trace-getter-changed', response => { response.actionTrace[0].locatorName = 'inventedGetter'; });
    mutate('reused-method-changed', response => {
        const file = response.files.find(file => file.layer === 'screen');
        file.content = file.content.replace('public async viewMovements(): Promise<void> {', 'public async viewMovements(): Promise<void> {\n        await this.movementsButton.click();');
    });
    mutate('date-range-weakened', response => {
        const file = response.files.find(file => file.layer === 'screen');
        file.content = file.content.replace('validateOldestMovementWithinDays(30, 40)', 'validateOldestMovementWithinDays(90, 40)');
    });
    return mutations;
}
module.exports = { CONTROL_DEFINITIONS, FIXTURE_IDS, buildControlFixture, mutationsFor, hash };
