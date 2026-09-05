const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationPatchWriter,
    AdditivePatchError,
    symbolsOf,
} = require('../dist/core/automation');

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

test('Screen reconoce alias y ruta relativa del mismo módulo sin sustituir el import original', t => {
    const ctx = fixture(t);
    fs.mkdirSync(path.join(ctx.root, 'screenobjects/commons'), { recursive: true });
    fs.writeFileSync(path.join(ctx.root, 'screenobjects/commons/base.screen.ts'), 'export default class BaseScreen {}');
    fs.writeFileSync(path.join(ctx.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
        baseUrl: '.', paths: { '@screenobjects/*': ['screenobjects/*'] }, moduleResolution: 'node16', module: 'NodeNext',
    } }));
    const [outcome] = ctx.writer.prepare({ ...BASE, screen: { file: ctx.files.screen, getters: [], methods: [],
        imports: ["import BaseScreen from '@screenobjects/commons/base.screen.ts';", "import { getTimeoutFromEnv } from '@common/env';"],
    } }, ctx.root);
    assert.match(outcome.content, /import BaseScreen from '\.\.\/commons\/base.screen.ts'/);
    assert.equal((outcome.content.match(/import BaseScreen/g) || []).length, 1);
    assert.match(outcome.content, /getTimeoutFromEnv/);
    assert.equal(ctx.read('screen'), SCREEN);
    assert.throws(() => ctx.writer.prepare({ ...BASE, screen: { file: ctx.files.screen, getters: [], methods: [],
        imports: ["import BaseScreen from '@unrelated/base';"],
    } }, ctx.root), /Import incompatible/);
});

test('corrección de import en Screen sin métodos nuevos es idempotente y rechaza conflictos', () => {
    const writer = new AutomationPatchWriter();
    const baseline = 'class Screen { verify() { return getTimeoutFromEnv(); } }';
    const imports = ["import { getTimeoutFromEnv } from '@common/utils/env/environment-config.js';"];
    const first = writer.patchScreen(baseline, [], [], BASE.recordingId, BASE.createdAt, imports);
    assert.match(first.content, /import \{ getTimeoutFromEnv \}/);
    assert.equal(writer.patchScreen(first.content, [], [], BASE.recordingId, BASE.createdAt, imports).content, first.content);
    assert.throws(() => writer.patchScreen(first.content, [], [], BASE.recordingId, BASE.createdAt,
        ["import { other as getTimeoutFromEnv } from '@other';"]), /Import incompatible/);
});

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
    assert.match(screen, /\/\/ \[Appium Recorder\] rec-abc123/);
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
    assert.match(feature, /# \[Appium Recorder\] rec-abc123/);
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
} = require('../dist/core/automation');

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

const { GeneratedFileRegistry } = require('../dist/core/automation');

test('update fusiona imports multilinea, aliases, tipos y varios screens sin duplicar bindings', t => {
    const ctx = fixture(t);
    const proposed = STEPS.replace("import { When } from '@wdio/cucumber-framework';", [
        "import { When,\n Then, type DataTable } from '@wdio/cucumber-framework';",
        "import { expect as check } from '@wdio/globals';",
        "import firstScreen from '@screenobjects/payment/first.screen.ts';",
        "import secondScreen from '@screenobjects/payment/second.screen.ts';",
    ].join('\n')) + '\nThen(/^nuevo$/, async (data: DataTable) => { await firstScreen.run(); await secondScreen.run(); check(data).toBeDefined(); });\n';
    const additions = stepsAdditions(STEPS, proposed);
    ctx.writer.apply({ ...BASE, steps: { file: ctx.files.steps, ...additions } }, ctx.root);
    const result = ctx.read('steps');
    assert.match(result, /When, Then, type DataTable/);
    assert.match(result, /expect as check/);
    assert.match(result, /import firstScreen/);
    assert.match(result, /import secondScreen/);
    assert.equal((result.match(/from ['"]@wdio\/cucumber-framework['"]/g) || []).length, 1);
    assert.ok(result.includes(STEPS.slice(STEPS.indexOf('When(')).trim()));
    ctx.writer.apply({ ...BASE, steps: { file: ctx.files.steps, ...additions } }, ctx.root);
    assert.equal(ctx.read('steps'), result, 'reaplicar no duplica imports ni definitions');
});

test('un binding importado incompatible no cambia el archivo existente', t => {
    const ctx = fixture(t);
    assert.throws(() => ctx.writer.apply({ ...BASE, steps: {
        file: ctx.files.steps,
        imports: ["import { When } from 'otro-modulo';"],
        definitions: [{ name: 'nuevo', code: 'When(/^nuevo$/, async () => {});' }],
    } }, ctx.root), /Import incompatible/);
    assert.equal(ctx.read('steps'), STEPS);
});

test('AutomationApplier entrega todos los imports al patch de Steps', t => {
    const ctx = fixture(t);
    const { AutomationApplier } = require('../dist/core/automation');
    const proposed = STEPS + "\nimport { Then } from '@wdio/cucumber-framework';\n"
        + "import { expect } from '@wdio/globals';\n"
        + "import oneScreen from '@screenobjects/payment/one.screen.ts';\n"
        + "import twoScreen from '@screenobjects/payment/two.screen.ts';\n"
        + 'Then(/^otro$/, async () => { await oneScreen.run(); await twoScreen.run(); expect(true).toBe(true); });\n';
    const applier = new AutomationApplier(ctx.writer, undefined, undefined, ctx.root);
    applier.applyAdditiveUpdates({ recordingId: BASE.recordingId, actions: [] }, { resolutions: [] }, {
        files: [{ layer: 'steps', path: ctx.files.steps, content: proposed }],
    }, new Map([['steps', ctx.files.steps]]));
    assert.match(ctx.read('steps'), /When, Then/);
    for (const name of ['expect', 'oneScreen', 'twoScreen']) assert.match(ctx.read('steps'), new RegExp('import[^;]*\\b' + name + '\\b'));
});

test('update conserva varios tags, comentarios, Examples y todos los escenarios nuevos', t => {
    const ctx = fixture(t);
    const first = '  @payment @smoke_mobile @android\n  # motivo del caso\n  @filters\n  Scenario Outline: Nuevo\n    Then resultado <periodo>\n\n    Examples:\n      | periodo |\n      | hoy |\n';
    const second = '  @payment @regression_mobile @ios\n  Scenario: Otro\n    Then otro resultado\n';
    const block = featureAdditions(FEATURE, FEATURE + '\n' + first + '\n' + second);
    assert.ok(block.includes(first.trimEnd()));
    assert.ok(block.includes(second.trimEnd()));
    const [outcome] = ctx.writer.apply({ ...BASE, feature: { file: ctx.files.feature, scenario: block } }, ctx.root);
    assert.deepEqual(outcome.added, ['Nuevo', 'Otro']);
    assert.ok(ctx.read('feature').startsWith(FEATURE.trimEnd()));
    assert.ok(ctx.read('feature').includes('@payment @smoke_mobile @android'));
    assert.ok(ctx.read('feature').includes('@payment @regression_mobile @ios'));
    const result = ctx.read('feature');
    ctx.writer.apply({ ...BASE, feature: { file: ctx.files.feature, scenario: block } }, ctx.root);
    assert.equal(ctx.read('feature'), result);
});

test('register no adopta un archivo ajeno que solo se amplió', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-registry-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const { projectPaths } = require('../dist/core/workspace');
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
    const { projectPaths } = require('../dist/core/workspace');
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

// El caso de tapp-subhome: el modulo se escribio grabando en iOS y ahora se
// graba en Android. La clave existe en los dos bloques y Android esta vacio.
// 387 de las 1001 claves compartidas de este framework estan asi.
test('completar rellena el hueco de una clave existente', t => {
    const ctx = fixture(t);
    const [outcome] = ctx.writer.apply({
        ...BASE,
        locators: {
            file: ctx.files.locators,
            additions: [],
            completions: [{
                name: 'mostrarMovimientos',
                platform: 'ios',
                block: 'filtroIos',
                value: '//XCUIElementTypeButton[@name="Mostrar"]',
            }],
        },
    }, ctx.root);

    const parsed = JSON.parse(ctx.read('locators'));
    assert.deepEqual(outcome.added, ['mostrarMovimientos']);
    assert.equal(parsed.filtroIos.mostrarMovimientos, '//XCUIElementTypeButton[@name="Mostrar"]');
    // La otra plataforma no se toca.
    assert.equal(parsed.filtroAndroid.mostrarMovimientos, 'new UiSelector().text("Mostrar")');
});

test('completar nunca pisa un valor real', t => {
    const ctx = fixture(t);
    const [outcome] = ctx.writer.apply({
        ...BASE,
        locators: {
            file: ctx.files.locators,
            additions: [],
            completions: [{
                name: 'mostrarMovimientos',
                platform: 'android',
                block: 'filtroAndroid',
                value: 'otro',
            }],
        },
    }, ctx.root);

    assert.deepEqual(outcome.added, []);
    assert.deepEqual(outcome.skipped, ['mostrarMovimientos']);
    assert.equal(JSON.parse(ctx.read('locators')).filtroAndroid.mostrarMovimientos, 'new UiSelector().text("Mostrar")');
});

// Tu regla: verificar que la clave exista en el bloque de la plataforma grabada.
// Si no esta, ese modulo no declara el elemento ahi y no es una decision del patch.
test('completar una clave que el bloque no declara es un error', t => {
    const ctx = fixture(t);
    assert.throws(() => ctx.writer.apply({
        ...BASE,
        locators: {
            file: ctx.files.locators,
            additions: [],
            completions: [{ name: 'noDeclarada', platform: 'android', block: 'filtroAndroid', value: 'x' }],
        },
    }, ctx.root), AdditivePatchError);
});

test('completar rechaza un bloque distinto del mapping autorizado', t => {
    const ctx = fixture(t);
    assert.throws(() => ctx.writer.apply({
        ...BASE,
        locators: {
            file: ctx.files.locators,
            additions: [],
            completions: [{
                name: 'mostrarMovimientos',
                platform: 'ios',
                block: 'filtroAndroid',
                value: '//XCUIElementTypeButton[@name="Mostrar"]',
            }],
        },
    }, ctx.root), AdditivePatchError);
});
