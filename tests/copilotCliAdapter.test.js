const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const { CopilotCliAdapter } = require('../dist/core/copilotCliAdapter');

function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => child.emit('exit', null, 'SIGTERM');
    return child;
}

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
    const adapter = new CopilotCliAdapter((_command, _args, _options) => {
        const child = fakeChild();
        process.nextTick(() => {
            child.stdout.write('ok');
            child.emit('close', 0, null);
        });
        return child;
    }, 'copilot', ['--ask']);
    const result = await adapter.execute({ cwd: process.cwd(), prompt: 'hola', timeoutMs: 1000 });
    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /ok/);
});
