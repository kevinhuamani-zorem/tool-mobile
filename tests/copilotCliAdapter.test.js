const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CopilotCliAdapter } = require('../dist/core/automation');

function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => child.emit('exit', null, 'SIGTERM');
    return child;
}

test('permisos headless autorizan paquete y validadores sin habilitar permisos globales', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot package ' permisos-"));
    let captured;
    const adapter = new CopilotCliAdapter((_command, args) => {
        captured = args;
        const child = fakeChild();
        process.nextTick(() => child.emit('close', 0, null));
        return child;
    }, 'copilot', ['-p']);
    try {
        await adapter.execute({ cwd: root, prompt: 'validar', timeoutMs: 1000 });
        assert.equal(captured[captured.indexOf('--add-dir') + 1], fs.realpathSync(root));
        for (const flag of ['--allow-tool=read', '--allow-tool=write', '--allow-tool=shell(node)',
            '--allow-tool=shell(python)', '--allow-tool=shell(python3)', '--no-custom-instructions']) {
            assert.ok(captured.includes(flag), flag);
        }
        assert.equal(captured.some(arg => /^--allow-all|^--yolo|^--deny-tool=bash$/.test(arg)), false);
        await adapter.execute({ cwd: root, prompt: 'roast', timeoutMs: 1000, allowValidationScripts: false });
        assert.ok(captured.includes('--deny-tool=shell'));
        assert.equal(captured.some(arg => arg.startsWith('--allow-tool=shell(')), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('adapter reporta AGENT_NOT_INSTALLED cuando el comando no existe', async () => {
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => child.emit('error', { code: 'ENOENT', message: 'missing' }));
        return child;
    }, 'missing-copilot', ['--ask']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 1000 });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'AGENT_NOT_INSTALLED');
});

test('adapter devuelve éxito cuando el proceso termina en 0', async () => {
    let capturedArgs = [];
    const adapter = new CopilotCliAdapter((_command, args, _options) => {
        capturedArgs = args;
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write('ok');
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p', '--silent']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 1000 });
    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /ok/);
    assert.equal(capturedArgs[0], '-p');
    assert.equal(capturedArgs[1], 'hola');
    assert.equal(capturedArgs.includes('--model'), true);
    assert.equal(capturedArgs.includes('auto'), true);
});

test('adapter conserva UTF-8 cuando Copilot parte una tilde entre chunks', async () => {
    const expected = 'Últimos 30 días · Más información';
    const bytes = Buffer.from(expected, 'utf8');
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            for (const byte of bytes) child.stdout.write(Buffer.from([byte]));
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 1000 });
    assert.equal(result.success, true);
    assert.equal(result.stdout, expected);
    assert.equal(result.stdout.includes('�'), false);
});

test('adapter respeta un modelo explícito en args sin inyectar auto', async () => {
    let capturedArgs = [];
    const adapter = new CopilotCliAdapter((_command, args, _options) => {
        capturedArgs = args;
        const child = fakeChild();
        process.nextTick(() => child.emit('close', 0, null));
        return child;
    }, 'copilot', ['-p', '--model', 'claude-sonnet-5']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 1000 });
    assert.equal(result.success, true);
    const modelFlags = capturedArgs.filter(value => value === '--model');
    assert.equal(modelFlags.length, 1);
    assert.equal(capturedArgs.includes('claude-sonnet-5'), true);
});

test('adapter termina PASS 2 cuando aparece salida validada por schema', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-stop-on-output-'));
    const schemaPath = path.join(root, 'agent-response.schema.json');
    const outputPath = path.join(root, 'agent-response.json');
    fs.writeFileSync(schemaPath, JSON.stringify({
        type: 'object',
        required: ['ok'],
        properties: { ok: { const: true } },
        additionalProperties: false,
    }));
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        return child;
    }, 'copilot', ['-p']);
    const started = Date.now();
    setTimeout(() => {
        fs.writeFileSync(outputPath, JSON.stringify({ ok: true }));
    }, 50);
    try {
        const result = await adapter.execute({
            cwd: root,
            prompt: 'hola',
            timeoutMs: 10_000,
            stopOnValidatedOutput: {
                outputFile: './agent-response.json',
                schemaFile: './agent-response.schema.json',
                pollIntervalMs: 25,
            },
        });
        const elapsed = Date.now() - started;
        assert.equal(result.success, true);
        assert.equal(result.timedOut, false);
        assert.equal(elapsed < 2_000, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('adapter entrega una salida con schema inválido al validador oficial antes de esperar la corrección', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-invalid-output-feedback-'));
    fs.writeFileSync(path.join(root, 'response.schema.json'), JSON.stringify({
        type: 'object',
        required: ['ok'],
        properties: { ok: { const: true } },
        additionalProperties: false,
    }));
    const evaluated = [];
    const adapter = new CopilotCliAdapter((_command, _args, _options) => fakeChild(), 'copilot', ['-p']);
    setTimeout(() => {
        fs.writeFileSync(path.join(root, 'response.json'), JSON.stringify({ wrong: true }));
    }, 30);
    setTimeout(() => {
        fs.writeFileSync(path.join(root, 'response.json'), JSON.stringify({ ok: true }));
    }, 100);
    try {
        const result = await adapter.execute({
            cwd: root,
            prompt: 'corrige el contrato',
            timeoutMs: 2_000,
            stopOnValidatedOutput: {
                outputFile: './response.json',
                schemaFile: './response.schema.json',
                pollIntervalMs: 10,
                acceptOutput(output) {
                    evaluated.push(output);
                    return output.ok === true;
                },
            },
        });
        assert.equal(result.success, true);
        assert.deepEqual(evaluated, [{ wrong: true }, { ok: true }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('adapter corta por timeout aunque el hijo ignore SIGTERM', async () => {
    const script = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
    const adapter = new CopilotCliAdapter(
        spawn,
        process.execPath,
        ['-e', script, '{prompt}'],
        'auto',
        50
    );
    const started = Date.now();
    const result = await adapter.execute({
        cwd: process.cwd(),
        prompt: 'noop',
        timeoutMs: 200,
    });
    const elapsed = Date.now() - started;
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'AGENT_TIMEOUT');
    assert.equal(result.timedOut, true);
    assert.equal(elapsed < 1_500, true);
});

test('modelo por ejecución prevalece sobre args y reporta auto resuelto sin modelos auxiliares', async () => {
    let captured;
    const adapter = new CopilotCliAdapter((_command, args) => {
        captured = args;
        const child = fakeChild();
        process.nextTick(() => {
            const event = JSON.stringify({ type: 'session.auto_mode_resolved', data: { chosenModel: 'gpt-5.6-terra' } });
            child.stdout.write(event.slice(0, 30));
            child.stdout.write(event.slice(30) + '\n');
            child.stdout.write(JSON.stringify({ type: 'model.model_call_started', data: { model: 'auxiliary-model' } }) + '\n');
            child.stdout.write(JSON.stringify({ type: 'assistant.message', data: { model: 'gpt-5.6-terra', content: 'secret' } }));
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p', '--model=old-model']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'test', timeoutMs: 1000, model: 'auto' });
    assert.ok(!captured.includes('--model=old-model'));
    assert.deepEqual(result.modelUsage, { requestedModel: 'auto', actualModels: ['gpt-5.6-terra'] });
});

test('modelo fijo se envía sin inventar modelo usado cuando no hay telemetría', async () => {
    let captured;
    const adapter = new CopilotCliAdapter((_command, args) => {
        captured = args;
        const child = fakeChild();
        process.nextTick(() => child.emit('close', 1, null));
        return child;
    }, 'copilot', ['-p', '--model', 'old-model']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'test', timeoutMs: 1000, model: 'gpt-5.6-terra' });
    assert.equal(captured[captured.indexOf('--model') + 1], 'gpt-5.6-terra');
    assert.equal(captured.includes('old-model'), false);
    assert.equal(result.success, false);
    assert.deepEqual(result.modelUsage, { requestedModel: 'gpt-5.6-terra', actualModels: [] });
});

test('adapter no corta cuando una herramienta es denegada', async () => {
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write(`${JSON.stringify({
                type: 'assistant.message',
                data: {
                    toolRequests: [{
                        toolCallId: 'tool-1',
                        name: 'create',
                        arguments: { path: '/tmp/query-requests.json', file_text: '{}' },
                    }],
                },
            })}\n`);
            child.stdout.write(`${JSON.stringify({
                type: 'tool.execution_complete',
                data: {
                    toolCallId: 'tool-1',
                    success: false,
                    error: {
                        message: 'Permission denied and could not request permission from user',
                        code: 'denied',
                    },
                    toolTelemetry: {
                        properties: {
                            resolvedPathAgainstCwd: 'true',
                        },
                    },
                },
            })}\n`);
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p']);
    const started = Date.now();
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 10_000 });
    const elapsed = Date.now() - started;
    assert.equal(result.success, true);
    assert.equal(result.errorCode, undefined);
    assert.equal(Array.isArray(result.deniedToolAttempts), true);
    assert.equal(result.deniedToolAttempts.length, 1);
    assert.match(result.deniedToolAttempts[0].detail || '', /query-requests\.json/);
    assert.equal(result.timedOut, false);
    assert.equal(elapsed < 2_000, true);
});

test('adapter corta de inmediato cuando create falla por Path already exists', async () => {
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write(`${JSON.stringify({
                type: 'assistant.message',
                data: {
                    toolRequests: [{
                        toolCallId: 'tool-1',
                        name: 'create',
                        arguments: { path: '/tmp/query-requests.json', file_text: '{}' },
                    }],
                },
            })}\n`);
            child.stdout.write(`${JSON.stringify({
                type: 'tool.execution_complete',
                data: {
                    toolCallId: 'tool-1',
                    success: false,
                    error: {
                        message: 'Path already exists',
                        code: 'failure',
                    },
                },
            })}\n`);
        });
        return child;
    }, 'copilot', ['-p']);
    const started = Date.now();
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 10_000 });
    const elapsed = Date.now() - started;
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'AGENT_OUTPUT_PATH_EXISTS');
    assert.match(result.errorMessage || '', /create no sobrescribe/);
    assert.match(result.errorMessage || '', /query-requests\.json/);
    assert.equal(result.timedOut, false);
    assert.equal(elapsed < 2_000, true);
});

test('adapter tolera una denegación aislada de bash y puede terminar en éxito', async () => {
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write(`${JSON.stringify({
                type: 'assistant.message',
                data: {
                    toolRequests: [{
                        toolCallId: 'tool-1',
                        name: 'bash',
                        arguments: { command: 'find / -maxdepth 1' },
                    }],
                },
            })}\n`);
            child.stdout.write(`${JSON.stringify({
                type: 'tool.execution_complete',
                data: {
                    toolCallId: 'tool-1',
                    success: false,
                    error: {
                        message: 'Permission denied and could not request permission from user',
                        code: 'denied',
                    },
                },
            })}\n`);
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 10_000 });
    assert.equal(result.success, true);
    assert.equal(result.errorCode, undefined);
});

test('adapter canonicaliza cwd antes de ejecutar el comando', async () => {
    if (process.platform === 'win32') return;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-adapter-cwd-'));
    const realDir = path.join(tempRoot, 'real');
    const linkDir = path.join(tempRoot, 'link');
    fs.mkdirSync(realDir, { recursive: true });
    fs.symlinkSync(realDir, linkDir);
    const expectedCwd = fs.realpathSync.native(linkDir);
    let capturedCwd = null;
    const adapter = new CopilotCliAdapter((_command, _args, options) => {
        capturedCwd = options?.cwd || null;
        const child = fakeChild();
        process.nextTick(() => child.emit('close', 0, null));
        return child;
    }, 'copilot', ['-p']);
    try {
        await adapter.execute({ cwd: linkDir, prompt: 'hola', timeoutMs: 1000 });
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    assert.equal(capturedCwd, expectedCwd);
});

test('denegación por ruta absoluta interna no corta y se contabiliza como formato', async () => {
    const cwd = path.join(os.tmpdir(), `copilot-path-inside-${Date.now()}`);
    fs.mkdirSync(cwd, { recursive: true });
    const absoluteInside = path.join(cwd, 'scenario.json');
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write(`${JSON.stringify({
                type: 'assistant.message',
                data: {
                    toolRequests: [{
                        toolCallId: 'tool-inside',
                        name: 'view',
                        arguments: { path: absoluteInside },
                    }],
                },
            })}\n`);
            child.stdout.write(`${JSON.stringify({
                type: 'tool.execution_complete',
                data: {
                    toolCallId: 'tool-inside',
                    success: false,
                    error: { message: 'Permission denied and could not request permission from user', code: 'denied' },
                    toolTelemetry: { properties: { resolvedPathAgainstCwd: 'false' } },
                },
            })}\n`);
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p']);
    const result = await adapter.execute({ cwd, prompt: 'hola', timeoutMs: 5000 });
    assert.equal(result.success, true);
    assert.equal(result.deniedPathStats?.insideCwdCount, 1);
    assert.equal(result.deniedPathStats?.outsideCwdCount, 0);
    fs.rmSync(cwd, { recursive: true, force: true });
});

test('denegación fuera de cwd se contabiliza como fuga y no corta ejecución', async () => {
    const cwd = path.join(os.tmpdir(), `copilot-path-outside-${Date.now()}`);
    const outsidePath = path.join(os.tmpdir(), `copilot-outside-${Date.now()}.txt`);
    fs.mkdirSync(cwd, { recursive: true });
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write(`${JSON.stringify({
                type: 'assistant.message',
                data: {
                    toolRequests: [{
                        toolCallId: 'tool-outside',
                        name: 'view',
                        arguments: { path: outsidePath },
                    }],
                },
            })}\n`);
            child.stdout.write(`${JSON.stringify({
                type: 'tool.execution_complete',
                data: {
                    toolCallId: 'tool-outside',
                    success: false,
                    error: { message: 'Permission denied and could not request permission from user', code: 'denied' },
                    toolTelemetry: { properties: { resolvedPathAgainstCwd: 'false' } },
                },
            })}\n`);
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['-p']);
    const result = await adapter.execute({ cwd, prompt: 'hola', timeoutMs: 5000 });
    assert.equal(result.success, true);
    assert.equal(result.errorCode, undefined);
    assert.equal(result.deniedPathStats?.insideCwdCount, 0);
    assert.equal(result.deniedPathStats?.outsideCwdCount, 1);
    assert.equal(result.deniedToolAttempts?.[0]?.pathClass, 'outside');
    fs.rmSync(cwd, { recursive: true, force: true });
});
