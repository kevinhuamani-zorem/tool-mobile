const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidateRepeatedValidationCycle } = require('../dist/core/automation/application/resolver/artifactPlanning');

function cycle(kind = 'VERIFICAR_EXISTE') {
    const actions = [{ action: 'CLICK', sequence: 1, contextHint: 'consultar resultados', selector: '~results' }];
    const rows = [{ text: 'el usuario consulta los resultados', status: 'missing', actions: [actions[0]] }];
    const sequences = [];
    for (let i = 0; i < 3; i++) {
        const first = { action: 'CLICK', sequence: 2 + i * 2, contextHint: 'filtro por período', selector: `~period-${i}` };
        const verify = { action: kind, sequence: first.sequence + 1, contextHint: kind === 'VERIFICAR_NO_EXISTE' ? 'mensaje de error' : 'pantalla de resultados', selector: '~result' };
        if (kind === 'VERIFICAR_TEXTO') {
            verify.contextHint = 'mensaje del período';
            verify.value = `Período ${i + 1}`;
            verify.textAssertion = { source: 'element', operator: 'equals' };
        }
        actions.push(first, verify);
        rows.push({ text: `el usuario elige el período ${i + 1}`, status: 'missing', actions: [first] },
            { text: 'se muestra el resultado', status: 'missing', actions: [verify] });
        sequences.push([first.sequence, verify.sequence]);
    }
    const resolutions = actions.map(action => ({ sequence: action.sequence, intent: action.contextHint }));
    const repetition = { sequences, repetitions: 3, parameter: 'period', values: ['1', '2', '3'] };
    const consolidate = acceptance => consolidateRepeatedValidationCycle(rows, repetition, actions, resolutions, acceptance);
    return { rows, actions, resolutions, repetition, consolidate };
}

test('un ciclo de existencia describe la pantalla observada y no transforma aceptación QA en éxito', () => {
    const f = cycle();
    const first = f.consolidate('se confirma el pago exitoso y el destinatario recibe el dinero');
    const changedGoal = f.consolidate('el correo fue entregado correctamente');
    assert.ok(first && changedGoal);
    const row = first[1];
    assert.equal(row.text, changedGoal[1].text, 'cambiar lo deseado no cambia lo observado');
    assert.match(row.text, /pantalla de resultados/);
    assert.match(row.text, /cada filtro/);
    assert.doesNotMatch(row.text, /pago|dinero|exitoso|entregado|resultados esperados/);
    assert.deepEqual(row.actions, f.actions.slice(1), 'se conservan todas las acciones y su orden');
});

test('los ciclos conservan negaciones y comprobaciones textuales con sus valores y operador', () => {
    const missing = cycle('VERIFICAR_NO_EXISTE').consolidate('todos los pagos terminaron correctamente');
    assert.match(missing[1].text, /no se muestra el mensaje de error/);
    const f = cycle('VERIFICAR_TEXTO');
    const consolidated = f.consolidate('el saldo corresponde al esperado');
    assert.match(consolidated[1].text, /mensaje del período/);
    const checks = consolidated[1].actions.filter(action => action.action === 'VERIFICAR_TEXTO');
    assert.deepEqual(checks.map(action => [action.value, action.textAssertion]), f.actions.filter(action => action.action === 'VERIFICAR_TEXTO').map(action => [action.value, action.textAssertion]));
    assert.doesNotMatch(consolidated[1].text, /saldo|esperado/);
});

test('consolidar no reescribe un step reutilizado ni descarta su tabla o una secuencia sin asociación completa', () => {
    for (const mutate of [
        f => { f.rows[2].status = 'reused'; },
        f => { f.rows[2].dataTable = { headers: ['expected'], rows: [['confirmación']] }; },
        f => { f.rows[2].actions.push({ action: 'CLICK', sequence: 99 }); },
    ]) {
        const f = cycle();
        mutate(f);
        const before = JSON.stringify(f.rows);
        assert.equal(f.consolidate('éxito'), undefined);
        assert.equal(JSON.stringify(f.rows), before);
    }
});
