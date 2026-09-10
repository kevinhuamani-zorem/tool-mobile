const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { ApprovedGoldenStore } = require('../dist/core/automation');
const { projectPaths } = require('../dist/core/workspace');
const { saveGoldenCaseFromPackage } = require('../dist/recorder/src/ipc/automation/goldenCase');
const { appliedPackageFixture, withGoldenRoot, expectedFile } = require('./helpers/goldenCaseFixture');

const channels = new Map();
const originalLoad = Module._load;
let registerAutomationHandlers;
try {
    Module._load = function (name, ...args) {
        if (name === 'electron') return { ipcMain: { handle: (channel, handler) => channels.set(channel, handler) } };
        return originalLoad.call(this, name, ...args);
    };
    ({ registerAutomationHandlers } = require('../dist/recorder/src/ipc/automationHandlers'));
} finally { Module._load = originalLoad; }

function fixture(t) {
    const f = appliedPackageFixture(t);
    const root = withGoldenRoot(t, f);
    // Rebuilding references must also work before a mobile session or generation exists.
    registerAutomationHandlers({ state: { sessionActive: false } });
    return { ...f, root, refresh: () => channels.get('rebuild-golden-index')(null) };
}
function seedFromCli() {
    const result = spawnSync(process.execPath, ['-e',
        'Object.assign(require(process.argv[1]).projectPaths, JSON.parse(process.argv[2])); require(process.argv[3]);',
        path.resolve(__dirname, '../dist/core/workspace'),
        JSON.stringify({ toolRoot: projectPaths.toolRoot, runtimeRoot: projectPaths.runtimeRoot }),
        path.resolve(__dirname, '../scripts/golden-seed-memory.js'),
    ], { encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout), stderr: result.stderr };
}
function tree(directory) {
    const result = {};
    if (!fs.existsSync(directory)) return result;
    for (const name of fs.readdirSync(directory).sort()) {
        const file = path.join(directory, name);
        if (fs.statSync(file).isDirectory()) {
            for (const [child, content] of Object.entries(tree(file))) result[name + '/' + child] = content;
        } else result[name] = fs.readFileSync(file).toString('base64');
    }
    return result;
}
function sourceState(f) {
    return { approved: tree(path.join(f.root, 'approved')), framework: tree(f.frameworkRoot),
        recording: tree(f.packageDirectory), legacy: tree(path.join(projectPaths.runtimeRoot, 'automation-memory')) };
}
function distinctCase(f, suffix) {
    f.scenario.recordingId += '-' + suffix;
    f.scenario.request.caseId = 'TC-' + suffix;
    f.plan.recordingId = f.scenario.recordingId;
    f.response.recordingId = f.scenario.recordingId;
    for (const [file, value] of [['scenario.json', f.scenario], ['generation-plan.json', f.plan], ['agent-response.json', f.response]]) {
        fs.writeFileSync(path.join(f.packageDirectory, file), JSON.stringify(value));
    }
}

test('refresh desde IPC equivale al CLI sin promocionar un borrador o la memoria legacy', async t => {
    const f = fixture(t);
    const legacy = path.join(projectPaths.runtimeRoot, 'automation-memory', 'legacy-v1');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'successful-cases.json'), JSON.stringify([{ recordingId: f.scenario.recordingId, qualityScore: 100 }]));
    const before = sourceState(f);
    const result = await f.refresh();
    const cli = seedFromCli();
    assert.equal(result.success, true);
    assert.equal(result.datasetRoot, f.root);
    assert.equal(result.index.entries.length, 0);
    assert.equal(result.retrieval.indexedCases, 0);
    assert.deepEqual(result.issues, []);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.report.approvedCases, 0);
    assert.equal(cli.report.retrieval.indexedCases, 0);
    assert.equal(cli.report.fingerprint, result.index.fingerprint);
    assert.deepEqual(cli.report.issues, result.issues);
    assert.deepEqual(sourceState(f), before, 'only derived indexes may be written');
});

test('refresh reconstruye ambas proyecciones y conserva reservas, retiradas y aprobaciones exactas', async t => {
    const f = fixture(t);
    const reference = saveGoldenCaseFromPackage(f.deps(), { approved: true, executed: 'not-run' });
    const reserved = appliedPackageFixture(t); distinctCase(reserved, '2');
    saveGoldenCaseFromPackage(reserved.deps(), { approved: true, usage: 'evaluation', executed: 'passed' });
    const withdrawn = appliedPackageFixture(t); distinctCase(withdrawn, '3');
    const withdrawnCase = saveGoldenCaseFromPackage(withdrawn.deps(), { approved: true });
    new ApprovedGoldenStore(f.root).revoke(withdrawnCase.manifest.goldenId, withdrawnCase.manifest.versionHash, 'QA fixture');
    const before = sourceState(f);
    fs.writeFileSync(path.join(f.root, 'approved-index.json'), '{"entries":[{"goldenId":"unapproved"}]}');
    fs.writeFileSync(path.join(f.root, 'retrieval-index.json'), '{"records":[{"goldenId":"unapproved"}]}');
    const result = await f.refresh();
    assert.equal(result.success, true);
    assert.equal(result.index.entries.length, 2);
    assert.equal(result.index.versions, 3);
    assert.equal(result.retrieval.indexedCases, 1, 'evaluation cases are never references');
    assert.deepEqual(result.issues, []);
    const retrieval = JSON.parse(fs.readFileSync(path.join(f.root, 'retrieval-index.json')));
    assert.deepEqual(retrieval.records.map(item => item.goldenId), [reference.manifest.goldenId]);
    const cli = seedFromCli();
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.report.approvedCases, result.index.entries.length);
    assert.equal(cli.report.versions, result.index.versions);
    assert.equal(cli.report.retrieval.indexedCases, result.retrieval.indexedCases);
    assert.equal(cli.report.fingerprint, result.index.fingerprint);
    assert.deepEqual(sourceState(f), before, 'refresh does not reapprove, restore, execute, export or change history');
});

test('refresh excluye versiones alteradas y entrega los mismos problemas del CLI una sola vez', async t => {
    const f = fixture(t);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true });
    fs.appendFileSync(expectedFile(saved, 'feature'), '\n# Changed after QA approval\n');
    const before = sourceState(f);
    const result = await f.refresh();
    const cli = seedFromCli();
    assert.equal(result.success, true, 'the refresh completes with reported integrity issues');
    assert.equal(result.index.entries.length, 0);
    assert.equal(result.retrieval.indexedCases, 0);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /alterado/);
    assert.equal(cli.status, 1);
    assert.deepEqual([...new Set(cli.report.issues)], result.issues);
    assert.deepEqual(sourceState(f), before, 'bad evidence remains intact and excluded');
});

test('refresh comunica problemas de lectura de referencias aunque la publicación sea íntegra', async t => {
    const f = fixture(t);
    // An older producer can publish a byte-consistent context that today's reader cannot interpret.
    f.scenario.actions = {};
    fs.writeFileSync(path.join(f.packageDirectory, 'scenario.json'), JSON.stringify(f.scenario));
    saveGoldenCaseFromPackage(f.deps(), { approved: true });
    const before = sourceState(f);
    const result = await f.refresh();
    const cli = seedFromCli();
    assert.equal(result.success, true);
    assert.equal(result.index.entries.length, 1);
    assert.deepEqual(result.index.issues, []);
    assert.equal(result.retrieval.indexedCases, 0);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /referencia no disponible/);
    assert.equal(cli.status, 1);
    assert.deepEqual([...new Set(cli.report.issues)], result.issues);
    assert.deepEqual(sourceState(f), before);
});

test('refresh devuelve un error accionable si falta el repositorio y no crea un dataset alternativo', async t => {
    const f = fixture(t);
    const missing = path.join(projectPaths.runtimeRoot, 'missing-recorder');
    fs.mkdirSync(path.join(projectPaths.runtimeRoot, 'config'), { recursive: true });
    fs.writeFileSync(path.join(projectPaths.runtimeRoot, 'config', 'golden-repository.json'),
        JSON.stringify({ schemaVersion: 1, repositoryRoot: missing }));
    const before = sourceState(f);
    const result = await f.refresh();
    assert.equal(result.success, false);
    assert.match(result.error, /Selecciona el repositorio/);
    assert.equal(fs.existsSync(missing), false);
    assert.equal(fs.existsSync(path.join(projectPaths.runtimeRoot, 'golden')), false);
    assert.deepEqual(sourceState(f), before);
});
