const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { validateWithSchema, unsupportedSchemaKeywords, layeredResultSchema, queryRequestsSchema, gapResolutionsSchema,
    AutomationHistoryStore, AgentRunStore, recordEvaluationPass, evaluateAutomationPackages } = require('../dist/core/automation');
const { designReviewSchema } = require('../dist/core/automation/infrastructure/layered/memoryReuse');
const { calculateGenerationQuality } = require('../dist/core/generation');

test('F7 schema validates declared string, numeric, boolean, null and compound constraints together', () => {
    const cases = [
        ['abcdef', { type: 'string', maxLength: 3 }, false], ['', { type: 'string', minLength: 1 }, false],
        ['x', { type: 'string', enum: ['x'], minLength: 2 }, false], ['abc', { type: 'string', pattern: '^a' }, true],
        [-1, { type: 'integer', minimum: 1 }, false], [2.5, { type: 'integer' }, false], [4, { type: 'number', maximum: 3 }, false],
        [false, { type: 'boolean' }, true], [null, { type: 'null' }, true], [null, { type: ['string', 'null'] }, true],
        [false, { type: 'null' }, false], [null, { anyOf: [{ type: 'string' }, { type: 'null' }] }, true],
        [7, { anyOf: [{ type: 'string' }, { type: 'null' }] }, false], ['🚀', { type: 'string', maxLength: 1 }, true],
        [{ b: 2, a: 1 }, { const: { a: 1, b: 2 }, type: 'object' }, true], [[], false, false], [0, true, true],
        [{ a: 1 }, { type: 'object', additionalProperties: { type: 'string' } }, false],
        [[{ a: 1, b: 2 }, { b: 2, a: 1 }], { type: 'array', uniqueItems: true }, false],
        ['x', { $defs: { word: { type: 'string' } }, $ref: '#/$defs/word' }, true],
        ['x', { type: 'string', pattern: '[' }, false],
    ];
    for (const [value, schema, valid] of cases) assert.equal(validateWithSchema(value, schema), valid, JSON.stringify({ value, schema }));
    assert.equal(validateWithSchema(Object.create({ value: 'inherited' }), { type: 'object', required: ['value'] }), false);
});

test('F7 unsupported schema keywords fail explicitly and current shared schemas are covered', () => {
    for (const schema of [layeredResultSchema('behavior-author'), layeredResultSchema('interaction-author'), queryRequestsSchema(), gapResolutionsSchema(8), designReviewSchema()]) {
        assert.deepEqual(unsupportedSchemaKeywords(schema), []);
    }
    assert.deepEqual(unsupportedSchemaKeywords({ type: 'string', format: 'email' }), ['$.format: unsupported schema keyword']);
    assert.equal(validateWithSchema('not-an-email', { type: 'string', format: 'email' }), false);
    assert.equal(validateWithSchema('accepted', { anyOf: [{ const: 'accepted' }, { mystery: true }] }), false);
});

test('F7 action coverage ignores and reports out-of-range indices, without a score above 100', () => {
    const metrics = calculateGenerationQuality([{ text: 'valid', actionIndices: [0, 1, 2, -1, 3.5] }], 2);
    assert.equal(metrics.actionCoverage, 1); assert.deepEqual(metrics.invalidActionIndices, [2, -1, 3.5]);
    assert.equal(metrics.passed, false); assert.ok(metrics.qualityScore <= 100);
    assert.equal(calculateGenerationQuality([{ text: 'invalid', actionIndices: [5] }], 1).linkedRows, 0);
    assert.equal(calculateGenerationQuality([{ text: 'invalid count', actionIndices: [0] }], -1).actionCoverage, 0);
});

test('F7 reports autonomous denominators, retries, timeouts and QA approval without reclassifying the failed attempt', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f7-eval-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pkg = path.join(root, 'pkg'); const history = new AutomationHistoryStore(pkg);
    const store = new AgentRunStore(pkg); history.beginRevision({ recordingId: 'rec-eval', caseId: 'TC-E', source: 'recording' });
    function run(id, firstPassed, finalPassed, timedOut) {
        store.start('rec-eval', id); const identity = history.identity();
        const errors = { all: [], behavior: [], interaction: ['[selector-contract] incorrect selector'], integration: [] };
        recordEvaluationPass(pkg, 1, firstPassed, firstPassed ? { all: [], behavior: [], interaction: [], integration: [] } : errors);
        if (!firstPassed) recordEvaluationPass(pkg, 2, finalPassed, finalPassed ? { all: [], behavior: [], interaction: [], integration: [] } : errors);
        history.capture('golden-examples/interaction-author.json', JSON.stringify({ role: 'interaction-author', pass: 1, enabled: false, fingerprint: 'corpus-v1', examples: [] }), 'recorder', 'golden-context:interaction-author', 1);
        const report = { startedAt: '2026-09-08T10:00:00Z', completedAt: '2026-09-08T10:00:03Z', stages: [{ invoked: true, execution: 'agent', timedOut, actualModels: ['test-model'] }, { invoked: false, execution: 'agent' }, { execution: 'deterministic' }] };
        history.append({ ...identity, kind: 'generation-result', origin: 'recorder', result: finalPassed ? 'passed' : 'failed' }, [{ name: 'layered-generation-run.json', content: JSON.stringify(report) }]);
        return identity;
    }
    run('first', true, true, false); run('second', false, true, false); const failed = run('third', false, false, true);
    history.beginRevision({ recordingId: 'rec-eval', caseId: 'TC-E', source: 'framework-import' });
    history.append({ ...history.identity(), kind: 'qa-verification', origin: 'qa', result: 'approved' });
    const report = evaluateAutomationPackages([pkg], path.join(root, 'golden'));
    assert.deepEqual(report.metrics.autonomousFinal, { numerator: 2, denominator: 3, rate: 2 / 3, notEvaluated: 0 });
    assert.equal(report.metrics.autonomousFirstPass.numerator, 1); assert.equal(report.metrics.autonomousFirstPass.denominator, 3);
    assert.equal(report.metrics.timeouts.numerator, 1);
    assert.equal(report.metrics.qaApprovalAfterFailure.numerator, 1);
    assert.equal(report.attempts.find(attempt => attempt.attemptId === failed.attemptId).status, 'failed');
    assert.equal(report.attempts[0].wallTimeMs, 3000);
    assert.ok(report.attempts.every(attempt => attempt.invocations === 1), 'prepared/cached/deterministic stages are not provider invocations');
    assert.equal(report.metrics.errors[0].recurrentAcrossAttempts, true);
    assert.equal(report.status, 'not-evaluated', 'empty QA corpus is explicit even with generation observations');
    assert.ok(report.limitations.includes('No QA-approved golden corpus.'));
    assert.ok(report.attempts.every(attempt => attempt.functionalVerification === 'not-evaluated'));
});

test('locator fidelity counts provider mistakes before Recorder correction without claiming device execution', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f7-locator-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pkg = path.join(root, 'pkg'), history = new AutomationHistoryStore(pkg), run = new AgentRunStore(pkg);
    history.beginRevision({ recordingId: 'rec-locator', caseId: 'TC-1', source: 'recording' });
    run.start('rec-locator', 'plan-1');
    history.capture('agents/zorem/locator-fidelity.json', JSON.stringify({ checked: 4, matched: 3, corrected: true,
        corrections: [{ file: 'case.screen.ts', typeStart: 12 }], unverified: [] }), 'recorder', 'locator-fidelity', 1);
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'passed' }, [{ name: 'layered-generation-run.json', content: JSON.stringify({ stages: [{ invoked: true, execution: 'agent' }] }) }]);
    const result = evaluateAutomationPackages([pkg], path.join(root, 'golden'));
    assert.equal(result.metrics.locatorFidelity.beforeRecorderCorrection.rate, 0.75);
    assert.equal(result.metrics.locatorFidelity.correctedGetters, 1);
    assert.equal(result.attempts[0].functionalVerification, 'not-evaluated');
});
