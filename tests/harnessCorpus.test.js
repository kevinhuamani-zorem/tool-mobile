'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHarnessCorpus, sha256 } = require('../scripts/lib/harnessCorpus');
const { recordedLocator } = require('../dist/core/indexing');
const { parseTextAssertion } = require('../dist/core/automation/contracts');

const corpusRoot = path.join(__dirname, 'fixtures', 'agent-harness');
const corpusFile = path.join(corpusRoot, 'corpus.json');
const load = () => readHarnessCorpus(corpusFile);
function copyCorpus(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-harness-corpus-'));
    fs.cpSync(corpusRoot, root, { recursive: true });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function editManifest(root, edit) {
    const file = path.join(root, 'corpus.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    edit(manifest);
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return file;
}

test('harness corpus freezes three synthetic Android families without QA or golden approval', () => {
    const corpus = load();
    assert.equal(corpus.manifest.schemaVersion, 1);
    assert.equal(corpus.manifest.synthetic, true);
    assert.equal(corpus.manifest.qaReview.status, 'pending');
    assert.deepEqual(corpus.cases.map(c => [c.id, c.family, c.caseId]), [
        ['sales-empty', 'sales-empty', 'TC-10239'],
        ['movements-period', 'movements-period', 'TC-10140'],
        ['yapeo-recipient', 'yapeo-recipient', 'TC-10240'],
    ]);
    assert.equal(new Set(corpus.files.map(f => f.path)).size, corpus.files.length);
    for (const row of corpus.cases) {
        assert.equal(row.synthetic, true);
        assert.equal(row.pilotEligible, false);
        assert.equal(row.qaReview.status, 'pending');
        assert.equal(row.labelsValue.reviewed, false);
        assert.equal(row.labelsValue.qaReview.status, 'pending');
        assert.equal(row.labelsValue.functional.status, 'not-evaluated');
        assert.deepEqual(row.scenarioValue.request.acceptanceChecks, []);
        assert.equal(row.source.kind, 'reported-regression');
        assert.equal(row.source.construction, 'synthetic-reduction');
        assert.deepEqual(Object.keys(row.source.sourceRecording).sort(), ['recordingId', 'scenarioSha256']);
        assert.match(row.source.sourceRecording.recordingId, /^rec-[a-f0-9-]+$/);
        assert.match(row.source.sourceRecording.scenarioSha256, /^[a-f0-9]{64}$/);
        assert.match(row.scenarioValue.recordingId, /^harness-synthetic-/);
        assert.notEqual(row.scenarioValue.recordingId, row.source.sourceRecording.recordingId);
        assert.equal(row.labelsValue.provenance.selectorVerification, 'synthetic-contract-only');
    }
});

test('every action preserves a canonical selector pair and belongs to exactly one ordered Step', () => {
    for (const { id, scenarioValue: scenario } of load().cases) {
        const actions = scenario.actions;
        assert.deepEqual(actions.map(a => a.sequence), actions.map((_, i) => i + 1), id);
        for (const action of actions) {
            assert.equal(action.selectorVerified, true, `${id}/${action.sequence}`);
            assert.equal(action.platform, scenario.platform);
            const pair = recordedLocator(action, scenario.platform);
            assert.equal(pair.ok, true, pair.reason);
            assert.equal(pair.type, action.locatorType);
            assert.equal(pair.value, action.locatorValue);
            assert.equal(recordedLocator({ ...action, locatorType: 'XPATH' }, scenario.platform).ok, false,
                'the same selector cannot silently change to XPath');
            if (action.action === 'VERIFICAR_TEXTO') {
                assert.deepEqual(parseTextAssertion(action.textAssertion, action.action, action.value), action.textAssertion);
            }
        }
        const traced = scenario.request.scenarioRows.flatMap(row => row.actions || []);
        assert.deepEqual(traced, actions, `${id}: all actions must preserve content and order in row traces`);
        assert.equal(scenario.request.scenarioRows[0].status, 'reused');
        assert.deepEqual(scenario.request.scenarioRows[0].actions, []);
        assert.ok(scenario.request.scenarioRows.every(row => row.wording === 'domain'));
    }
});

test('pending labels cover the reported regression families without silently approving criteria', () => {
    const mutationIds = new Set();
    for (const { scenarioValue: scenario, labelsValue: labels } of load().cases) {
        assert.ok(labels.proposedAcceptanceCriteria.length > 0);
        for (const criterion of labels.proposedAcceptanceCriteria) {
            assert.equal(criterion.reviewed, false);
            assert.equal(criterion.critical, true);
            for (const sequence of criterion.sequences) {
                assert.match(scenario.actions[sequence - 1].action, /^VERIFICAR_/);
            }
            if (criterion.kind === 'date-range') assert.ok([30, 90].includes(criterion.days));
        }
        for (const expected of labels.expectedNegatives) {
            assert.equal(expected.reviewed, false);
            assert.equal(expected.expectationStatus, 'proposed');
            assert.ok(expected.expectedRuleCodes.length > 0);
            assert.ok(expected.expectedRuleCodes.every(code => /^[a-z]+(?:-[a-z]+)+$/.test(code)));
            mutationIds.add(expected.id);
        }
        for (const reuse of labels.reuseExpectations) {
            assert.equal(reuse.status, 'proposed');
            assert.equal(reuse.reviewed, false);
            assert.ok(reuse.sequences.every(n => scenario.actions[n - 1]));
        }
    }
    assert.deepEqual([...mutationIds].sort(), ['date-range-weakened', 'duplicate-case', 'duplicate-step',
        'locator-type', 'locator-value-invented', 'mechanical-gherkin', 'remove-text-assertion',
        'reused-method-changed', 'test-data-user-missing', 'trace-getter-changed'].sort());
});

test('synthetic user aliases and parameter values are frozen with the corpus, without credentials', () => {
    const corpus = load();
    const ref = corpus.manifest.testData;
    assert.equal(ref.synthetic, true);
    const frozen = corpus.files.find(file => file.path === ref.path);
    assert.ok(frozen, 'the baseline must include the hashed alias catalog');
    assert.equal(sha256(frozen.content), ref.sha256);
    const names = frozen.content.toString('utf8').split('\n').filter(line => line.startsWith('- name: ')).map(line => line.slice(8));
    assert.deepEqual(names, corpus.cases.map(row => row.scenarioValue.request.dataName));
    assert.doesNotMatch(frozen.content.toString('utf8'), /^\s*(?:password|pin|otp|token|accessKey|phone):/im);
    for (const { scenarioValue: scenario } of corpus.cases) {
        assert.equal(scenario.request.examples.username, scenario.request.dataName);
        for (const row of scenario.request.scenarioRows) {
            for (const [, parameter] of row.text.matchAll(/<([^>]+)>/g)) {
                assert.equal(typeof scenario.request.examples[parameter], 'string', `missing Examples.${parameter}`);
            }
        }
    }
    const yapeo = corpus.cases.find(c => c.id === 'yapeo-recipient').scenarioValue;
    assert.equal(yapeo.request.examples.recipient, '000000001');
    assert.equal(yapeo.actions[3].value, yapeo.request.examples.recipient);
    assert.equal(yapeo.actions[1].selector, 'id=com.android.permissioncontroller:id/permission_allow_button');
    assert.equal(yapeo.actions[1].locatorType, 'ANDROID');
    assert.equal(yapeo.actions[1].locatorValue, 'new UiSelector().resourceId("com.android.permissioncontroller:id/permission_allow_button")');
});

test('corpus loader rejects changed inputs even when the JSON still parses', t => {
    const root = copyCorpus(t);
    const scenario = path.join(root, 'sales-empty', 'scenario.json');
    fs.appendFileSync(scenario, '\n');
    assert.throws(() => readHarnessCorpus(path.join(root, 'corpus.json')), /Hash de corpus diferente/);
});

test('corpus loader rejects parent traversal and symlinked input references', t => {
    const root = copyCorpus(t);
    const file = editManifest(root, manifest => { manifest.cases[0].scenario.path = '../outside.json'; });
    assert.throws(() => readHarnessCorpus(file), /Ruta de corpus inválida/);
    const source = path.join(root, 'sales-empty', 'scenario.json');
    const linked = path.join(root, 'sales-empty', 'linked.json');
    fs.symlinkSync(source, linked);
    editManifest(root, manifest => { manifest.cases[0].scenario.path = 'sales-empty/linked.json'; });
    assert.throws(() => readHarnessCorpus(file), /no admite enlaces/);
});

test('changing a fixture flag cannot create pilot eligibility or QA approval', t => {
    const root = copyCorpus(t);
    const file = editManifest(root, manifest => { manifest.cases[0].pilotEligible = true; });
    assert.throws(() => readHarnessCorpus(file), /no concede aprobación QA/);
    editManifest(root, manifest => { manifest.cases[0].pilotEligible = false; manifest.cases[0].qaReview.status = 'approved'; });
    assert.throws(() => readHarnessCorpus(file), /no concede aprobación QA/);
});
