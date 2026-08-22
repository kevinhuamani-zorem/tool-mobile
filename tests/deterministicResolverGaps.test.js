const test = require('node:test');
const assert = require('node:assert/strict');
const { DeterministicResolver } = require('../dist/core/deterministicResolver');

const SCREEN = 'screenobjects/payment/muestre-nombre-yapero-yapear.screen.ts';
const LOCATORS = 'resources/locators/payment/muestre-nombre-yapero-yapear.locator.json';
const STEPS = 'features/yape-steps-definitions/payment/muestre-nombre-yapero-yapear.steps.ts';

function locator(name, selector) {
    return {
        name, selector, androidSelector: selector, iosSelector: '',
        file: LOCATORS, module: 'muestre-nombre-yapero-yapear',
        squad: 'payment', scope: 'squad', platform: 'android',
    };
}

function method(name, signature, locatorKeys) {
    return { name, file: SCREEN, squad: 'payment', locatorFiles: [LOCATORS], signature, locatorKeys, className: 'S' };
}

function catalogWithExistingModule() {
    return {
        getCatalog: () => ({
            squad: 'payment', featureScope: '', platform: 'android',
            locators: [
                locator('yapear', 'Yapear'),
                locator('nuevoNumero', 'new UiSelector().text("Nuevo número")'),
                locator('continuarYapeo', 'Continuar'),
                locator('existaElNombreDelYapero', '//android.view.View'),
            ],
            stepDefinitions: [], features: [], scenarios: [],
            screenMethods: [
                method('buscarYaperoPorNumero', 'buscarYaperoPorNumero(numero: string): Promise<void>', ['yapear', 'nuevoNumero', 'continuarYapeo']),
                method('validarNombreDelYapero', 'validarNombreDelYapero(): Promise<void>', ['existaElNombreDelYapero']),
            ],
            artifactBundles: [{
                steps: STEPS, screens: [SCREEN], locators: [LOCATORS],
                stepExpressions: ['el usuario busca el numero para yapear'],
                screenMethods: ['buscarYaperoPorNumero', 'validarNombreDelYapero'],
            }],
        }),
    };
}

function emptyCatalog() {
    return {
        getCatalog: () => ({
            squad: 'payment', featureScope: '', platform: 'android',
            locators: [], stepDefinitions: [], features: [], scenarios: [],
            screenMethods: [], artifactBundles: [],
        }),
    };
}

function scenario(actions) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-abc12345', revision: 1,
        fingerprint: 'f'.repeat(64), createdAt: '2026-01-01T00:00:00Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'verifica leer nombre yapero', acceptanceCriteria: 'se muestra el nombre del yapero',
        request: {
            squad: 'payment', featureName: 'F', scenarioName: 'S', fileName: 'f', locatorModule: 'm',
            caseId: 'TC-1', pathType: 'Happy Path', tag: 't', dataName: 'QA',
            platform: 'android', examples: {}, scenarioRows: [],
        },
        actions,
    };
}

const action = (kind, intent, selector, value = '') => ({ action: kind, elementIntent: intent, selector, value });

const FLUJO_COMPLETO = [
    action('CLICK', 'yapear', '~Yapear'),
    action('CLICK', 'nuevo numero', 'android=new UiSelector().text("Nuevo número")'),
    action('CLICK', 'continuar yapeo', '~Continuar'),
    action('VERIFICAR_TEXTO', 'label nombre del usuario verificamos que existe', 'android=new UiSelector().text("Kevin Hua*")', 'Kevin Hua'),
];

test('abre un gap cuando el selector fija el mismo texto que la acción valida', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('VERIFICAR_TEXTO', 'nombre del yapero', 'android=new UiSelector().text("Kevin Hua")', 'Kevin Hua'),
    ]));

    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-verification-1');
    assert.ok(gap, 'debe detectar el locator anclado al valor observado');
    assert.equal(gap.type, 'verification-semantics');
    assert.match(gap.description, /fija el mismo texto que valida/);
    assert.match(gap.requiredOutput, /contenedor del valor/);
});

test('un nombre propio no lo detectaba likelyDynamicText y ahora sí se marca', () => {
    // likelyDynamicText solo mira montos y números largos; el caso real que se
    // generó mal fijaba el nombre de una persona.
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('VERIFICAR_TEXTO', 'nombre', 'android=new UiSelector().text("Kevin Hua*")', 'Kevin Hua'),
    ]));

    assert.ok(result.unresolvedContext.gaps.some(gap => gap.type === 'verification-semantics'));
});

test('no marca la aserción cuando el selector no depende del valor', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('VERIFICAR_TEXTO', 'nombre del yapero', '~lblNombreYapero', 'Kevin Hua'),
    ]));

    assert.equal(result.unresolvedContext.gaps.some(gap => gap.type === 'verification-semantics'), false);
});

test('detecta el comodín que UiSelector.text no interpreta', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('CLICK', 'boton', 'android=new UiSelector().text("Descargar*")'),
    ]));

    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-selector-wildcard-1');
    assert.ok(gap, 'el asterisco se busca de forma literal y nunca coincide');
    assert.match(gap.requiredOutput, /textContains/);
});

test('no marca comodín cuando el texto no lo lleva', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('CLICK', 'boton', 'android=new UiSelector().text("Descargar")'),
    ]));

    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id.startsWith('gap-selector-wildcard')), false);
});

test('avisa del método equivalente que ya existe en el módulo target', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario(FLUJO_COMPLETO));

    assert.equal(result.plan.files.find(file => file.layer === 'screen').operation, 'update');
    const assertion = result.plan.resolutions[3];
    assert.ok(assertion.existingMethod, 'la resolución debe cargar el método equivalente');
    assert.equal(assertion.existingMethod.name, 'validarNombreDelYapero');
    assert.deepEqual(assertion.existingMethod.locatorKeys, ['existaElNombreDelYapero']);

    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-duplicate-4');
    assert.ok(gap, 'debe abrir un gap en vez de duplicar en silencio');
    assert.match(gap.description, /ya expone validarNombreDelYapero/);
});

test('reutiliza el método existente cuando la coincidencia es fuerte', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([
        ...FLUJO_COMPLETO.slice(0, 3),
        action('VERIFICAR_TEXTO', 'validar nombre del yapero', '~lblOtroNodo', 'x'),
    ]));

    const assertion = result.plan.resolutions[3];
    assert.equal(assertion.resolution, 'reuse');
    assert.equal(assertion.existingMethod.name, 'validarNombreDelYapero');
    assert.match(assertion.reason, /ya expone validarNombreDelYapero/);
});

test('no inventa duplicados cuando el módulo target no tiene nada parecido', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([
        ...FLUJO_COMPLETO.slice(0, 3),
        action('CLICK', 'compartir constancia por correo', '~btnCompartirCorreo'),
    ]));

    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id.startsWith('gap-duplicate')), false);
    assert.equal(result.plan.resolutions[3].resolution, 'create');
});
