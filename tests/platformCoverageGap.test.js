/**
 * Claves sin valor en la plataforma grabada del modulo que un caso extiende
 * (`gap-platform-coverage`), con el recording 85a9110f ("flujo de yapeo",
 * TC-10240) como fixture: el plan extiende payment/yapear-contact, cuyo
 * `inputContactToYapear` solo existe en el bloque iOS. En otra maquina el
 * analisis terminaba en «No pudimos completar el analisis» porque el gap era
 * bloqueante, aunque el texto del gap iba dirigido al agente y el QA no puede
 * corregir el framework desde la grabacion.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationMemory,
    AutomationPackageBuilder,
    BlockingGapError,
    DeterministicResolver,
} = require('../dist/core/automation');
const { gapJudgment, isAuthorInformationalGap } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
const { projectRoleJson, projectSharedJson } = require('../dist/core/automation/infrastructure/layered/projections');
const { inferredStrategy } = require('../dist/core/indexing');

const CONTACT_SCREEN = 'screenobjects/payment/contacts.screen.ts';
const CONTACT_LOCATORS = 'resources/locators/payment/yapear-contact.locator.json';
const CONTACT_STEPS = 'features/yape-steps-definitions/payment/payment.steps.ts';

function locator(name, androidSelector, iosSelector = '') {
    return {
        name, selector: androidSelector, androidSelector, iosSelector,
        androidStrategy: androidSelector ? (inferredStrategy(androidSelector) || 'ANDROID') : undefined,
        androidBlock: 'yapearAndroid', iosBlock: 'yapearIos',
        file: CONTACT_LOCATORS, module: 'payment/yapear-contact', squad: 'payment', scope: 'squad', platform: 'android',
    };
}

function method(name, locatorKeys) {
    return { name, file: CONTACT_SCREEN, squad: 'payment', locatorFiles: [CONTACT_LOCATORS], signature: `${name}()`, locatorKeys, className: 'ContactsScreen' };
}

/** payment/yapear-contact tal como esta en el framework: una clave solo en iOS. */
function catalog() {
    const locators = [
        locator('titleYapear', 'new UiSelector().text("Yapear")', 'Yapear'),
        locator('inputNumberToYapear', 'new UiSelector().resourceId("textfield-filtrar-contacto")', '**/XCUIElementTypeTextField[`value == "Busca"`]'),
        locator('btnselectNumber', 'new UiSelector().resourceId("contentContactItem")', '**/XCUIElementTypeCell[`name == "A nuevo"`]'),
        locator('inputContactToYapear', '', '**/XCUIElementTypeButton[`name == "Editar casilla"`]'),
    ];
    const screenMethods = [
        method('validateSelectContactScreen', ['titleYapear']),
        method('inputNumberToYapear', ['inputNumberToYapear', 'btnselectNumber']),
    ];
    const stepDefinitions = [{
        keyword: 'When', expression: '^el usuario selecciona el contacto a yapear$', file: CONTACT_STEPS,
        squad: 'payment', scope: 'squad', screenMethods: [{ file: CONTACT_SCREEN, method: 'inputNumberToYapear' }],
    }];
    return {
        squad: 'payment', featureScope: '', platform: 'android',
        locators, stepDefinitions, frameworkStepDefinitions: stepDefinitions, features: [], scenarios: [], screenMethods,
        artifactBundles: [{
            steps: CONTACT_STEPS, screens: [CONTACT_SCREEN], locators: [CONTACT_LOCATORS],
            stepExpressions: stepDefinitions.map(item => item.expression),
            screenMethods: screenMethods.map(item => item.name),
        }],
    };
}

const action = (kind, contextHint, selector, value = '') => ({
    action: kind, contextHint, elementIntent: '', selector, value, selectorVerified: Boolean(selector),
});

/** Tramo del yapeo que cae en la pantalla de contactos: tres locators reutilizados. */
function yapeoScenario() {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-f98d051e-c07d-4f6a-9577-a1ff85a9110f', revision: 1,
        fingerprint: 'a'.repeat(64), createdAt: '2026-09-06T21:51:23.848Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'realizar el flujo de yapeo',
        acceptanceCriteria: 'el usuario realiza un yapeo hacia un número destino y se visualiza el yapeo exitoso',
        request: {
            squad: 'payment', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado', fileName: 'flujo-mobile',
            locatorModule: 'nueva-pantalla', caseId: 'TC-10240', pathType: 'Happy Path', tag: 'yapeo_sin_otp',
            dataName: 'Jose Mendoza Dni10', platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: [
            action('VERIFICAR_EXISTE', 'pantalla yapear', 'android=new UiSelector().text("Yapear")'),
            action('ESCRIBIR', 'ingresar numero destino', 'android=new UiSelector().resourceId("textfield-filtrar-contacto")', '955528219'),
            action('CLICK', 'boton seleccionar numero destino', 'android=new UiSelector().resourceId("contentContactItem")'),
            action('VERIFICAR_EXISTE', 'pantalla yapear a', 'android=new UiSelector().text("Yapear a")'),
        ].map((item, index) => ({ ...item, sequence: index + 1 })),
    };
}

const provider = () => ({ getCatalog: () => catalog() });

test('una clave sin valor en el modulo que se extiende avisa, no bloquea el analisis', () => {
    const result = new DeterministicResolver(provider()).resolve(yapeoScenario());
    assert.equal(result.plan.reuseTarget?.locators, CONTACT_LOCATORS, 'el caso extiende yapear-contact');
    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-platform-coverage');
    assert.ok(gap, 'la clave vacia se pone sobre la mesa');
    assert.equal(gap.blocking, undefined, 'el estado del framework no es un defecto de la grabacion');
    assert.match(gap.description, /1 clave\(s\) sin valor en android: inputContactToYapear/);
    assert.match(gap.description, /Ninguna accion grabada corresponde a inputContactToYapear: no la adoptes/);
    assert.match(gap.requiredOutput, /no pide una decision/);
    assert.ok(result.unresolvedContext.gaps.every(item => !item.blocking), 'nada bloquea el paquete');
});

test('el paquete se arma con la clave vacia y el gap queda abierto para el agente', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-coverage-'));
    const builder = new AutomationPackageBuilder(
        new DeterministicResolver(provider()),
        new AutomationMemory(path.join(root, 'memory')),
    );
    let prepared;
    try {
        prepared = builder.prepare(yapeoScenario(), root);
    } catch (error) {
        assert.fail(`prepare no debe lanzar${error instanceof BlockingGapError ? ' BlockingGapError' : ''}: ${error.message}`);
    }
    assert.equal(prepared.agentRequired, true);
    const gaps = JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, 'gaps.json'), 'utf8'));
    const coverage = gaps.gaps.find(item => item.id === 'gap-platform-coverage');
    assert.equal(coverage?.status, 'open');
    const plan = JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, 'generation-plan.json'), 'utf8'));
    assert.ok(plan.unresolvedGapIds.includes('gap-platform-coverage'));

    // Derek lo firma como informativo: Sumrak no lo juzga y solo Zorem lo lee.
    const judgment = gapJudgment(prepared.packageDirectory, plan);
    assert.ok(judgment.informational.includes('gap-platform-coverage'));
    assert.equal(judgment.open.includes('gap-platform-coverage'), false);
    const fixed = judgment.fixed.find(item => item.gapId === 'gap-platform-coverage');
    assert.equal(fixed?.decision, 'resolved');
    assert.match(fixed?.reason || '', /Aviso para Zorem/);
    const shared = projectSharedJson('gaps.json', gaps, judgment);
    const forLorem = projectRoleJson('gaps.json', shared, 'behavior-author', prepared.packageDirectory);
    const forZorem = projectRoleJson('gaps.json', shared, 'interaction-author', prepared.packageDirectory);
    assert.equal(forLorem.gaps.some(item => item.id === 'gap-platform-coverage'), false, 'Lorem no escribe locators');
    assert.equal(forZorem.gaps.some(item => item.id === 'gap-platform-coverage'), true);
    assert.equal(isAuthorInformationalGap('gap-platform-coverage'), true);
});

test('cuando una accion grabada puede rellenar la clave, el aviso apunta al completionTarget', () => {
    // El caso graba en Android el mismo elemento que la clave declara solo en
    // iOS (`name == "Editar casilla"`): la identidad por literal compartido
    // ofrece completar la clave en sitio en vez de duplicarla.
    const scenario = yapeoScenario();
    scenario.actions.push({
        ...action('CLICK', 'casilla de busqueda de contacto', 'android=new UiSelector().description("Editar casilla")'),
        sequence: 5,
    });
    const result = new DeterministicResolver(provider()).resolve(scenario);
    const targets = result.plan.resolutions.flatMap(item => item.completionTargets || []);
    assert.ok(
        targets.some(target => target.module === 'payment/yapear-contact' && target.name === 'inputContactToYapear' && target.platform === 'android'),
        'el relleno de la clave esta autorizado por el plan',
    );
    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-platform-coverage');
    assert.ok(gap);
    assert.equal(gap.blocking, undefined);
    assert.match(gap.description, /Una accion grabada captura inputContactToYapear: si la adoptas, declara su relleno en `completions`/);
    assert.doesNotMatch(gap.description, /Ninguna accion grabada corresponde/);
});
