const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeForAi } = require('../dist/ai/secretSanitizer');

test('oculta credenciales y datos personales antes de enviarlos a IA', () => {
    const result = sanitizeForAi({
        password: 'super-secret',
        accessKey: 'abc123',
        description: 'correo qa.user@example.com teléfono 999888777',
        nested: { authorization: 'Bearer token-value' }
    });
    const serialized = JSON.stringify(result);

    assert.doesNotMatch(serialized, /super-secret|abc123|qa\.user@example\.com|999888777|token-value/);
    assert.match(serialized, /\[REDACTED\]/);
});
