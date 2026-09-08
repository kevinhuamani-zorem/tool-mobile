const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveGoldenRepository, saveGoldenRepository } = require('../dist/core/workspace');
const { goldenDatasetRoot } = require('../dist/core/automation');
const { git, recorderRepository } = require('./helpers/goldenRepository');

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'golden-repository-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = recorderRepository(path.join(root, 'recorder'));
    return { root, repo, paths: { toolRoot: path.join(root, 'app'), runtimeRoot: path.join(root, 'userData') } };
}

test('development and packaged runtime origin resolve the same versioned tests/golden', t => {
    const { root, repo, paths } = fixture(t);
    assert.equal(goldenDatasetRoot({ ...paths, toolRoot: repo }), path.join(repo, 'tests/golden'));
    assert.equal(goldenDatasetRoot({ ...paths, runtimeRoot: repo }), path.join(repo, 'tests/golden'));
    assert.throws(() => goldenDatasetRoot(paths), /Selecciona el repositorio/);
    assert.equal(fs.existsSync(path.join(root, 'userData')), false, 'reads never create a runtime dataset');
});

test('selected repository persists, overrides auto-detection, and never silently falls back when missing', t => {
    const { root, repo, paths } = fixture(t);
    const selection = saveGoldenRepository(repo, paths);
    assert.equal(selection.datasetRoot, path.join(repo, 'tests/golden'));
    assert.deepEqual(resolveGoldenRepository(paths), selection);
    const other = recorderRepository(path.join(root, 'other'));
    assert.equal(goldenDatasetRoot({ ...paths, toolRoot: other }), selection.datasetRoot);
    fs.renameSync(repo, `${repo}-moved`);
    assert.throws(() => goldenDatasetRoot({ ...paths, toolRoot: other }), /Selecciona el repositorio/);
    assert.equal(fs.existsSync(path.join(paths.runtimeRoot, 'runtime/golden')), false);
    assert.equal(saveGoldenRepository(other, paths).datasetRoot, path.join(other, 'tests/golden'));
});

test('invalid selection preserves the saved repository; arbitrary folders and nested framework Git roots are rejected', t => {
    const { root, repo, paths } = fixture(t);
    const saved = saveGoldenRepository(repo, paths);
    const nested = path.join(repo, 'tools/fake-recorder');
    fs.mkdirSync(path.join(nested, 'tests'), { recursive: true });
    fs.copyFileSync(path.join(repo, 'package.json'), path.join(nested, 'package.json'));
    for (const candidate of [root, nested, path.join(repo, 'tests/golden'), 'relative/path'])
        assert.throws(() => saveGoldenRepository(candidate, paths), /repositorio Git del recorder/);
    assert.deepEqual(resolveGoldenRepository(paths), saved);
    assert.equal(fs.readdirSync(path.join(paths.runtimeRoot, 'config')).length, 1, 'no leftover selection temporary files');
    fs.writeFileSync(path.join(paths.runtimeRoot, 'config/golden-repository.json'), '{');
    assert.throws(() => resolveGoldenRepository({ ...paths, toolRoot: repo }), /No se pudo leer/);
});

test('Git worktrees are supported and selection settings stay local', t => {
    const { root, repo, paths } = fixture(t);
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Recorder fixture');
    const worktree = path.join(root, 'worktree'); git(repo, 'worktree', 'add', '-q', '-b', 'qa', worktree);
    assert.equal(fs.statSync(path.join(worktree, '.git')).isFile(), true);
    assert.equal(saveGoldenRepository(worktree, paths).datasetRoot, path.join(worktree, 'tests/golden'));
    saveGoldenRepository(worktree, { ...paths, runtimeRoot: repo });
    assert.equal(git(repo, 'check-ignore', 'config/golden-repository.json'), 'config/golden-repository.json');
});

test('symlinks cannot redirect versioned golden writes outside the selected repository', t => {
    const { root, repo, paths } = fixture(t);
    const dataset = path.join(repo, 'tests/golden');
    fs.rmSync(dataset, { recursive: true });
    fs.symlinkSync(path.join(root, 'missing-outside'), dataset);
    assert.throws(() => saveGoldenRepository(repo, paths), /Selecciona el repositorio/);
    assert.equal(fs.existsSync(path.join(root, 'missing-outside')), false);
    fs.unlinkSync(dataset); fs.rmSync(path.join(repo, 'tests'), { recursive: true });
    const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(repo, 'tests'));
    assert.throws(() => saveGoldenRepository(repo, paths), /Selecciona el repositorio/);
});
