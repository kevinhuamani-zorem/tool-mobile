const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deriveAutomationContextProjections } = require('../dist/core/automationContextProjections');
const { GapQueryPolicy } = require('../dist/core/gapQueryPolicy');
const { AgentRunStore } = require('../dist/core/agentRunStore');
const { CodeGraph } = require('../dist/core/codeGraph');
const { FrameworkQueryService } = require('../dist/core/frameworkQueryService');

function scenario() {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'recording-phase-3', revision: 1,
        fingerprint: 'fingerprint', createdAt: '2026-08-29T00:00:00.000Z', squad: 'payment',
        platform: 'android', environment: 'qa', objective: 'Consultar movimientos',
        acceptanceCriteria: 'Visualiza sus movimientos', request: {
            squad: 'payment', featureName: 'Movimientos', scenarioName: 'Consultar movimientos',
            fileName: 'movements', locatorModule: 'movements', caseId: 'TC-1', pathType: 'Happy Path',
            tag: 'movements', dataName: 'QA', platform: 'android',
        },
        actions: [],
    };
}

function plan(resolutions = [], gapIds = []) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', planId: 'plan-phase-3',
        recordingId: 'recording-phase-3', fingerprint: 'fingerprint', deterministicCoverage: 1,
        status: gapIds.length ? 'needs-agent' : 'deterministic', resolutions, files: [],
        unresolvedGapIds: gapIds,
        budgets: { maxDurationMs: 300000, maxContextBytes: 20000, maxRepairAttempts: 1 },
    };
}

function resolvedContext(overrides = {}) {
    return {
        schemaVersion: 1, recordingId: 'recording-phase-3', planId: 'plan-phase-3', reusedLocators: [],
        frameworkContract: {
            stepsOnlyOrchestrate: true, screenExtendsBaseScreen: true,
            sharedLocatorNameAcrossPlatforms: true, allowedScopes: ['squad', 'home'],
            baseScreenClass: 'BaseScreen', baseScreenImport: '@screenobjects/commons/base.screen.ts',
            locatorFactoryImport: '@utils/LocatorFactory.ts', typeLocatorImport: '@utils/Enums.ts',
        },
        ...overrides,
    };
}

function unresolved(gaps = []) {
    return { schemaVersion: 1, recordingId: 'recording-phase-3', planId: 'plan-phase-3', gaps };
}

function projection(gaps, resolutions = [], context = resolvedContext()) {
    return deriveAutomationContextProjections({
        scenario: scenario(), plan: plan(resolutions, gaps.map(gap => gap.id)),
        resolvedContext: context, unresolvedContext: unresolved(gaps),
    });
}

function gap(id = 'gap-screen', overrides = {}) {
    return {
        id, type: 'semantic-naming', description: 'Falta decidir la pantalla existente',
        requiredOutput: 'Elegir pantalla', ...overrides,
    };
}

function response(query, input) {
    return {
        schemaVersion: 1, query, success: true,
        items: [{ type: 'method', name: input.term || 'result' }], relations: [],
        metrics: {
            durationMs: 2, indexDurationMs: 1, cacheHit: true, filesExamined: 5,
            filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 300, truncated: false,
        },
    };
}

function service() {
    return { calls: [], execute(query, input) { this.calls.push({ query, input }); return response(query, input); } };
}

test('deriva hints compactos de decisiones y relaciones existentes', () => {
    const resolutions = [{
        sequence: 1, action: 'CLICK', intent: 'abrir movimientos', resolution: 'reuse',
        locatorName: 'openMovements', confidence: 1, reason: 'selector exacto',
        source: { file: 'resources/locators/payment/movements.locator.json', module: 'payment/movements', scope: 'squad' },
    }];
    const result = projection([], resolutions, resolvedContext({
        frameworkAwareness: {
            candidates: [{ feature: 'Movimientos', scenario: 'Consultar', file: 'features/movements.feature', score: 0.82, selectorCoverage: 1, matchedSteps: [] }],
            exactStepDefinitions: [{ expression: '^el usuario consulta movimientos$', file: 'features/movements.steps.ts', scope: 'squad' }],
            selectorCollisions: [], decision: 'reuse-existing',
        },
    }));
    assert.ok(result.hints.hints.some(item => item.type === 'existing_locator' && item.path.includes('movements.locator.json')));
    assert.ok(result.hints.hints.some(item => item.type === 'existing_step' && item.confidence === 1));
    assert.equal(JSON.stringify(result.hints).includes('selector exacto'), true);
    assert.equal(JSON.stringify(result.hints).includes('class '), false);
});

test('confidence usa coincidencia exacta o score existente de forma determinística', () => {
    const context = resolvedContext({ frameworkAwareness: {
        candidates: [{ feature: 'A', scenario: 'B', file: 'a.feature', score: 0.73456, selectorCoverage: 0.5, matchedSteps: [] }],
        exactStepDefinitions: [], selectorCollisions: [], decision: 'create-new',
    } });
    const first = projection([], [], context).hints.hints;
    const second = projection([], [], context).hints.hints;
    assert.deepEqual(first, second);
    assert.equal(first.find(item => item.type === 'existing_scenario').confidence, 0.7346);
    assert.equal(first.find(item => item.type === 'framework_contract').confidence, 1);
});

test('autoriza únicamente una query declarada por el gap', () => {
    const projected = projection([gap()]).gaps;
    const fake = service();
    const decision = new GapQueryPolicy(projected, fake).request('gap-screen', 'findExistingScreen', { term: 'Movements' });
    assert.equal(decision.accepted, true);
    assert.equal(fake.calls.length, 1);
});

test('rechaza una query no autorizada sin tocar FrameworkQueryService', () => {
    const fake = service();
    const decision = new GapQueryPolicy(projection([gap()]).gaps, fake)
        .request('gap-screen', 'findLocator', { term: 'movements' });
    assert.equal(decision.reason, 'query-not-allowed');
    assert.equal(fake.calls.length, 0);
});

test('rechaza argumentos inválidos con razón invalid-args y sin llamar al servicio', () => {
    const fake = service();
    const decision = new GapQueryPolicy(projection([gap()]).gaps, fake)
        .request('gap-screen', 'findExistingScreen', {
            symbolOrPath: 'home/home.lblRecentMovements',
            intent: 'abrir movimientos',
        });
    assert.equal(decision.accepted, false);
    assert.equal(decision.reason, 'invalid-args');
    assert.match(decision.message || '', /Campos válidos:/);
    assert.equal(fake.calls.length, 0);
});

test('acepta query válida con symbol en args', () => {
    const fake = service();
    const decision = new GapQueryPolicy(projection([gap()]).gaps, fake)
        .request('gap-screen', 'findExistingScreen', {
            symbol: 'lblRecentMovements',
            intent: 'abrir movimientos',
        });
    assert.equal(decision.accepted, true);
    assert.equal(fake.calls.length, 1);
});

test('rechaza cualquier query cuando no existe un gap abierto', () => {
    const fake = service();
    const decision = new GapQueryPolicy(projection([]).gaps, fake)
        .request('missing', 'findExistingScreen', {});
    assert.equal(decision.reason, 'no-open-gap');
    assert.equal(fake.calls.length, 0);
});

test('evita una query idéntica repetida', () => {
    const fake = service();
    const policy = new GapQueryPolicy(projection([gap()]).gaps, fake);
    assert.equal(policy.request('gap-screen', 'findExistingScreen', { term: 'A', limit: 1 }).accepted, true);
    const duplicate = policy.request('gap-screen', 'findExistingScreen', { limit: 1, term: 'A' });
    assert.equal(duplicate.reason, 'duplicate-query');
    assert.equal(fake.calls.length, 1);
});

test('respeta maxQueries por gap', () => {
    const fake = service();
    const projected = projection([gap('gap-one', { allowedQueries: ['findExistingScreen'], maxQueries: 1 })]).gaps;
    const policy = new GapQueryPolicy(projected, fake);
    assert.equal(policy.request('gap-one', 'findExistingScreen', { term: 'A' }).accepted, true);
    assert.equal(policy.request('gap-one', 'findExistingScreen', { term: 'B' }).reason, 'max-queries-reached');
});

test('rechaza nuevas consultas después de resolver el gap', () => {
    const fake = service();
    const policy = new GapQueryPolicy(projection([gap()]).gaps, fake);
    policy.resolve('gap-screen', 'agent');
    assert.equal(policy.request('gap-screen', 'findExistingScreen', {}).reason, 'gap-resolved');
    assert.equal(policy.snapshot()[0].resolvedBy, 'agent');
});

test('un gap blocking pertenece al QA y no habilita queries', () => {
    const projected = projection([gap('gap-qa', { type: 'qa-decision', blocking: true })]).gaps;
    assert.equal(projected.gaps[0].status, 'blocked-qa');
    assert.deepEqual(projected.gaps[0].allowedQueries, []);
    assert.equal(projected.gaps[0].maxQueries, 0);
    const decision = new GapQueryPolicy(projected, service()).request('gap-qa', 'findExistingScreen', {});
    assert.equal(decision.reason, 'gap-blocking');
});

test('scenario completamente determinístico produce gaps vacíos y cero queries', () => {
    const result = projection([], [{
        sequence: 1, action: 'CLICK', intent: 'abrir movimientos', resolution: 'builtin',
        confidence: 1, reason: 'helper',
    }]);
    const fake = service();
    new GapQueryPolicy(result.gaps, fake).request('none', 'findExistingScreen', {});
    assert.deepEqual(result.gaps.gaps, []);
    assert.equal(fake.calls.length, 0);
    assert.equal(result.metrics.finalGapCount, 0);
});

test('mantiene presupuestos independientes para múltiples gaps', () => {
    const fake = service();
    const projected = projection([
        gap('gap-screen-a', { maxQueries: 1 }),
        gap('gap-screen-b', { maxQueries: 1 }),
    ]).gaps;
    const policy = new GapQueryPolicy(projected, fake);
    assert.equal(policy.request('gap-screen-a', 'findExistingScreen', { term: 'A' }).accepted, true);
    assert.equal(policy.request('gap-screen-b', 'findExistingScreen', { term: 'B' }).accepted, true);
    assert.equal(fake.calls.length, 2);
});

test('normaliza gaps de recordings anteriores sin romper su contrato', () => {
    const legacy = projection([{
        id: 'legacy', type: 'test-input', description: 'Falta data', requiredOutput: 'Completar data',
    }]).gaps.gaps[0];
    assert.equal(legacy.status, 'open');
    assert.equal(legacy.resolvedBy, null);
    assert.deepEqual(legacy.allowedQueries, ['findExample']);
    assert.equal(typeof legacy.allowedQueryArgsSchemas.findExample, 'object');
    assert.deepEqual(legacy.expectedAnswerSchema.required, ['gapId', 'decision']);
});

test('la política rechaza resultados truncados en vez de aceptarlos en silencio', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-query-limit-'));
    const feature = path.join(root, 'features/yape-features/payment/movements.feature');
    fs.mkdirSync(path.dirname(feature), { recursive: true });
    fs.writeFileSync(
        feature,
        `Feature: Movimientos
${Array.from({ length: 20 }, (_value, index) => `  Scenario: Consultar movimientos ${index}
    Then visualiza movimientos ${index}`).join('\n')}
`
    );
    const service = new FrameworkQueryService(new CodeGraph({
        frameworkRoot: root, cacheFile: path.join(root, '.cache', 'graph.json'),
    }), root);
    const projected = projection([gap('gap-scenario', {
        type: 'refinement', allowedQueries: ['inspectScenario'], maxQueries: 1,
    })]).gaps;
    const decision = new GapQueryPolicy(projected, service).request(
        'gap-scenario', 'inspectScenario', { squad: 'payment', term: 'movimientos', limit: 10, maxBytes: 768 },
    );
    assert.equal(decision.accepted, false);
    assert.equal(decision.reason, 'query-truncated');
    assert.match(decision.message || '', /truncated=true/);
});

test('GapQueryPolicy inyecta maxBytes cuando args no lo especifica', () => {
    const fake = service();
    const policy = new GapQueryPolicy(projection([gap()]).gaps, fake, undefined, { maxBytes: 7777 });
    const decision = policy.request('gap-screen', 'findExistingScreen', { symbol: 'lblSales' });
    assert.equal(decision.accepted, true);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].input.maxBytes, 7777);
});

test('actualiza métricas de proyección y consultas aceptadas/rechazadas', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-query-metrics-'));
    const store = new AgentRunStore(root);
    store.start('recording-phase-3', 'plan-phase-3');
    const result = projection([gap()]);
    store.recordProjectionMetrics(result.metrics);
    const fake = service();
    const policy = new GapQueryPolicy(result.gaps, fake, store);
    policy.request('gap-screen', 'findExistingScreen', { term: 'A' });
    policy.request('gap-screen', 'findExistingScreen', { term: 'A' });
    policy.request('gap-screen', 'findLocator', {});
    policy.request('gap-screen', 'findExistingScreen', { symbolOrPath: 'home/home.lblRecentMovements' });
    const artifact = store.read();
    assert.equal(artifact.initialGapCount, 1);
    assert.equal(artifact.finalGapCount, 1);
    assert.ok(artifact.hintsGenerated >= 1);
    assert.equal(artifact.queriesRequested, 4);
    assert.equal(artifact.queriesAccepted, 1);
    assert.equal(artifact.queriesRejected, 3);
    assert.equal(artifact.duplicateQueriesAvoided, 1);
    assert.equal(artifact.invalidArgsRejected, 1);
    assert.equal(artifact.queryCount, 1);
    assert.equal(artifact.cacheHits, 1);
    policy.resolve('gap-screen', 'deterministic');
    assert.equal(store.read().gapsResolvedDeterministically, 1);
    assert.equal(store.read().finalGapCount, 0);

    const noGapStore = new AgentRunStore(fs.mkdtempSync(path.join(os.tmpdir(), 'no-gap-metrics-')));
    noGapStore.start('deterministic', 'plan');
    new GapQueryPolicy(projection([]).gaps, fake, noGapStore)
        .request('none', 'findExistingScreen', {});
    assert.equal(noGapStore.read().queriesAvoidedNoGap, 1);
});
