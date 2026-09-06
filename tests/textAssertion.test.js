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
function validate(content, action = step(), steps) {
    const report = { errors: [], warnings: [] };
    textAssertionRules({ scenario: { actions: [action] }, response: {
        files: [
            { layer: 'screen', path: 'screen.ts', content },
            ...(steps == null ? [] : [{ layer: 'steps', path: 'steps.ts', content: steps }]),
        ],
        actionTrace: [{ sequence: 1, screenMethod: 'checkMovements', locatorName: 'movementsContent' }],
    } }, report);
    return report.errors;
}
/** Forma heredada: la comparacion dentro del metodo del Screen (sigue siendo valida). */
function legacyScreen(preview = generated()) {
    const operator = /toBe\(/.test(preview.stepContent) ? 'toBe' : 'toContain';
    return preview.screenContent
        .replace('return actualText1;', `await expect(actualText1).${operator}("Hoy");`)
        .replace('checkMovements(): Promise<string>', 'checkMovements(): Promise<void>');
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

// Page Object puro: el Screen lee el texto grabado y lo devuelve; la
// expectativa de negocio vive en el Step, junto al Gherkin (diseño elegido el
// 05-09-2026, el mismo que propuso Lorem en TC-10239).
test('genera las cuatro capas, conserva XPath y emite lectura en el Screen + comparación en el Step', () => {
    for (const source of ['element', 'container']) for (const operator of ['contains', 'equals']) {
        const action = step(source, operator);
        const preview = generated(action);
        assert.equal(preview.files.length, 4);
        assert.ok(preview.locatorContent.includes(action.selector));
        assert.ok(preview.screenContent.includes(`await this.movementsContent, '${source}'`));
        assert.match(preview.screenContent, /public async checkMovements\(\): Promise<string>/);
        assert.match(preview.screenContent, /return actualText1;/);
        assert.doesNotMatch(preview.screenContent, /expect\(actualText1\)/, 'el Screen no compara');
        assert.doesNotMatch(preview.screenContent, /import \{[^}]*\bexpect\b[^}]*\} from '@wdio\/globals'/, 'sin comparación no importa expect');
        assert.match(preview.stepContent, /import \{ expect \} from '@wdio\/globals';/);
        assert.match(preview.stepContent, /const actualText: string = await recordedContentScreen\.checkMovements\(\);/);
        assert.match(preview.stepContent, operator === 'contains'
            ? /expect\(actualText\)\.toContain\("Hoy"\);/
            : /expect\(actualText\)\.toBe\("Hoy"\);/);
        assert.deepEqual(validate(preview.screenContent, action, preview.stepContent), []);
        // La forma heredada (comparación dentro del Screen) sigue siendo válida.
        assert.deepEqual(validate(legacyScreen(preview), action), []);
        const name = /class (\w+) extends/.exec(preview.screenContent)[1];
        assert.ok(screenMethodGetterUsage(preview.screenContent, name).get('checkMovements').getters.has('movementsContent'));
        for (const content of [preview.screenContent, preview.stepContent]) {
            assert.equal(ts.createSourceFile('x.ts', content, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
        }
    }
    const legacy = generated({ ...step(), textAssertion: undefined });
    assert.match(legacy.screenContent, /toHaveText/);
    assert.doesNotMatch(legacy.screenContent, /readRecordedText/);
    assert.doesNotMatch(legacy.stepContent, /expect\(/);
});

test('el valor <param> del Examples se compara en el Step con el parámetro del callback', () => {
    const action = { ...step(), value: '<esperado>' };
    const request = {
        squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Consulta',
        fileName: 'recorded-content', locatorModule: 'recorded-content', caseId: 'TC-1', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'Then', text: 'el contenido incluye <esperado>', methodName: 'checkMovements', status: 'missing', actions: [action] }],
    };
    const preview = new FwkMobileGenerator().preview(request, [action]);
    assert.match(preview.stepContent, /async \(esperado: string\) => \{/);
    assert.match(preview.stepContent, /expect\(actualText\)\.toContain\(esperado\);/);
    assert.deepEqual(validate(preview.screenContent, action, preview.stepContent), []);
});

test('una fila con dos aserciones de texto o con acciones tras la lectura conserva la comparación en el Screen', () => {
    const two = [step(), { ...step(), sequence: 2, variableName: 'otherContent', value: 'Ayer' }];
    const request = {
        squad: 'payment', platform: 'android', featureName: 'Movimientos', scenarioName: 'Consulta',
        fileName: 'recorded-content', locatorModule: 'recorded-content', caseId: 'TC-1', tag: 'movements', pathType: 'Happy Path',
        scenarioRows: [{ keyword: 'Then', text: 'el contenido incluye Hoy y Ayer', methodName: 'checkBoth', status: 'missing', actions: two }],
    };
    const preview = new FwkMobileGenerator().preview(request, two);
    assert.match(preview.screenContent, /checkBoth\(\): Promise<void>/);
    assert.match(preview.screenContent, /await expect\(actualText1\)\.toContain\("Hoy"\);/);
    assert.match(preview.screenContent, /await expect\(actualText2\)\.toContain\("Ayer"\);/);
    assert.doesNotMatch(preview.stepContent, /expect\(/);
});

test('rechaza cambio de fuente/getter, helper alterado o lectura no devuelta en el Screen (Zorem)', () => {
    const { screenContent: screen, stepContent: steps } = generated();
    for (const modified of [
        screen.replace("await this.movementsContent, 'container'", "await this.movementsContent, 'element'"),
        screen.replace('await this.movementsContent,', 'await this.otherElement,'),
        screen.replace("element.$$('.//*')", "element.$$('..')"),
        screen.replace('return actualText1;', ''),
    ]) {
        const [error] = validate(modified, step(), steps);
        assert.equal(error?.code, 'recorded-text-assertion');
        assert.equal(error?.file, 'screen.ts');
    }
    // Forma heredada: los mismos rechazos cuando la comparación vive en el Screen.
    const legacy = legacyScreen();
    for (const modified of [
        legacy.replace('.toContain("Hoy")', '.toBe("Hoy")'),
        legacy.replace('.toContain("Hoy")', '.toContain("Ayer")'),
        legacy.replace('await expect(actualText1)', '// await expect(actualText1)'),
    ]) assert.equal(validate(modified)[0]?.code, 'recorded-text-assertion');
});

test('rechaza en Steps cambio de operador/esperado o comparación ausente y lo atribuye a Lorem', () => {
    const { screenContent: screen, stepContent: steps } = generated();
    for (const modified of [
        steps.replace('.toContain("Hoy")', '.toBe("Hoy")'),
        steps.replace('.toContain("Hoy")', '.toContain("Ayer")'),
        steps.replace('expect(actualText)', '// expect(actualText)'),
        steps.replace('const actualText: string = await recordedContentScreen.checkMovements();', 'await recordedContentScreen.checkMovements();')
            .replace('    expect(actualText).toContain("Hoy");\n', ''),
    ]) {
        const [error] = validate(screen, step(), modified);
        assert.equal(error?.code, 'recorded-text-assertion-steps');
        assert.equal(error?.file, 'steps.ts');
    }
    const { classifyValidationErrors } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
    const routed = classifyValidationErrors(validate(screen, step(), steps.replace('.toContain("Hoy")', '.toBe("Hoy")')));
    assert.equal(routed.behavior.length, 1);
    assert.equal(routed.interaction.length, 0);
    // Sin archivo de Steps en la respuesta, el aviso vuelve a Zorem: no hay otra capa a la que dirigirlo.
    assert.equal(validate(screen)[0]?.code, 'recorded-text-assertion');
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

// Un mensaje unico para tres condiciones dejaba al autor adivinando que
// corregir (TC-10239: 30 turnos y dos rondas sin converger). Cada fallo dice
// cual de las partes falta y como se escribe.
test('el error de recorded-text-assertion nombra la parte que falla y cómo corregirla', () => {
    const preview = generated();
    const { screenContent: screen, stepContent: steps } = preview;
    const messageFor = (content, stepsContent = steps) => validate(content, step(), stepsContent)[0]?.message || '';
    // Screen (Zorem)
    assert.match(messageFor(screen.replace("await this.movementsContent, 'container'", "await this.movementsContent, 'element'")),
        /lee con la fuente 'element' en vez de 'container'; escribe const actual = await this\.readRecordedText\(this\.movementsContent, 'container'\)/);
    assert.match(messageFor(screen.replace('await this.movementsContent,', 'await this.otherElement,')),
        /lee desde this\.otherElement en vez del getter trazado/);
    assert.match(messageFor(screen.replace("element.$$('.//*')", "element.$$('..')")),
        /el helper readRecordedText de \w+ difiere del contrato; cópialo idéntico desde framework-api\.json\.textAssertion\.helper/);
    assert.match(messageFor(screen.replace('return actualText1;', '')),
        /lee el texto pero no lo devuelve; termina con return actualText1; \(Promise<string>\) para que el Step compare con toContain\("Hoy"\)/);
    const helperStart = screen.indexOf('    private async readRecordedText');
    const helperEnd = screen.indexOf('\n    }\n', helperStart) + '\n    }\n'.length;
    assert.match(messageFor(screen.slice(0, helperStart) + screen.slice(helperEnd)),
        /no declara el helper readRecordedText; cópialo idéntico desde framework-api\.json\.textAssertion\.helper/);
    assert.match(messageFor(screen.replace('const actualText1 = await this.readRecordedText', 'const actualText1 = await this.otherReader')),
        /no lee el texto con el helper; escribe const actual = await this\.readRecordedText\(this\.movementsContent, 'container'\)/);
    // Forma heredada (comparación en el Screen)
    const legacy = legacyScreen(preview);
    assert.match(messageFor(legacy.replace('.toContain("Hoy")', '.toBe("Hoy")'), null),
        /compara con toBe y la grabación exige contains \(toContain\); escribe await expect\(actualText1\)\.toContain\("Hoy"\)/);
    assert.match(messageFor(legacy.replace('.toContain("Hoy")', '.toContain("Ayer")'), null),
        /compara con "Ayer" en vez del valor grabado "Hoy"/);
    // Steps (Lorem)
    assert.match(messageFor(screen, steps.replace('.toContain("Hoy")', '.toBe("Hoy")')),
        /el Step compara checkMovements con toBe y la grabación exige contains \(toContain\); escribe const actualText: string = await <screen>\.checkMovements\(\.\.\.\); expect\(actualText\)\.toContain\("Hoy"\)/);
    assert.match(messageFor(screen, steps.replace('.toContain("Hoy")', '.toContain("Ayer")')),
        /el Step compara checkMovements con "Ayer" en vez del valor grabado "Hoy"/);
    assert.match(messageFor(screen, steps.replace('expect(actualText)', '// expect(actualText)')),
        /el Step que invoca checkMovements no compara el texto devuelto/);
    assert.match(messageFor(screen, "import { Then } from '@wdio/cucumber-framework';\n"),
        /ningún Step invoca checkMovements para comparar el texto devuelto/);
    assert.match(messageFor(screen, null), /devuelve la lectura y no hay Steps que la comparen/);
    for (const message of [messageFor(screen, steps.replace('.toContain("Hoy")', '.toBe("Hoy")'))]) {
        assert.match(message, /^La acción 1: /);
        assert.match(message, /El XPath solo localiza; no reemplaza la aserción\.$/);
    }
    assert.deepEqual(validate(screen, step(), steps), [], 'la versión generada sigue siendo válida');
});

test('un metodo trazado inexistente o una traza incompleta se explican por separado', () => {
    const report = { errors: [], warnings: [] };
    textAssertionRules({ scenario: { actions: [step()] }, response: {
        files: [{ layer: 'screen', path: 'screen.ts', content: 'class X {}' }],
        actionTrace: [{ sequence: 1, screenMethod: 'missingMethod', locatorName: 'movementsContent' }],
    } }, report);
    assert.match(report.errors[0].message, /traza el método missingMethod, que no existe en el Screen Object/);
    const untraced = { errors: [], warnings: [] };
    textAssertionRules({ scenario: { actions: [step()] }, response: {
        files: [{ layer: 'screen', path: 'screen.ts', content: 'class X {}' }],
        actionTrace: [{ sequence: 1 }],
    } }, untraced);
    assert.match(untraced.errors[0].message, /debe trazar screenMethod y locatorName/);
    assert.equal(untraced.errors[0].code, 'recorded-text-assertion');
});

test('Derek restaura el helper canónico antes de juzgar y el resultado pasa la regla', () => {
    const { normalizeRecordedTextReader, hasCanonicalRecordedTextReader } = require('../dist/core/automation');
    const { normalizeAuthorResult } = require('../dist/core/automation/infrastructure/layered/artifacts');
    const { screenContent: screen, stepContent: steps } = generated();
    // Helper reescrito por el modelo (otro limite y otra consulta de descendientes).
    const rewritten = screen
        .replace("element.$$('.//*')", "element.$$('*')")
        .replace('32768', '50');
    assert.equal(validate(rewritten, step(), steps)[0]?.code, 'recorded-text-assertion');
    assert.equal(hasCanonicalRecordedTextReader(rewritten), false);
    const restored = normalizeRecordedTextReader(rewritten);
    assert.equal(hasCanonicalRecordedTextReader(restored), true);
    assert.deepEqual(validate(restored, step(), steps), []);
    assert.equal(normalizeRecordedTextReader(screen), screen, 'sin cambios cuando ya es canónico');
    assert.equal(normalizeRecordedTextReader('class A { async go() {} }'), 'class A { async go() {} }');

    // Helper ausente aunque el metodo lo invoca: se inserta en la clase.
    const helperStart = screen.indexOf('    private async readRecordedText');
    const helperEnd = screen.indexOf('\n    }\n', helperStart) + '\n    }\n'.length;
    const missing = screen.slice(0, helperStart) + screen.slice(helperEnd);
    assert.match(validate(missing, step(), steps)[0]?.message || '', /no declara el helper/);
    const inserted = normalizeRecordedTextReader(missing);
    assert.deepEqual(validate(inserted, step(), steps), []);
    assert.equal(ts.createSourceFile('screen.ts', inserted, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);

    // Derek lo aplica sobre la capa screen de Zorem, no sobre la de Lorem.
    const result = {
        schemaVersion: 1, role: 'interaction-author', recordingId: 'rec-1', planId: 'plan-1',
        files: [
            { layer: 'screen', path: 'screenobjects/payment/x.screen.ts', content: rewritten },
            { layer: 'locators', path: 'resources/locators/payment/x.locator.json', content: '{}' },
        ],
        actionTrace: [],
    };
    assert.equal(normalizeAuthorResult(result, 'interaction-author', { recordingId: 'rec-1', planId: 'plan-1', files: [] }), true);
    assert.equal(result.files[0].content, restored);
    const behavior = { schemaVersion: 1, role: 'behavior-author', recordingId: 'rec-1', planId: 'plan-1', files: [{ layer: 'steps', path: 's.ts', content: rewritten }], actionTrace: [] };
    normalizeAuthorResult(behavior, 'behavior-author', { recordingId: 'rec-1', planId: 'plan-1', files: [] });
    assert.equal(behavior.files[0].content, rewritten, 'la capa de Lorem no se toca');
});
