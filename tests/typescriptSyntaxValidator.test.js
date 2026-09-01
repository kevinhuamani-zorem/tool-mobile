const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateTypeScriptSyntax,
} = require('../dist/core/validation');

test('la fachada del validador sintáctico conserva ubicación precisa', () => {
    const diagnostics = validateTypeScriptSyntax(
        'steps/example.steps.ts',
        'export const broken = ;'
    );

    assert.equal(diagnostics.length > 0, true);
    assert.equal(diagnostics[0].line, 1);
    assert.equal(typeof diagnostics[0].column, 'number');
    assert.equal(diagnostics[0].message.length > 0, true);
});

test('el validador sintáctico acepta TypeScript válido', () => {
    assert.deepEqual(
        validateTypeScriptSyntax('screen/example.screen.ts', 'export const value = 1;'),
        []
    );
});
