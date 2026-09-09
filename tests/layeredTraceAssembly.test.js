const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { assembleActionTrace } = require('../dist/core/automation/infrastructure/layered/traceAssembly');
const { classifyValidationErrors } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { projectPaths } = require('../dist/core/workspace');
const { locatorContractRules } = require('../dist/core/validation/infrastructure/rules/locatorContractRules');
const { recordedLocatorRules } = require('../dist/core/validation/infrastructure/rules/recordedLocatorRules');

function fixture() {
    const actions = [
        { sequence: 1, action: 'CLICK', selector: 'android=new UiSelector().text("Mostrar movimientos")',
            locatorType: 'ANDROID', locatorValue: 'new UiSelector().text("Mostrar movimientos")', variableName: 'movementsButton', selectorVerified: true },
        { sequence: 2, action: 'SCROLL_DOWN', selector: '' },
        { sequence: 3, action: 'CLICK', selector: '~Ver todos', locatorType: 'ID', locatorValue: 'Ver todos',
            variableName: 'seeAllButton', selectorVerified: true },
    ];
    const text = 'el usuario consulta todos sus movimientos';
    const request = { squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Consultar movimientos',
        fileName: 'trace-movements', locatorModule: 'trace-movements', caseId: 'TC-1', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'When', text, methodName: 'viewAllMovements', status: 'missing', actions }] };
    const preview = new FwkMobileGenerator().preview(request, actions);
    const files = [
        { layer: 'screen', path: path.relative(projectPaths.frameworkRoot, preview.screenPath), content: preview.screenContent },
        { layer: 'steps', path: path.relative(projectPaths.frameworkRoot, preview.stepPath), content: preview.stepContent },
        { layer: 'locators', path: path.relative(projectPaths.frameworkRoot, preview.locatorPath), content: preview.locatorContent },
    ];
    const fullTrace = actions.map(action => ({ sequence: action.sequence, screenMethod: 'viewAllMovements',
        gherkinStep: 'When ' + text, ...(action.variableName ? { locatorName: action.variableName } : {}) }));
    const behavior = { files: files.filter(f => f.layer === 'steps'), actionTrace: structuredClone(fullTrace) };
    delete behavior.actionTrace[0].locatorName;
    const interaction = { files: files.filter(f => f.layer !== 'steps'), actionTrace: fullTrace };
    const context = { scenario: { platform: 'android', request, actions }, relaxedContract: false,
        response: { files, actionTrace: behavior.actionTrace },
        plan: { files: files.map(file => ({ layer: file.layer, path: file.path, operation: 'create' })),
            resolutions: actions.map(a => ({ sequence: a.sequence, resolution: a.variableName ? 'create' : 'builtin', locatorName: a.variableName })) } };
    return { context, behavior, interaction };
}
function validate(context) {
    const report = { errors: [], warnings: [] };
    locatorContractRules(context, report); recordedLocatorRules(context, report);
    return report.errors;
}

test('conserva la corrección de Zorem en una acción agrupada sin reescribir los autores', () => {
    const { context, behavior, interaction } = fixture();
    const originals = JSON.stringify({ behavior, interaction });
    assert.ok(validate(context).some(e => e.code === 'trace-locator' && /acción 1/.test(e.message)));
    assert.ok(validate(context).some(e => e.code === 'trace-screen-method' && /acción 3/.test(e.message)));
    // Author array order and prose do not own the final behavior interface.
    interaction.actionTrace.reverse();
    interaction.actionTrace.forEach(t => { t.gherkinStep = 'When texto anterior'; });
    const changedInput = JSON.stringify({ behavior, interaction });
    const merged = assembleActionTrace(behavior, interaction);
    assert.deepEqual(merged.errors, []);
    context.response.actionTrace = merged.actionTrace;
    assert.deepEqual(validate(context), []);
    assert.deepEqual(merged.actionTrace.map(t => t.sequence), [1, 2, 3]);
    assert.equal(merged.actionTrace[0].gherkinStep, behavior.actionTrace[0].gherkinStep);
    assert.equal(merged.actionTrace[1].locatorName, undefined, 'un scroll no recibe locator');
    assert.equal(JSON.stringify({ behavior, interaction }), changedInput);
    assert.equal(JSON.parse(originals).behavior.actionTrace[0].locatorName, undefined);
});

test('no combina trazas duplicadas, ajenas o de otro método; dirige el diagnóstico a Zorem', () => {
    for (const edit of [
        i => i.actionTrace.push({ ...i.actionTrace[0] }),
        i => { i.actionTrace[0].screenMethod = 'anotherMethod'; },
        i => i.actionTrace.push({ ...i.actionTrace[0], sequence: 99 }),
    ]) {
        const { behavior, interaction, context } = fixture(); edit(interaction);
        const merged = assembleActionTrace(behavior, interaction);
        assert.ok(merged.errors.some(e => e.code === 'interaction-trace'));
        const routed = classifyValidationErrors(merged.errors, context.plan);
        assert.ok(routed.interaction.length);
        assert.deepEqual(routed.behavior, []);
    }
});

test('la integración mantiene los rechazos de locators, tipos y consumo real del getter', () => {
    for (const edit of [
        (i, c) => { i.actionTrace[2].locatorName = 'invented'; },
        (i, c) => { c.response.files[0].content = c.response.files[0].content.replace('this.seeAllButton.click()', '$("//invented").click()'); },
        (i, c) => { c.response.files[0].content = c.response.files[0].content.replace(/TypeLocator.ID/g, 'TypeLocator.XPATH'); },
        (i, c) => { c.response.files[2].content = c.response.files[2].content.replace('Ver todos', 'Otro botón'); },
    ]) {
        const { behavior, interaction, context } = fixture(); edit(interaction, context);
        const merged = assembleActionTrace(behavior, interaction);
        context.response.actionTrace = merged.actionTrace;
        assert.ok(validate(context).length, 'no basta con afirmar una traza correcta');
    }
});

test('conserva metadata legacy y acciones ausentes para que el validador no pierda el diagnóstico', () => {
    const { behavior, interaction } = fixture();
    interaction.actionTrace = [];
    assert.deepEqual(assembleActionTrace(behavior, interaction).actionTrace, behavior.actionTrace);
    assert.equal(assembleActionTrace(behavior, interaction).actionTrace[0].locatorName, undefined);
    behavior.actionTrace.push({ ...behavior.actionTrace[0] });
    assert.equal(assembleActionTrace(behavior, interaction).actionTrace.length, 4, 'no deduplica acciones defectuosas');
});
