/**
 * Redacción Gherkin del borrador y del validador, con las reglas del QA:
 * Given = contexto inicial, When = acción, Then = resultado esperado,
 * And/But complementan el paso anterior (heredan su tipo); tercera persona
 * («el usuario …») o impersonal («se muestra …»).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DeterministicResolver,
    semanticGherkinKeywords,
    gherkinKeywordAccepted,
    gherkinPersonProblem,
    gherkinStepKind,
} = require('../dist/core/automation');
const { FwkMobileGenerator } = require('../dist/core/generation');
const {
    gherkinKeywordProblems,
    gherkinPersonProblems,
} = require('../dist/core/validation/infrastructure/rules/gherkinInspection');

const emptyCatalog = {
    getCatalog: (squad, platform) => ({
        squad, platform, featureScope: '', stepDefinitions: [], screenMethods: [], locators: [], features: [], scenarios: [], artifactBundles: [],
    }),
};

const action = (kind, contextHint, selector, value = '') => ({
    action: kind, contextHint, elementIntent: '', selector, value, selectorVerified: Boolean(selector),
});

function scenario(actions, objective = 'enviar los movimientos por correo', acceptanceCriteria = 'el usuario ingresa su correo y valida mensaje de correo enviado') {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-gherkin-1', revision: 1,
        fingerprint: 'f'.repeat(64), createdAt: '2026-09-06T00:00:00.000Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective, acceptanceCriteria,
        request: {
            squad: 'payment', featureName: '', scenarioName: '', fileName: '', locatorModule: '',
            caseId: 'TC-10240', pathType: 'Happy Path', tag: 'movimientos', dataName: 'QA',
            platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: actions.map((item, index) => ({ ...item, sequence: index + 1 })),
    };
}

/** Las 11 acciones de 18167698. */
const SEND_BY_EMAIL = [
    action('CLICK', 'boton mostrar movimientos', 'android=new UiSelector().text("Mostrar movimientos")'),
    action('SCROLL_DOWN', '', ''),
    action('CLICK', 'boton ver todos los movimientos', '~Ver todos'),
    action('VERIFICAR_EXISTE', 'pantalla movimientos', 'android=new UiSelector().text("Movimientos")'),
    action('CLICK', 'boton correo', '~Botón de enviar por correo'),
    action('VERIFICAR_TEXTO', 'pantalla enviar movimientos', 'android=new UiSelector().text("Enviar movimientos")', 'Enviar movimientos'),
    action('ESCRIBIR', 'ingresar el correo', 'android=new UiSelector().className("android.widget.EditText")', 'joseamendoza@yape.com.pe'),
    action('CLICK', 'boton enviar correo', 'android=new UiSelector().text("ENVIAR")'),
    action('VERIFICAR_TEXTO', 'texto de correo enviado', '~Tu correo se estará enviando en los próximos minutos.', 'Tu correo se estará enviando en los próximos minutos.'),
    action('CLICK', 'boton entendido', 'android=new UiSelector().text("ENTENDIDO")'),
    action('CLICK', 'boton atras', '~Atrás'),
];

test('los keywords salen de lo que ejecuta cada step y And hereda el tipo del anterior', () => {
    const verify = { action: 'VERIFICAR_EXISTE' };
    const click = { action: 'CLICK' };
    assert.deepEqual(semanticGherkinKeywords([
        { actions: [] }, { actions: [click, click] }, { actions: [verify] }, { actions: [click] },
        { actions: [verify] }, { actions: [verify] }, { actions: [{ action: 'ESCRIBIR' }, click] }, { actions: [click, verify] },
    ]), ['Given', 'When', 'Then', 'When', 'Then', 'And', 'When', 'Then']);
    assert.equal(gherkinStepKind([click, verify]), 'assertion', 'un step que termina verificando es un resultado');
    assert.equal(gherkinKeywordAccepted('And', 'assertion', 'assertion'), true);
    assert.equal(gherkinKeywordAccepted('And', 'behavior', 'assertion'), false, 'un And tras Then no puede ser una acción');
    assert.equal(gherkinKeywordAccepted('But', 'assertion', 'assertion'), true);
    assert.equal(gherkinKeywordAccepted('When', 'assertion', 'behavior'), false);
    assert.equal(gherkinKeywordAccepted('Given', 'context', undefined), true);
    assert.equal(gherkinKeywordAccepted('Given', 'behavior', 'context'), false);
});

test('tercera persona o impersonal: se rechazan primera persona, imperativo e infinitivo', () => {
    for (const text of [
        'el usuario consulta todos sus movimientos', 'se muestra la pantalla de enviar movimientos',
        'el usuario <username> inicia sesión en Yape', 'se muestran los movimientos correspondientes a cada filtro',
        'no se muestra la opción de descarga', 'el usuario ingresa su correo <email> y confirma el envío',
        'se confirma el envío del reporte', 'la pantalla de inicio muestra el saldo',
    ]) assert.equal(gherkinPersonProblem(text), undefined, text);
    assert.equal(gherkinPersonProblem('ingreso mi correo y confirmo'), 'first-person');
    assert.equal(gherkinPersonProblem('yo quiero ver mis movimientos'), 'first-person');
    assert.equal(gherkinPersonProblem('el usuario consulta mis movimientos'), 'first-person');
    assert.equal(gherkinPersonProblem('ingresa tu correo y confirma'), 'second-person');
    assert.equal(gherkinPersonProblem('selecciona el botón de enviar'), 'second-person');
    assert.equal(gherkinPersonProblem('valida que se muestre el mensaje'), 'second-person');
    assert.equal(gherkinPersonProblem('verificar que existe el filtro'), 'infinitive');
    assert.equal(gherkinPersonProblem('enviar los movimientos por correo'), 'infinitive');
});

test('el borrador de 18167698 alterna When/Then, nombra el dato escrito y no repite la frase de dominio', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario(SEND_BY_EMAIL));
    const rows = result.scenario.request.scenarioRows;
    assert.deepEqual(rows.map(row => row.keyword), ['Given', 'When', 'Then', 'When', 'Then', 'When', 'Then', 'When']);
    assert.deepEqual(rows.map(row => row.text), [
        'el usuario <username> inicia sesión en Yape',
        'el usuario consulta todos sus movimientos',
        'se muestra la pantalla de movimientos',
        'el usuario prepara el envío de sus movimientos por correo',
        'se muestra la pantalla de enviar movimientos',
        'el usuario solicita sus movimientos en el correo <email>',
        'se muestra el mensaje de correo enviado',
        'el usuario finaliza la consulta del envío por correo',
    ]);
    assert.equal(result.scenario.request.examples.email, 'joseamendoza@yape.com.pe');
    for (const row of rows) assert.equal(gherkinPersonProblem(row.text), undefined, row.text);
    const written = rows[5].actions.find(item => item.action === 'ESCRIBIR');
    assert.equal(written.value, '<email>');
});

test('el criterio del QA en infinitivo se vuelve impersonal y el objetivo en infinitivo no se copia', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([
        action('CLICK', 'boton mostrar movimientos', '~Mostrar movimientos'),
        action('VERIFICAR_EXISTE', 'filtro de movimientos', '~Botón de filtrar'),
    ], 'consultar los movimientos del mes', 'verificar que existe el filtro de movimientos'));
    const rows = result.scenario.request.scenarioRows.filter(row => row.status === 'missing');
    assert.deepEqual(rows.map(row => [row.keyword, row.text]), [
        ['When', 'el usuario consulta sus movimientos'],
        ['Then', 'se muestra el filtro de movimientos'],
    ]);
});

test('las definitions llevan el keyword efectivo aunque el step anterior sea una fila reutilizada', () => {
    const actions = [
        { action: 'CLICK', variableName: 'btnSendEmail', selector: '~Enviar por correo', sequence: 1 },
        { action: 'ESCRIBIR', variableName: 'emailInput', selector: 'id=email', value: '<email>', sequence: 2 },
        { action: 'VERIFICAR_EXISTE', variableName: 'sentMessage', selector: '~Enviado', sequence: 3 },
    ];
    const preview = new FwkMobileGenerator().preview({
        squad: 'payment', featureName: 'Envío de movimientos', scenarioName: 'Enviar movimientos por correo',
        fileName: 'send-movements-by-email', locatorModule: 'movements', caseId: 'TC-10240', pathType: 'Happy Path',
        tag: 'movimientos', platform: 'android', createdAt: '2026-09-06T00:00:00.000Z',
        examples: { email: 'qa@yape.com.pe' },
        scenarioRows: [
            { keyword: 'Given', text: 'el usuario <username> inicia sesión en Yape', status: 'reused', actions: [] },
            { keyword: 'When', text: 'el usuario consulta todos sus movimientos', status: 'reused', actions: [] },
            { keyword: 'And', text: 'el usuario selecciona la opción de enviar por correo', status: 'missing', methodName: 'selectSendByEmail', actions: [actions[0]] },
            { keyword: 'And', text: 'el usuario ingresa su correo <email>', status: 'missing', methodName: 'enterEmail', actions: [actions[1]] },
            { keyword: 'Then', text: 'se muestra el mensaje de correo enviado', status: 'missing', methodName: 'showEmailSent', actions: [actions[2]] },
        ],
    }, actions);
    assert.match(preview.stepContent, /^When\(\/\^el usuario selecciona la opción de enviar por correo\$\//m, 'And tras When se define con When');
    assert.match(preview.stepContent, /^When\(\/\^el usuario ingresa su correo \(\.\*\)\$\/, async \(email: string\)/m);
    assert.match(preview.stepContent, /^Then\(\/\^se muestra el mensaje de correo enviado\$\//m);
    assert.doesNotMatch(preview.stepContent, /^Given\(/m, 'ninguna definition nueva es Given');
    assert.match(preview.stepContent, /^import \{ Then, When \} from '@wdio\/cucumber-framework';$/m);
    assert.match(preview.screenContent, /await this\.emailInput\.setValue\(email\);/);
});

test('el validador señala keywords sin semántica y redacción fuera de tercera persona', () => {
    const feature = [
        'Feature: Envío',
        '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Envío',
        '    Given el usuario <username> inicia sesión en Yape',
        '    When el usuario consulta todos sus movimientos',
        '    Then se muestra la pantalla de movimientos',
        '    And el usuario selecciona correo',
        '    And se muestra la pantalla de enviar movimientos',
        '    When ingresa tu correo <email> y confirma',
        '    Then se muestra el mensaje de correo enviado',
        '',
        '  Scenario: otro caso ya existente sin traza',
        '    When el usuario hace otra cosa',
        '    Then pasa algo',
    ].join('\n');
    const trace = (sequence, step) => ({ sequence, gherkinStep: step });
    const actionTrace = [
        trace(1, 'When el usuario consulta todos sus movimientos'), trace(2, 'When el usuario consulta todos sus movimientos'),
        trace(3, 'Then se muestra la pantalla de movimientos'),
        trace(4, 'And el usuario selecciona correo'),
        trace(5, 'And se muestra la pantalla de enviar movimientos'),
        trace(6, 'When ingresa tu correo <email> y confirma'), trace(7, 'When ingresa tu correo <email> y confirma'),
        trace(8, 'Then se muestra el mensaje de correo enviado'),
    ];
    const actions = [
        { sequence: 1, action: 'CLICK' }, { sequence: 2, action: 'CLICK' }, { sequence: 3, action: 'VERIFICAR_EXISTE' },
        { sequence: 4, action: 'CLICK' }, { sequence: 5, action: 'VERIFICAR_TEXTO' }, { sequence: 6, action: 'ESCRIBIR' },
        { sequence: 7, action: 'CLICK' }, { sequence: 8, action: 'VERIFICAR_TEXTO' },
    ];
    const keywordProblems = gherkinKeywordProblems(feature, actionTrace, actions);
    assert.deepEqual(keywordProblems.map(problem => [problem.step, problem.expected]), [
        ['And el usuario selecciona correo', 'When'],
        ['And se muestra la pantalla de enviar movimientos', 'Then'],
    ]);
    const personProblems = gherkinPersonProblems(feature, new Set(['el usuario <username> inicia sesion en yape']));
    assert.deepEqual(personProblems.map(problem => [problem.step, problem.problem]), [
        ['When ingresa tu correo <email> y confirma', 'second-person'],
    ]);
    const clean = feature
        .replace('    And el usuario selecciona correo', '    When el usuario selecciona correo')
        .replace('    And se muestra la pantalla de enviar movimientos', '    Then se muestra la pantalla de enviar movimientos');
    assert.deepEqual(gherkinKeywordProblems(clean, actionTrace, actions), []);
});


test('el yapeo se redacta por intención del bloque sin perder acciones ni parámetros', () => {
    const recorded = [
        action('CLICK', 'boton yapear', '~Yapear'),
        action('CLICK', 'boton permitir', '~Permitir'),
        action('CLICK', 'boton cerrar', '~Cerrar'),
        action('VERIFICAR_EXISTE', 'pantalla yapear', '~Pantalla Yapear'),
        action('ESCRIBIR', 'ingresar numero destino', '~Número', '900000001'),
        action('CLICK', 'boton seleccionar numero destino', '~Destinatario'),
        action('VERIFICAR_EXISTE', 'numero del yapero', '~Número del destinatario'),
        action('ESCRIBIR', 'ingresar monto', '~Monto', '1'),
        action('ESCRIBIR', 'agregar mensaje', '~Mensaje', 'Prueba'),
        action('CLICK', 'boton yapear', '~Yapear'),
        action('VERIFICAR_EXISTE', 'monto yapeado', '~Monto yapeado'),
        action('VERIFICAR_EXISTE', 'numero de celular ofuscado', '~Número ofuscado'),
        action('CLICK', 'boton cerrar', '~Cerrar'),
    ];
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario(recorded,
        'realizar el flujo de yapeo', 'se realiza un yapeo exitoso'));
    const rows = result.scenario.request.scenarioRows;
    assert.deepEqual(rows.filter(row => row.keyword === 'When').map(row => row.text), [
        'el usuario inicia un yapeo',
        'el usuario identifica al destinatario mediante el número <number>',
        'el usuario solicita un yapeo por <amount> con el comentario <addMessage>',
        'el usuario cierra el detalle del yapeo',
    ]);
    assert.deepEqual(rows.flatMap(row => row.actions.map(a => a.sequence)), recorded.map((_, i) => i + 1));
    assert.deepEqual(rows[1].actions.map(a => a.action), ['CLICK', 'CLICK', 'CLICK']);
    for (const [key, value] of Object.entries({ number: '900000001', amount: '1', addMessage: 'Prueba' })) {
        assert.equal(result.scenario.request.examples[key], value);
        assert.ok(rows.some(row => row.text.includes(`<${key}>`)));
    }
    assert.ok(rows.some(row => row.text === 'se muestra el número de celular ofuscado'));
    assert.ok(rows.every(row => !/exitoso|selecciona cerrar|selecciona seleccionar/.test(row.text)));
});

test('un objetivo de éxito no convierte la existencia de una pantalla en confirmación de negocio', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([
        action('CLICK', 'boton yapear', '~Yapear'),
        action('VERIFICAR_EXISTE', 'pantalla yapear', '~Pantalla Yapear'),
    ], 'el usuario inicia un yapeo', 'se realiza un yapeo exitoso'));
    const assertions = result.scenario.request.scenarioRows.filter(row => row.keyword === 'Then');
    assert.deepEqual(assertions.map(row => row.text), ['se muestra la pantalla de yapear']);
});

test('no se atribuye el objetivo completo a cerrar cuando falta contexto del bloque', () => {
    const { intentBehaviorText } = require('../dist/core/automation/application/resolver/wording');
    assert.equal(intentBehaviorText([action('CLICK', 'boton cerrar', '~Cerrar')], ['boton cerrar']), undefined);
    assert.equal(intentBehaviorText([action('CLICK', 'boton yapear', '~Yapear'),
        action('CLICK', 'boton cancelar pago', '~Cancelar pago')], ['boton yapear', 'boton cancelar pago'],
        { nextAssertions: ['pantalla yapear'] }), 'el usuario solicita un yapeo y cancela pago');
    const text = intentBehaviorText([
        action('ESCRIBIR', 'nombre', '~Nombre', '<name>'),
        action('ESCRIBIR', 'apellido', '~Apellido', '<surname>'),
    ], ['nombre', 'apellido']);
    assert.match(text, /<name>.*<surname>/);
});


test('el objetivo de un único bloque no sustituye los parámetros de sus datos grabados', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenario([
        action('ESCRIBIR', 'correo', '~Correo', 'qa@example.invalid'),
        action('VERIFICAR_EXISTE', 'pantalla de envío', '~Envío'),
    ], 'el usuario configura el destino de sus movimientos', 'se muestra la pantalla de envío'));
    const behavior = result.scenario.request.scenarioRows.find(row => row.keyword === 'When');
    assert.ok(behavior.text.includes('<email>'));
    assert.equal(behavior.actions[0].value, '<email>');
    assert.equal(result.scenario.request.examples.email, 'qa@example.invalid');
});
