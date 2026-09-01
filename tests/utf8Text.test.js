const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    readJsonUtf8,
    readUtf8File,
    utf8TextProblems,
    writeJsonUtf8,
} = require('../dist/core/shared');

test('JSON UTF-8 conserva tildes y normaliza Unicode a NFC sin BOM', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utf8-json-'));
    const file = path.join(root, 'movements.locator.json');
    const decomposed = 'U\u0301ltimos 30 di\u0301as';
    writeJsonUtf8(file, {
        movementsAndroid: {
            filterLast30Days: `new UiSelector().text("${decomposed}")`,
            informationButton: 'Más información',
        },
    });
    const bytes = fs.readFileSync(file);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    const text = readUtf8File(file);
    assert.equal(text, text.normalize('NFC'));
    const document = readJsonUtf8(file);
    assert.equal(
        document.movementsAndroid.filterLast30Days,
        'new UiSelector().text("Últimos 30 días")'
    );
    assert.equal(document.movementsAndroid.informationButton, 'Más información');
    fs.rmSync(root, { recursive: true, force: true });
});

test('lector estricto rechaza bytes que no son UTF-8', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-utf8-'));
    const file = path.join(root, 'invalid.json');
    fs.writeFileSync(file, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
    assert.throws(() => readUtf8File(file), /UTF-8 válido/);
    fs.rmSync(root, { recursive: true, force: true });
});

test('diagnóstico distingue mojibake, reemplazo y texto no NFC', () => {
    assert.deepEqual(
        utf8TextProblems('BotÃ³n').map(problem => problem.code),
        ['probable-mojibake']
    );
    assert.deepEqual(
        utf8TextProblems('Bot�n').map(problem => problem.code),
        ['replacement-character']
    );
    assert.deepEqual(
        utf8TextProblems('di\u0301as').map(problem => problem.code),
        ['non-nfc']
    );
    assert.deepEqual(utf8TextProblems('Botón y últimos días'), []);
});

