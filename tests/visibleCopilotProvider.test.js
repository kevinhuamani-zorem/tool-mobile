const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { VisibleCopilotProvider } = require('../dist/core/automation');
const { randomUUID } = require('node:crypto');

function fixture() {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'visible-copilot-'));
    fs.writeFileSync(path.join(cwd, 'response.schema.json'), JSON.stringify({
        type: 'object',
        required: ['recordingId', 'files'],
        properties: {
            recordingId: { type: 'string' },
            files: { type: 'array', minItems: 1 },
        },
        additionalProperties: true,
    }));
    return cwd;
}

function delegate(result = {}) {
    return {
        name: 'copilot',
        calls: [],
        async getVersion() { return 'test'; },
        cancel() {},
        async execute(input) {
            this.calls.push(input);
            return {
                success: true,
                exitCode: 0,
                stdout: '',
                stderr: '',
                durationMs: 1,
                timedOut: false,
                cancelled: false,
                ...result,
            };
        },
    };
}

test('terminal identifica solo su sesión y reporta modelo real sin esperar cierre de Copilot', async () => {
    const cwd = fixture();
    const previousHome = process.env.COPILOT_HOME;
    process.env.COPILOT_HOME = cwd;
    const sessionId = randomUUID();
    const sessionDir = path.join(cwd, 'session-state', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(path.join(cwd, 'session-state', 'other-session'));
    fs.writeFileSync(path.join(cwd, 'session-state', 'other-session', 'events.jsonl'), JSON.stringify({
        type: 'session.auto_mode_resolved', data: { chosenModel: 'wrong-model' },
    }) + '\n');
    let requested;
    const provider = new VisibleCopilotProvider(delegate(), {
        openInteractiveTerminalWithPrompt(_name, _cwd, _prompt, model) {
            requested = model;
            setTimeout(() => {
                fs.writeFileSync(path.join(sessionDir, 'events.jsonl'), JSON.stringify({
                    type: 'assistant.message', data: { model: 'gpt-5.6-terra', content: 'private text' },
                }) + '\n');
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({ recordingId: 'rec', files: [{}] }));
            }, 10);
            return { sessionId };
        },
    }, 'darwin', 10);
    try {
        const result = await provider.execute({ cwd, prompt: 'test', model: 'gpt-5.6-terra', timeoutMs: 1000,
            stopOnValidatedOutput: { outputFile: 'response.json', schemaFile: 'response.schema.json' } });
        assert.equal(requested, 'gpt-5.6-terra');
        assert.deepEqual(result.modelUsage, { requestedModel: 'gpt-5.6-terra', actualModels: ['gpt-5.6-terra'] });
        assert.equal(result.stdout, '');
    } finally {
        if (previousHome === undefined) delete process.env.COPILOT_HOME;
        else process.env.COPILOT_HOME = previousHome;
        fs.rmSync(cwd, { recursive: true, force: true });
    }
});

test('PASS 1 permanece en el provider controlado', async () => {
    const cwd = fixture();
    const base = delegate();
    let launches = 0;
    const provider = new VisibleCopilotProvider(base, {
        openInteractiveTerminalWithPrompt() { launches += 1; },
    }, 'darwin', 10);
    const result = await provider.execute({ cwd, prompt: 'PASS 1', timeoutMs: 100 });
    assert.equal(result.success, true);
    assert.equal(base.calls.length, 1);
    assert.equal(launches, 0);
});

test('PASS 2 abre Copilot interactivo y termina al validar una respuesta nueva', async () => {
    const cwd = fixture();
    const base = delegate();
    let launch;
    const provider = new VisibleCopilotProvider(base, {
        openInteractiveTerminalWithPrompt(providerName, packageDirectory, prompt) {
            launch = { providerName, packageDirectory, prompt };
            setTimeout(() => {
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({
                    recordingId: 'rec-visible',
                    files: [{ layer: 'feature' }],
                }));
            }, 20);
        },
    }, 'darwin', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'PROMPT EXACTO DEL RECORDER',
        timeoutMs: 500,
        stopOnValidatedOutput: {
            outputFile: './response.json',
            schemaFile: './response.schema.json',
        },
    });
    assert.equal(result.success, true);
    assert.deepEqual(launch, {
        providerName: 'copilot',
        packageDirectory: cwd,
        prompt: 'PROMPT EXACTO DEL RECORDER',
    });
    assert.equal(base.calls.length, 0);
});

test('PASS 2 mantiene Copilot abierto hasta que cambia una salida rechazada por el validador oficial', async () => {
    const cwd = fixture();
    const evaluated = [];
    const provider = new VisibleCopilotProvider(delegate(), {
        openInteractiveTerminalWithPrompt() {
            setTimeout(() => {
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({
                    recordingId: 'first-invalid',
                    files: [{ layer: 'feature' }],
                }));
            }, 15);
            setTimeout(() => {
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({
                    recordingId: 'second-valid',
                    files: [{ layer: 'feature' }],
                }));
            }, 120);
        },
    }, 'darwin', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'corrige hasta validar',
        timeoutMs: 800,
        stopOnValidatedOutput: {
            outputFile: './response.json',
            schemaFile: './response.schema.json',
            acceptOutput(output) {
                evaluated.push(output.recordingId);
                return output.recordingId === 'second-valid';
            },
        },
    });
    assert.equal(result.success, true);
    assert.deepEqual(evaluated, ['first-invalid', 'second-valid']);
});

test('PASS 2 entrega al validador oficial una salida con schema inválido para solicitar corrección', async () => {
    const cwd = fixture();
    const evaluated = [];
    const provider = new VisibleCopilotProvider(delegate(), {
        openInteractiveTerminalWithPrompt() {
            setTimeout(() => {
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({
                    description: 'propiedades incorrectas',
                }));
            }, 15);
            setTimeout(() => {
                fs.writeFileSync(path.join(cwd, 'response.json'), JSON.stringify({
                    recordingId: 'corrected',
                    files: [{ layer: 'feature' }],
                }));
            }, 100);
        },
    }, 'darwin', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'corrige el contrato',
        timeoutMs: 800,
        stopOnValidatedOutput: {
            outputFile: './response.json',
            schemaFile: './response.schema.json',
            acceptOutput(output) {
                evaluated.push(output);
                return output.recordingId === 'corrected';
            },
        },
    });
    assert.equal(result.success, true);
    assert.equal(evaluated.length, 2);
    assert.equal(evaluated[0].description, 'propiedades incorrectas');
    assert.equal(evaluated[1].recordingId, 'corrected');
});

test('respuesta parcial no dispara importación y respeta timeout', async () => {
    const cwd = fixture();
    const provider = new VisibleCopilotProvider(delegate(), {
        openInteractiveTerminalWithPrompt() {
            fs.writeFileSync(path.join(cwd, 'response.json'), '{"recordingId":"incompleto"}');
        },
    }, 'darwin', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'prompt',
        timeoutMs: 40,
        stopOnValidatedOutput: {
            outputFile: './response.json',
            schemaFile: './response.schema.json',
        },
    });
    assert.equal(result.success, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.errorCode, 'AGENT_TIMEOUT');
});

test('PASS 2 acepta extend-existing emitido desde el vocabulario del plan', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'visible-copilot-gap-'));
    fs.writeFileSync(path.join(cwd, 'gap-resolutions.schema.json'), JSON.stringify({
        type: 'object',
        required: ['schemaVersion', 'recordingId', 'planId', 'resolutions'],
        properties: {
            schemaVersion: { const: '1.0' },
            recordingId: { type: 'string' },
            planId: { type: 'string' },
            resolutions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['gapId', 'decision'],
                    properties: {
                        gapId: { type: 'string' },
                        decision: { enum: ['reuse', 'create', 'resolved', 'extend-existing'] },
                    },
                    additionalProperties: false,
                },
            },
        },
        additionalProperties: false,
    }));
    const provider = new VisibleCopilotProvider(delegate(), {
        openInteractiveTerminalWithPrompt() {
            setTimeout(() => fs.writeFileSync(path.join(cwd, 'gap-resolutions.json'), JSON.stringify({
                schemaVersion: '1.0',
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: 'gap-artifacts', decision: 'extend-existing' }],
            })), 20);
        },
    }, 'darwin', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'prompt',
        timeoutMs: 500,
        stopOnValidatedOutput: {
            outputFile: './gap-resolutions.json',
            schemaFile: './gap-resolutions.schema.json',
        },
    });
    assert.equal(result.success, true);
});

test('fuera de macOS conserva el provider headless', async () => {
    const cwd = fixture();
    const base = delegate();
    const provider = new VisibleCopilotProvider(base, {
        openInteractiveTerminalWithPrompt() {
            throw new Error('no debe abrir terminal');
        },
    }, 'linux', 5);
    const result = await provider.execute({
        cwd,
        prompt: 'PASS 2',
        timeoutMs: 100,
        stopOnValidatedOutput: {
            outputFile: './response.json',
            schemaFile: './response.schema.json',
        },
    });
    assert.equal(result.success, true);
    assert.equal(base.calls.length, 1);
});
