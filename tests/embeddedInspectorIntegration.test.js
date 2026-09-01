const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { AppiumDriverManager } = require('../dist/core/mobile-session');
const {
    EMBEDDED_INSPECTOR_COMMIT,
    EMBEDDED_INSPECTOR_HOST_ORIGIN,
    EMBEDDED_INSPECTOR_ORIGIN,
    EMBEDDED_INSPECTOR_URL,
    embeddedInspectorAssetsPath,
    embeddedInspectorHostDocument,
    embeddedInspectorWindowOptions,
    embeddedInspectorAssetsAvailable,
    focusEmbeddedInspectorWindow,
    isAllowedInspectorNavigation,
    resolveInspectorMode,
    returnToRecorderAfterElementUse,
} = require('../dist/recorder/src/embeddedInspectorWindow');
const {
    EmbeddedInspectorProxy,
    isAllowedInspectorProxyRequest,
} = require('../dist/recorder/src/embeddedInspectorProxy');

const toolRoot = path.resolve(__dirname, '..');

test('exposes active session metadata without credential capabilities', () => {
    const manager = new AppiumDriverManager();
    manager.driver = {
        sessionId: 'session-123',
        capabilities: {
            platformName: 'Android',
            'appium:automationName': 'UiAutomator2',
            'bstack:options': {
                userName: 'private-user',
                accessKey: 'private-key',
                projectName: 'Recorder',
            },
        },
    };
    manager.config = { platform: 'android' };
    manager.sessionState = 'active';
    manager.sessionProvider = 'browserstack';
    manager.serverUrl = 'https://hub-cloud.browserstack.com/wd/hub';

    assert.deepEqual(manager.getSessionMetadata(), {
        serverUrl: 'https://hub-cloud.browserstack.com/wd/hub',
        sessionId: 'session-123',
        capabilities: {
            platformName: 'Android',
            'appium:automationName': 'UiAutomator2',
            'bstack:options': { projectName: 'Recorder' },
        },
        platform: 'android',
        provider: 'browserstack',
        state: 'active',
    });
});

test('uses a sandboxed Inspector window and denies external navigation', () => {
    const options = embeddedInspectorWindowOptions('/tmp/embedded-preload.js');
    assert.equal(options.webPreferences.nodeIntegration, false);
    assert.equal(options.webPreferences.contextIsolation, true);
    assert.equal(options.webPreferences.sandbox, true);
    assert.equal(options.webPreferences.webSecurity, true);
    assert.equal(options.webPreferences.allowRunningInsecureContent, false);
    assert.equal(isAllowedInspectorNavigation(EMBEDDED_INSPECTOR_URL), true);
    assert.equal(isAllowedInspectorNavigation(`${EMBEDDED_INSPECTOR_ORIGIN}/embedded.html`), true);
    assert.equal(isAllowedInspectorNavigation('https://example.com'), false);
    assert.equal(EMBEDDED_INSPECTOR_HOST_ORIGIN, 'appium-recorder://host');
});

test('host delegates only clipboard writes while preserving iframe and document isolation', () => {
    const document = embeddedInspectorHostDocument();
    const delegatedPermissions = [...document.matchAll(/\sallow="([^"]*)"/g)]
        .map(match => match[1]);
    assert.match(
        document,
        /<iframe id="embedded-inspector" sandbox="allow-scripts allow-same-origin allow-downloads"\s+allow="clipboard-write"/,
    );
    assert.deepEqual(delegatedPermissions, ['clipboard-write']);
    assert.match(
        document,
        /Content-Security-Policy" content="default-src 'none'; frame-src appium-recorder:\/\/inspector; style-src 'unsafe-inline'"/,
    );
    assert.doesNotMatch(document, /clipboard-read/);
    assert.doesNotMatch(document, /allow="[^"]*(?:\*|camera|microphone|geolocation)/);
    assert.doesNotMatch(document, /allow-(?:forms|modals|popups|top-navigation)/);
});

test('defaults to embedded only with assets and preserves actionable legacy fallback', () => {
    assert.deepEqual(resolveInspectorMode(undefined, true), { mode: 'embedded' });
    assert.equal(resolveInspectorMode('legacy', true).mode, 'legacy');
    assert.equal(resolveInspectorMode(undefined, false).mode, 'legacy');
    assert.match(resolveInspectorMode(undefined, false).warning, /npm run inspector:build/);
    assert.throws(
        () => resolveInspectorMode('embedded', false),
        /npm run inspector:build/,
    );
    assert.throws(() => resolveInspectorMode('unknown', true), /legacy.*embedded/);
});

test('explicit use hides Inspector, focuses recorder, and preserves the same window', () => {
    const calls = [];
    const inspectorWindow = {
        isDestroyed: () => false,
        isMinimized: () => true,
        restore: () => calls.push('restore'),
        show: () => calls.push('inspector-show'),
        focus: () => calls.push('inspector-focus'),
        hide: () => calls.push('inspector-hide'),
        destroy: () => calls.push('inspector-destroy'),
    };
    const recorderWindow = {
        show: () => calls.push('recorder-show'),
        focus: () => calls.push('recorder-focus'),
    };

    returnToRecorderAfterElementUse(inspectorWindow, recorderWindow);
    assert.deepEqual(calls, ['inspector-hide', 'recorder-show', 'recorder-focus']);
    assert.equal(focusEmbeddedInspectorWindow(inspectorWindow), true);
    assert.deepEqual(calls, [
        'inspector-hide',
        'recorder-show',
        'recorder-focus',
        'restore',
        'inspector-show',
        'inspector-focus',
    ]);
    assert.doesNotMatch(calls.join(','), /destroy/);
});

test('accepts only the embedded origin and active session through the Appium proxy', () => {
    assert.equal(
        isAllowedInspectorProxyRequest(
            'appium-recorder://inspector',
            '/session/session-123/source',
            'session-123',
        ),
        true,
    );
    assert.equal(
        isAllowedInspectorProxyRequest(
            'https://malicious.example',
            '/session/session-123/source',
            'session-123',
        ),
        false,
    );
    assert.equal(
        isAllowedInspectorProxyRequest(
            'appium-recorder://inspector',
            '/session/another-session/source',
            'session-123',
        ),
        false,
    );
});

test('the proxy forwards only requests from the trusted origin to the active session', async t => {
    const upstream = http.createServer((request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ value: request.url }));
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => upstream.close(resolve)));
    const address = upstream.address();
    assert.equal(typeof address, 'object');

    const proxy = new EmbeddedInspectorProxy();
    const proxyUrl = await proxy.start(`http://127.0.0.1:${address.port}`, 'session-123');
    t.after(() => proxy.stop());

    const allowed = await fetch(`${proxyUrl}/session/session-123/source`, {
        headers: { origin: 'appium-recorder://inspector' },
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { value: '/session/session-123/source' });

    const rejected = await fetch(`${proxyUrl}/session/session-123/source`, {
        headers: { origin: 'https://malicious.example' },
    });
    assert.equal(rejected.status, 403);
});

test('proxy shutdown aborts a hung Appium request instead of blocking session cleanup', async t => {
    let markRequestStarted;
    const requestStarted = new Promise(resolve => { markRequestStarted = resolve; });
    const upstream = http.createServer(() => markRequestStarted());
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        upstream.closeAllConnections();
        return new Promise(resolve => upstream.close(resolve));
    });
    const address = upstream.address();
    assert.equal(typeof address, 'object');

    const proxy = new EmbeddedInspectorProxy();
    const proxyUrl = await proxy.start(`http://127.0.0.1:${address.port}`, 'session-123');
    const pendingRequest = fetch(`${proxyUrl}/session/session-123/source`, {
        headers: { origin: 'appium-recorder://inspector' },
    }).catch(error => error);
    await requestStarted;

    let timeout;
    try {
        await Promise.race([
            proxy.stop(),
            new Promise((_, reject) => {
                timeout = setTimeout(
                    () => reject(new Error('proxy stop timed out')),
                    1000,
                );
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
    assert.ok(await pendingRequest instanceof Error);
});

test('rejects altered embedded assets at runtime', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedded-inspector-assets-'));
    const assets = path.join(root, 'dist-browser');
    fs.mkdirSync(assets);
    fs.writeFileSync(path.join(assets, 'embedded.html'), '<html></html>');
    const digest = crypto.createHash('sha256').update('<html></html>').digest('hex');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
        commit: EMBEDDED_INSPECTOR_COMMIT,
        hostOrigin: EMBEDDED_INSPECTOR_HOST_ORIGIN,
        files: { 'embedded.html': digest },
    }));

    assert.equal(embeddedInspectorAssetsAvailable(assets), true);
    fs.appendFileSync(path.join(assets, 'embedded.html'), '<script></script>');
    assert.equal(embeddedInspectorAssetsAvailable(assets), false);
});

test('resolves embedded assets from the cache pinned to the controlled fork commit', () => {
    assert.equal(
        embeddedInspectorAssetsPath(),
        path.join(
            toolRoot,
            'node_modules',
            '.cache',
            'appium-inspector',
            EMBEDDED_INSPECTOR_COMMIT,
            'dist-browser',
        ),
    );
});

test('pins and builds the controlled fork without a committed bundle or plugin', () => {
    const gitmodules = fs.readFileSync(path.join(toolRoot, '.gitmodules'), 'utf8');
    const buildScript = fs.readFileSync(
        path.join(toolRoot, 'scripts', 'build-embedded-inspector.js'),
        'utf8',
    );
    const runScript = fs.readFileSync(path.join(toolRoot, 'run.sh'), 'utf8');

    assert.match(gitmodules, /kevinhuamani-zorem\/appium-inspector\.git/);
    assert.match(gitmodules, /kevinhuamani-zorem-embedded-inspector-mode/);
    assert.match(buildScript, new RegExp(EMBEDDED_INSPECTOR_COMMIT));
    assert.match(buildScript, /npm', \['run', 'build:browser'\]/);
    assert.match(buildScript, /VITE_EMBEDDED_HOST_ORIGIN: hostOrigin/);
    assert.doesNotMatch(buildScript, /appium-inspector-plugin/);
    assert.match(runScript, /--address 127\.0\.0\.1/);
    assert.doesNotMatch(runScript, /--allow-cors/);
});
