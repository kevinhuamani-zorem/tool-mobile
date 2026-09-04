const test = require('node:test');
const assert = require('node:assert/strict');
const { DeterministicResolver } = require('../dist/core/automation');
const { inferredStrategy } = require('../dist/core/indexing');

const SCREEN = 'screenobjects/payment/muestre-nombre-yapero-yapear.screen.ts';
const LOCATORS = 'resources/locators/payment/muestre-nombre-yapero-yapear.locator.json';
const STEPS = 'features/yape-steps-definitions/payment/muestre-nombre-yapero-yapear.steps.ts';

// El getter del Screen Object declara la estrategia; sin ella el resolver no
// puede afirmar que el locator sirva y no lo reutiliza.
function locator(name, selector, strategy) {
    return {
        name, selector, androidSelector: selector, iosSelector: '',
        androidStrategy: strategy || inferredStrategy(selector) || 'ID',
        androidBlock: 'muestreNombreYaperoYapearAndroid',
        iosBlock: 'muestreNombreYaperoYapearIos',
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

function verifiedCandidate(candidateId, selector, overrides = {}) {
    const accessibility = selector.startsWith('~');
    return {
        candidateId,
        selector,
        inspectorStrategy: accessibility ? 'accessibility id' : 'xpath',
        locatorType: accessibility ? 'ID' : 'XPATH',
        locatorValue: accessibility ? selector.slice(1) : selector,
        priority: 0,
        stability: 'manual',
        sourceReason: 'Inspector selection',
        primary: false,
        verification: {
            protocolVersion: 3,
            verifiedAt: '2026-08-27T00:00:00.000Z',
            matchCount: 1,
            sameElement: true,
        },
        ...overrides,
    };
}

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

test('desambigua un step cuando el texto ya existe en el framework', () => {
    const catalog = {
        getCatalog: () => ({
            squad: 'payment',
            featureScope: '',
            platform: 'android',
            locators: [],
            features: [],
            scenarios: [],
            screenMethods: [],
            artifactBundles: [],
            stepDefinitions: [{
                expression: '^el usuario consulta todos sus movimientos$',
                file: 'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts',
                squad: 'payment',
                scope: 'squad',
                keyword: 'When',
                signature: 'When(/^el usuario consulta todos sus movimientos$/)',
            }],
        }),
    };
    const result = new DeterministicResolver(catalog).resolve(scenario([
        action('CLICK', 'boton de ver todos los movimientos', '~Ver todos'),
        action('VERIFICAR_EXISTE', 'lista de movimientos', 'id=movimientos'),
    ]));
    const behavior = result.scenario.request.scenarioRows.find(row => row.keyword === 'When');
    assert.ok(behavior, 'debe existir un row de comportamiento');
    assert.notEqual(behavior.text, 'el usuario consulta todos sus movimientos');
    assert.match(behavior.text, /^el usuario consulta todos sus movimientos /);
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

test('conserva el selector primary verificado y no reutiliza a partir de un backup', () => {
    // Contrato vigente: un unico selector verificado por accion. El backup
    // solo viaja como evidencia local (automationRecordingStore); el resolver
    // nunca lo usa para decidir un reuse, aunque coincida con un locator
    // existente del catalogo.
    const primary = verifiedCandidate('primary', '~Nuevo', { primary: true });
    const backup = verifiedCandidate('existing-backup', '~Yapear', {
        stability: 'stable',
        sourceReason: 'Accessibility identifier',
    });
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([{
        ...action('VERIFICAR_EXISTE', 'acceso yapear', '~Nuevo'),
        selectorVerified: true,
        selectorCandidates: [primary, backup],
    }]));
    const resolution = result.plan.resolutions[0];
    assert.equal(resolution.resolution, 'create');
    assert.equal(resolution.selector, '~Nuevo');
    assert.equal(resolution.matchedCandidateId, undefined);
});

test('conserva el primary como selector de create cuando ningún candidato existe', () => {
    const primary = verifiedCandidate('primary', '~Nuevo', { primary: true });
    const backup = verifiedCandidate('backup', '//android.widget.Button[@text="Nuevo"]', {
        stability: 'structural',
    });
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([{
        ...action('VERIFICAR_EXISTE', 'nuevo acceso', '~Nuevo'),
        selectorVerified: true,
        selectorCandidates: [primary, backup],
    }]));
    assert.equal(result.plan.resolutions[0].resolution, 'create');
    assert.equal(result.plan.resolutions[0].selector, '~Nuevo');
});

test('completionTargets conserva file, bloque y key exactos del candidato reuse', () => {
    const provider = {
        getCatalog: () => ({
            ...emptyCatalog().getCatalog(),
            locators: [{
                ...locator('yapear', '', 'ID'),
                androidSelector: '',
                iosSelector: '//XCUIElementTypeButton[@name="Yapear"]',
            }],
        }),
    };
    const result = new DeterministicResolver(provider).resolve(scenario([{
        ...action('CLICK', 'acceso yapear', '~Yapear'),
        selectorVerified: true,
        selectorCandidates: [verifiedCandidate('primary', '~Yapear', { primary: true })],
    }]));

    assert.deepEqual(result.plan.resolutions[0].completionTargets, [{
        file: LOCATORS,
        module: 'muestre-nombre-yapero-yapear',
        name: 'yapear',
        platform: 'android',
        block: 'muestreNombreYaperoYapearAndroid',
    }]);
});

test('el reuse depende exclusivamente del selector primary, no de la estabilidad de un backup', () => {
    // Antes del contrato de selector unico, un backup mas estable podia
    // ganarle al primary en el ranking de reuse. Ahora el backup es solo
    // evidencia local: el primary decide, sin importar la estabilidad de
    // ningun candidato adicional.
    const provider = {
        getCatalog: () => ({
            ...emptyCatalog().getCatalog(),
            locators: [
                locator('manualMatch', '~Manual'),
                locator('stableMatch', '~Stable'),
            ],
        }),
    };
    const result = new DeterministicResolver(provider).resolve(scenario([{
        ...action('VERIFICAR_EXISTE', 'resultado', '~Manual'),
        selectorVerified: true,
        selectorCandidates: [
            verifiedCandidate('primary', '~Manual', { primary: true, stability: 'manual' }),
            verifiedCandidate('stable', '~Stable', { stability: 'stable', priority: 3 }),
        ],
    }]));
    assert.equal(result.plan.resolutions[0].resolution, 'reuse');
    assert.equal(result.plan.resolutions[0].locatorName, 'manualMatch');
    assert.equal(result.plan.resolutions[0].matchedPrimaryCandidate, true);
});

test('abre un gap QA bloqueante ante matches materialmente ambiguos', () => {
    // La ambiguedad ya no nace de comparar varios candidatos: con un unico
    // selector verificado por accion, el gap aparece cuando ese selector
    // coincide con mas de un locator existente del mismo rango.
    const provider = {
        getCatalog: () => ({
            ...emptyCatalog().getCatalog(),
            locators: [
                locator('firstMatch', '~Stable'),
                locator('secondMatch', '~Stable'),
            ],
        }),
    };
    const result = new DeterministicResolver(provider).resolve(scenario([{
        ...action('VERIFICAR_EXISTE', 'resultado', '~Stable'),
        selectorVerified: true,
    }]));
    const gap = result.unresolvedContext.gaps.find(item =>
        item.id === 'gap-locator-candidate-ambiguity-1'
    );
    assert.equal(gap?.type, 'qa-decision');
    assert.equal(gap?.blocking, true);
    assert.equal(result.plan.resolutions[0].resolution, 'create');
    assert.equal(result.plan.resolutions[0].selector, '~Stable');
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

// Un nombre parecido no habilita reutilizar: `~lblOtroNodo` no es el locator de
// `validarNombreDelYapero`, y darlo por bueno era afirmar sin evidencia que ese
// identificador sirve para este caso.
test('no reutiliza por parecido de nombre cuando el selector es otro', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([
        ...FLUJO_COMPLETO.slice(0, 3),
        action('VERIFICAR_TEXTO', 'validar nombre del yapero', '~lblOtroNodo', 'x'),
    ]));

    const assertion = result.plan.resolutions[3];
    assert.equal(assertion.resolution, 'create');
    assert.equal(assertion.existingMethod.name, 'validarNombreDelYapero',
        'el candidato se conserva como contexto');
    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-duplicate-4');
    assert.ok(gap, 'se propone al QA, no se decide solo');
    assert.match(gap.requiredOutput, /mismo identificador y la misma estrategia/);
});

// El mismo valor normalizado con la misma estrategia es el mismo selector; se
// adopta el nombre lógico que ya existe en el framework.
test('reutiliza cuando TypeLocator y selector normalizado coinciden', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([
        action('CLICK', 'yapear', '~Yapear'),
        action('VERIFICAR_EXISTE', 'pantalla de yapeo', 'android=new UiSelector().text("Nuevo número")'),
    ]));

    assert.equal(result.plan.resolutions[0].resolution, 'reuse');
    assert.equal(result.plan.resolutions[0].locatorName, 'yapear');
    assert.match(result.plan.resolutions[0].reason, /TypeLocator\/selector normalizado \(ID\)/);
    assert.equal(result.plan.resolutions[1].resolution, 'reuse');
    assert.match(result.plan.resolutions[1].reason, /TypeLocator\/selector normalizado \(ANDROID\)/);
});

// Mismo texto, otra estrategia: es otro selector y no se puede dar por bueno.
test('no reutiliza cuando el tipo difiere aunque el contenido coincida', () => {
    const catalog = {
        getCatalog: () => ({
            squad: 'payment', featureScope: '', platform: 'android',
            stepDefinitions: [], features: [], scenarios: [], screenMethods: [],
            locators: [locator('shortcutTapp', 'Tapp', 'XPATH')],
        }),
    };
    const result = new DeterministicResolver(catalog).resolve(scenario([
        action('CLICK', 'ingresar a tapp', '~Tapp'),
        action('VERIFICAR_EXISTE', 'pantalla tapp', 'android=new UiSelector().text("TAPP")'),
    ]));

    assert.equal(result.plan.resolutions[0].resolution, 'create');
    // No se pierde: llega al QA como candidato a duplicado.
    assert.ok(result.unresolvedContext.gaps.some(gap => /^gap-duplicate-element/.test(gap.id)));
});

test('no inventa duplicados cuando el módulo target no tiene nada parecido', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(scenario([
        ...FLUJO_COMPLETO.slice(0, 3),
        action('CLICK', 'compartir constancia por correo', '~btnCompartirCorreo'),
    ]));

    assert.equal(result.unresolvedContext.gaps.some(gap => /^gap-duplicate-\d/.test(gap.id)), false);
    assert.equal(result.plan.resolutions[3].resolution, 'create');
});


// El PR de Tapp: `~Tapp` no se parecia como texto a
// `//android.widget.Button[@content-desc="Tapp"]`, asi que el resolver creaba un
// duplicado y reportaba `deterministic` sin avisar de nada.
test('avisa del duplicado cuando el mismo elemento se grabo con otra estrategia', () => {
    const existentes = [
        {
            name: 'shortcutTapp', selector: '//android.widget.Button[@content-desc="Tapp"]',
            androidSelector: '//android.widget.Button[@content-desc="Tapp"]',
            iosSelector: '//XCUIElementTypeButton[@name="Tapp"]',
            file: 'resources/locators/home/home.locator.json', module: 'home/home',
            squad: 'home', scope: 'home', platform: 'android',
        },
        {
            // Vacio en Android: solo se ve si el indice lee las dos plataformas.
            name: 'btnViewAllAccounts', selector: '', androidSelector: '',
            iosSelector: '//XCUIElementTypeButton[@name="Ver todas"]',
            file: 'resources/locators/interoperabilidad/tapp-subhome.locator.json',
            module: 'interoperabilidad/tapp-subhome',
            squad: 'interoperabilidad', scope: 'squad', platform: 'android',
        },
    ];
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform, stepDefinitions: [], screenMethods: [], features: [],
            locators: existentes,
        }),
    };
    const scenario = {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-tapp', revision: 1,
        fingerprint: 'f', createdAt: new Date(0).toISOString(), squad: 'interoperabilidad',
        platform: 'android', environment: 'qa',
        objective: 'ingresar a tapp y ver todas las cuentas',
        acceptanceCriteria: 'se muestra la pantalla de todas las cuentas',
        request: {
            squad: 'interoperabilidad', featureName: '', scenarioName: '', fileName: '',
            locatorModule: '', caseId: 'TC-10140', pathType: 'Happy Path', tag: 'interop',
            dataName: 'QA', platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: [
            { action: 'CLICK', selector: '~Tapp', selectorVerified: true, contextHint: 'ingresar a tapp', value: '', sequence: 1 },
            { action: 'CLICK', selector: '~Ver todas', selectorVerified: true, contextHint: 'ver todas las cuentas', value: '', sequence: 2 },
            { action: 'VERIFICAR_EXISTE', selector: 'android=new UiSelector().text("Todas tus cuentas")', selectorVerified: true, contextHint: 'pantalla todas las cuentas', value: '', sequence: 3 },
        ],
    };

    const result = new DeterministicResolver(catalog).resolve(scenario);
    const duplicados = result.unresolvedContext.gaps.filter(gap => /^gap-duplicate-element/.test(gap.id));
    assert.equal(duplicados.length, 2, 'una por cada elemento ya existente');
    assert.match(duplicados[0].description, /home\/home\.shortcutTapp/);
    assert.match(duplicados[1].description, /tapp-subhome\.btnViewAllAccounts/);
    assert.match(duplicados[1].description, /sin valor Android/,
        'reutilizarlo tal cual romperia Android: hay que completarlo primero');
    // Deja de ser una generacion silenciosa.
    assert.equal(result.plan.status, 'needs-agent');
    // La ultima accion no comparte identidad con nada: no debe inventar un gap.
    assert.equal(duplicados.some(gap => gap.sequence === 3), false);
});

test('no propone duplicado contra el modulo que se esta escribiendo', () => {
    const propio = {
        name: 'enterTappOption', selector: '~Tapp', androidSelector: '~Tapp', iosSelector: '',
        file: 'resources/locators/interoperabilidad/tapp-accounts.locator.json',
        module: 'interoperabilidad/tapp-accounts', squad: 'interoperabilidad',
        scope: 'squad', platform: 'android',
    };
    const catalog = {
        getCatalog: (squad, platform) => ({
            squad, platform, stepDefinitions: [], screenMethods: [], features: [], locators: [propio],
        }),
    };
    const scenario = {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-2', revision: 1,
        fingerprint: 'f', createdAt: new Date(0).toISOString(), squad: 'interoperabilidad',
        platform: 'android', environment: 'qa', objective: 'ingresar a tapp',
        acceptanceCriteria: 'se muestra tapp',
        request: {
            squad: 'interoperabilidad', featureName: '', scenarioName: '', fileName: '',
            locatorModule: 'tapp-accounts', caseId: 'TC-1', pathType: 'Happy Path',
            tag: 'interop', dataName: 'QA', platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: [
            { action: 'VERIFICAR_EXISTE', selector: '~Tapp2', selectorVerified: true, contextHint: 'pantalla tapp dos', value: '', sequence: 1 },
        ],
    };
    const result = new DeterministicResolver(catalog).resolve(scenario);
    assert.equal(
        result.unresolvedContext.gaps.some(gap => /^gap-duplicate-element/.test(gap.id)),
        false
    );
});

// Red de seguridad del contrato de locators: si el par (TypeLocator, valor) no
// reconstruye el selector, el codigo generado no encuentra el elemento. Se
// bloquea en vez de delegarlo: no es algo que el agente pueda arreglar
// adivinando, hay que volver a capturar el elemento.
test('bloquea cuando un locator nuevo no se puede componer con TypeLocator', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('CLICK', 'boton filtrar', 'Ver todos'),
        action('VERIFICAR_EXISTE', 'filtro visible', '~lblFiltro'),
    ]));

    const gap = result.unresolvedContext.gaps.find(item => item.id === 'gap-locator-roundtrip');
    assert.ok(gap, 'un valor pelado bajo XPATH llega a wdio sin prefijo y no es un XPath');
    assert.equal(gap.blocking, true);
    assert.match(gap.description, /Ver todos/);
    assert.match(gap.requiredOutput, /UiSelector/);
});

test('no abre el gap de composicion cuando los selectores traen su sintaxis', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario(FLUJO_COMPLETO));
    assert.equal(
        result.unresolvedContext.gaps.some(gap => gap.id === 'gap-locator-roundtrip'), false
    );
});

// Un `reuse` apunta a un valor que ya vive en el JSON, y ahi la estrategia la
// declara el getter, no la sintaxis: `"Yapear"` pelado es ID valido y XPath
// invalido a la vez. Reinferirlo marcaria como roto codigo que funciona.
test('no marca como roto un locator existente que se reutiliza', () => {
    const result = new DeterministicResolver(catalogWithExistingModule()).resolve(
        scenario([action('CLICK', 'yapear', '~Yapear')])
    );
    assert.equal(
        result.unresolvedContext.gaps.some(gap => gap.id === 'gap-locator-roundtrip'), false
    );
});

// Caso real: el QA pulsa el mismo boton de filtro entre cada opcion. Antes
// salian cinco locators —filterMovementsButton, filterMovementsButton7,
// filterMovements, filter, filter13— apuntando todos a `~Botón de filtrar`.
test('el mismo elemento pulsado varias veces produce un solo locator', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('CLICK', 'boton de filtro de movimientos', '~Botón de filtrar'),
        action('CLICK', 'filtrar por solo hoy', 'android=new UiSelector().text("Solo hoy")'),
        action('CLICK', 'filtro de movimientos', '~Botón de filtrar'),
        action('CLICK', 'filtrar por ultimos 7 dias', 'android=new UiSelector().text("Últimos 7 días")'),
        action('CLICK', 'filtrar', '~Botón de filtrar'),
        action('VERIFICAR_EXISTE', 'contenedor de movimientos', '~lblContenedorMovimientos'),
    ]));

    const byName = result.plan.resolutions
        .filter(item => item.resolution === 'create')
        .map(item => item.locatorName);
    assert.equal(new Set(byName).size, byName.length - 2, 'las tres pulsaciones comparten nombre');

    const filterName = result.plan.resolutions.find(item => item.sequence === 1).locatorName;
    assert.equal(result.plan.resolutions.find(item => item.sequence === 3).locatorName, filterName);
    assert.equal(result.plan.resolutions.find(item => item.sequence === 5).locatorName, filterName);
    assert.match(result.plan.resolutions.find(item => item.sequence === 3).reason, /mismo elemento/);
});

// El nombre no puede perder el numero: `filterLastDays` para "ultimos 7 dias"
// miente y colisiona con cualquier otro periodo.
test('el nombre logico conserva los digitos del intent', () => {
    const result = new DeterministicResolver(emptyCatalog()).resolve(scenario([
        action('CLICK', 'filtrar por ultimos 7 dias', 'android=new UiSelector().text("Últimos 7 días")'),
        action('CLICK', 'ultimos 15 dias', 'android=new UiSelector().text("Últimos 15 días")'),
        action('VERIFICAR_EXISTE', 'contenedor de movimientos', '~lblContenedorMovimientos'),
    ]));
    assert.equal(result.plan.resolutions.find(item => item.sequence === 1).locatorName, 'filterLast7Days');
    assert.equal(result.plan.resolutions.find(item => item.sequence === 2).locatorName, 'last15Days');
});

// Casuistica de tapp-subhome: el modulo existe con iOS relleno y Android vacio,
// y la grabacion se hace en Android. Adoptar esas claves sin rellenarlas deja el
// getter resolviendo a "" y el caso falla al ejecutar, no al generar.
function catalogoConPlataformaAMedias() {
    const file = 'resources/locators/payment/tapp-subhome.locator.json';
    const half = (name, iosSelector) => ({
        name, selector: iosSelector, androidSelector: '', iosSelector,
        androidBlock: 'tappSubhomeAndroid', iosBlock: 'tappSubhomeIos',
        iosStrategy: 'XPATH',
        file, module: 'payment/tapp-subhome', squad: 'payment', scope: 'squad', platform: 'ios',
    });
    return {
        getCatalog: () => ({
            squad: 'payment', featureScope: '', platform: 'android',
            locators: [
                half('txtTitle', '//XCUIElementTypeStaticText[@name="TAPP"]'),
                half('btnViewAllAccounts', '//XCUIElementTypeButton[@name="Ver todas"]'),
            ],
            stepDefinitions: [], features: [], scenarios: [],
            screenMethods: [{
                name: 'validateSubhomeIsDisplayed', file: 'screenobjects/payment/tapp-subhome.screen.ts',
                squad: 'payment', locatorFiles: [file], className: 'S',
                signature: 'validateSubhomeIsDisplayed(): Promise<void>',
                locatorKeys: ['txtTitle', 'btnViewAllAccounts'],
            }],
            artifactBundles: [{
                steps: 'features/yape-steps-definitions/payment/tapp-subhome.steps.ts',
                screens: ['screenobjects/payment/tapp-subhome.screen.ts'],
                locators: [file],
                stepExpressions: ['el usuario visualiza el subhome de tapp'],
                screenMethods: ['validateSubhomeIsDisplayed'],
            }],
        }),
    };
}

test('un candidato sin valor en la plataforma grabada exige rellenarlo, no duplicarlo', () => {
    const recorded = scenario([
        action('CLICK', 'ver todas las cuentas de tapp', '~Ver todas'),
        action('VERIFICAR_EXISTE', 'titulo del subhome de tapp', '~TAPP'),
    ]);
    recorded.objective = 'el usuario visualiza el subhome de tapp';
    recorded.acceptanceCriteria = 'se muestra el subhome de tapp con sus cuentas';
    const result = new DeterministicResolver(catalogoConPlataformaAMedias()).resolve(recorded);

    // La identidad cruza plataformas: `~Ver todas` reconoce el XPath de iOS.
    const gap = result.unresolvedContext.gaps.find(item => /^gap-duplicate-element-/.test(item.id));
    assert.ok(gap, 'el candidato existente tiene que salir a la superficie');
    assert.match(gap.description, /sin valor Android/);
    assert.match(gap.requiredOutput, /no se adoptan tal cual/);
    assert.match(gap.requiredOutput, /"completions"|`completions`/);
    assert.match(gap.requiredOutput, /"file": "resources\/locators\/payment\/tapp-subhome\.locator\.json"/);
    assert.match(gap.requiredOutput, /"platform": "android"/);
    assert.match(gap.requiredOutput, /no lo escribas tu/);
});

// La ruta determinista nunca produjo este fallo: exactLocator compara valores y
// "" no iguala a ningun selector grabado. El fallo era del agente.
test('el resolver no reutiliza un locator vacio en la plataforma grabada', () => {
    const result = new DeterministicResolver(catalogoConPlataformaAMedias()).resolve(scenario([
        action('VERIFICAR_EXISTE', 'titulo del subhome', '~TAPP'),
    ]));
    assert.equal(result.plan.resolutions[0].resolution, 'create');
});

// El gap de duplicado invita a reutilizar un locator existente. Para que el
// validador pueda autorizar esa reutilizacion, lo que el gap ofrece tiene que
// viajar como dato, no solo como prosa dentro de la descripcion.
test('el gap de duplicado publica los candidatos que ofrece', () => {
    const result = new DeterministicResolver(catalogoConPlataformaAMedias()).resolve(scenario([
        action('CLICK', 'ver todas las cuentas de tapp', '~Ver todas'),
        action('VERIFICAR_EXISTE', 'titulo del subhome de tapp', '~TAPP'),
    ]));
    const resolution = result.plan.resolutions.find(item => item.sequence === 1);
    assert.ok(resolution.reuseCandidates?.length, 'sin esto el validador no puede autorizar la reutilizacion');
    assert.equal(resolution.reuseCandidates[0].name, 'btnViewAllAccounts');
    assert.equal(resolution.reuseCandidates[0].file, 'resources/locators/payment/tapp-subhome.locator.json');
});

// El texto del step salia de una plantilla armada con el slug tecnico —"el
// usuario completa saldo disponible consultar etiqueta"— ignorando que el QA ya
// habia escrito el comportamiento y el resultado esperado en espanol.
test('el objetivo y el criterio del QA se usan como texto de los steps', () => {
    const recorded = scenario([
        action('CLICK', 'opcion de recarga', '~btnRecarga'),
        action('VERIFICAR_EXISTE', 'confirmacion de recarga', '~lblRecarga'),
    ]);
    recorded.objective = 'el usuario recarga su celular con un monto';
    recorded.acceptanceCriteria = 'se muestra la constancia de la recarga realizada';
    const rows = new DeterministicResolver(emptyCatalog()).resolve(recorded).scenario.request.scenarioRows;

    const when = rows.find(row => row.keyword === 'When');
    const then = rows.find(row => row.keyword === 'Then');
    assert.equal(when.text, 'el usuario recarga su celular con un monto');
    assert.equal(when.wording, 'qa');
    assert.equal(then.text, 'se muestra la constancia de la recarga realizada');
    assert.equal(then.wording, 'qa');
    assert.doesNotMatch(rows.map(row => row.text).join(' '), /el usuario completa|resultado esperado de/);
});

// Las frases de dominio estan redactadas a mano y son mejor Gherkin que
// cualquier objetivo: ganan.
test('una frase de dominio gana al objetivo del QA', () => {
    const recorded = scenario([
        action('CLICK', 'mostrar movimientos', 'android=new UiSelector().text("Mostrar")'),
        action('VERIFICAR_EXISTE', 'contenedor de movimientos', '~lblMovimientos'),
    ]);
    recorded.objective = 'el usuario debe poder ver todos sus movimientos';
    const rows = new DeterministicResolver(emptyCatalog()).resolve(recorded).scenario.request.scenarioRows;
    const when = rows.find(row => row.keyword === 'When');
    assert.equal(when.text, 'el usuario consulta sus movimientos');
    assert.equal(when.wording, 'domain');
});

test('consolida un ciclo de filtro y validación en una sola expectativa declarativa', () => {
    const recorded = scenario([
        action('CLICK', 'mostrar todos los movimientos', '~Mostrar movimientos'),
        action('VERIFICAR_EXISTE', 'lista de movimientos', 'id=movements-list'),
        action('CLICK', 'abrir filtro de movimientos', '~Filtrar'),
        action('CLICK', 'filtrar movimientos por solo hoy', 'android=new UiSelector().text("Solo hoy")'),
        action('VERIFICAR_EXISTE', 'resultado de movimientos filtrados', 'id=filtered-results'),
        action('CLICK', 'abrir filtro de movimientos', '~Filtrar'),
        action('CLICK', 'filtrar movimientos por ultimos 7 dias', 'android=new UiSelector().text("Últimos 7 días")'),
        action('VERIFICAR_EXISTE', 'resultado de movimientos filtrados', 'id=filtered-results'),
        action('CLICK', 'abrir filtro de movimientos', '~Filtrar'),
        action('CLICK', 'filtrar movimientos por ultimos 30 dias', 'android=new UiSelector().text("Últimos 30 días")'),
        action('VERIFICAR_EXISTE', 'resultado de movimientos filtrados', 'id=filtered-results'),
    ]);
    recorded.objective = 'el usuario consulta todos sus movimientos';
    recorded.acceptanceCriteria = 'se muestran los movimientos correspondientes a cada filtro';

    const rows = new DeterministicResolver(emptyCatalog()).resolve(recorded).scenario.request.scenarioRows;
    const generated = rows.filter(row => row.status === 'missing');
    const consolidated = generated.find(row => /cada filtro/i.test(row.text));

    assert.ok(consolidated, 'el ciclo debe quedar expresado como una expectativa funcional');
    assert.equal(consolidated.keyword, 'And');
    assert.equal(consolidated.actions.length, 9, 'conserva la traza y el orden de todas las vueltas');
    assert.equal(generated.length, 3, 'navegación, validación inicial y ciclo consolidado');
    assert.doesNotMatch(rows.map(row => row.text).join(' '), /el usuario completa|resultado esperado de/);
});

// Un objetivo que narra la interfaz no es un step. Se descarta, y la fila queda
// marcada `template` — la unica senal de que ese texto salio de maquina y hay
// que reescribirlo.
test('un objetivo procedimental no se usa y la fila queda marcada template', () => {
    const recorded = scenario([
        action('CLICK', 'opcion de recarga', '~btnRecarga'),
        action('VERIFICAR_EXISTE', 'confirmacion de recarga', '~lblRecarga'),
    ]);
    recorded.objective = 'el usuario hace clic en el boton de recarga';
    recorded.acceptanceCriteria = 'ok';
    const rows = new DeterministicResolver(emptyCatalog()).resolve(recorded).scenario.request.scenarioRows;
    assert.equal(rows.find(row => row.keyword === 'When').wording, 'template');
    // Un criterio demasiado corto tampoco sirve como resultado esperado.
    assert.equal(rows.find(row => row.keyword === 'Then').wording, 'template');
});

// Una pantalla nueva no se "extiende" sobre un Screen ajeno solo porque ambos
// hablen de botones y titulos: `button` y `title` aparecen en casi cualquier
// metodo o clave del framework y no prueban relacion alguna. Antes bastaban
// dos coincidencias asi para que el plan marcara `update` sobre otro modulo.
test('sustantivos genericos de interfaz no convierten un Screen ajeno en objetivo de extension', () => {
    const OTP_SCREEN = 'screenobjects/payment/yapear-otp.screen.ts';
    const OTP_LOCATORS = 'resources/locators/payment/yapear-otp.locator.json';
    const otpMethod = (name, signature, locatorKeys) => ({
        name, file: OTP_SCREEN, squad: 'payment', locatorFiles: [OTP_LOCATORS], signature, locatorKeys, className: 'YapearOtpScreen',
    });
    const catalog = {
        getCatalog: () => ({
            squad: 'payment', featureScope: '', platform: 'android',
            locators: [
                { ...locator('txttitleYapeoAlto', '~Yapeo alto'), file: OTP_LOCATORS, module: 'yapear-otp' },
                { ...locator('btnValidateCode', '~Validar codigo'), file: OTP_LOCATORS, module: 'yapear-otp' },
            ],
            stepDefinitions: [], features: [], scenarios: [],
            screenMethods: [
                otpMethod('validateConfirmaYapeoAltoScreen', 'validateConfirmaYapeoAltoScreen(): Promise<void>', ['txttitleYapeoAlto']),
                otpMethod('pressButtonValideCode', 'pressButtonValideCode(): Promise<void>', ['btnValidateCode']),
            ],
            artifactBundles: [],
        }),
    };
    const resolver = new DeterministicResolver(catalog);
    const result = resolver.resolve({
        ...scenario([
            { action: 'CLICK', sequence: 1, selector: 'android=new UiSelector().text("Historial encadenado")', locatorType: 'ANDROID', locatorValue: 'new UiSelector().text("Historial encadenado")', selectorVerified: true, contextHint: 'boton de historial encadenado', platform: 'android' },
            { action: 'CLICK', sequence: 2, selector: '~Ver detalle encadenado', locatorType: 'ID', locatorValue: 'Ver detalle encadenado', selectorVerified: true, contextHint: 'boton de ver detalle encadenado', platform: 'android' },
            { action: 'VERIFICAR_EXISTE', sequence: 3, selector: '~Titulo historial encadenado', locatorType: 'ID', locatorValue: 'Titulo historial encadenado', selectorVerified: true, contextHint: 'titulo del historial encadenado', platform: 'android' },
        ]),
        objective: 'el usuario consulta el historial encadenado',
        acceptanceCriteria: 'se muestra el titulo del historial encadenado',
    });
    const screen = result.plan.files.find(file => file.layer === 'screen');
    assert.equal(screen.operation, 'create', `no debe extender ${screen.path}`);
    assert.notEqual(screen.path, OTP_SCREEN);
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id === 'gap-extend-existing-artifacts'), false);
    assert.equal(result.plan.deterministicCoverage, 1);
});

// Reutilizar un step existente exige evidencia, no solo el mismo texto: los
// metodos que invoca tienen que llegar exactamente a los locators que este
// caso resolvio como reuse. Si llega a uno mas, el step haria algo que no se
// grabo; si el texto coincide pero el step no existe con evidencia, se sufija.
function catalogWithAssertionStep(locatorKeys) {
    const base = catalogWithExistingModule().getCatalog();
    return {
        getCatalog: () => ({
            ...base,
            stepDefinitions: [{
                keyword: 'Then', expression: '^se muestra el nombre del yapero$', file: STEPS,
                squad: 'payment', scope: 'squad',
                screenMethods: [{ file: SCREEN, method: 'validarNombreDelYapero' }],
            }],
            screenMethods: [
                method('buscarYaperoPorNumero', 'buscarYaperoPorNumero(numero: string): Promise<void>', ['yapear', 'nuevoNumero', 'continuarYapeo']),
                method('validarNombreDelYapero', 'validarNombreDelYapero(): Promise<void>', locatorKeys),
            ],
        }),
    };
}

function assertionScenario() {
    return scenario([{
        action: 'VERIFICAR_EXISTE', sequence: 1, selector: '//android.view.View',
        locatorType: 'XPATH', locatorValue: '//android.view.View', selectorVerified: true,
        contextHint: 'existe el nombre del yapero', platform: 'android',
    }]);
}

test('reutiliza el step existente cuando su metodo llega exactamente al locator grabado', () => {
    const result = new DeterministicResolver(catalogWithAssertionStep(['existaElNombreDelYapero'])).resolve(assertionScenario());
    const rows = result.scenario.request.scenarioRows;
    const reused = rows.find(row => row.status === 'reused' && (row.actions || []).length);
    assert.ok(reused, JSON.stringify(rows.map(row => [row.keyword, row.text, row.status])));
    assert.equal(reused.text, 'se muestra el nombre del yapero');
    assert.equal(reused.methodName, 'validarNombreDelYapero');
    assert.equal(result.plan.resolutions[0].resolution, 'reuse');
});

test('no reutiliza el step si su metodo alcanza locators que este caso no grabo', () => {
    const result = new DeterministicResolver(catalogWithAssertionStep(['existaElNombreDelYapero', 'yapear'])).resolve(assertionScenario());
    const rows = result.scenario.request.scenarioRows;
    assert.equal(rows.some(row => row.status === 'reused' && (row.actions || []).length), false);
    const assertion = rows.find(row => /^(Then|And)$/.test(row.keyword) && row.status === 'missing');
    assert.ok(assertion);
    assert.notEqual(assertion.text, 'se muestra el nombre del yapero', 'el texto se desambigua en vez de colisionar');
});
