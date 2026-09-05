const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { parseTextAssertion, RECORDED_TEXT_READER } = require('../dist/core/automation/contracts');
const { prepareRecordedStep, scenarioFingerprint } = require('../dist/core/automation/infrastructure/automationRecordingStore');
const { actionIdentity } = require('../dist/core/automation/domain/memoryFragments');
const { MobileStepExecutor } = require('../dist/core/mobile-session/infrastructure/mobileStepExecutor');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { textAssertionRules } = require('../dist/core/validation/infrastructure/rules/textAssertionRules');
const { screenMethodGetterUsage } = require('../dist/core/validation/infrastructure/rules/screenMethodUsage');
const { partialPrompt } = require('../dist/core/automation/infrastructure/layered/prompts');

const definition = (source = 'container', operator = 'contains') => ({ version: 1, source, operator });
const step = (source = 'container', operator = 'contains') => ({
    action: 'VERIFICAR_TEXTO', sequence: 1, selector: '(//android.view.View)[1]', selectorVerified: true,
    variableName: 'movementsContent', contextHint: 'contenido de movimientos', value: 'Hoy', textAssertion: definition(source, operator),
});
function executor(text = '', descendants = ['Hoy 10:30', 'S/ 20']) {
    const queries = [];
    const element = { getText: async () => text, $$: async selector => {
        queries.push(selector);
        return descendants.map(text => ({ getText: async () => text }));
    } };
    return { element, queries, runner: new MobileStepExecutor({ findElement: async () => element }, {}) };
}
function generated(action = step()) {
    const request = {
        squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Consulta de hoy',
        fileName: 'recorded-content', locatorModule: 'recorded-content', caseId: 'TC-1', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'Then', text: 'el contenido incluye Hoy', methodName: 'checkMovements', status: 'missing', actions: [action] }],
    };
    return new FwkMobileGenerator().preview(request, [action]);
}
function validate(content, action = step()) {
    const report = { errors: [], warnings: [] };
    textAssertionRules({ scenario: { actions: [action] }, response: {
        files: [{ layer: 'screen', path: 'screen.ts', content }],
        actionTrace: [{ sequence: 1, screenMethod: 'checkMovements', locatorName: 'movementsContent' }],
    } }, report);
    return report.errors;
}

test('persiste solo intención explícita y conserva Unicode/espacios del esperado', () => {
    const input = { ...step(), value: ' Hoy: últimos días ', textPreview: { actual: 'NO PERSISTIR' } };
    const prepared = prepareRecordedStep(input, 1, 'android');
    assert.deepEqual(prepared.textAssertion, definition());
    assert.equal(prepared.value, input.value);
    assert.equal(prepared.textPreview, undefined);
    const legacy = { ...step(), textAssertion: undefined };
    assert.equal(prepareRecordedStep(legacy, 1, 'ios').textAssertion, undefined);
    assert.throws(() => parseTextAssertion(definition(), 'CLICK', 'Hoy'));
    assert.throws(() => parseTextAssertion(definition(), 'VERIFICAR_TEXTO', ''));
    assert.throws(() => parseTextAssertion({ ...definition(), source: 'parent' }, 'VERIFICAR_TEXTO', 'Hoy'));
    assert.throws(() => parseTextAssertion({ ...definition(), operator: 'regex' }, 'VERIFICAR_TEXTO', 'Hoy'));
});

test('cache y fingerprint distinguen fuente, operador y esperado exacto', () => {
    const actions = [step(), step('element'), step('container', 'equals'), { ...step(), value: 'hoy' }];
    const fingerprints = actions.map(action => scenarioFingerprint({ squad: 'payment', platform: 'android', actions: [action], objective: 'revisar', request: {} }));
    assert.equal(new Set(fingerprints).size, 4);
    assert.equal(new Set(actions.map(action => actionIdentity(action, 'android'))).size, 4);
});

test('lectura de contenedor encuentra Hoy en descendientes sin inferir padres ni alterar selector', async () => {
    const { runner, queries } = executor();
    const result = await runner.execute(step());
    assert.equal(result.success, true);
    assert.equal(result.textPreview.actual, 'Hoy 10:30\nS/ 20');
    assert.deepEqual(queries, ['.//*']);
    assert.equal((await runner.execute(step('container', 'equals'))).success, false);
    assert.equal((await runner.execute(step('element'))).success, false);
});

test('texto propio, comparación exacta y legacy conservan comportamiento', async () => {
    const { runner, queries } = executor('Hoy');
    assert.equal((await runner.execute(step('element', 'equals'))).success, true);
    assert.deepEqual(queries, []);
    assert.equal((await runner.execute({ ...step('element'), value: 'hoy' })).success, false);
    assert.equal((await runner.execute({ ...step(), textAssertion: undefined })).success, true);
    assert.deepEqual(queries, []);
});

test('lector emitido y ejecución local tienen idénticos resultados Android/iOS, duplicados y límites', async () => {
    const compiled = ts.transpile(`class Reader { ${RECORDED_TEXT_READER} }`, { target: ts.ScriptTarget.ES2020 });
    const Reader = new Function(`${compiled}; return Reader;`)();
    for (const platform of ['android', 'ios']) {
        for (const source of ['element', 'container']) {
            const { runner, element } = executor('Hoy', ['Hoy', '', 'Últimos días']);
            const result = await runner.execute({ ...step(source), platform });
            assert.equal(result.textPreview.actual, await new Reader().readRecordedText(element, source));
        }
    }
    for (const input of [executor('', Array(201).fill('Hoy')), executor('x'.repeat(32769))]) {
        assert.equal((await input.runner.execute(step())).success, false);
        await assert.rejects(new Reader().readRecordedText(input.element, 'container'), /excede/);
    }
    const failing = executor();
    failing.element.getText = async () => { throw new Error('stale element'); };
    assert.equal((await failing.runner.execute(step())).success, false);
});

test('genera las cuatro capas, conserva XPath y emite lectura explícita + comparación adecuada', () => {
    for (const source of ['element', 'container']) for (const operator of ['contains', 'equals']) {
        const action = step(source, operator);
        const preview = generated(action);
        assert.equal(preview.files.length, 4);
        assert.ok(preview.locatorContent.includes(action.selector));
        assert.ok(preview.screenContent.includes(`await this.movementsContent, '${source}'`));
        assert.match(preview.screenContent, operator === 'contains' ? /\.toContain\("Hoy"\)/ : /\.toBe\("Hoy"\)/);
        assert.deepEqual(validate(preview.screenContent, action), []);
        const name = /class (\w+) extends/.exec(preview.screenContent)[1];
        assert.ok(screenMethodGetterUsage(preview.screenContent, name).get('checkMovements').getters.has('movementsContent'));
        assert.equal(ts.createSourceFile('screen.ts', preview.screenContent, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
    }
    const legacy = generated({ ...step(), textAssertion: undefined });
    assert.match(legacy.screenContent, /toHaveText/);
    assert.doesNotMatch(legacy.screenContent, /readRecordedText/);
});

test('rechaza cambio de operador/fuente/esperado/getter, helper alterado o comparación comentada', () => {
    const screen = generated().screenContent;
    for (const modified of [
        screen.replace('.toContain("Hoy")', '.toBe("Hoy")'),
        screen.replace("await this.movementsContent, 'container'", "await this.movementsContent, 'element'"),
        screen.replace('.toContain("Hoy")', '.toContain("Ayer")'),
        screen.replace('await this.movementsContent,', 'await this.otherElement,'),
        screen.replace("element.$$('.//*')", "element.$$('..')"),
        screen.replace('await expect(actualText1)', '// await expect(actualText1)'),
    ]) assert.equal(validate(modified)[0]?.code, 'recorded-text-assertion');
});

test('ambos autores reciben semántica explícita sin inferir validación a partir de XPath', () => {
    for (const role of ['behavior-author', 'interaction-author']) {
        const prompt = partialPrompt(role);
        assert.match(prompt, /textAssertion/);
        assert.match(prompt, /XPath SOLO localiza/);
        assert.match(prompt, /contains usa toContain y equals usa toBe/);
    }
});

test('actions.json y scenario.json conservan intención sin persistir contenido observado', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { AutomationRecordingStore } = require('../dist/core/automation/infrastructure/automationRecordingStore');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'text-assertion-recording-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const store = new AutomationRecordingStore(root);
    const { scenario, directory } = store.buildScenario({
        request: { squad: 'payment', platform: 'android' },
        actions: [{ ...step(), textPreview: { actual: 'CONTENIDO PRIVADO' } }],
        objective: 'Consultar movimientos', acceptanceCriteria: 'El contenido incluye Hoy', environment: 'qa',
    });
    assert.deepEqual(scenario.actions[0].textAssertion, definition());
    for (const file of ['actions.json', 'scenario.json']) {
        const content = fs.readFileSync(path.join(directory, file), 'utf8');
        assert.match(content, /textAssertion/);
        assert.doesNotMatch(content, /CONTENIDO PRIVADO|textPreview/);
    }
});
