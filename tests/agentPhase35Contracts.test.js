const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
    AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    agentBudgetViolations,
    isAgentFallbackAllowed,
} = require('../dist/core/automationContracts');
const {
    emptyQueryRequests,
    emptyQueryResults,
    parseAgentContextQueryRequests,
    validateAgentContextQueryRequests,
    validateAgentContextQueryResults,
} = require('../dist/core/agentQueryContracts');
const {
    canFallbackToManual,
    resolveAgentExecutionMode,
    resolvePackageArtifactPath,
    summarizeAgentProcessOutput,
    isValidAgentExecutionState,
} = require('../dist/core/agentRuntimeGuards');
const { AgentRunStore } = require('../dist/core/agentRunStore');
const { deriveAutomationContextProjections } = require('../dist/core/automationContextProjections');
const { GapQueryPolicy } = require('../dist/core/gapQueryPolicy');
const { AutomationResponseValidator } = require('../dist/core/automationResponseValidator');

function basePlan() {
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp',
        deterministicCoverage: 1,
        status: 'deterministic',
        resolutions: [],
        files: [],
        unresolvedGapIds: [],
        budgets: { ...DEFAULT_AGENT_OPERATIONAL_BUDGETS },
    };
}

function baseScenario() {
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        revision: 1,
        fingerprint: 'fp',
        createdAt: '2026-08-29T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Objetivo',
        acceptanceCriteria: 'Aceptación',
        request: {
            squad: 'payment',
            featureName: 'Feature',
            scenarioName: 'Scenario',
            fileName: 'feature',
            locatorModule: 'module',
            caseId: 'TC-1',
            pathType: 'Happy Path',
            tag: 'tag',
            dataName: 'QA',
            platform: 'android',
        },
        actions: [],
    };
}

test('query request válido', () => {
    const result = validateAgentContextQueryRequests({
        schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
        requests: [{ id: 'q1', gapId: 'gap-screen', query: 'findExistingScreen', args: { name: 'Movements' } }],
    });
    assert.equal(result.valid, true);
    assert.equal(result.value.requests.length, 1);
});

test('query request con versión inválida', () => {
    const result = validateAgentContextQueryRequests({
        schemaVersion: '2.0',
        requests: [],
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.code === 'schema-version'), true);
});

test('query desconocida', () => {
    const result = validateAgentContextQueryRequests({
        schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
        requests: [{ id: 'q1', gapId: 'gap', query: 'searchEverything', args: {} }],
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.code === 'unknown-query'), true);
});

test('gapId faltante', () => {
    const result = validateAgentContextQueryRequests({
        schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
        requests: [{ id: 'q1', query: 'findExample', args: {} }],
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.code === 'request-gap-id'), true);
});

test('cantidad máxima de requests', () => {
    const result = validateAgentContextQueryRequests({
        schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
        requests: [
            { id: 'q1', gapId: 'g1', query: 'findExample', args: {} },
            { id: 'q2', gapId: 'g1', query: 'findExample', args: {} },
        ],
    }, 1);
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.code === 'max-requests-exceeded'), true);
});

test('query result resolved', () => {
    const result = validateAgentContextQueryResults({
        schemaVersion: AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
        results: [{ requestId: 'q1', gapId: 'gap-screen', status: 'resolved', data: { ok: true } }],
    }, new Set(['q1']));
    assert.equal(result.valid, true);
    assert.equal(result.value.results[0].status, 'resolved');
});

test('query result rejected', () => {
    const result = validateAgentContextQueryResults({
        schemaVersion: AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
        results: [{
            requestId: 'q1',
            gapId: 'gap-screen',
            status: 'rejected',
            code: 'query-not-allowed',
            evidence: ['gap policy'],
        }],
    }, new Set(['q1']));
    assert.equal(result.valid, true);
    assert.equal(result.value.results[0].code, 'query-not-allowed');
});

test('error code tipado en rejected', () => {
    const result = validateAgentContextQueryResults({
        schemaVersion: AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
        results: [{ requestId: 'q1', gapId: 'gap', status: 'rejected' }],
    }, new Set(['q1']));
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.code === 'invalid-rejection-code'), true);
});

test('budget válido', () => {
    const violations = agentBudgetViolations(DEFAULT_AGENT_OPERATIONAL_BUDGETS, {
        totalDurationMs: 1000,
        contextBytes: 1000,
        responseBytes: 1000,
        agentInvocations: 1,
        totalQueries: 1,
        queriesPerGap: { a: 1 },
    });
    assert.deepEqual(violations, []);
});

test('context budget exceeded', () => {
    const violations = agentBudgetViolations(DEFAULT_AGENT_OPERATIONAL_BUDGETS, {
        contextBytes: DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxContextBytes + 1,
    });
    assert.equal(violations.includes('CONTEXT_BUDGET_EXCEEDED'), true);
});

test('total query budget exceeded', () => {
    const violations = agentBudgetViolations(DEFAULT_AGENT_OPERATIONAL_BUDGETS, {
        totalQueries: DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxTotalQueries + 1,
    });
    assert.equal(violations.includes('TOTAL_QUERY_BUDGET_EXCEEDED'), true);
});

test('deterministic scenario mantiene agentInvocations en 0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-deterministic-'));
    const store = new AgentRunStore(root);
    store.start('rec-1', 'plan-1');
    store.mark('ready-for-review', true);
    assert.equal(store.read().agentInvocationCount, 0);
});

test('blocked QA mantiene agentInvocations en 0', () => {
    const run = new AgentRunStore(fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-blocked-')));
    run.start('rec-1', 'plan-1');
    const projection = deriveAutomationContextProjections({
        scenario: baseScenario(),
        plan: {
            ...basePlan(),
            status: 'needs-agent',
            unresolvedGapIds: ['gap-qa'],
        },
        resolvedContext: {
            schemaVersion: 1,
            recordingId: 'rec-1',
            planId: 'plan-1',
            reusedLocators: [],
            frameworkContract: {
                stepsOnlyOrchestrate: true,
                screenExtendsBaseScreen: true,
                sharedLocatorNameAcrossPlatforms: true,
                allowedScopes: ['squad', 'home'],
                baseScreenClass: 'BaseScreen',
                baseScreenImport: '@screenobjects/commons/base.screen.ts',
                locatorFactoryImport: '@utils/LocatorFactory.ts',
                typeLocatorImport: '@utils/Enums.ts',
            },
        },
        unresolvedContext: {
            schemaVersion: 1,
            recordingId: 'rec-1',
            planId: 'plan-1',
            gaps: [{
                id: 'gap-qa',
                type: 'qa-decision',
                description: 'Definición pendiente',
                requiredOutput: 'QA decide',
                blocking: true,
            }],
        },
    });
    new GapQueryPolicy(projection.gaps, { execute: () => ({}) }, run)
        .request('gap-qa', 'findExistingScreen', {});
    assert.equal(run.read().agentInvocationCount, 0);
});

test('feature flag manual', () => {
    assert.equal(resolveAgentExecutionMode('manual'), 'manual');
    assert.equal(resolveAgentExecutionMode(undefined), 'manual');
});

test('feature flag automatic', () => {
    assert.equal(resolveAgentExecutionMode('automatic'), 'automatic');
});

test('fallback permitido', () => {
    assert.equal(canFallbackToManual('automatic', 'AGENT_NOT_INSTALLED'), true);
    assert.equal(isAgentFallbackAllowed('AGENT_UNAVAILABLE'), true);
});

test('fallback no permitido', () => {
    assert.equal(canFallbackToManual('automatic', 'SCHEMA_INVALID'), false);
    assert.equal(canFallbackToManual('manual', 'AGENT_NOT_INSTALLED'), false);
});

test('output path válido', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-path-ok-'));
    const resolved = resolvePackageArtifactPath(pkg, 'query-requests.json');
    assert.equal(resolved.endsWith(path.join(pkg, 'query-requests.json')), true);
});

test('path traversal rechazado', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-path-traversal-'));
    assert.throws(
        () => resolvePackageArtifactPath(pkg, '../agent-response.json'),
        /Artefacto no permitido/
    );
});

test('symlink escape rechazado', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-path-symlink-'));
    const external = path.join(os.tmpdir(), `phase35-out-${Date.now()}.json`);
    fs.writeFileSync(external, '{}');
    fs.symlinkSync(external, path.join(pkg, 'agent-response.json'));
    assert.throws(
        () => resolvePackageArtifactPath(pkg, 'agent-response.json'),
        /Symlink no permitido/
    );
});

test('agent-run sin provider real conserva defaults', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35-run-default-'));
    const store = new AgentRunStore(root);
    store.start('rec-1', 'plan-1');
    const run = store.read();
    assert.equal(run.agentProvider, null);
    assert.equal(run.agentVersion, null);
    assert.equal(run.agentExitCode, null);
    assert.equal(run.fallbackUsed, false);
});

test('backward compatibility de agent-response sin schemaVersion', () => {
    const validator = new AutomationResponseValidator(
        { validate: () => ({ valid: true, errors: [], warnings: [], conflicts: [] }) },
        { getCatalog: () => ({ stepDefinitions: [], scenarios: [], locators: [] }) }
    );
    const response = {
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [],
        actionTrace: [],
        files: [],
    };
    const validation = validator.validate(baseScenario(), basePlan(), response);
    assert.equal(validation.errors.some(error => error.code === 'schema'), false);
});

test('sanitización de logs', () => {
    const summary = summarizeAgentProcessOutput(
        'token=abc123\nmail=test@example.com',
        'browserstack_access_key=secret',
        2,
        120
    );
    assert.equal(summary.exitCode, 2);
    assert.equal(summary.summary.includes('abc123'), false);
    assert.equal(summary.summary.includes('example.com'), false);
    assert.equal(summary.summary.includes('secret'), false);
});

test('serialización/deserialización de contratos', () => {
    const requests = emptyQueryRequests();
    requests.requests.push({ id: 'q1', gapId: 'gap', query: 'findExample', args: { term: 'x' } });
    const parsedRequests = parseAgentContextQueryRequests(JSON.stringify(requests));
    assert.equal(parsedRequests.valid, true);

    const results = emptyQueryResults();
    results.results.push({ requestId: 'q1', gapId: 'gap', status: 'resolved', data: { ok: true } });
    const parsedResults = validateAgentContextQueryResults(results, new Set(['q1']));
    assert.equal(parsedResults.valid, true);
});

test('modelo de estados de ejecución soportado', () => {
    assert.equal(isValidAgentExecutionState('prepared'), true);
    assert.equal(isValidAgentExecutionState('running'), true);
    assert.equal(isValidAgentExecutionState('completed'), true);
    assert.equal(isValidAgentExecutionState('failed'), true);
    assert.equal(isValidAgentExecutionState('timed-out'), true);
    assert.equal(isValidAgentExecutionState('cancelled'), true);
    assert.equal(isValidAgentExecutionState('unknown'), false);
});
