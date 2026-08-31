const test = require('node:test');
const assert = require('node:assert/strict');
const { detectRepetition } = require('../dist/core/repetitionDetector');

const click = (selector, hint = '') => ({ action: 'CLICK', selector, contextHint: hint, value: '' });

function withSequence(actions) {
    return actions.map((action, index) => ({ ...action, sequence: index + 1 }));
}

const FILTROS = withSequence([
    click('android=new UiSelector().text("Mostrar movimientos")', 'boton de mostrar movimientos'),
    click('~Ver todos', 'boton de ver todos los movimientos'),
    click('~Botón de filtrar', 'boton de filtro de movimientos'),
    click('android=new UiSelector().text("Solo hoy")', 'filtrar por solo hoy'),
    click('~Botón de filtrar', 'boton de filtro de movimientos'),
    click('android=new UiSelector().text("Ultimos 7 dias")', 'filtrar por ultimos 7 dias'),
    click('~Botón de filtrar', 'filtrar'),
    click('android=new UiSelector().text("Ultimos 30 dias")', 'ultimos 30 dias'),
    click('~Botón de filtrar', 'filtrar'),
    click('android=new UiSelector().text("Ultimos 90 dias")', 'ultimos 90 dias'),
]);

test('detecta el ciclo, sus valores y de dónde empieza', () => {
    const cycle = detectRepetition(FILTROS);

    assert.ok(cycle, 'debe encontrar el ciclo');
    assert.equal(cycle.startSequence, 3);
    assert.equal(cycle.length, 2);
    assert.equal(cycle.repetitions, 4);
    assert.equal(cycle.varyingOffset, 1);
    assert.deepEqual(cycle.values, ['Solo hoy', 'Ultimos 7 dias', 'Ultimos 30 dias', 'Ultimos 90 dias']);
});

test('nombra el parámetro desde el contexto que escribió el QA', () => {
    // "boton de filtro de movimientos" en la acción constante del ciclo.
    assert.equal(detectRepetition(FILTROS).parameter, 'filtro');
});

test('mapea cada repetición a sus secuencias', () => {
    assert.deepEqual(detectRepetition(FILTROS).sequences, [[3, 4], [5, 6], [7, 8], [9, 10]]);
});

test('ignora un flujo lineal sin repetición', () => {
    assert.equal(detectRepetition(withSequence([
        click('~Yapear', 'yapear'),
        click('~Nuevo numero', 'nuevo numero'),
        click('~Continuar', 'continuar'),
        click('~Confirmar', 'confirmar'),
    ])), undefined);
});

test('exige al menos tres vueltas para no confundir un par casual', () => {
    assert.equal(detectRepetition(withSequence([
        click('~Filtrar', 'filtrar'),
        click('android=new UiSelector().text("Hoy")', 'hoy'),
        click('~Filtrar', 'filtrar'),
        click('android=new UiSelector().text("Ayer")', 'ayer'),
    ])), undefined);
});

test('descarta el ciclo si varían dos posiciones: son flujos distintos, no una tabla', () => {
    const cycle = detectRepetition(withSequence([
        click('android=new UiSelector().text("Origen A")', 'origen'),
        click('android=new UiSelector().text("Destino A")', 'destino'),
        click('android=new UiSelector().text("Origen B")', 'origen'),
        click('android=new UiSelector().text("Destino B")', 'destino'),
        click('android=new UiSelector().text("Origen C")', 'origen'),
        click('android=new UiSelector().text("Destino C")', 'destino'),
    ]));

    assert.equal(cycle, undefined);
});

test('detecta un ciclo de una sola acción', () => {
    const cycle = detectRepetition(withSequence([
        click('android=new UiSelector().text("Opcion 1")', 'marcar opcion'),
        click('android=new UiSelector().text("Opcion 2")', 'marcar opcion'),
        click('android=new UiSelector().text("Opcion 3")', 'marcar opcion'),
    ]));

    assert.equal(cycle.length, 1);
    assert.equal(cycle.repetitions, 3);
    assert.deepEqual(cycle.values, ['Opcion 1', 'Opcion 2', 'Opcion 3']);
});

test('prefiere el ciclo que cubre más acciones de la grabación', () => {
    const cycle = detectRepetition(FILTROS);
    assert.equal(cycle.length * cycle.repetitions, 8);
});

test('no repite un valor: si el literal se repite no es una tabla de datos', () => {
    assert.equal(detectRepetition(withSequence([
        click('~Filtrar', 'filtrar'),
        click('android=new UiSelector().text("Hoy")', 'hoy'),
        click('~Filtrar', 'filtrar'),
        click('android=new UiSelector().text("Hoy")', 'hoy'),
        click('~Filtrar', 'filtrar'),
        click('android=new UiSelector().text("Hoy")', 'hoy'),
    ])), undefined);
});

const { DeterministicResolver } = require('../dist/core/deterministicResolver');

const emptyCatalog = {
    getCatalog: () => ({
        squad: 'payment', featureScope: '', platform: 'android',
        locators: [], stepDefinitions: [], features: [], scenarios: [],
        screenMethods: [], artifactBundles: [],
    }),
};

function scenarioWith(actions) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-abc12345', revision: 1,
        fingerprint: 'f'.repeat(64), createdAt: '2026-01-01T00:00:00Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'usar todos los filtros de movimientos',
        acceptanceCriteria: 'poder usar todas las opciones del filtro',
        request: {
            squad: 'payment', featureName: 'F', scenarioName: 'S', fileName: 'f', locatorModule: 'm',
            caseId: 'TC-1', pathType: 'Happy Path', tag: 't', dataName: 'QA',
            platform: 'android', examples: {}, scenarioRows: [],
        },
        actions,
    };
}

test('el plan detecta repetición y agrega DataTable de forma determinística', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenarioWith(FILTROS));

    assert.equal(result.plan.repetition.repetitions, 4);
    assert.equal(result.plan.repetition.parameter, 'filtro');
    assert.equal(result.unresolvedContext.gaps.some(item => item.type === 'repetition'), false);
    const whenRow = result.scenario.request.scenarioRows.find(row => row.keyword === 'When');
    assert.ok(whenRow?.dataTable, 'la fila funcional debe contener DataTable');
    assert.deepEqual(whenRow.dataTable.headers, ['filtro']);
    assert.deepEqual(whenRow.dataTable.rows, [
        ['Solo hoy'],
        ['Ultimos 7 dias'],
        ['Ultimos 30 dias'],
        ['Ultimos 90 dias'],
    ]);
});

test('la falta de aserción es un gap bloqueante propio, no una nota dentro de otro gap', () => {
    const sinAsercion = new DeterministicResolver(emptyCatalog).resolve(scenarioWith(FILTROS));
    const gap = sinAsercion.unresolvedContext.gaps.find(item => item.type === 'missing-assertion');
    assert.ok(gap, 'sin Then la grabación no es un caso de prueba');
    assert.equal(gap.blocking, true);
    assert.equal(sinAsercion.unresolvedContext.gaps[0].id, 'gap-missing-assertion');
    assert.match(gap.requiredOutput, /VERIFICAR_TEXTO/);
    const conAsercion = new DeterministicResolver(emptyCatalog).resolve(scenarioWith([
        ...FILTROS,
        { action: 'VERIFICAR_EXISTE', selector: '~lblResultado', contextHint: 'resultado', value: '', sequence: 11 },
    ]));
    assert.equal(conAsercion.unresolvedContext.gaps.some(item => item.type === 'missing-assertion'), false);
});

test('un flujo lineal no produce gap de repetición', () => {
    const result = new DeterministicResolver(emptyCatalog).resolve(scenarioWith(withSequence([
        click('~Yapear', 'yapear'),
        click('~Continuar', 'continuar'),
    ])));

    assert.equal(result.plan.repetition, undefined);
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.type === 'repetition'), false);
});
