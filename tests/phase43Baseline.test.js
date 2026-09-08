const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTests, compareTests, comparableContexts } = require('../scripts/phase43-baseline');

test('baseline compara resultados capturados, incluidos fallos resueltos y tests no ejecutados', () => {
    const previous = parseTests('not ok 1 - fixed\nnot ok 2 - known\nok 3 - broken\nnot ok 4 - missing\nnot ok 5 - skipped\n');
    const current = parseTests('ok 1 - fixed\nnot ok 2 - known\nnot ok 3 - broken\nok 4 - skipped # SKIP unavailable\nnot ok 5 - new test\n');
    const result = compareTests(current, previous);
    assert.deepEqual(result.failures.map(test => [test.name, test.category]), [['known', 'PREEXISTING'], ['broken', 'REGRESSION'], ['new test', 'UNBASELINED']]);
    assert.deepEqual(result.resolved.map(test => test.name), ['fixed']);
    assert.deepEqual(result.notReevaluated.map(test => test.name), ['missing', 'skipped']);
});

test('sin baseline y con nombres ambiguos nunca confirma fallos preexistentes', () => {
    const tests = parseTests('not ok 1 - duplicate\nnot ok 2 - duplicate\n');
    assert.deepEqual(compareTests(tests).failures.map(test => test.category), ['UNBASELINED', 'UNBASELINED']);
    assert.deepEqual(compareTests(tests, tests).failures.map(test => test.category), ['AMBIGUOUS', 'AMBIGUOUS']);
    assert.deepEqual(compareTests(parseTests('ok 1 - duplicate\n'), tests).resolved, []);
});

test('un cambio de framework, dependencias o entorno impide comparar baselines como equivalentes', () => {
    const baseline = { frameworkHead: 'a', frameworkWorktree: '', frameworkWorkingHash: 'w', frameworkLockHash: 'b', recorderLockHash: 'c', node: 'v22', platform: 'darwin', arch: 'arm64' };
    assert.equal(comparableContexts({ ...baseline, recorderHead: 'new' }, baseline), true);
    for (const field of Object.keys(baseline)) assert.equal(comparableContexts({ ...baseline, [field]: 'different' }, baseline), false, field);
    assert.equal(comparableContexts({}, {}), false);
});
