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
        'el usuario selecciona correo',
        'se muestra la pantalla de enviar movimientos',
        'el usuario ingresa su correo <email> y selecciona enviar correo',
        'se muestra el mensaje de correo enviado',
        'el usuario selecciona atras',
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
