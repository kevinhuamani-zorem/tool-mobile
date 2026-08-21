const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutomationRecordingStore } = require('../dist/core/automationRecordingStore');
const { DeterministicResolver } = require('../dist/core/deterministicResolver');
const { AutomationResponseValidator } = require('../dist/core/automationResponseValidator');
const { AutomationMemory } = require('../dist/core/automationMemory');
const { AutomationPackageBuilder } = require('../dist/core/automationPackageBuilder');
const { AutomationAgentLauncher } = require('../dist/core/automationAgentLauncher');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');

test('la captura solicita intención funcional y no un nombre técnico de locator', () => {
    const workspace = fs.readFileSync(path.join(
        __dirname,
        '../recorder/renderer/src/components/RecorderWorkspace.tsx'
    ), 'utf8');
    assert.match(workspace, /¿Qué función cumple este elemento\?/);
    assert.match(workspace, /id="txtElementIntent"/);
    assert.doesNotMatch(workspace, /Buscar o asignar locator lógico/);
    assert.doesNotMatch(workspace, /Buscar locator del squad o crear uno/);
});

function request() {
    return {
        squad: 'payment', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado',
        fileName: 'flujo-mobile', locatorModule: 'nueva-pantalla', caseId: 'TC-10239',
        pathType: 'Happy Path', tag: 'miflujo', dataName: 'Usuario QA', platform: 'android'
    };
}

function scenario(actions) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-test', revision: 1,
        fingerprint: 'fingerprint-test', createdAt: new Date(0).toISOString(), squad: 'payment',
        platform: 'android', environment: 'qa', objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos', request: request(),
        actions: actions.map((action, index) => ({ ...action, sequence: index + 1 }))
    };
}

const emptyCatalog = {
    getCatalog: (squad, platform) => ({ squad, platform, stepDefinitions: [], screenMethods: [], locators: [], features: [] })
};

test('recording persiste datos funcionales y oculta únicamente secretos', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-recording-'));
    const store = new AutomationRecordingStore(root);
    store.start({ squad: 'payment', platform: 'android', environment: 'qa' });
    store.replaceActions([
        { action: 'ESCRIBIR', selector: 'id=phone', variableName: 'phone', elementIntent: 'numero a yapear', value: '999111222' },
        { action: 'ESCRIBIR', selector: 'id=password', variableName: 'password', elementIntent: 'contraseña', value: 'secreto' }
    ], {
        squad: 'payment', platform: 'android', environment: 'qa'
    });
    const actions = JSON.parse(fs.readFileSync(path.join(store.getActiveDirectory(), 'actions.json')));
    assert.equal(actions[0].sequence, 1);
    assert.equal(actions[0].value, '999111222');
    assert.equal(actions[1].value, '<password>');
    assert.equal(actions[0].selectorVerified, true);
});

test('resolver propone dataName editable cuando el recording no lo especifica', () => {
    const recorded = scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=resultado', selectorVerified: true,
        elementIntent: 'resultado esperado'
    }]);
    recorded.request.dataName = '';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    assert.equal(result.scenario.request.dataName, 'Usuario QA Temporal');
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id === 'gap-test-data'), false);
});

test('resolver convierte un teléfono grabado en parámetro y Example', () => {
    const recorded = scenario([{
        action: 'ESCRIBIR', selector: 'id=phone', selectorVerified: true,
        elementIntent: 'input de nuevo numero', value: '999111222'
    }]);
    recorded.objective = 'buscar usuario para yapear';
    recorded.acceptanceCriteria = 'mostrar el usuario encontrado';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    const row = result.scenario.request.scenarioRows[1];
    assert.equal(row.actions[0].value, '<numero>');
    assert.equal(result.scenario.request.examples.numero, '999111222');
});

test('resolver rechaza como completo un valor funcional perdido', () => {
    const recorded = scenario([{
        action: 'ESCRIBIR', selector: 'id=phone', selectorVerified: true,
        elementIntent: 'input de nuevo numero', value: '<valor>'
    }]);
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    assert.equal(result.plan.status, 'needs-agent');
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.type === 'test-input'), true);
});

test('resolver crea nombres semánticos y no solicita al agente cuando todo está verificado', () => {
    const resolver = new DeterministicResolver(emptyCatalog);
    const result = resolver.resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    assert.equal(result.plan.status, 'deterministic');
    assert.equal(result.plan.deterministicCoverage, 1);
    assert.equal(result.plan.resolutions[0].locatorName, 'listaDeMovimientos');
    assert.equal(result.plan.files.length, 4);
    assert.equal(result.unresolvedContext.gaps.length, 0);
});

test('resolver delega la semántica de un saldo dinámico sin descartar el selector verificado', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_TEXTO', selector: 'id=saldo', selectorVerified: true,
        elementIntent: 'saldo disponible', value: 'S/ 760.59'
    }]));
    assert.equal(result.plan.resolutions[0].resolution, 'create');
    assert.equal(result.plan.status, 'needs-agent');
    assert.equal(result.unresolvedContext.gaps[0].type, 'verification-semantics');
    assert.match(result.unresolvedContext.gaps[0].requiredOutput, /contenido no vacío/);
});

test('generador consolida pasos repetidos y usa acceso seguro a bloques locator', () => {
    const repeatedScroll = {
        action: 'SCROLL_DOWN', selector: '', variableName: '', value: '',
        elementIntent: 'desplazar movimientos'
    };
    const click = {
        action: 'CLICK', selector: '~Ver todos', variableName: 'verTodos', value: '',
        elementIntent: 'ver todos los movimientos'
    };
    const preview = new FwkMobileGenerator().preview({
        ...request(),
        featureName: 'Movimientos', scenarioName: 'Consultar movimientos',
        fileName: 'movimientos', locatorModule: 'movements-filter',
        scenarioRows: [
            { keyword: 'When', text: 'el usuario desplaza movimientos', status: 'missing', actions: [repeatedScroll] },
            { keyword: 'And', text: 'el usuario desplaza movimientos', status: 'missing', actions: [repeatedScroll] },
            { keyword: 'Then', text: 'se muestra ver todos', status: 'missing', actions: [click] },
        ]
    }, [repeatedScroll, repeatedScroll, click]);
    assert.equal((preview.stepContent.match(/el usuario desplaza movimientos/g) || []).length, 1);
    assert.equal((preview.screenContent.match(/elUsuarioDesplazaMovimientos\(/g) || []).length, 1);
    assert.match(preview.screenContent, /Locators\["movementsFilterAndroid"\]\.verTodos/);
});

test('resolver agrupa acciones técnicas en comportamiento y propone rutas compactas', () => {
    const recorded = scenario([
        { action: 'CLICK', selector: 'id=movements', selectorVerified: true, elementIntent: 'mostrar movimientos' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'SCROLL_DOWN', selector: '', selectorVerified: false, elementIntent: '' },
        { action: 'CLICK', selector: '~Ver todos', selectorVerified: true, elementIntent: 'ver todos los movimientos' },
        { action: 'VERIFICAR_EXISTE', selector: '~Botón de filtrar', selectorVerified: true, elementIntent: 'verificar boton de filtro de movimientos' },
    ]);
    recorded.objective = 'el usuario debe poder ver todos sus movimientos y ubicar el boton de filtro';
    recorded.acceptanceCriteria = 'verificar que existe el filtro de movimientos';
    const result = new DeterministicResolver(emptyCatalog).resolve(recorded);
    assert.match(result.plan.files[0].path, /filtro-movimientos\.feature$/);
    assert.equal(result.scenario.request.featureName, 'Filtro de movimientos');
    assert.equal(result.scenario.request.scenarioRows.length, 3);
    assert.equal(result.scenario.request.scenarioRows[1].text, 'el usuario consulta todos sus movimientos');
    assert.equal(result.scenario.request.scenarioRows[1].actions.length, 4);
    assert.equal(result.scenario.request.scenarioRows[2].text, 'se muestra el botón de filtro de movimientos');
});

function validResponse(plan, recordingId = 'rec-test') {
    const content = {
        feature: 'Feature: Consulta de movimientos\n\n@miflujo\n  Scenario: [TC-10239][Happy Path][AUTO-FRONT] Consulta\n    Given el usuario Usuario QA inicia sesión en Yape\n    Then se muestra la lista de movimientos\n',
        steps: "import { Then } from '@wdio/cucumber-framework';\nThen(/^se muestra la lista de movimientos$/, async () => { await Promise.resolve(); });\n",
        screen: 'export class ConsultaScreen { public async validar(): Promise<void> { await Promise.resolve(); } }\n',
        locators: JSON.stringify({ consultaAndroid: { listaDeMovimientos: 'id=movimientos' }, consultaIos: { listaDeMovimientos: '' } }, null, 2)
    };
    return {
        schemaVersion: 1, recordingId, planId: plan.planId, resolutions: [],
        actionTrace: [{ sequence: 1, gherkinStep: 'Then se muestra la lista de movimientos', locatorName: 'listaDeMovimientos' }],
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, content: content[file.layer] }))
    };
}

test('validator exige cuatro capas, trazabilidad y Then', () => {
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const validator = new AutomationResponseValidator();
    const validation = validator.validate(resolved.scenario, resolved.plan, validResponse(resolved.plan));
    assert.equal(validation.valid, true);
    assert.equal(validation.qualityScore, 100);
    const broken = validResponse(resolved.plan);
    broken.actionTrace = [];
    assert.equal(validator.validate(resolved.scenario, resolved.plan, broken).valid, false);
});

test('memoria solo promociona calidad 100 y recupera la versión más reciente', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-memory-'));
    const memory = new AutomationMemory(root);
    const resolved = new DeterministicResolver(emptyCatalog).resolve(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]));
    const response = validResponse(resolved.plan);
    assert.throws(() => memory.promote(resolved.scenario, resolved.plan, response, {
        valid: false, qualityScore: 90, errors: [], warnings: []
    }), /100%/);
    const entry = memory.promote(resolved.scenario, resolved.plan, response, {
        valid: true, qualityScore: 100, errors: [], warnings: []
    });
    assert.equal(entry.version, 1);
    assert.equal(memory.find(resolved.scenario.fingerprint).response.planId, resolved.plan.planId);
    assert.deepEqual(memory.stats(), { successfulCases: 1, versions: 1 });
});

test('package builder limita el contexto y deja verificador autocontenido', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-package-'));
    const resolved = new DeterministicResolver(emptyCatalog);
    const builder = new AutomationPackageBuilder(resolved, new AutomationMemory(path.join(root, 'memory')));
    const result = builder.prepare(scenario([{
        action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
        elementIntent: 'lista de movimientos'
    }]), root);
    assert.equal(result.agentRequired, false);
    assert.equal(result.validation.valid, true);
    assert.equal(result.validation.qualityScore, 100);
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'generation-plan.json')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'verify-package.js')));
    assert.ok(fs.existsSync(path.join(result.packageDirectory, 'agent-response.json')));
});

test('launcher inicia el proveedor dentro del paquete sin navegar el framework', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-launcher-'));
    const executable = path.join(root, 'claude');
    fs.writeFileSync(executable, '');
    let call;
    const launcher = new AutomationAgentLauncher((command, args, options) => {
        call = { command, args, options };
        return { unref() {} };
    });
    launcher.launch('claude', root, executable);
    assert.equal(call.options.cwd, root);
    assert.equal(call.command, executable);
    assert.match(call.args[0], /instructions\.md/);
});

test('el flujo de automatización cruza renderer, preload y main por IPC explícito', () => {
    const root = path.resolve(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf-8');
    const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf-8');
    const controller = fs.readFileSync(path.join(root, 'recorder/renderer/src/controller/recorderController.js'), 'utf-8');
    for (const channel of [
        'prepare-automation-package', 'launch-automation-agent',
        'import-automation-response', 'generate-automation-response'
    ]) {
        assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`));
        assert.match(preload, new RegExp(channel));
    }
    assert.match(controller, /prepareAutomationPackage/);
    assert.match(controller, /generateAutomationResponse/);
});
