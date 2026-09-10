const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { prepareHarnessBaseline, verifyHarnessBaseline, engineCheck, recorderIdentity } = require('../scripts/harness-baseline');
const { sha256 } = require('../scripts/lib/harnessCorpus');
const corpusSource = path.resolve(__dirname, 'fixtures/agent-harness');
const git = (root, ...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-harness-baseline-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    function repo(name) {
        const dir = path.join(root, name); fs.mkdirSync(dir);
        git(dir, 'init', '--quiet'); git(dir, 'config', 'user.name', 'Harness Test'); git(dir, 'config', 'user.email', 'harness@example.invalid');
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, engines: { node: '>=24.0.0', npm: '>=11.0.0' } }));
        fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ name, lockfileVersion: 3 }));
        fs.mkdirSync(path.join(dir, 'core')); fs.writeFileSync(path.join(dir, 'core/source.js'), 'committed source');
        git(dir, 'add', '.'); git(dir, 'commit', '--quiet', '-m', 'Pinned input');
        return dir;
    }
    const framework = repo('target'), recorder = repo('recorder');
    fs.mkdirSync(path.join(recorder, 'dist/core'), { recursive: true }); fs.writeFileSync(path.join(recorder, 'dist/core/test.js'), 'built');
    const corpus = path.join(root, 'input-corpus'); fs.cpSync(corpusSource, corpus, { recursive: true });
    return { root, framework, recorder, corpus: path.join(corpus, 'corpus.json'), frameworkCommit: git(framework, 'rev-parse', 'HEAD'), directory: path.join(root, 'baseline') };
}
const runtime = { runtime: { node: 'v22.18.0', npm: '10.9.3' } };

test('baseline freezes committed inputs, records dirty sources and does not imply execution or QA approval', t => {
    const options = fixture(t);
    const originalLock = fs.readFileSync(path.join(options.framework, 'package-lock.json'));
    fs.writeFileSync(path.join(options.framework, 'package.json'), JSON.stringify({ engines: { node: '>=1.0.0', npm: '>=1.0.0' } }));
    fs.writeFileSync(path.join(options.framework, 'qa-change.txt'), 'keep QA changes');
    const beforeStatus = git(options.framework, 'status', '--porcelain');
    const manifest = prepareHarnessBaseline(options, runtime);
    assert.equal(manifest.framework.commit, options.frameworkCommit);
    assert.equal(manifest.framework.lockfileSha256, sha256(originalLock));
    assert.equal(manifest.framework.engines.node.required, '>=24.0.0');
    assert.equal(manifest.framework.engines.node.status, 'incompatible');
    assert.equal(manifest.framework.engines.npm.status, 'incompatible');
    assert.equal(manifest.framework.sourceWorkingChangesIncluded, false);
    assert.match(manifest.framework.sourceWorktree.status, /qa-change.txt/);
    assert.equal(fs.existsSync(path.join(options.directory, 'framework/qa-change.txt')), false);
    assert.equal(fs.existsSync(path.join(options.directory, 'framework/node_modules')), false);
    assert.equal(manifest.readiness.pilot, 'not-ready');
    assert.equal(manifest.framework.dependencies.installExecuted, false);
    assert.equal(manifest.execution.providerInvoked, false);
    assert.equal(manifest.execution.functionalExecution, 'not-evaluated');
    assert.equal(manifest.execution.approval, 'not-granted');
    assert.equal(manifest.policies.automaticPassLimit, 2);
    assert.ok(manifest.corpus.cases.every(row => row.synthetic && row.qaReview.status === 'pending' && !row.pilotEligible));
    assert.ok(manifest.corpus.files.some(row => row.path.endsWith('harness-users.yml')));
    assert.equal(git(options.framework, 'status', '--porcelain'), beforeStatus);
    assert.equal(fs.readFileSync(path.join(options.framework, 'qa-change.txt'), 'utf8'), 'keep QA changes');
    assert.deepEqual(verifyHarnessBaseline(options.directory), manifest);
    const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/harness-baseline.js'), '--verify', options.directory], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).readiness.pilot, 'not-ready');
});

test('source hash detects uncommitted generation changes without attributing them to the same commit', t => {
    const options = fixture(t), before = recorderIdentity(options.recorder);
    fs.writeFileSync(path.join(options.recorder, 'core/source.js'), 'candidate source');
    const after = recorderIdentity(options.recorder);
    assert.equal(after.commit, before.commit);
    assert.notEqual(after.source.sha256, before.source.sha256);
    assert.equal(after.builtCore.sha256, before.builtCore.sha256);
    assert.match(after.workingTree, /core\/source.js/);
});

test('preparation refuses moving refs, unavailable commits, existing evidence and tracked symlinks', t => {
    const options = fixture(t);
    assert.throws(() => prepareHarnessBaseline({ ...options, frameworkCommit: 'main' }, runtime), /hash completo/);
    assert.throws(() => prepareHarnessBaseline({ ...options, frameworkCommit: 'f'.repeat(40) }, runtime));
    assert.equal(fs.existsSync(options.directory), false);
    assert.throws(() => prepareHarnessBaseline({ ...options, directory: path.join(options.framework, 'baseline') }, runtime), /fuera de los checkouts/);
    const sourceAlias = path.join(options.root, 'alias');
    fs.symlinkSync(options.recorder, sourceAlias);
    assert.throws(() => prepareHarnessBaseline({ ...options, directory: path.join(sourceAlias, 'nested/baseline') }, runtime), /fuera de los checkouts/);
    fs.symlinkSync('package.json', path.join(options.framework, 'linked.json'));
    git(options.framework, 'add', 'linked.json'); git(options.framework, 'commit', '--quiet', '-m', 'linked');
    assert.throws(() => prepareHarnessBaseline({ ...options, frameworkCommit: git(options.framework, 'rev-parse', 'HEAD') }, runtime), /enlaces/);
    assert.equal(fs.existsSync(options.directory), false);
    const manifest = prepareHarnessBaseline(options, runtime);
    assert.throws(() => prepareHarnessBaseline(options, runtime), /directorio nuevo/);
    assert.deepEqual(verifyHarnessBaseline(options.directory), manifest);
});

test('verification refuses changed metadata, frozen corpus, aliases and framework', t => {
    const options = fixture(t); prepareHarnessBaseline(options, runtime);
    const manifestPath = path.join(options.directory, 'manifest.json');
    const manifestBytes = fs.readFileSync(manifestPath);
    fs.appendFileSync(manifestPath, ' ');
    assert.throws(() => verifyHarnessBaseline(options.directory), /manifiesto/);
    fs.writeFileSync(manifestPath, manifestBytes);
    const corpus = JSON.parse(fs.readFileSync(path.join(options.directory, 'corpus/corpus.json')));
    for (const reference of [corpus.cases[0].scenario, corpus.testData]) {
        const file = path.join(options.directory, 'corpus', reference.path), bytes = fs.readFileSync(file);
        fs.appendFileSync(file, ' ');
        assert.throws(() => verifyHarnessBaseline(options.directory), /Hash/);
        fs.writeFileSync(file, bytes);
    }
    fs.writeFileSync(path.join(options.directory, 'framework/core/source.js'), 'modified');
    assert.throws(() => verifyHarnessBaseline(options.directory), /framework fijado/);
});

test('verification rejects linked snapshot roots even when target bytes match', t => {
    const options = fixture(t); prepareHarnessBaseline(options, runtime);
    for (const name of ['framework', 'corpus']) {
        const original = path.join(options.directory, name), moved = path.join(options.root, `external-${name}`);
        fs.renameSync(original, moved); fs.symlinkSync(moved, original);
        assert.throws(() => verifyHarnessBaseline(options.directory), /sin enlaces/);
        fs.unlinkSync(original); fs.renameSync(moved, original);
    }
});

test('runtime compatibility is explicit and unknown semver ranges are never considered compatible', () => {
    assert.equal(engineCheck('v24.1.0', '>=24.0.0').status, 'compatible');
    assert.equal(engineCheck('11.0.0', '>=11.0.0').status, 'compatible');
    assert.equal(engineCheck('v22.18.0', '>=24.0.0').status, 'incompatible');
    assert.equal(engineCheck('v24.0.0-rc.1', '>=24.0.0').status, 'unverified');
    assert.equal(engineCheck('v24.1.0', '^24').status, 'unverified');
    assert.equal(engineCheck('v24.1.0', undefined).status, 'unverified');
});
