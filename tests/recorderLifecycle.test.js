const assert = require('node:assert/strict');
const test = require('node:test');

const {
    RecorderRuntimeLifecycle,
    RecorderSessionInitializationCancelled,
    RecorderSessionOwnership,
} = require('../dist/recorder/src/recorderLifecycle');

test('deduplicates concurrent recorder cleanup and closes every owned resource', async () => {
    const calls = [];
    let releaseSession;
    const sessionClosed = new Promise(resolve => { releaseSession = resolve; });
    const lifecycle = new RecorderRuntimeLifecycle([
        () => { calls.push('inspector'); },
        async () => { calls.push('proxy'); },
        async () => {
            calls.push('session');
            await sessionClosed;
        },
    ]);

    const first = lifecycle.cleanup();
    const second = lifecycle.cleanup();
    assert.equal(first, second);
    releaseSession();
    await Promise.all([first, second]);
    assert.deepEqual(calls, ['inspector', 'proxy', 'session']);
});

test('continues cleanup after one resource fails and surfaces the failure', async () => {
    const calls = [];
    const lifecycle = new RecorderRuntimeLifecycle([
        () => {
            calls.push('inspector');
            throw new Error('inspector close failed');
        },
        () => { calls.push('proxy'); },
        () => { calls.push('session'); },
    ]);

    await assert.rejects(lifecycle.cleanup(), /inspector close failed/);
    assert.deepEqual(calls, ['inspector', 'proxy', 'session']);
});

test('deduplicates cleanup even when a cleanup task reenters synchronously', async () => {
    let lifecycle;
    let calls = 0;
    let reentrant;
    lifecycle = new RecorderRuntimeLifecycle([
        () => {
            calls += 1;
            reentrant = lifecycle.cleanup();
        },
    ]);

    const first = lifecycle.cleanup();
    await first;
    assert.equal(reentrant, first);
    assert.equal(calls, 1);
});

test('closing during session acquisition cancels continuation and quits the acquired session once', async () => {
    let finishInitialization;
    const initialization = new Promise(resolve => { finishInitialization = resolve; });
    const manager = {
        active: false,
        quitCalls: 0,
        isActive() { return this.active; },
        async quit() {
            this.quitCalls += 1;
            this.active = false;
        },
    };
    const ownership = new RecorderSessionOwnership();
    const acquisition = ownership.acquire(manager, async () => {
        await initialization;
        manager.active = true;
    });
    const closing = ownership.close();
    finishInitialization();

    await assert.rejects(
        acquisition,
        error => error instanceof RecorderSessionInitializationCancelled,
    );
    await closing;
    assert.equal(manager.quitCalls, 1);
    assert.equal(manager.active, false);
    await ownership.close();
    assert.equal(manager.quitCalls, 1);
});
