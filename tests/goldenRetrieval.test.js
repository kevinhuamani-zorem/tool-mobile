const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { appliedPackageFixture, withGoldenRoot, expectedFile } = require('./helpers/goldenCaseFixture');
const { saveGoldenCaseFromPackage } = require('../dist/recorder/src/ipc/automation/goldenCase');
const { ApprovedGoldenStore, GoldenRetrievalIndex, GoldenReferenceSession, selectGoldenCoverage, writeGoldenRoleExamples,
    withGoldenRetrieval, AutomationHistoryStore, evaluateAutomationPackages, AgentRunStore, recordEvaluationPass } = require('../dist/core/automation');
const { projectPaths } = require('../dist/core/workspace');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };

function approve(f, id = 'SOURCE', pending = false) {
    f.scenario.recordingId = 'rec-' + id; f.scenario.request.caseId = 'TC-' + id;
    f.plan.recordingId = f.scenario.recordingId; f.response.recordingId = f.scenario.recordingId;
    const screen = { layer: 'screen', path: 'screenobjects/payment/result.screen.ts', content: 'class ResultScreen { async checkResult() {} }\nexport default new ResultScreen();\n' };
    const locators = { layer: 'locators', path: 'resources/locators/payment/result.locator.json', content: '{"resultAndroid": {"result": "~result"}}\n' };
    const login = { layer: 'steps', path: 'features/login.steps.ts', content: '// reused login implementation\n' };
    const helper = { layer: 'dependency', path: 'support/utils/ready.ts', content: '// precise helper\n' + '// assertion context\n'.repeat(2500) + 'export const waitReady = 1;\n' };
    const files = [...f.response.files, screen, locators, login, helper];
    f.plan.files.push({ path: screen.path, layer: 'screen', operation: 'create' }, { path: locators.path, layer: 'locators', operation: 'create' });
    for (const file of files) { const target = path.join(f.frameworkRoot, file.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.content); }
    for (const [name, value] of [['scenario.json', f.scenario], ['generation-plan.json', f.plan]]) write(path.join(f.packageDirectory, name), value);
    const recovery = { recordedTrace: f.response.actionTrace, pending: pending ? [{ message: 'verify association' }] : [],
        traceAssociations: [{ sequence: 1, status: 'preserved' }],
        relations: [
            { from: { path: f.featurePath }, to: { path: login.path, symbol: 'login' } },
            { from: { path: f.featurePath }, to: { path: f.stepsPath } },
            { from: { path: f.stepsPath }, to: { path: screen.path, symbol: 'checkResult' } },
            { from: { path: screen.path }, to: { path: helper.path, symbol: 'waitReady' } },
            { from: { path: screen.path }, to: { path: locators.path, symbol: 'result' } },
        ],
        files: files.map(file => ({ ...file, currentHash: hash(file.content), symbols: file === helper ? ['waitReady'] : [],
            association: f.plan.files.some(planned => planned.path === file.path) ? 'receipt' : 'relations' })),
    };
    write(path.join(f.packageDirectory, 'framework-recovery.json'), recovery);
    const history = new AutomationHistoryStore(f.packageDirectory); history.ensureRevision(f.scenario.recordingId, f.scenario.request.caseId);
    history.beginRevision({ recordingId: f.scenario.recordingId, caseId: f.scenario.request.caseId, source: 'framework-import' },
        [{ name: 'framework-recovery.json', content: JSON.stringify(recovery) }]);
    const saved = saveGoldenCaseFromPackage(f.deps(), { approved: true, source: 'recovery', executed: 'passed' });
    return { saved, helper, login, screen, locators };
}
function setup(t) {
    const f = appliedPackageFixture(t), root = withGoldenRoot(t, f);
    const previous = projectPaths.frameworkRoot; projectPaths.frameworkRoot = f.frameworkRoot;
    t.after(() => { projectPaths.frameworkRoot = previous; });
    const approved = approve(f);
    const scenario = { ...f.scenario, recordingId: 'rec-target', request: { ...f.scenario.request, caseId: 'TC-TARGET' } };
    const session = role => new GoldenReferenceSession({ root, frameworkRoot: f.frameworkRoot, scenario, role, pass: 1,
        integrationErrors: role === 'integration-reviewer' ? ['[integration-contract] checkResult relation'] : [] });
    return { f, root, scenario, session, ...approved };
}
const request = (saved, operation, extra = {}) => ({ id: 'detail', operation, goldenId: saved.manifest.goldenId, versionHash: saved.manifest.versionHash, ...extra });

test('incremental index rebuilds only changed approvals and never trusts a forged serialized index', t => {
    const { f, root, scenario, saved } = setup(t);
    const index = new GoldenRetrievalIndex(root);
    assert.equal(index.refresh().metrics.rebuiltCases, 1);
    const warm = index.refresh(); assert.equal(warm.metrics.rebuiltCases, 0); assert.equal(warm.metrics.reusedCases, 1);
    const f2 = appliedPackageFixture(t); approve(f2, 'SECOND');
    const updated = index.refresh(); assert.equal(updated.metrics.rebuiltCases, 1); assert.equal(updated.metrics.reusedCases, 1);
    new ApprovedGoldenStore(root).revoke(saved.manifest.goldenId, saved.manifest.versionHash, 'qa');
    assert.equal(index.search(scenario, f.frameworkRoot).candidates.length, 1);
    const cacheFile = path.join(root, 'retrieval-index.json');
    write(cacheFile, { records: [{ goldenId: saved.manifest.goldenId, metadata: { frameworkFiles: [] } }] });
    fs.appendFileSync(path.join(f.frameworkRoot, f.stepsPath), '// changed');
    assert.equal(new GoldenRetrievalIndex(root).search(scenario, f.frameworkRoot).candidates.length, 0);
    const code = 'const {GoldenRetrievalIndex}=require(process.argv[1]); console.log(new GoldenRetrievalIndex(process.argv[2]).search(JSON.parse(process.argv[3]),process.argv[4]).candidates.length)';
    assert.equal(execFileSync(process.execPath, ['-e', code, path.resolve(__dirname, '../dist/core/automation'), root, JSON.stringify(scenario), f.frameworkRoot], { encoding: 'utf8' }).trim(), '0');
});

test('verified snapshot cache detects same-size tampering even when mtime is restored', t => {
    const { root, saved } = setup(t); const store = new ApprovedGoldenStore(root);
    assert.equal(store.index().entries.length, 1);
    const file = expectedFile(saved, 'steps'), original = fs.readFileSync(file), stat = fs.statSync(file);
    const changed = Buffer.from(original); changed[0] = changed[0] === 65 ? 66 : 65;
    fs.writeFileSync(file, changed); fs.utimesSync(file, stat.atime, stat.mtime);
    assert.equal(store.index().entries.length, 0); assert.equal(store.index().issues.length, 1);
    fs.writeFileSync(file, original); assert.equal(store.index().entries.length, 1);
});

test('role expansions expose approved graphs and complete pertinent helpers, preserving scope and reservations', t => {
    const { f, root, saved, helper, login, session } = setup(t);
    const lorem = session('behavior-author'), zorem = session('interaction-author'), sumrak = session('integration-reviewer');
    assert.deepEqual(lorem.initialPayload().examples[0].files.map(file => file.layer), ['feature', 'steps']);
    assert.deepEqual(zorem.initialPayload().examples[0].files.map(file => file.layer), ['screen', 'locators']);
    assert.equal(zorem.request(request(saved, 'dependency', { path: helper.path })).data.content, helper.content);
    assert.throws(() => zorem.request(request(saved, 'dependency', { path: login.path })), /fuera/);
    assert.throws(() => zorem.request(request(saved, 'dependency', { path: '../secret' })), /fuera/);
    assert.throws(() => zorem.request(request(saved, 'example', { goldenId: 'golden-unknown' })), /fuera/);
    assert.throws(() => zorem.request(request(saved, 'catalog', { need: 'unrelated' })), /fuera/);
    const graph = zorem.request(request(saved, 'graph')).data;
    assert.equal(graph.verified, true); assert.ok(graph.edges.some(edge => edge.to.path === helper.path));
    assert.ok(!graph.nodes.some(node => node.path === login.path));
    assert.ok(graph.nodes.every(node => !('content' in node)));
    assert.equal(sumrak.request(request(saved, 'example')).data.files.length, 0);
    assert.throws(() => sumrak.request(request(saved, 'dependency', { path: helper.path })), /fuera/);
    saveGoldenCaseFromPackage(f.deps(), { approved: true, source: 'recovery', usage: 'evaluation' });
    assert.throws(() => zorem.request(request(saved, 'example')), /fuera/);
    assert.equal(zorem.request({ id: 'catalog', operation: 'catalog' }).data.total, 0);
    assert.ok(new ApprovedGoldenStore(root).index().entries.some(entry => entry.usage === 'evaluation'));
});

test('revocation and changed current dependencies invalidate an already prepared reference session', t => {
    const { f, root, saved, helper, session } = setup(t);
    const zorem = session('interaction-author');
    fs.appendFileSync(path.join(f.frameworkRoot, helper.path), '// QA changes');
    assert.throws(() => zorem.request(request(saved, 'graph')), /incompatible/);
    fs.writeFileSync(path.join(f.frameworkRoot, helper.path), helper.content);
    assert.equal(zorem.request(request(saved, 'example')).success, true);
    new ApprovedGoldenStore(root).revoke(saved.manifest.goldenId, saved.manifest.versionHash, 'qa');
    assert.throws(() => zorem.request(request(saved, 'example')), /retirada/);
});

test('large duplicate corpus stays discoverable through pagination without inflating initial code', t => {
    const { f, root, scenario } = setup(t);
    for (let i = 1; i < 23; i++) approve(appliedPackageFixture(t), 'VARIANT-' + i);
    const session = new GoldenReferenceSession({ root, frameworkRoot: f.frameworkRoot, scenario, role: 'behavior-author', pass: 1 });
    const payload = session.initialPayload(); assert.equal(payload.retrieval.candidateCases, 23);
    assert.equal(payload.examples.length, 1); assert.equal(payload.retrieval.patternGroups, 1);
    const first = session.request({ id: 'page-1', operation: 'variants', groupId: payload.retrieval.catalog[0].groupId }).data;
    assert.equal(first.references.length, 20); assert.equal(first.nextCursor, 20);
    const second = session.request({ id: 'page-2', operation: 'variants', groupId: payload.retrieval.catalog[0].groupId, cursor: first.nextCursor }).data;
    assert.equal(second.references.length, 3); assert.equal(second.nextCursor, null);
    const refs = [...first.references, ...second.references]; assert.equal(new Set(refs.map(ref => ref.goldenId)).size, 23);
    const last = refs.at(-1);
    assert.equal(session.request({ id: 'last', operation: 'example', goldenId: last.goldenId, versionHash: last.versionHash }).data.files.length, 2);
    t.diagnostic(JSON.stringify({ cases: 23, initialExamples: payload.examples.length, initialBytes: Buffer.byteLength(JSON.stringify(payload)),
        indexed: session.search.metrics.indexedCases, warmRebuilds: new GoldenRetrievalIndex(root).refresh().metrics.rebuiltCases }));
});

test('coverage selection scales to thousands and keeps every distinct task need without a magic count cap', () => {
    const candidates = Array.from({ length: 2000 }, (_, i) => ({ groupId: 'same-pattern', coverage: ['action:click', 'assertion:text'], score: 1, entry: { goldenId: String(i) } }));
    const selected = selectGoldenCoverage([...candidates, ...Array.from({ length: 30 }, (_, i) => ({ groupId: 'pattern-' + i, coverage: ['rule:' + i], score: 1, entry: { goldenId: 'distinct-' + i } }))]);
    assert.equal(selected.length, 31);
    assert.equal(new Set(selected.flatMap(candidate => candidate.coverage)).size, 32);
});

async function readResponse(stage, id) {
    for (let i = 0; i < 150; i++) {
        const file = path.join(stage, 'golden-response.json');
        if (fs.existsSync(file)) { const value = JSON.parse(fs.readFileSync(file)); if (value.requestId === id) return value; }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Recorder did not serve the reference during the provider invocation.');
}

test('file mailbox serves queries in the current invocation and preserves request/response metrics after failure', async t => {
    const { f, root, scenario, saved, helper } = setup(t);
    const pkg = path.join(f.root, 'target'), stage = path.join(pkg, 'zorem'); fs.mkdirSync(stage, { recursive: true });
    write(path.join(pkg, 'scenario.json'), scenario);
    const history = new AutomationHistoryStore(pkg); history.ensureRevision(scenario.recordingId, scenario.request.caseId);
    new AgentRunStore(pkg).start(scenario.recordingId, 'plan-target');
    const prepared = writeGoldenRoleExamples(pkg, stage, 'interaction-author', 1);
    const report = { role: 'interaction-author', attempt: 0, contextBytes: 100, invoked: true, execution: 'agent' };
    let calls = 0;
    await assert.rejects(withGoldenRetrieval(prepared, pkg, stage, report, async () => {
        calls++;
        write(path.join(stage, 'golden-request.json'), request(saved, 'dependency', { id: 'helper', path: helper.path }));
        const response = await readResponse(stage, 'helper');
        assert.equal(response.success, true); assert.equal(response.data.content, helper.content);
        write(path.join(stage, 'golden-request.json'), request(saved, 'dependency', { id: 'denied', path: '/outside' }));
        assert.equal((await readResponse(stage, 'denied')).success, false);
        throw new Error('provider stopped');
    }), /provider stopped/);
    assert.equal(calls, 1); assert.equal(report.goldenRetrieval.requests, 2); assert.equal(report.goldenRetrieval.rejected, 1);
    assert.ok(report.goldenRetrieval.responseBytes > Buffer.byteLength(helper.content));
    assert.ok(history.events().some(event => event.stage === 'golden-retrieval-response:interaction-author'));
    write(path.join(stage, 'golden-request.json'), request(saved, 'example', { id: 'after-close' }));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(JSON.parse(fs.readFileSync(path.join(stage, 'golden-response.json'))).requestId, 'denied');
    recordEvaluationPass(pkg, 1, false, { all: ['failed'], behavior: [], interaction: ['[selector-contract] failed'], integration: [] });
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'failed' },
        [{ name: 'layered-generation-run.json', content: JSON.stringify({ stages: [report], startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }) }]);
    const evaluation = evaluateAutomationPackages([pkg], root);
    assert.equal(evaluation.metrics.goldenRetrieval.requests, 2); assert.equal(evaluation.metrics.goldenRetrieval.rejected, 1);
    assert.equal(evaluation.metrics.autonomousFinal.numerator, 0);
    assert.equal(evaluation.attempts[0].invocations, 1);
});

test('redirected mailboxes cannot write outside the stage and do not interrupt generation', async t => {
    const { f, scenario } = setup(t);
    const pkg = path.join(f.root, 'target'), stage = path.join(pkg, 'lorem'); fs.mkdirSync(stage, { recursive: true }); write(path.join(pkg, 'scenario.json'), scenario);
    const prepared = writeGoldenRoleExamples(pkg, stage, 'behavior-author', 1);
    const report = { role: 'behavior-author', attempt: 0 };
    const external = path.join(f.root, 'external.json'); fs.writeFileSync(external, 'KEEP');
    const result = await withGoldenRetrieval(prepared, pkg, stage, report, async () => {
        fs.symlinkSync(external, path.join(stage, 'golden-response.json'));
        write(path.join(stage, 'golden-request.json'), { id: 'catalog', operation: 'catalog' });
        await new Promise(resolve => setTimeout(resolve, 150));
        return 'generated';
    });
    assert.equal(result, 'generated'); assert.equal(fs.readFileSync(external, 'utf8'), 'KEEP');
    assert.equal(report.goldenRetrieval.requests, 1);
});

test('regeneration receives its approved case despite owned edits, while evaluation excludes it', t => {
    const { f, root, saved, helper } = setup(t);
    fs.appendFileSync(path.join(f.frameworkRoot, f.featurePath), '\n# current QA change\n');
    const options = { root, frameworkRoot: f.frameworkRoot, scenario: f.scenario, role: 'behavior-author', pass: 1 };
    assert.equal(new GoldenReferenceSession(options).initialPayload().examples.length, 0);
    const session = new GoldenReferenceSession({ ...options, purpose: 'generation' });
    const payload = session.initialPayload();
    assert.equal(payload.purpose, 'generation');
    assert.equal(payload.examples.length, 1);
    assert.equal(payload.examples[0].relationship, 'same-case-approved');
    assert.equal(payload.examples[0].versionHash, saved.manifest.versionHash);
    assert.ok(payload.examples[0].files.every(file => !file.content.includes('current QA change')));
    assert.equal(payload.examples[0].automaticReuse, false);
    assert.equal(session.request(request(saved, 'example')).data.relationship, 'same-case-approved');
    fs.appendFileSync(path.join(f.frameworkRoot, helper.path), '// incompatible dependency');
    assert.throws(() => session.request(request(saved, 'example')), /incompatible/);
    assert.equal(new GoldenReferenceSession({ ...options, purpose: 'generation' }).initialPayload().examples.length, 0);
});

test('generation wiring includes its own golden and evaluation switch excludes it on both passes', t => {
    const { f, saved } = setup(t);
    const previous = process.env.RECORDER_GOLDEN_PURPOSE;
    t.after(() => { if (previous === undefined) delete process.env.RECORDER_GOLDEN_PURPOSE; else process.env.RECORDER_GOLDEN_PURPOSE = previous; });
    const stage = path.join(f.root, 'role'); fs.mkdirSync(stage);
    process.env.RECORDER_GOLDEN_PURPOSE = 'generation';
    for (const pass of [1, 2]) {
        const payload = JSON.parse(fs.readFileSync(writeGoldenRoleExamples(f.packageDirectory, stage, 'behavior-author', pass).file));
        assert.equal(payload.examples[0].versionHash, saved.manifest.versionHash);
        assert.equal(payload.examples[0].relationship, 'same-case-approved');
    }
    process.env.RECORDER_GOLDEN_PURPOSE = 'evaluation';
    for (const pass of [1, 2]) assert.equal(JSON.parse(fs.readFileSync(writeGoldenRoleExamples(f.packageDirectory, stage, 'behavior-author', pass).file)).examples.length, 0);
});

test('same-case references cannot bypass reservation, scope or revocation during regeneration', t => {
    const { f, root, saved } = setup(t);
    const options = { root, frameworkRoot: f.frameworkRoot, scenario: f.scenario, role: 'behavior-author', pass: 1, purpose: 'generation' };
    assert.equal(new GoldenReferenceSession({ ...options, scenario: { ...f.scenario, platform: 'ios' } }).initialPayload().examples.length, 0);
    const session = new GoldenReferenceSession(options);
    saveGoldenCaseFromPackage(f.deps(), { approved: true, source: 'recovery', usage: 'evaluation' });
    assert.throws(() => session.request(request(saved, 'example')), /fuera|retirada|incompatible/);
    assert.equal(new GoldenReferenceSession(options).initialPayload().examples.length, 0);
});
