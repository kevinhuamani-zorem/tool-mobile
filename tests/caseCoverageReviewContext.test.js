const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadReviewDiagnostics } = require('../dist/recorder/src/ipc/automation/reviewContext');
const validation = { valid: true, qualityScore: 100, warnings: [], errors: [] };

test('optional absent, malformed or stale reports cannot block reviewing files or leak another run', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-review-context-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const scenario = { actions: [{ sequence: 14, selectorVerified: false }] };
    const plan = { planId: 'current-plan', resolutions: [{ sequence: 14, resolution: 'unresolved' }] };
    const first = loadReviewDiagnostics(root, validation, scenario, plan);
    assert.equal(first.length, 1);
    fs.writeFileSync(path.join(root, 'test-design-review.json'), '{broken');
    fs.writeFileSync(path.join(root, 'qa-observations.json'), JSON.stringify({ observations: {} }));
    fs.writeFileSync(path.join(root, 'layered-generation-run.json'), JSON.stringify({ planId: 'previous-plan',
        stages: [{ attempt: 0, error: '[trace] case.ts: Failure from another run' }] }));
    const next = loadReviewDiagnostics(root, validation, scenario, plan);
    assert.deepEqual(next, first);
    assert.doesNotMatch(JSON.stringify(next), /another run/);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
});
