const test = require('node:test');
const assert = require('node:assert/strict');
const { GapExecutionPlanner, partitionGapsById } = require('../dist/core/gapExecutionPlanner');

test('particiona una ejecución por gap id', () => {
    const ids = partitionGapsById([
        { id: 'gap-1' },
        { id: 'gap-2' },
        { id: 'gap-1' },
        { id: 'gap-3' },
    ]);
    assert.deepEqual(ids, ['gap-1', 'gap-2', 'gap-3']);
});

test('ejecuta gaps en paralelo con grado configurable', async () => {
    const planner = new GapExecutionPlanner({ parallelism: 3 });
    const gaps = Array.from({ length: 6 }, (_, index) => ({
        gapId: `gap-${index + 1}`,
        contextBytes: 1000,
    }));
    let current = 0;
    let peak = 0;
    const results = await planner.execute(gaps, 20_000, async gap => {
        current += 1;
        peak = Math.max(peak, current);
        await new Promise(resolve => setTimeout(resolve, 20));
        current -= 1;
        return `${gap.gapId}-ok`;
    });
    assert.equal(results.length, 6);
    assert.equal(results.every(result => result.ok), true);
    assert.equal(peak <= 3, true);
    assert.equal(peak > 1, true);
});

test('aísla GAP_CONTEXT_OVERFLOW por gap y continúa con los demás', async () => {
    const planner = new GapExecutionPlanner({ parallelism: 2 });
    const executed = [];
    const results = await planner.execute([
        { gapId: 'gap-ok-1', contextBytes: 5000 },
        { gapId: 'gap-overflow', contextBytes: 25001 },
        { gapId: 'gap-ok-2', contextBytes: 7000 },
    ], 20_000, async gap => {
        executed.push(gap.gapId);
        return 'done';
    });
    const overflow = results.find(result => result.gapId === 'gap-overflow');
    assert.equal(overflow.ok, false);
    assert.equal(overflow.errorCode, 'GAP_CONTEXT_OVERFLOW');
    assert.equal(executed.includes('gap-ok-1'), true);
    assert.equal(executed.includes('gap-ok-2'), true);
    assert.equal(executed.includes('gap-overflow'), false);
});
