'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { runHarnessControls, main } = require('../scripts/harness-controls');
const { buildControlFixture, mutationsFor, CONTROL_DEFINITIONS, hash } = require('../scripts/lib/harnessControlFixtures');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { projectPaths, workspaceConfiguration } = require('../dist/core/workspace');
const CLI = path.join(__dirname, '../scripts/harness-controls.js');

function temporary(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-controls-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function execute(args = []) {
    const child = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    assert.equal(child.error, undefined);
    return { status: child.status, report: JSON.parse(child.stdout), stderr: child.stderr };
}
function sourceFingerprint(root) {
    const files = [];
    const visit = folder => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name === '.git') continue;
            const name = path.join(folder, entry.name), relative = path.relative(root, name);
            if (entry.isDirectory()) visit(name);
            else files.push([relative, entry.isSymbolicLink() ? `link:${fs.readlinkSync(name)}` : hash(fs.readFileSync(name))]);
        }
    };
    visit(root);
    return hash(JSON.stringify(files));
}
function repository(t) {
    const root = temporary(t), source = path.join(root, 'framework');
    for (const dir of ['features/yape-features', 'features/yape-steps-definitions', 'resources/locators', 'screenobjects', 'support']) {
        fs.mkdirSync(path.join(source, dir), { recursive: true });
        fs.writeFileSync(path.join(source, dir, '.gitkeep'), '');
    }
    fs.writeFileSync(path.join(source, 'package.json'), '{"name":"control-pinned-source","private":true}\n');
    const git = args => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    git(['init']); git(['add', '.']);
    git(['-c', 'user.name=Harness', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic pinned control fixture']);
    const commit = git(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(source, 'uncommitted-qa-note.txt'), 'QA work must remain untouched.');
    return { root, source, commit, git };
}

test('CLI runs the production validator: fixed positives plus all exact-code controls without LLM/device', () => {
    const { status, report } = execute();
    assert.equal(status, 0, JSON.stringify(report));
    assert.equal(report.falsePositives, 0);
    assert.equal(report.falseNegatives, 0);
    assert.equal(report.truePositives, 10);
    assert.equal(report.measured, 13);
    assert.equal(report.notEvaluated, 0);
    assert.deepEqual(report.unsupported, []);
    assert.equal(report.coverage.execution.denominator, 10);
    assert.equal(report.coverage.execution.numerator, 10);
    assert.equal(report.provenance.agentExecuted, false);
    assert.equal(report.provenance.deviceExecuted, false);
    assert.equal(report.provenance.qaReviewed, false);
    assert.equal(report.corpus.caseIds.length, 3);
    for (const fixture of report.fixtures) {
        assert.equal(fixture.baselineExpectedValid, true);
        assert.equal(fixture.baselineObserved, 'valid');
        assert.deepEqual(fixture.generatedLayers, ['feature', 'steps', 'screen', 'locators']);
    }
    for (const sample of report.samples.filter(row => row.expected === 'invalid')) {
        assert.equal(sample.observed, 'invalid');
        assert.ok(sample.actualCodes.includes(sample.expectedCode), JSON.stringify(sample));
    }
    assert.equal(report.samples.find(row => row.id === 'generated-contract:mechanical-gherkin').expectedCode, 'imperative-gherkin');
    assert.equal(report.samples.find(row => row.id === 'date-range:date-range-weakened').expectedCode, 'acceptance-date-range');
});

test('positive rejection is a false positive, never relabelled into a successful invalid baseline', () => {
    const report = runHarnessControls({}, { createValidator(fixture) {
        const validator = new AutomationResponseValidator(undefined, fixture.catalog);
        let calls = 0;
        return { validate(...args) {
            const result = validator.validate(...args);
            if (fixture.id === 'generated-contract' && calls++ === 0) return { ...result, valid: false, errors: [{ code: 'false-positive' }] };
            return result;
        } };
    } });
    assert.equal(report.exitCode, 1);
    assert.equal(report.falsePositives, 1);
    assert.equal(report.samples.find(row => row.id === 'generated-contract:baseline').expected, 'valid');
    assert.equal(report.samples.find(row => row.id === 'generated-contract:baseline').observed, 'invalid');
    assert.equal(report.samples.filter(row => row.id.startsWith('generated-contract:') && row.expected === 'invalid').every(row => row.observed === 'not-evaluated'), true);
});

test('invalid for another error is a missed control, not a detected TypeLocator defect', () => {
    const report = runHarnessControls({}, { createValidator(fixture) {
        const validator = new AutomationResponseValidator(undefined, fixture.catalog);
        return { validate(...args) {
            const result = validator.validate(...args);
            return { ...result, errors: result.errors.map(error => error.code === 'locator-type-mismatch' ? { ...error, code: 'different-error' } : error) };
        } };
    } });
    assert.equal(report.exitCode, 1);
    assert.equal(report.falseNegatives, 1);
    const control = report.samples.find(row => row.id === 'generated-contract:locator-type');
    assert.equal(control.observed, 'invalid');
    assert.ok(!control.actualCodes.includes(control.expectedCode));
    assert.equal(report.coverage.detection.numerator, 9);
    assert.equal(report.coverage.detection.denominator, 10);
});

test('missing mutation support stays in scheduled denominators and exits 2', () => {
    const report = runHarnessControls({}, { mutationsFor: fixture => mutationsFor(fixture).filter(row => row.id !== 'locator-type') });
    assert.equal(report.exitCode, 2);
    assert.equal(report.falseNegatives, 0);
    assert.equal(report.notEvaluated, 1);
    assert.equal(report.unsupported[0].controlId, 'locator-type');
    assert.equal(report.coverage.execution.numerator, 9);
    assert.equal(report.coverage.execution.denominator, 10);
    assert.equal(report.coverage.detection.notEvaluated, 1);
});

test('fixtures are deterministic, retain inputs and restore caller workspace configuration', () => {
    const paths = { ...projectPaths }, configuration = { ...workspaceConfiguration }, before = [], references = [];
    const deps = { buildFixture(id) {
        const fixture = buildControlFixture(id);
        references.push(fixture); before.push(hash(JSON.stringify(fixture.response)));
        return fixture;
    } };
    const first = runHarnessControls({}, deps), second = runHarnessControls();
    assert.equal(first.exitCode, 0);
    assert.deepEqual(first.fixtures.map(row => row.baselineSha256), second.fixtures.map(row => row.baselineSha256));
    assert.deepEqual(references.map(fixture => hash(JSON.stringify(fixture.response))), before);
    assert.deepEqual(projectPaths, paths);
    assert.deepEqual(workspaceConfiguration, configuration);
});

test('pinned source checkout and QA uncommitted files are unchanged by a full CLI run', t => {
    const { source, commit, git, root } = repository(t);
    const before = sourceFingerprint(source), statusBefore = git(['status', '--porcelain']);
    const output = path.join(root, 'report.json');
    const result = execute(['--framework', source, '--framework-commit', commit, '--output', output]);
    assert.equal(result.status, 0, JSON.stringify(result.report));
    assert.equal(result.report.framework.commit, commit);
    assert.equal(result.report.framework.source, 'isolated-git-archive');
    assert.equal(result.report.framework.archiveSha256.length, 64);
    assert.equal(sourceFingerprint(source), before);
    assert.equal(git(['status', '--porcelain']), statusBefore);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).exitCode, 0);
});

test('framework branches, missing companion options and linked report destinations are not evaluable', t => {
    const { source, commit, root } = repository(t);
    for (const args of [['--framework', source], ['--framework', source, '--framework-commit', 'HEAD']]) {
        const result = execute(args);
        assert.equal(result.status, 2);
        assert.equal(result.report.measured, 0);
        assert.equal(result.report.notEvaluated, 13);
    }
    const link = path.join(root, 'linked-output');
    fs.symlinkSync(source, link, 'dir');
    const before = sourceFingerprint(source);
    const result = execute(['--framework', source, '--framework-commit', commit, '--output', path.join(link, 'report.json')]);
    assert.equal(result.status, 2);
    assert.equal(sourceFingerprint(source), before);
});

test('a committed redirect cannot turn fixture writes into modifications of another checkout', t => {
    const { source, git, root } = repository(t);
    const protectedRoot = path.join(root, 'qa-protected'); fs.mkdirSync(protectedRoot);
    fs.writeFileSync(path.join(protectedRoot, 'sentinel'), 'QA');
    fs.symlinkSync(protectedRoot, path.join(source, 'redirect'), 'dir');
    git(['add', 'redirect']);
    git(['-c', 'user.name=Harness', '-c', 'user.email=harness@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Unsupported redirect']);
    const before = sourceFingerprint(protectedRoot);
    const result = execute(['--framework', source, '--framework-commit', git(['rev-parse', 'HEAD'])]);
    assert.equal(result.status, 2);
    assert.equal(result.report.measured, 0);
    assert.equal(sourceFingerprint(protectedRoot), before);
});

test('a no-op mutation cannot falsely satisfy a fixed negative control', () => {
    const report = runHarnessControls({}, { mutationsFor(fixture) {
        const mutations = mutationsFor(fixture);
        const mutation = mutations.find(row => row.id === 'locator-type');
        if (mutation) mutation.response = JSON.parse(JSON.stringify(fixture.response));
        return mutations;
    } });
    assert.equal(report.exitCode, 2);
    assert.equal(report.samples.find(row => row.id === 'generated-contract:locator-type').observed, 'not-evaluated');
    assert.match(report.unsupported[0].reason, /did not change/);
});

test('the family map reports only proposed matching controls, never claims corpus scenarios ran', () => {
    const report = runHarnessControls();
    assert.equal(report.coverage.families.every(row => row.mappingOnly && !row.corpusScenarioExecuted), true);
    assert.equal(CONTROL_DEFINITIONS.length, 10);
    assert.deepEqual(report.coverage.families.find(row => row.caseId === 'yapeo-recipient').controlIds.includes('trace-getter-changed'), true);
    assert.throws(() => main(['--unknown']), /Invalid or repeated option/);
});


test('report output preserves existing evidence without rerunning or overwriting it', t => {
    const root = temporary(t), output = path.join(root, 'existing-report.json');
    fs.writeFileSync(output, '{"preserve":"prior evidence"}\n');
    const before = fs.readFileSync(output, 'utf8');
    const result = execute(['--output', output]);
    assert.equal(result.status, 2);
    assert.match(result.report.issues[0].message, /already exists/);
    assert.equal(fs.readFileSync(output, 'utf8'), before);
});


test('unimplemented corpus labels stay visibly unmapped without inventing evaluated samples', t => {
    const root = temporary(t), corpus = path.join(root, 'corpus');
    fs.cpSync(path.join(__dirname, 'fixtures/agent-harness'), corpus, { recursive: true });
    const manifestFile = path.join(corpus, 'corpus.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const row = manifest.cases.find(item => item.id === 'sales-empty'), file = path.join(corpus, row.labels.path);
    const labels = JSON.parse(fs.readFileSync(file, 'utf8'));
    labels.expectedNegatives.push({ id: 'unsupported-new-control', expectedRuleCodes: ['new-rule'], reviewed: false });
    fs.writeFileSync(file, JSON.stringify(labels));
    row.labels.sha256 = hash(fs.readFileSync(file));
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    const report = runHarnessControls({ corpus: manifestFile });
    assert.equal(report.exitCode, 2);
    assert.equal(report.truePositives, 10);
    assert.equal(report.measured, 13);
    assert.equal(report.coverage.proposedLabels.unmapped, 1);
    assert.equal(report.coverage.proposedLabels.items.find(item => item.labelId === 'unsupported-new-control').mapped, false);
});
