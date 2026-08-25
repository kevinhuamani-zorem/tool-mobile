const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationPatchWriter,
    AdditivePatchError,
    symbolsOf,
} = require('../dist/core/automationPatchWriter');

const LOCATORS = JSON.stringify({
    filtroAndroid: { mostrarMovimientos: 'new UiSelector().text("Mostrar")' },
    filtroIos: { mostrarMovimientos: '' },
}, null, 4) + '\n';

const SCREEN = [
    "import BaseScreen from '../commons/base.screen.ts';",
    '',
    'class FiltroScreen extends BaseScreen {',
    '',
    '    private get mostrarMovimientos(): string {',
    '        return Locators["filtroAndroid"].mostrarMovimientos;',
    '    }',
    '',
    '    public async elUsuarioConsulta(): Promise<void> {',
    '        await this.uiHelper.waitForDisplayed(this.mostrarMovimientos);',
    '    }',
    '}',
    '',
    'export default new FiltroScreen();',
    '',
].join('\n');

const STEPS = [
    "import { When } from '@wdio/cucumber-framework';",
    '',
    'When(/^el usuario consulta$/, async () => {',
    '    await generatedScreen.elUsuarioConsulta();',
    '});',
    '',
].join('\n');

const FEATURE = [
    'Feature: Filtro',
    '',
    '  @filtro',
    '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consulta',
    '    Given el usuario <username> inicia sesión en Yape',
    '    Then se muestra algo',
    '',
    '    Examples:',
    '      | username |',
    '      | QA |',
    '',
].join('\n');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-patch-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const files = {
        locators: 'resources/locators/payment/filtro.locator.json',
        screen: 'screenobjects/payment/filtro.screen.ts',
        steps: 'features/yape-steps-definitions/payment/filtro.steps.ts',
        feature: 'features/yape-features/payment/filtro.feature',
    };
    const write = (relative, content) => {
        const absolute = path.join(root, relative);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, content);
    };
    write(files.locators, LOCATORS);
    write(files.screen, SCREEN);
    write(files.steps, STEPS);
    write(files.feature, FEATURE);
    const read = key => fs.readFileSync(path.join(root, files[key]), 'utf-8');
    return { root, files, read, writer: new AutomationPatchWriter() };
}

const BASE = { recordingId: 'rec-abc123', createdAt: '2026-08-21T17:00:00.000Z' };

// El estandar del repo prohibe metadatos dentro del JSON de locators: la traza
// de que grabacion aporto cada clave vive en el registro del recorder.
test('agrega la clave nueva a ambos bloques sin ensuciar el JSON con _metadata', t => {
    const ctx = fixture(t);
    const [outcome] = ctx.writer.apply({
        ...BASE,
        locators: { file: ctx.files.locators, additions: [{ name: 'btnDescargar', android: 'Descargar', ios: '' }] },
    }, ctx.root);

    const parsed = JSON.parse(ctx.read('locators'));
    assert.deepEqual(outcome.added, ['btnDescargar']);
    assert.equal(parsed.filtroAndroid.btnDescargar, 'Descargar');
    assert.equal(parsed.filtroIos.btnDescargar, '');
    assert.equal(parsed.filtroAndroid.mostrarMovimientos, 'new UiSelector().text("Mostrar")');
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, '_metadata'), false,
        'un `_metadata` es un comentario con otro nombre y el review lo marca');
});

test('nunca pisa una clave de locator existente', t => {
    const ctx = fixture(t);
    const [outcome] = ctx.writer.apply({
        ...BASE,
        locators: { file: ctx.files.locators, additions: [{ name: 'mostrarMovimientos', android: 'OTRO', ios: 'OTRO' }] },
    }, ctx.root);

    assert.deepEqual(outcome.skipped, ['mostrarMovimientos']);
    assert.equal(JSON.parse(ctx.read('locators')).filtroAndroid.mostrarMovimientos, 'new UiSelector().text("Mostrar")');
});

test('inserta el getter tras el último getter y el método antes del cierre de clase', t => {
    const ctx = fixture(t);
    ctx.writer.apply({
        ...BASE,
        screen: {
            file: ctx.files.screen,
            getters: [{ name: 'btnDescargar', code: '    private get btnDescargar(): string {\n        return Locators["filtroAndroid"].btnDescargar;\n    }' }],
            methods: [{ name: 'elUsuarioDescarga', code: '    public async elUsuarioDescarga(): Promise<void> {\n        await this.uiHelper.waitForDisplayed(this.btnDescargar);\n    }' }],
        },
    }, ctx.root);

    const screen = ctx.read('screen');
    assert.ok(screen.indexOf('get mostrarMovimientos') < screen.indexOf('get btnDescargar'), 'el getter nuevo va después del existente');
    assert.ok(screen.indexOf('get btnDescargar') < screen.indexOf('elUsuarioConsulta'), 'los getters quedan antes de los métodos');
    assert.ok(screen.indexOf('elUsuarioConsulta') < screen.indexOf('elUsuarioDescarga'), 'el método nuevo va al final');
    assert.match(screen, /\/\/ \[Appium Visual Recorder\] rec-abc123/);
    assert.match(screen, /export default new FiltroScreen\(\);/);
    assert.match(screen, /await this\.uiHelper\.waitForDisplayed\(this\.mostrarMovimientos\);/);
});

test('no duplica un método de Screen Object que ya existe', t => {
    const ctx = fixture(t);
    const [outcome] = ctx.writer.apply({
        ...BASE,
        screen: { file: ctx.files.screen, getters: [], methods: [{ name: 'elUsuarioConsulta', code: '    public async elUsuarioConsulta(): Promise<void> {}' }] },
    }, ctx.root);

    assert.deepEqual(outcome.skipped, ['elUsuarioConsulta']);
    assert.equal(ctx.read('screen'), SCREEN);
});

test('agrega la definición de step y el import del Screen si falta', t => {
    const ctx = fixture(t);
    ctx.writer.apply({
        ...BASE,
        steps: {
            file: ctx.files.steps,
            screenImport: "import otroScreen from '../../../screenobjects/payment/otro.screen.ts';",
            definitions: [{ name: 'el usuario descarga', code: 'When(/^el usuario descarga$/, async () => {\n    await otroScreen.descargar();\n});' }],
        },
    }, ctx.root);

    const steps = ctx.read('steps');
    assert.match(steps, /import otroScreen from/);
    assert.match(steps, /el usuario descarga/);
    assert.match(steps, /el usuario consulta/);
    assert.ok(steps.indexOf('import otroScreen') < steps.indexOf('When(/^el usuario consulta'), 'el import va en el bloque de imports');
    assert.ok(steps.indexOf('When(/^el usuario consulta') < steps.indexOf('When(/^el usuario descarga'), 'la definición nueva va al final');
});

test('agrega el escenario al final del Feature sin tocar los previos', t => {
    const ctx = fixture(t);
    ctx.writer.apply({
        ...BASE,
        feature: { file: ctx.files.feature, scenario: '  @otro\n  Scenario Outline: [TC-2][Happy Path][AUTO-FRONT] Descarga\n    Then se descarga\n' },
    }, ctx.root);

    const feature = ctx.read('feature');
    assert.match(feature, /\[TC-1\]\[Happy Path\]\[AUTO-FRONT\] Consulta/);
    assert.match(feature, /\[TC-2\]\[Happy Path\]\[AUTO-FRONT\] Descarga/);
    assert.match(feature, /# \[Appium Visual Recorder\] rec-abc123/);
    assert.ok(feature.indexOf('TC-1') < feature.indexOf('TC-2'));
});

test('aborta si el patch eliminaría un símbolo existente', t => {
    const ctx = fixture(t);
    class Destructivo extends AutomationPatchWriter {
        patchSteps() {
            // Simula una transformación que pierde la definición previa.
            return { content: "import { When } from '@wdio/cucumber-framework';\n", added: [], skipped: [] };
        }
    }
    const writer = new Destructivo();

    assert.throws(
        () => writer.apply({ ...BASE, steps: { file: ctx.files.steps, definitions: [] } }, ctx.root),
        (error) => error instanceof AdditivePatchError && /eliminaría 1 símbolo/.test(error.message)
    );
    assert.equal(ctx.read('steps'), STEPS, 'el archivo original no se toca');
});

test('rechaza rutas fuera del framework', t => {
    const ctx = fixture(t);
    assert.throws(
        () => ctx.writer.apply({ ...BASE, feature: { file: '../../../etc/passwd', scenario: 'x' } }, ctx.root),
        AdditivePatchError
    );
});

test('symbolsOf reconoce los tokens de cada capa', () => {
    assert.deepEqual(symbolsOf('steps', STEPS), ['el usuario consulta']);
    assert.deepEqual(symbolsOf('screen', SCREEN), ['elUsuarioConsulta']);
    assert.deepEqual(symbolsOf('feature', FEATURE), ['[TC-1][Happy Path][AUTO-FRONT] Consulta']);
    assert.deepEqual(symbolsOf('locators', LOCATORS), ['mostrarMovimientos', 'mostrarMovimientos']);
});

const {
    locatorAdditions,
    screenAdditions,
    stepsAdditions,
    featureAdditions,
} = require('../dist/core/automationPatchWriter');

test('deriva solo las claves de locator nuevas comparando contra el disco', () => {
    const proposed = JSON.stringify({
        filtroAndroid: { mostrarMovimientos: 'CAMBIADO', btnDescargar: 'Descargar' },
        filtroIos: { mostrarMovimientos: '', btnDescargar: 'DescargarIos' },
    }, null, 4);

    const additions = locatorAdditions(LOCATORS, proposed);

    assert.deepEqual(additions, [{ name: 'btnDescargar', android: 'Descargar', ios: 'DescargarIos' }]);
});

test('deriva getters y métodos nuevos del Screen Object propuesto', () => {
    const proposed = SCREEN
        .replace('class FiltroScreen extends BaseScreen {', [
            'class FiltroScreen extends BaseScreen {',
            '',
            '    private get btnDescargar(): string {',
            '        return Locators["filtroAndroid"].btnDescargar;',
            '    }',
        ].join('\n'))
        .replace('}\n\nexport default', [
            '',
            '    public async elUsuarioDescarga(): Promise<void> {',
            '        await this.uiHelper.waitForDisplayed(this.btnDescargar);',
            '    }',
            '}',
            '',
            'export default',
        ].join('\n'));

    const { getters, methods } = screenAdditions(SCREEN, proposed);

    assert.deepEqual(getters.map(item => item.name), ['btnDescargar']);
    assert.deepEqual(methods.map(item => item.name), ['elUsuarioDescarga']);
    assert.match(getters[0].code, /private get btnDescargar/);
});

test('deriva definiciones de step nuevas e ignora las existentes', () => {
    const proposed = STEPS +
        '\nWhen(/^el usuario descarga$/, async () => {\n    await otroScreen.descargar();\n});\n';

    const { definitions } = stepsAdditions(STEPS, proposed);

    assert.deepEqual(definitions.map(item => item.name), ['el usuario descarga']);
});

test('deriva el escenario nuevo con su tag y descarta el existente', () => {
    const proposed = FEATURE + '\n  @otro\n  Scenario Outline: [TC-2][Happy Path][AUTO-FRONT] Descarga\n    Then se descarga\n';

    const block = featureAdditions(FEATURE, proposed);

    assert.match(block, /@otro/);
    assert.match(block, /\[TC-2\]/);
    assert.doesNotMatch(block, /\[TC-1\]/);
    assert.equal(featureAdditions(FEATURE, FEATURE), undefined);
});

const { GeneratedFileRegistry } = require('../dist/core/generatedFileRegistry');

test('register no adopta un archivo ajeno que solo se amplió', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-registry-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const { projectPaths } = require('../dist/core/projectPaths');
    const manifest = path.join(projectPaths.toolConfig, 'generated-files.json');
    const backup = fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf-8') : null;
    t.after(() => backup === null ? fs.rmSync(manifest, { force: true }) : fs.writeFileSync(manifest, backup));
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, files: {} }, null, 2));

    const registry = new GeneratedFileRegistry();
    const inside = relative => path.join(projectPaths.frameworkRoot, relative);
    const preview = {
        featurePath: inside('features/yape-features/payment/nuevo.feature'),
        featureContent: 'Feature: nuevo',
        screenPath: inside('screenobjects/payment/ajeno.screen.ts'),
        screenContent: 'class X {}',
        files: [],
    };
    const planned = [
        { layer: 'feature', path: 'features/yape-features/payment/nuevo.feature', operation: 'create' },
        { layer: 'screen', path: 'screenobjects/payment/ajeno.screen.ts', operation: 'update' },
    ];

    const document = registry.register(preview, 'payment', planned);

    assert.ok(document.files['features/yape-features/payment/nuevo.feature'], 'el create sí se administra');
    assert.equal(
        document.files['screenobjects/payment/ajeno.screen.ts'],
        undefined,
        'el update sobre un archivo ajeno no debe adoptarse'
    );
});

test('registerPatch deja traza sin reclamar el archivo', t => {
    const { projectPaths } = require('../dist/core/projectPaths');
    const manifest = path.join(projectPaths.toolConfig, 'generated-files.json');
    const backup = fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf-8') : null;
    t.after(() => backup === null ? fs.rmSync(manifest, { force: true }) : fs.writeFileSync(manifest, backup));
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, files: {} }, null, 2));

    const registry = new GeneratedFileRegistry();
    const file = path.join(projectPaths.frameworkRoot, 'screenobjects/payment/ajeno.screen.ts');

    const document = registry.registerPatch(file, 'payment', 'rec-abc123', ['btnDescargar']);

    assert.equal(document.files['screenobjects/payment/ajeno.screen.ts'], undefined);
    assert.deepEqual(registry.listPatches(file).map(entry => entry.recordingId), ['rec-abc123']);
    assert.deepEqual(registry.listPatches(file)[0].symbols, ['btnDescargar']);
});
