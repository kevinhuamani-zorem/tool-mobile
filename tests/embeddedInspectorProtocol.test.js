const assert = require('node:assert/strict');
const test = require('node:test');

const {
    EMBEDDED_INSPECTOR_CHANNEL,
    EMBEDDED_INSPECTOR_TYPES,
    EMBEDDED_INSPECTOR_VERSION,
    EmbeddedInspectorHandshake,
    EmbeddedInspectorProtocolError,
    recorderSelectorFromInspector,
    validateEmbeddedInspectorMessage,
} = require('../dist/recorder/src/embeddedInspectorProtocol');

function message(type, payload) {
    return {
        channel: EMBEDDED_INSPECTOR_CHANNEL,
        version: EMBEDDED_INSPECTOR_VERSION,
        type,
        ...(payload === undefined ? {} : { payload }),
    };
}

test('validates every embedded event payload', () => {
    assert.deepEqual(
        validateEmbeddedInspectorMessage(message(EMBEDDED_INSPECTOR_TYPES.READY)),
        message(EMBEDDED_INSPECTOR_TYPES.READY),
    );
    assert.deepEqual(
        validateEmbeddedInspectorMessage(message(EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED, {
            strategy: '-android uiautomator',
            selector: 'new UiSelector().text("Pagar")',
            elementId: 'element-1',
            tag: 'android.widget.Button',
            attributes: { text: 'Pagar', enabled: 'true' },
            screenshot: 'abc',
            source: '<hierarchy />',
        })).payload.attributes,
        { text: 'Pagar', enabled: 'true' },
    );

    assert.throws(
        () => validateEmbeddedInspectorMessage(message(EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED, {
            strategy: 'xpath',
            selector: '//button',
            attributes: { enabled: true },
        })),
        error => error instanceof EmbeddedInspectorProtocolError && error.code === 'INVALID_PAYLOAD',
    );
    assert.throws(
        () => validateEmbeddedInspectorMessage({
            channel: EMBEDDED_INSPECTOR_CHANNEL,
            version: 1,
            type: EMBEDDED_INSPECTOR_TYPES.READY,
        }),
        error => error instanceof EmbeddedInspectorProtocolError && error.code === 'UNSUPPORTED_PROTOCOL',
    );
});

test('maps successful Inspector strategies into existing recorder selector syntax', () => {
    const base = { attributes: {} };
    assert.equal(
        recorderSelectorFromInspector({ ...base, strategy: 'accessibility id', selector: 'Pagar' }),
        '~Pagar',
    );
    assert.equal(
        recorderSelectorFromInspector({ ...base, strategy: 'id', selector: 'com.yape:id/pay' }),
        'id=com.yape:id/pay',
    );
    assert.equal(
        recorderSelectorFromInspector({
            ...base,
            strategy: '-android uiautomator',
            selector: 'new UiSelector().text("Pagar")',
        }),
        'android=new UiSelector().text("Pagar")',
    );
    assert.equal(
        recorderSelectorFromInspector({
            ...base,
            strategy: '-ios predicate string',
            selector: 'name == "Pagar"',
        }),
        'iosPredicate=name == "Pagar"',
    );
});

test('performs the handshake and transfers the explicitly used strategy and selector unchanged', () => {
    const sent = [];
    const uses = [];
    const errors = [];
    let connected = 0;
    const connection = {
        serverUrl: 'http://127.0.0.1:4723',
        sessionId: 'session-1',
        capabilities: { platformName: 'Android' },
        platform: 'android',
    };
    const handshake = new EmbeddedInspectorHandshake(
        connection,
        value => sent.push(value),
        () => { connected += 1; },
        value => uses.push(value),
        value => errors.push(value),
    );

    handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.READY));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, EMBEDDED_INSPECTOR_TYPES.CONNECT);
    assert.deepEqual(sent[0].payload, connection);

    handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.CONNECTED, { sessionId: 'session-1' }));
    assert.equal(connected, 1);
    handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED, {
        strategy: 'xpath',
        selector: '//android.widget.Button',
        attributes: {},
    }));
    assert.equal(uses.length, 1);
    assert.deepEqual(uses[0], {
        strategy: 'xpath',
        selector: '//android.widget.Button',
        attributes: {},
    });
    assert.deepEqual(errors, []);

    assert.throws(
        () => handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.READY)),
        error => error.code === 'DUPLICATE_READY',
    );
});

test('rejects explicit element use before the connected acknowledgement', () => {
    const handshake = new EmbeddedInspectorHandshake(
        {
            serverUrl: 'http://127.0.0.1:4723',
            sessionId: 'session-1',
            capabilities: {},
            platform: 'android',
        },
        () => undefined,
        () => undefined,
        () => undefined,
        () => undefined,
    );
    assert.throws(
        () => handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED, {
            strategy: 'xpath',
            selector: '//button',
            attributes: {},
        })),
        error => error.code === 'INVALID_MESSAGE_ORDER',
    );
});

test('rejects ordinary Inspector selection without mutating recorder state', () => {
    let uses = 0;
    const handshake = new EmbeddedInspectorHandshake(
        {
            serverUrl: 'http://127.0.0.1:4723',
            sessionId: 'session-1',
            capabilities: {},
            platform: 'android',
        },
        () => undefined,
        () => undefined,
        () => { uses += 1; },
        () => undefined,
    );
    handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.READY));
    handshake.handle(message(EMBEDDED_INSPECTOR_TYPES.CONNECTED, { sessionId: 'session-1' }));

    assert.throws(
        () => handshake.handle(message('appium-inspector:element-selected', {
            strategy: 'xpath',
            selector: '//button',
            attributes: {},
        })),
        error => error.code === 'INVALID_MESSAGE_TYPE',
    );
    assert.equal(uses, 0);
});
