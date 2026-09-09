const test = require('node:test');
const assert = require('node:assert/strict');
const { goldenPlanProjection, goldenRegenerationControls } = require('../dist/core/automation');
const selectorGap = { id: 'gap-locator-1', type: 'selector-ambiguity', blocking: false };
const refinement = { id: 'gap-regeneration-refinement', type: 'refinement', description: 'Conservar la corrección del QA', requiredOutput: 'Las cuatro capas revisadas' };
const resolved = { status: 'needs-agent', files: [{ layer: 'screen', path: 'screenobjects/payment/case.screen.ts', operation: 'update' }], resolutions: [{ sequence: 1, action: 'CLICK', resolution: 'reuse', locatorName: 'button' }], unresolvedGapIds: [selectorGap.id] };
const regenerated = { ...resolved, status: 'regeneration', reconciliation: { revisionId: 'revision-qa' }, unresolvedGapIds: [selectorGap.id, refinement.id] };

test('resolver projection separates only the builder regeneration control and preserves its metadata', () => {
    const gaps = [selectorGap, refinement], before = JSON.stringify({ plan: regenerated, gaps });
    assert.deepEqual(goldenPlanProjection(resolved, [selectorGap]), goldenPlanProjection(regenerated, gaps));
    assert.deepEqual(goldenRegenerationControls(regenerated, gaps), [refinement]);
    assert.equal(JSON.stringify({ plan: regenerated, gaps }), before);
    assert.deepEqual(goldenRegenerationControls(resolved, [selectorGap]), []);
});

test('resolver gaps and path/locator decisions remain strict replay differences', () => {
    const expected = goldenPlanProjection(resolved, [selectorGap]);
    for (const changedGap of [{ ...selectorGap, blocking: true }, { ...selectorGap, type: 'semantic-naming' }, { ...selectorGap, id: 'gap-locator-2' }])
        assert.notDeepEqual(goldenPlanProjection(regenerated, [changedGap, refinement]), expected);
    assert.notDeepEqual(goldenPlanProjection({ ...regenerated, files: [{ ...resolved.files[0], path: 'screenobjects/payment/other.screen.ts' }] }, [selectorGap, refinement]), expected);
    assert.notDeepEqual(goldenPlanProjection({ ...regenerated, resolutions: [{ ...resolved.resolutions[0], locatorName: 'otherButton' }] }, [selectorGap, refinement]), expected);
});

test('lookalike, blocking, duplicated or unfounded control gaps are never discarded', () => {
    const variants = [
        [regenerated, [{ ...refinement, type: 'selector-ambiguity' }]],
        [regenerated, [{ ...refinement, id: 'gap-other-refinement' }]],
        [regenerated, [{ ...refinement, blocking: true }]],
        [regenerated, [refinement, refinement]],
        [{ ...regenerated, status: 'needs-agent' }, [refinement]],
        [{ ...regenerated, reconciliation: undefined }, [refinement]],
        [{ ...regenerated, unresolvedGapIds: [] }, [refinement]],
        [{ ...regenerated, unresolvedGapIds: [refinement.id, refinement.id] }, [refinement]],
    ];
    for (const [plan, gaps] of variants) {
        assert.equal(goldenPlanProjection(plan, gaps).gaps.length, gaps.length);
        assert.deepEqual(goldenRegenerationControls(plan, gaps), []);
    }
});
