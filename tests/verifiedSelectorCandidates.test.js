const assert = require('node:assert/strict');
const test = require('node:test');

const {
    independentlyVerifySelectorCandidates,
} = require('../dist/core/verifiedSelectorCandidates');
const {
    recorderSelectorFromInspector,
} = require('../dist/recorder/src/embeddedInspectorProtocol');
const {
    attachLocatorCandidatePackage,
    locatorCandidatePackage,
    requireTrustedLocatorCandidatePackage,
} = require('../dist/core/selectorCandidates');

function candidate(candidateId, strategy, selector, overrides = {}) {
    return {
        candidateId,
        strategy,
        selector,
        priority: 0,
        stability: 'stable',
        sourceReason: 'Inspector recommendation',
        ...overrides,
    };
}

test('revalidates every candidate, same-element identity and TypeLocator roundtrip', async () => {
    const calls = [];
    const result = await independentlyVerifySelectorCandidates({
        candidates: [
            candidate('primary', 'id', 'com.yape.qa:id/pay', { stability: 'manual' }),
            candidate('accessibility', 'accessibility id', 'Pagar', { priority: 1 }),
        ],
        selectedElementId: 'element-1',
        platform: 'android',
        verifiedAt: '2026-08-27T00:00:00.000Z',
        recorderSelector: recorderSelectorFromInspector,
        findElementIds: async selector => {
            calls.push(selector);
            return ['element-1'];
        },
    });

    assert.equal(result.primarySelector, 'id=com.yape.qa:id/pay');
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].primary, true);
    assert.equal(result.candidates[0].locatorType, 'ANDROID');
    assert.equal(result.candidates[0].locatorValue,
        'new UiSelector().resourceId("com.yape.qa:id/pay")');
    assert.ok(calls.includes('android=new UiSelector().resourceId("com.yape.qa:id/pay")'));
    assert.deepEqual(result.warnings, []);
});

test('omits zero, multiple, different-element, unrepresentable and failed alternatives visibly', async () => {
    const result = await independentlyVerifySelectorCandidates({
        candidates: [
            candidate('primary', 'accessibility id', 'Pagar', { stability: 'manual' }),
            candidate('zero', 'xpath', '//zero'),
            candidate('multiple', 'xpath', '//multiple'),
            candidate('different', 'xpath', '//different'),
            candidate('unrepresentable', 'xpath', 'plain-text'),
            candidate('failed', 'xpath', '//failed'),
        ],
        selectedElementId: 'element-1',
        platform: 'android',
        recorderSelector: recorderSelectorFromInspector,
        findElementIds: async selector => {
            if (selector === '~Pagar') return ['element-1'];
            if (selector === '//zero') return [];
            if (selector === '//multiple') return ['element-1', 'element-2'];
            if (selector === '//different') return ['element-2'];
            if (selector === '//failed') throw new Error('Appium unavailable');
            return [];
        },
    });

    assert.deepEqual(result.candidates.map(item => item.candidateId), ['primary']);
    assert.equal(result.warnings.length, 5);
    assert.match(result.warnings.join('\n'), /zero.*0 elementos/);
    assert.match(result.warnings.join('\n'), /multiple.*2 elementos/);
    assert.match(result.warnings.join('\n'), /different.*distinto/);
    assert.match(result.warnings.join('\n'), /unrepresentable.*XPath valido/);
    assert.match(result.warnings.join('\n'), /failed.*Appium unavailable/);
});

test('rejects an invalid primary instead of importing it', async () => {
    await assert.rejects(
        independentlyVerifySelectorCandidates({
            candidates: [candidate('primary', 'xpath', '//button', { stability: 'manual' })],
            selectedElementId: 'element-1',
            platform: 'android',
            recorderSelector: recorderSelectorFromInspector,
            findElementIds: async () => ['different-element'],
        }),
        /Selector primario rechazado.*distinto/,
    );
});

test('omits an unsupported backup strategy without aborting the primary', async () => {
    let calls = 0;
    const result = await independentlyVerifySelectorCandidates({
        candidates: [
            candidate('primary', 'accessibility id', 'Pagar', { stability: 'manual' }),
            candidate('future-backup', '-future strategy', 'future-selector'),
        ],
        selectedElementId: 'element-1',
        platform: 'android',
        recorderSelector: recorderSelectorFromInspector,
        findElementIds: async () => {
            calls += 1;
            return ['element-1'];
        },
    });

    assert.deepEqual(result.candidates.map(item => item.candidateId), ['primary']);
    assert.match(result.warnings.join('\n'), /future-backup.*no soportada/i);
    assert.equal(calls, 1);
});

test('blocks an unsupported primary strategy visibly', async () => {
    await assert.rejects(
        independentlyVerifySelectorCandidates({
            candidates: [candidate('primary', '-future strategy', 'future-selector')],
            selectedElementId: 'element-1',
            platform: 'android',
            recorderSelector: recorderSelectorFromInspector,
            findElementIds: async () => {
                throw new Error('no debe ejecutar Appium');
            },
        }),
        /Selector primario rechazado.*no soportada/i,
    );
});

test('validates all received candidates before applying the compact deterministic cap', async () => {
    let calls = 0;
    const candidates = [
        candidate('primary', 'accessibility id', 'Primary', { stability: 'manual' }),
        ...Array.from({ length: 11 }, (_, index) =>
            candidate(`candidate-${index}`, 'accessibility id', `Alternative ${index}`, {
                priority: 11 - index,
            })
        ),
    ];
    const result = await independentlyVerifySelectorCandidates({
        candidates,
        selectedElementId: 'element-1',
        platform: 'android',
        recorderSelector: recorderSelectorFromInspector,
        findElementIds: async () => {
            calls += 1;
            return ['element-1'];
        },
    });

    assert.equal(calls, candidates.length);
    assert.equal(result.candidates.length, 4);
    assert.equal(result.candidates[0].candidateId, 'primary');
    assert.deepEqual(
        result.candidates.slice(1).map(item => item.priority),
        [1, 2, 3],
    );
});

test('serializes candidates once and hydrates them while old scenarios stay compatible', () => {
    const scenario = {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-candidates',
        revision: 1,
        fingerprint: 'f'.repeat(64),
        createdAt: '2026-08-27T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Pagar',
        acceptanceCriteria: 'Pago visible',
        request: {},
        actions: [{
            action: 'CLICK',
            sequence: 1,
            selector: '~Pagar',
            selectorVerified: true,
            selectorCandidates: [{
                candidateId: 'primary',
                selector: '~Pagar',
                inspectorStrategy: 'accessibility id',
                locatorType: 'ID',
                locatorValue: 'Pagar',
                priority: 0,
                stability: 'manual',
                sourceReason: 'Manual Inspector selection',
                primary: true,
                verification: {
                    protocolVersion: 3,
                    verifiedAt: '2026-08-27T00:00:00.000Z',
                    matchCount: 1,
                    sameElement: true,
                },
            }],
        }],
    };
    const packaged = locatorCandidatePackage(scenario);
    const compactScenario = {
        ...scenario,
        actions: scenario.actions.map(({ selectorCandidates, ...action }) => action),
    };
    const hydrated = attachLocatorCandidatePackage(compactScenario, packaged);
    assert.equal(hydrated.actions[0].selectorCandidates[0].candidateId, 'primary');
    assert.equal(attachLocatorCandidatePackage(compactScenario, undefined), compactScenario);
});

test('rejects a locator candidate package modified after recorder preparation', () => {
    const scenario = {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-trusted',
        revision: 1,
        fingerprint: 'fingerprint',
        createdAt: '2026-08-27T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestran movimientos',
        request: {},
        actions: [{
            sequence: 1,
            action: 'CLICK',
            selector: 'id=movements',
            selectorVerified: true,
            selectorCandidates: [{
                candidateId: 'primary',
                selector: 'id=movements',
                inspectorStrategy: 'id',
                locatorType: 'XPATH',
                locatorValue: '//*[@resource-id="movements"]',
                priority: 0,
                stability: 'stable',
                sourceReason: 'Inspector recommendation',
                primary: true,
                verification: {
                    protocolVersion: 3,
                    verifiedAt: '2026-08-27T00:00:00.000Z',
                    matchCount: 1,
                    sameElement: true,
                },
            }],
        }],
    };
    const packaged = locatorCandidatePackage(scenario);
    assert.deepEqual(requireTrustedLocatorCandidatePackage(scenario, packaged), packaged);
    const tampered = structuredClone(packaged);
    tampered.actions[0].candidates[0].locatorValue = '//*[@text="invented"]';
    assert.throws(
        () => requireTrustedLocatorCandidatePackage(scenario, tampered),
        /fue modificado/,
    );
    assert.throws(
        () => requireTrustedLocatorCandidatePackage(scenario, undefined),
        /fue modificado/,
    );
    const compactScenario = {
        ...scenario,
        platform: 'ios',
        actions: scenario.actions.map(({ selectorCandidates, ...action }) => action),
    };
    assert.throws(
        () => attachLocatorCandidatePackage(compactScenario, packaged),
        /no coincide/,
    );
});
