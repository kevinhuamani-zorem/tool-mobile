const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { effectiveGenerationPlan } = require('../dist/core/effectiveGenerationPlan');
const { parseGapResolutions } = require('../dist/core/gapResolutionContracts');

function fixturePlan() {
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp-1',
        deterministicCoverage: 0,
        status: 'needs-agent',
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'ver movimientos',
            resolution: 'create',
            locatorName: 'showMovementsButton',
            selector: '~Mostrar movimientos',
            confidence: 1,
            gapId: 'gap-duplicate-element-1',
            reason: 'candidate exists',
            reuseCandidates: [{
                file: 'resources/locators/home/home.locator.json',
                module: 'home/home',
                name: 'lblRecentMovements',
            }],
        }],
        files: [],
        unresolvedGapIds: ['gap-duplicate-element-1'],
        budgets: {},
    };
}

test('effective plan materializa selectedCandidate autorizado como reuse', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-'));
    const plan = effectiveGenerationPlan(dir, fixturePlan(), [{
        gapId: 'gap-duplicate-element-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/home/home.locator.json',
            module: 'home/home',
            name: 'lblRecentMovements',
        },
    }]);
    assert.deepEqual(plan.resolutions[0].source, {
        file: 'resources/locators/home/home.locator.json',
        module: 'home/home',
        scope: 'home',
    });
    assert.equal(plan.resolutions[0].resolution, 'reuse');
    assert.equal(plan.resolutions[0].locatorName, 'lblRecentMovements');
});

test('effective plan rechaza candidatos que no ofrecieron plan ni findLocator', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-denied-'));
    assert.throws(() => effectiveGenerationPlan(dir, fixturePlan(), [{
        gapId: 'gap-duplicate-element-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/payment/other.locator.json',
            module: 'payment/other',
            name: 'inventedLocator',
        },
    }]), /no fue ofrecido/);
});

test('gap-resolutions exige candidato estructurado para reuse nuevo', () => {
    const valid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{
            gapId: 'gap-1',
            decision: 'reuse',
            selectedCandidate: {
                file: 'resources/locators/home/home.locator.json',
                module: 'home/home',
                name: 'lblRecentMovements',
            },
        }],
    }), 4);
    assert.equal(valid.valid, true);

    const invalid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{ gapId: 'gap-1', decision: 'reuse' }],
    }), 4);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'reuse-candidate-required'), true);
});

