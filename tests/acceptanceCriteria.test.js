const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { acceptanceFramework } = require('./helpers/acceptanceFramework');
const { parseAcceptanceCriteria, acceptanceArtifactHash } = require('../dist/core/automation/contracts');
const { acceptanceCriteriaRules, buildAutomationAssessment } = require('../dist/core/validation/infrastructure/rules/acceptanceCriteriaRules');
const { includeFrameworkCompilation } = require('../dist/core/validation');

const check = { id: 'range-30', description: 'Fecha más antigua dentro de 30 días', critical: true, kind: 'date-range', sequence: 1, days: 30 };
function fixture(t, criteria = [check]) {
    const { frameworkRoot } = acceptanceFramework(t);
    const screenPath = 'screenobjects/payment/movements.screen.ts';
    const locatorPath = 'resources/locators/payment/movements.locator.json';
    const context = { relaxedContract: false, scenario: { squad: 'payment', platform: 'android', actions: [{ sequence: 1, action: 'VERIFICAR_EXISTE' }], request: { caseId: 'TC-999900', acceptanceChecks: criteria } }, plan: {},
        response: { actionTrace: [{ sequence: 1, gherkinStep: 'Then se comprueba el rango', screenMethod: 'userViewMovementsLast30DaysConfirmaDateMostrada', locatorName: 'movementDates' }], files: [
            { layer: 'screen', path: screenPath, content: fs.readFileSync(path.join(frameworkRoot, screenPath), 'utf8') },
            { layer: 'locators', path: locatorPath, content: fs.readFileSync(path.join(frameworkRoot, locatorPath), 'utf8') },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/range.steps.ts', content: "import movementsScreen from '@screenobjects/payment/movements.screen.ts';\nThen(/^se comprueba el rango$/, async () => { await movementsScreen.userViewMovementsLast30DaysConfirmaDateMostrada(); });" },
            { layer: 'feature', path: 'features/yape-features/payment/range.feature', content: 'Feature: Rango\n  Scenario: [TC-999900] Verificar rango\n    Then se comprueba el rango\n' },
        ] } };
    return { context, frameworkRoot, screen: context.response.files[0], steps: context.response.files[2] };
}
function evaluate(context) { const report = { errors: [], warnings: [] }; const criteria = acceptanceCriteriaRules(context, report); return { report, criteria, assessment: buildAutomationAssessment(context, report.errors, criteria) }; }

test('criteria require QA-owned identity, a recorded assertion and an explicit positive range', () => {
    const actions = [{ sequence: 1, action: 'CLICK' }, { sequence: 2, action: 'VERIFICAR_EXISTE' }];
    assert.equal(parseAcceptanceCriteria(undefined, actions), undefined);
    assert.deepEqual(parseAcceptanceCriteria([], actions), []);
    assert.throws(() => parseAcceptanceCriteria([check], actions), /verificación grabada/);
    assert.throws(() => parseAcceptanceCriteria([{ ...check, sequence: 2, days: 0 }], actions), /positivo/);
    assert.throws(() => parseAcceptanceCriteria([{ ...check, sequence: 2 }, { ...check, sequence: 2 }], actions), /única/);
    assert.throws(() => parseAcceptanceCriteria([{ ...check, sequence: 2, approved: true }], actions), /válidos/);
    assert.throws(() => parseAcceptanceCriteria([{ ...check, kind: 'manual' }], actions), /manual/);
    assert.equal(parseAcceptanceCriteria([{ ...check, sequence: 2 }], actions)[0].days, 30);
});

test('legacy acceptance text and manual checks never manufacture a successful business verdict', t => {
    const { context } = fixture(t, []);
    let result = evaluate(context);
    assert.equal(result.assessment.acceptance.status, 'not-evaluated');
    assert.equal(result.assessment.acceptance.rate, null);
    context.scenario.request.acceptanceChecks = [{ id: 'outcome', description: 'Filtrado correcto', kind: 'manual', critical: true }];
    result = evaluate(context);
    assert.equal(result.assessment.acceptance.notEvaluated, 1);
    assert.equal(result.assessment.functional.status, 'not-evaluated');
});

test('the recognized framework range assertion proves implementation only', t => {
    const { context } = fixture(t);
    const result = evaluate(context);
    assert.equal(result.criteria[0].status, 'passed', JSON.stringify(result));
    assert.equal(result.assessment.acceptance.rate, 1);
    assert.equal(result.assessment.functional.status, 'not-evaluated');
});

test('mutation: changing 30 to 90 fails the explicit range criterion', t => {
    const { context, screen } = fixture(t);
    screen.content = screen.content.replace('await this.validateOldestMovementWithinDays(30, 40);', 'await this.validateOldestMovementWithinDays(90, 40);');
    const result = evaluate(context);
    assert.equal(result.criteria[0].status, 'failed');
    assert.equal(result.report.errors[0].code, 'acceptance-date-range');
    assert.equal(result.assessment.acceptance.criticalFailures, 1);
});

test('mutation: a visible date cannot pass a range criterion but can prove recorded presence', t => {
    const { context, screen, steps } = fixture(t);
    screen.content = screen.content.replace('public async userViewMovementsLast30DaysConfirmaDateMostrada(): Promise<void> {\n        await this.validateOldestMovementWithinDays(30, 40);', 'public async userViewMovementsLast30DaysConfirmaDateMostrada(): Promise<boolean> {\n        return await this.last15DaysOption.isDisplayed();');
    steps.content = steps.content.replace('await movementsScreen.userViewMovementsLast30DaysConfirmaDateMostrada();', 'const actual = await movementsScreen.userViewMovementsLast30DaysConfirmaDateMostrada(); expect(actual).toBe(true);');
    context.response.actionTrace[0].locatorName = 'last15DaysOption';
    assert.equal(evaluate(context).criteria[0].status, 'failed');
    context.scenario.request.acceptanceChecks = [{ ...check, kind: 'recorded-assertion', days: undefined }];
    assert.equal(evaluate(context).criteria[0].status, 'passed');
    steps.content = steps.content.replace(' expect(actual).toBe(true);', '');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'an unasserted boolean does not prove recorded presence');
});

test('unrecognized helpers, dependency changes and unreachable assertions cannot receive credit', t => {
    const { context, screen, frameworkRoot } = fixture(t);
    const original = screen.content;
    screen.content = original.replace('await this.validateOldestMovementWithinDays(30, 40);', 'return; await this.validateOldestMovementWithinDays(30, 40);');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated');
    screen.content = original.replace('isWithinLastDays(movementDate, days)', 'true');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated');
    screen.content = original;
    fs.appendFileSync(path.join(frameworkRoot, 'support/utils/payment.ts'), '\nexport const changedExecutable = true;\n');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated');
});

test('changed Step delegation and iOS without a recognized profile remain pending', t => {
    const { context, steps } = fixture(t);
    const original = steps.content;
    steps.content = original.replace('await movementsScreen.userViewMovementsLast30DaysConfirmaDateMostrada()', 'await movementsScreen.userViewMovementsLast90DaysConfirmaDateMostrada()');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated');
    steps.content = original;
    context.scenario.platform = 'ios';
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated');
});

test('assessment is bound to exact artifact bytes; later compilation failures update technical status', t => {
    const { context } = fixture(t);
    const assessment = evaluate(context).assessment;
    assert.equal(assessment.artifactHash, acceptanceArtifactHash([...context.response.files].reverse()));
    context.response.files[0].content += '\n';
    assert.notEqual(assessment.artifactHash, acceptanceArtifactHash(context.response.files));
    const validation = { valid: true, qualityScore: 100, errors: [], warnings: [], assessment };
    includeFrameworkCompilation(validation, { status: 'failed', diagnostics: [{ code: 2304, message: 'missing method' }], preexistingDiagnostics: [] });
    assert.equal(validation.assessment.static.status, 'failed');
    assert.equal(validation.assessment.static.errorCount, 1);
    assert.equal(validation.assessment.functional.status, 'not-evaluated');
});

test('an unused range implementation or a trace outside the final target case never receives credit', t => {
    const { context } = fixture(t);
    const feature = context.response.files.find(file => file.layer === 'feature');
    const original = feature.content;
    feature.content = original.replace('Then se comprueba el rango', 'Then se muestra la fecha');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'una traza huérfana no prueba que el Feature ejecute la aserción');
    feature.content = original.replace('TC-999900', 'TC-999901');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'no atribuir la aserción de otro caso');
    feature.content = original + original.slice(original.indexOf('  Scenario:'));
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'dos escenarios del TC no son una asociación única');
    context.response.files = context.response.files.filter(file => file.layer !== 'feature');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'sin Feature final no existe evidencia de ejecución del Step');
});

test('the trace must follow the final Feature order and cover the recorded actions', t => {
    const { context } = fixture(t);
    context.scenario.actions = [{ sequence: 1, action: 'CLICK' }, { sequence: 2, action: 'VERIFICAR_EXISTE' }];
    context.scenario.request.acceptanceChecks = [{ ...check, sequence: 2 }];
    const range = { ...context.response.actionTrace[0], sequence: 2 };
    context.response.actionTrace = [{ sequence: 1, gherkinStep: 'When el usuario elige 30 días', screenMethod: 'select30', locatorName: 'option30' }, range];
    const feature = context.response.files.find(file => file.layer === 'feature');
    feature.content = feature.content.replace('    Then se comprueba el rango', '    When el usuario elige 30 días\n    Then se comprueba el rango');
    assert.equal(evaluate(context).criteria[0].status, 'passed');
    feature.content = feature.content.replace('    When el usuario elige 30 días\n    Then se comprueba el rango', '    Then se comprueba el rango\n    When el usuario elige 30 días');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'una aserción antes del filtro no prueba el resultado grabado');
    context.response.actionTrace = [range];
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'una traza incompleta no prueba el orden grabado');
});

test('recorded text requires reachable Feature, Step and Screen assertions', t => {
    const { FwkMobileGenerator } = require('../dist/core/generation');
    const { context } = fixture(t);
    const action = { sequence: 1, action: 'VERIFICAR_TEXTO', selector: 'id=title', selectorVerified: true,
        variableName: 'title', value: 'Hoy', textAssertion: { version: 1, source: 'element', operator: 'contains' } };
    const request = { squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Verificar texto',
        fileName: 'recorded-text', locatorModule: 'recorded-text', caseId: 'TC-999900', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'Then', text: 'se comprueba el texto', methodName: 'checkText', status: 'missing', actions: [action] }] };
    const preview = new FwkMobileGenerator().preview(request, [action]);
    context.scenario.actions = [action];
    context.scenario.request = { ...request, acceptanceChecks: [{ id: 'text', description: 'Texto Hoy', critical: true, kind: 'recorded-assertion', sequence: 1 }] };
    context.plan.resolutions = [];
    context.response.actionTrace = [{ sequence: 1, gherkinStep: 'Then se comprueba el texto', screenMethod: 'checkText', locatorName: 'title' }];
    context.response.files = [
        { layer: 'feature', path: 'features/yape-features/payment/recorded-text.feature', content: preview.featureContent },
        { layer: 'steps', path: 'features/yape-steps-definitions/payment/recorded-text.steps.ts', content: preview.stepContent },
        { layer: 'screen', path: 'screenobjects/payment/recorded-text.screen.ts', content: preview.screenContent },
    ];
    assert.equal(evaluate(context).criteria[0].status, 'passed', JSON.stringify(evaluate(context)));
    const screen = context.response.files[2], original = screen.content;
    screen.content = original.replace('public async checkText(): Promise<string> {', 'public async checkText(): Promise<string> { return "Hoy";');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'no aprobar una lectura y aserción inaccesibles');
    screen.content = original;
    context.response.files[0].content = preview.featureContent.replace('se comprueba el texto', 'se muestra una pantalla');
    assert.equal(evaluate(context).criteria[0].status, 'not-evaluated', 'un helper correcto sin Step en el Feature no demuestra el criterio');
});
