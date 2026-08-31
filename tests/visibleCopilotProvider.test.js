const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { VisibleCopilotProvider } = require('../dist/core/visibleCopilotProvider');

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
