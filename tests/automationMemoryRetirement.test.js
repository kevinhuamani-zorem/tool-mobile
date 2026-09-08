const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutomationMemory, archiveLegacyAutomationMemory } = require('../dist/core/automation');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-retirement-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

test('archivar memoria conserva bytes y no toca recordings, golden ni otros archivos', t => {
    const root = fixture(t);
    const files = ['index.json', 'fragments.json', 'vocabulary.json', 'cases/old/v1/agent-response.json', 'agent-cache/author/result.json'];
    const bytes = Buffer.from([0, 1, 128, 255, 10]);
    for (const file of [...files, 'recordings/original.json', 'golden/approved.json', 'unrelated.txt']) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), bytes);
    }
    const memory = new AutomationMemory(root);
    const archived = archiveLegacyAutomationMemory(root);
    assert.equal(archived.length, 5);
    const batch = path.dirname(archived[0]);
    for (const file of files) {
        assert.deepEqual(fs.readFileSync(path.join(batch, file)), bytes);
        assert.equal(fs.existsSync(path.join(root, file)), false);
    }
    for (const file of ['recordings/original.json', 'golden/approved.json', 'unrelated.txt']) {
        assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes);
    }
    assert.deepEqual(archiveLegacyAutomationMemory(root), []);
    assert.deepEqual(memory.loadLearnedVocabulary(), {});
    assert.equal(memory.find('old'), null);
    assert.equal(memory.recallInteractions('payment', ['old']), undefined);
    assert.equal(memory.recallGap('payment', 'verification', 'old'), undefined);
});

test('una migración interrumpida restaura los archivos movidos y mantiene las lecturas deshabilitadas', t => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'index.json'), 'index bytes');
    fs.writeFileSync(path.join(root, 'fragments.json'), 'fragment bytes');
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
        if (from === path.join(root, 'fragments.json')) throw new Error('archive interrupted');
        return rename(from, to);
    };
    const memory = new AutomationMemory(root);
    try { assert.throws(() => archiveLegacyAutomationMemory(root), /archive interrupted/); }
    finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(path.join(root, 'index.json'), 'utf8'), 'index bytes');
    assert.equal(fs.readFileSync(path.join(root, 'fragments.json'), 'utf8'), 'fragment bytes');
    assert.equal(new AutomationMemory(root).find('any'), null);
    assert.equal(archiveLegacyAutomationMemory(root).length, 2, 'el siguiente arranque puede reintentar el archivo');
});

test('el archivo histórico no sigue un enlace a un directorio externo', t => {
    const root = fixture(t);
    const external = fixture(t);
    fs.writeFileSync(path.join(root, 'index.json'), 'legacy');
    fs.symlinkSync(external, path.join(root, 'legacy-v1'), 'dir');
    assert.throws(() => archiveLegacyAutomationMemory(root), /directorio local/);
    assert.equal(fs.readFileSync(path.join(root, 'index.json'), 'utf8'), 'legacy');
    assert.deepEqual(fs.readdirSync(external), []);
});

test('un runtime nuevo no crea memoria legacy al iniciar ni al consultar', t => {
    const root = path.join(fixture(t), 'absent');
    const memory = new AutomationMemory(root);
    assert.deepEqual(archiveLegacyAutomationMemory(root), []);
    assert.deepEqual(memory.fragments().interactions, []);
    assert.equal(fs.existsSync(root), false);
});
