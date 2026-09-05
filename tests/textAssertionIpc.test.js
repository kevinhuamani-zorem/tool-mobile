const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const channels = new Map();
const originalLoad = Module._load;
let registerInteractionHandlers;
try {
    Module._load = function (name, ...args) {
        if (name === 'electron') return { ipcMain: { handle: (name, handler) => channels.set(name, handler) } };
        return originalLoad.call(this, name, ...args);
    };
    ({ registerInteractionHandlers } = require('../dist/recorder/src/ipc/interactionHandlers'));
} finally { Module._load = originalLoad; }

const action = () => ({ action: 'VERIFICAR_TEXTO', sequence: 1, selector: 'id=container', selectorVerified: true, value: 'Hoy' });
const input = { value: 'Hoy', textAssertion: { version: 1, source: 'container', operator: 'contains' } };
function fixture() {
    let writes = 0;
    const state = { sessionActive: true, recordingPlatform: 'android', recordedSteps: [action()], executor: {
        previewTextAssertion: async () => ({ success: true }),
    } };
    const context = { state, syncRecording: () => { writes++; } };
    registerInteractionHandlers(context);
    return { state, context, writes: () => writes };
}
test('preview no escribe; edición conserva selector y solo guarda una comparación comprobada', async () => {
    const f = fixture();
    const preview = channels.get('preview-text-assertion');
    assert.equal((await preview(null, { ...action(), ...input })).success, true);
    assert.equal(f.writes(), 0);
    const update = channels.get('update-text-assertion');
    const result = await update(null, 0, { ...input, selector: 'id=other' });
    assert.equal(result.success, true);
    assert.equal(f.writes(), 1);
    assert.equal(f.state.recordedSteps[0].selector, 'id=container');
    assert.deepEqual(f.state.recordedSteps[0].textAssertion, input.textAssertion);
});
test('comparación fallida, índice inválido, sesión cerrada o persistencia fallida no alteran el recording', async () => {
    const f = fixture();
    const original = f.state.recordedSteps[0];
    const update = channels.get('update-text-assertion');
    f.state.executor.previewTextAssertion = async () => ({ success: false, message: 'no coincide' });
    assert.equal((await update(null, 0, input)).success, false);
    assert.equal((await update(null, -1, input)).success, false);
    assert.equal(f.writes(), 0);
    f.state.sessionActive = false;
    assert.equal((await update(null, 0, input)).success, false);
    f.state.sessionActive = true;
    f.state.executor.previewTextAssertion = async () => ({ success: true });
    registerInteractionHandlers({ ...f.context, syncRecording: () => { throw new Error('disco lleno'); } });
    assert.equal((await channels.get('update-text-assertion')(null, 0, input)).success, false);
    assert.equal(f.state.recordedSteps[0], original);
});
test('una grabación cambiada durante la lectura no recibe el resultado de la acción antigua', async () => {
    const f = fixture();
    const replacement = action();
    f.state.executor.previewTextAssertion = async () => {
        f.state.recordedSteps[0] = replacement;
        return { success: true };
    };
    assert.equal((await channels.get('update-text-assertion')(null, 0, input)).success, false);
    assert.equal(f.writes(), 0);
    assert.equal(f.state.recordedSteps[0], replacement);
});
