const test = require('node:test');
const assert = require('node:assert/strict');
const { frameworkHelpersOf } = require('../dist/core/frameworkHelpers');
const { helperMethodProblems, screenObjectProblems } = require('../dist/core/screenObjectContract');
const { frameworkContract } = require('../dist/core/frameworkContract');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');
const { projectPaths } = require('../dist/core/projectPaths');

const HELPERS = frameworkHelpersOf(projectPaths.frameworkRoot).map(helper => ({
    property: helper.property,
    methods: helper.methods.map(method => method.name),
}));
const codes = content => helperMethodProblems(content, HELPERS).map(problem => problem.code);

// Se descubren por la declaracion de BaseScreen, no por una lista de nombres:
// agregar un cuarto helper al framework lo incorpora sin tocar el recorder.
test('los helpers se leen del framework con sus metodos', () => {
    const properties = HELPERS.map(helper => helper.property);
    assert.deepEqual(properties, ['gestureHelper', 'keyboardHelper', 'uiHelper']);
    const gesture = HELPERS.find(helper => helper.property === 'gestureHelper');
    const ui = HELPERS.find(helper => helper.property === 'uiHelper');
    assert.ok(gesture.methods.includes('scrollDown'));
    assert.ok(ui.methods.includes('waitForElementDisplayedAndExpect'));
    // Firmas multilinea incluidas: un regex se las perdia.
    const full = frameworkHelpersOf(projectPaths.frameworkRoot);
    const declared = full.find(helper => helper.property === 'uiHelper').methods
        .find(method => method.name === 'waitForElementDisplayedAndExpect');
    assert.match(declared.signature, /element: ChainablePromiseElement/);
    assert.match(declared.signature, /timeout: number/);
});

// El caso real: el agente escribio this.uiHelper.scrollDown(). El metodo existe,
// pero en gestureHelper. No compila, y el fallo aparecia al construir el
// framework, fuera del pipeline.
test('un metodo que vive en otro helper se nombra', () => {
    const problems = helperMethodProblems('await this.uiHelper.scrollDown();', HELPERS);
    assert.deepEqual(problems.map(problem => problem.code), ['helper-method']);
    assert.match(problems[0].message, /scrollDown vive en gestureHelper/);
    assert.match(problems[0].message, /this\.gestureHelper\.scrollDown/);
});

// Si no existe en ninguno, la salida es un metodo del propio Screen Object, no
// inventarse una llamada al helper.
test('un metodo inexistente propone escribirlo en el Screen Object', () => {
    const problems = helperMethodProblems('await this.uiHelper.pinchZoom(2);', HELPERS);
    assert.deepEqual(problems.map(problem => problem.code), ['helper-method']);
    assert.match(problems[0].message, /ningun helper del framework lo tiene/);
    assert.match(problems[0].message, /metodo del propio Screen Object/);
    // Enumera lo que sí hay, para que no vuelva a adivinar.
    assert.match(problems[0].message, /waitForElementExistByLocator/);
});

test('las llamadas correctas no producen nada', () => {
    assert.deepEqual(codes(`
        await this.uiHelper.waitForElementExistByLocator(this.btn, true);
        await this.gestureHelper.scrollDown();
        await this.gestureHelper.verticalScrollTextIntoView('Hola');
        await this.keyboardHelper.submitOtp(this.otp, 6, '123456');
    `), []);
});

test('no confunde metodos del propio Screen Object con helpers', () => {
    assert.deepEqual(codes('await this.openAllMovements(); await this.btn.click();'), []);
});

// Si la ruta determinista rompiera la regla, estaria midiendo solo al agente.
test('el generador determinista solo llama a helpers que existen', () => {
    const actions = [
        { action: 'CLICK', variableName: 'showButton', selector: '~btnShow' },
        { action: 'SCROLL_DOWN' },
        { action: 'SCROLL_HASTA', value: 'Total' },
        { action: 'VERIFICAR_EXISTE', variableName: 'totalLabel', selector: '~lblTotal' },
    ];
    const preview = new FwkMobileGenerator().preview({
        squad: 'payment', featureName: 'F', scenarioName: 'S', fileName: 'helpers-case',
        locatorModule: 'helpers-case', caseId: 'TC-1', pathType: 'Happy Path',
        tag: 'x', platform: 'android',
        scenarioRows: [{
            keyword: 'Then', text: 'se muestra el total', status: 'missing',
            methodName: 'showTotal', actions,
        }],
    }, actions);

    const contract = frameworkContract(projectPaths.frameworkRoot);
    assert.deepEqual(screenObjectProblems(preview.screenContent, {
        typeLocatorSymbol: contract.typeLocatorSymbol,
        typeLocatorImport: contract.typeLocatorImport,
        platformOrder: contract.locatorSignature.platformOrder,
        parameterCount: contract.locatorSignature.parameterCount,
        helpers: HELPERS,
    }), []);
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { frameworkHelpers } = require('../dist/core/frameworkHelpers');

function helperFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helpers-fixture-'));
    fs.mkdirSync(path.join(root, 'core'));
    fs.writeFileSync(path.join(root, 'base.screen.ts'),
        'import { UIHelper } from "./core/UIHelper.js";\n'
        + 'export default abstract class BaseScreen { public uiHelper: UIHelper; }\n');
    fs.writeFileSync(path.join(root, 'core', 'UIHelper.ts'),
        'export class UIHelper {\n  public async waitForDisplayed(s: string): Promise<void> {}\n}\n');
    return { root, base: path.join(root, 'base.screen.ts') };
}

// El framework se actualiza y agrega métodos a un helper existente. Sellar el
// mtime del DIRECTORIO no lo detectaba —un directorio solo cambia cuando se
// agregan o quitan entradas, no al editar un archivo dentro—, así que el mapa
// quedaba congelado y el agente sin saber que ese método ya existe.
test('un método nuevo en un helper existente entra sin reiniciar', () => {
    const { root, base } = helperFixture();
    assert.deepEqual(frameworkHelpers(base)[0].methods.map(m => m.name), ['waitForDisplayed']);

    fs.writeFileSync(path.join(root, 'core', 'UIHelper.ts'),
        'export class UIHelper {\n'
        + '  public async waitForDisplayed(s: string): Promise<void> {}\n'
        + '  public async newCapability(x: number): Promise<void> {}\n}\n');

    assert.deepEqual(
        frameworkHelpers(base)[0].methods.map(m => m.name),
        ['newCapability', 'waitForDisplayed']
    );
});

test('un helper completamente nuevo también entra', () => {
    const { root, base } = helperFixture();
    assert.deepEqual(frameworkHelpers(base).map(h => h.property), ['uiHelper']);

    fs.writeFileSync(path.join(root, 'core', 'GestureHelper.ts'),
        'export class GestureHelper {\n  public async scrollDown(): Promise<void> {}\n}\n');
    fs.writeFileSync(path.join(root, 'base.screen.ts'),
        'import { UIHelper } from "./core/UIHelper.js";\n'
        + 'import { GestureHelper } from "./core/GestureHelper.js";\n'
        + 'export default abstract class BaseScreen {\n'
        + '  public uiHelper: UIHelper;\n  public gestureHelper: GestureHelper;\n}\n');

    assert.deepEqual(frameworkHelpers(base).map(h => h.property), ['gestureHelper', 'uiHelper']);
});
