const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { projectPaths } = require('../dist/core/workspace');
const { locatorContractRules } = require('../dist/core/validation/infrastructure/rules/locatorContractRules');
const { textAssertionRules } = require('../dist/core/validation/infrastructure/rules/textAssertionRules');

function fixture(source = 'element', operator = 'equals') {
    const action = { action: 'VERIFICAR_TEXTO', sequence: 6, selector: '~Last 30 days', selectorVerified: true,
        variableName: 'last30Days', value: 'Útimos 30 días', textAssertion: { version: 1, source, operator } };
    const text = 'se muestra la opción de 30 días';
    const request = { squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Consultar filtros',
        fileName: 'filter-text', locatorModule: 'filter-text', caseId: 'TC-1', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'Then', text, methodName: 'readLast30Days', status: 'missing', actions: [action] }] };
    const preview = new FwkMobileGenerator().preview(request, [action]);
    // Zorem correctly returned the helper read without adding an unrelated wait.
    const screenContent = preview.screenContent.replace(/    public async readLast30Days\(\): Promise<string> \{[\s\S]*?\n    \}/,
        `    public async readLast30Days(): Promise<string> {\n        const actual = await this.readRecordedText(this.last30Days, '${source}');\n        return actual;\n    }`);
    assert.notEqual(screenContent, preview.screenContent);
    const files = [
        { layer: 'screen', path: path.relative(projectPaths.frameworkRoot, preview.screenPath), content: screenContent },
        { layer: 'steps', path: path.relative(projectPaths.frameworkRoot, preview.stepPath), content: preview.stepContent },
        { layer: 'locators', path: path.relative(projectPaths.frameworkRoot, preview.locatorPath), content: preview.locatorContent },
    ];
    return { scenario: { platform: 'android', request, actions: [action] }, relaxedContract: false,
        response: { files, actionTrace: [{ sequence: 6, screenMethod: 'readLast30Days', locatorName: 'last30Days', gherkinStep: 'Then ' + text }] },
        plan: { files: files.map(file => ({ ...file, operation: 'create' })), resolutions: [{ sequence: 6, resolution: 'create', locatorName: 'last30Days' }] } };
}
function validate(context) {
    const report = { errors: [], warnings: [] };
    locatorContractRules(context, report); textAssertionRules(context, report);
    return report.errors;
}

test('trace accepts returned recorded text asserted by Steps without requiring an artificial wait', () => {
    for (const source of ['element', 'container']) for (const operator of ['contains', 'equals']) {
        assert.deepEqual(validate(fixture(source, operator)), []);
    }
});

test('trace still rejects discarded text, wrong getter, altered helper, wrong expectation and literal selectors', () => {
    for (const edit of [
        c => { c.response.files[0].content = c.response.files[0].content.replace('return actual;', 'return "fixed";'); },
        c => { c.response.files[0].content = c.response.files[0].content.replace('this.readRecordedText(this.last30Days', 'this.readRecordedText(this.otherGetter'); },
        c => { c.response.files[0].content = c.response.files[0].content.replace('append(await element.getText());', 'append("fixed");'); },
        c => { c.response.files[1].content = c.response.files[1].content.replace(/expect\(actualText\)\.toBe\([^;]+;/, 'console.log(actualText);'); },
        c => { c.response.files[1].content = c.response.files[1].content.replace('Útimos 30 días', 'Útimos 90 días'); },
        c => { c.response.files[0].content = c.response.files[0].content.replace('return actual;', 'await $("//unverified").click(); return actual;'); },
        c => { c.scenario.actions[0].action = 'CLICK'; c.scenario.actions[0].textAssertion = undefined; },
    ]) {
        const context = fixture(); edit(context);
        assert.ok(validate(context).some(error => error.code === 'trace-screen-method'));
    }
});


test('legacy text actions accept equality or contains on element text, never an inferred container', () => {
    for (const operator of ['contains', 'equals']) {
        const context = fixture('element', operator);
        context.scenario.actions[0].textAssertion = undefined;
        assert.deepEqual(validate(context), []);
        const container = fixture('container', operator);
        container.scenario.actions[0].textAssertion = undefined;
        assert.ok(validate(container).some(error => error.code === 'trace-screen-method'));
    }
});
