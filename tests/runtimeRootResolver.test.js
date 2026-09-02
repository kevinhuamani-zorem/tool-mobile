const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveRecorderRuntimeRoot } = require('../dist/core/workspace');

function recorderCheckout(root, name = 'appium-visual-recorder') {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }));
    return root;
}

test('packaged runtime resolves to the checkout that built the app', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-runtime-origin-'));
    const checkout = recorderCheckout(path.join(root, 'visual-recorder'));
    const origin = path.join(root, 'runtime-origin.json');
    fs.writeFileSync(origin, JSON.stringify({ schemaVersion: 1, runtimeRoot: checkout }));

    assert.deepEqual(resolveRecorderRuntimeRoot({
        packagedOriginFile: origin,
        fallbackRoot: path.join(root, 'fallback'),
    }), { root: checkout, source: 'packaged-origin' });
});

test('explicit runtime root wins over packaged metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-runtime-explicit-'));
    const explicit = recorderCheckout(path.join(root, 'explicit'));
    const packaged = recorderCheckout(path.join(root, 'packaged'));
    const origin = path.join(root, 'runtime-origin.json');
    fs.writeFileSync(origin, JSON.stringify({ schemaVersion: 1, runtimeRoot: packaged }));

    assert.deepEqual(resolveRecorderRuntimeRoot({
        explicitRoot: explicit,
        packagedOriginFile: origin,
        fallbackRoot: path.join(root, 'fallback'),
    }), { root: explicit, source: 'environment' });
});

test('stale or malformed build metadata falls back to userData', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-runtime-fallback-'));
    const fallback = path.join(root, 'Application Support');
    const origin = path.join(root, 'runtime-origin.json');
    fs.writeFileSync(origin, JSON.stringify({ schemaVersion: 1, runtimeRoot: path.join(root, 'missing') }));

    assert.deepEqual(resolveRecorderRuntimeRoot({
        packagedOriginFile: origin,
        fallbackRoot: fallback,
    }), { root: fallback, source: 'fallback' });
});
