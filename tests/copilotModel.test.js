const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { normalizeAgentModel, modelFromCopilotEvent, CopilotModelEvents, AgentRunStore, AutomationAgentLauncher } = require('../dist/core/automation');

test('modelo auto predeterminado e IDs inválidos rechazados antes de lanzar CLI', () => {
    assert.equal(normalizeAgentModel(), 'auto');
    assert.equal(normalizeAgentModel(' gpt-5.6-terra '), 'gpt-5.6-terra');
    for (const value of ['--allow-all', 'model; touch x', 'x\n-y', {}, 42]) assert.throws(() => normalizeAgentModel(value));
    assert.equal(modelFromCopilotEvent({ type: 'assistant.message', data: { content: 'model: fake' } }), null);
    assert.equal(modelFromCopilotEvent({ type: 'assistant.message', data: { model: '' } }), null);
    assert.equal(modelFromCopilotEvent({ type: 'session.model_change', data: { newModel: 'not-yet-used' } }), null);
});

test('lector de eventos incremental conserva solo modelos, tolera archivo ausente y líneas partidas', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-events-'));
    const file = path.join(root, 'events.jsonl');
    const reader = new CopilotModelEvents(file);
    assert.deepEqual(reader.read(), []);
    const line = JSON.stringify({ type: 'assistant.message', data: { model: 'gpt-5.6-terra', content: 'PRIVATE PROMPT' } });
    fs.writeFileSync(file, line.slice(0, 25));
    assert.deepEqual(reader.read(), []);
    fs.appendFileSync(file, line.slice(25) + '\n');
    assert.deepEqual(reader.read(), ['gpt-5.6-terra']);
    assert.deepEqual(reader.read(), ['gpt-5.6-terra']);
    fs.appendFileSync(file, 'invalid\n' + JSON.stringify({ type: 'session.auto_mode_resolved', data: { chosenModel: 'second-model' } }) + '\n');
    assert.deepEqual(reader.read(), ['gpt-5.6-terra', 'second-model']);
    assert.throws(() => CopilotModelEvents.forSession('../other-session'));
    fs.rmSync(root, { recursive: true, force: true });
});

test('telemetría separa solicitado y usados, conserva fallos y reinicia por ejecución', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-run-'));
    const store = new AgentRunStore(root);
    store.start('recording', 'plan');
    store.recordModelUsage('pass1', { requestedModel: 'auto', actualModels: ['model-a'] });
    store.recordModelUsage('pass2', { requestedModel: 'auto', actualModels: ['model-a', 'model-b'] });
    store.mark('failed', true);
    assert.deepEqual(store.read().agentModelUsage, { requestedModel: 'auto', actualModels: ['model-a', 'model-b'] });
    assert.equal(store.read().agentModelInvocations.length, 2);
    store.recordModelUsage('manual-correction', { requestedModel: 'fixed', actualModels: [] }, 'session-1');
    store.recordModelUsage('manual-correction', { requestedModel: 'fixed', actualModels: ['fixed'] }, 'session-1');
    assert.equal(store.read().agentModelInvocations.length, 3);
    store.start('recording', 'next-plan');
    assert.equal(store.read().agentModelUsage, null);
    fs.rmSync(root, { recursive: true, force: true });
});

test('launcher usa modelo elegido y UUID nuevo sin cambiar permisos', () => {
    if (process.platform !== 'darwin') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-launch-'));
    let args;
    const launcher = new AutomationAgentLauncher((_command, argv) => { args = argv.join(' '); return { unref() {} }; });
    const first = launcher.openTerminalWithPrompt('copilot', root, 'gpt-5.6-terra');
    assert.match(args, /'--model' 'gpt-5.6-terra'/);
    assert.ok(args.includes(first.sessionId));
    assert.doesNotMatch(args, /--allow-all/);
    assert.match(args, /--allow-tool=shell\(node\)/);
    assert.match(args, /--allow-tool=shell\(python\)/);
    assert.match(args, /--allow-tool=shell\(python3\)/);
    assert.match(args, /--allow-tool=read/);
    assert.match(args, /--allow-tool=write/);
    assert.match(args, /--add-dir/);
    assert.doesNotMatch(args, /--deny-tool=bash|--allow-all-paths|--yolo/);
    assert.notEqual(launcher.openTerminalWithPrompt('copilot', root, 'auto').sessionId, first.sessionId);
    fs.rmSync(root, { recursive: true, force: true });
});

test('UI recuerda modelo, bloquea cambios durante ejecución y muestra datos reales', async () => {
    const { createCopilotModelControls, modelUsageLabel } = await import(pathToFileURL(path.resolve(__dirname, '../recorder/renderer/src/features/review/copilotModelControls.js')));
    const elements = Object.fromEntries(['cmbCopilotModel', 'txtCopilotModel', 'copilotModelUsage'].map(id => [id, {
        value: '', handlers: {}, addEventListener(type, callback) { this.handlers[type] = callback; },
        removeEventListener(type) { delete this.handlers[type]; }, focus() {},
    }]));
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, val) => values.set(key, val) };
    const statuses = [elements.copilotModelUsage, { textContent: '' }];
    const doc = {
        getElementById: id => elements[id],
        querySelectorAll: selector => selector === '[data-copilot-model-usage]' ? statuses : [],
    };
    const api = { getAutomationModelUsage: async () => ({ requestedModel: 'auto', actualModels: ['model-a'] }) };
    const control = createCopilotModelControls(doc, api, storage);
    assert.equal(control.selected(), 'auto');
    elements.cmbCopilotModel.value = 'custom';
    elements.cmbCopilotModel.handlers.change();
    assert.equal(elements.txtCopilotModel.hidden, false);
    assert.throws(() => control.selected());
    elements.txtCopilotModel.value = 'model-a';
    elements.txtCopilotModel.handlers.input();
    assert.equal(control.selected(), 'model-a');
    control.busy(true);
    assert.equal(elements.cmbCopilotModel.disabled, true);
    assert.equal(elements.txtCopilotModel.disabled, true);
    control.busy(false);
    await control.refresh();
    assert.match(elements.copilotModelUsage.textContent, /Solicitado: auto · Usado: model-a/);
    assert.match(statuses[1].textContent, /Solicitado: auto · Usado: model-a/);
    control.dispose();
    assert.equal(createCopilotModelControls(doc, api, storage).selected(), 'model-a');
    assert.match(modelUsageLabel({ requestedModel: 'model-a', actualModels: [] }), /no informado/);
});
