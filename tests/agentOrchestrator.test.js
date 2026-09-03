const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AgentOrchestrator } = require('../dist/core/automation');
const { AgentRunStore } = require('../dist/core/automation');
const { DEFAULT_AGENT_OPERATIONAL_BUDGETS } = require('../dist/core/automation');

// Estos casos ejercitan deliberadamente el adapter legacy. Producción usa el
// modo determinista por defecto; el último caso de este archivo lo habilita de
// forma explícita para probar su materialización.
const originalGenerationMode = process.env.RECORDER_GENERATION_MODE;
process.env.RECORDER_GENERATION_MODE = 'legacy';
test.after(() => {
    if (originalGenerationMode === undefined) delete process.env.RECORDER_GENERATION_MODE;
    else process.env.RECORDER_GENERATION_MODE = originalGenerationMode;
});

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function packageFixture(overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-orchestrator-'));
    const unresolvedGapIds = overrides.unresolvedGapIds
        || (overrides.gaps ? overrides.gaps.map(gap => gap.id) : ['gap-screen']);
    writeJson(path.join(root, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp',
        deterministicCoverage: 0.5,
        status: 'needs-agent',
        resolutions: [],
        files: [],
        unresolvedGapIds,
        budgets: { ...DEFAULT_AGENT_OPERATIONAL_BUDGETS, ...overrides.budgets },
    });
    writeJson(path.join(root, 'gaps.json'), {
        schemaVersion: 1,
        recordingId: 'rec-1',
        planId: 'plan-1',
        gaps: overrides.gaps || [{
            id: 'gap-screen',
            type: 'semantic-naming',
            description: 'resolver pantalla',
            requiredOutput: 'definir screen',
            intent: 'resolver',
            reason: 'falta contexto',
            blocking: false,
            allowedQueries: ['findExistingScreen'],
            maxQueries: 2,
            expectedAnswerSchema: { type: 'object' },
            evidenceRequired: [],
            resolvedBy: null,
            status: 'open',
        }],
    });
    writeJson(path.join(root, 'status.json'), { state: 'ready-for-agent' });
    [
        'scenario.json',
        'hints.json',
        'reuse-context.json',
        'collision-report.json',
        'locator-candidates.json',
        'instructions.md',
        'query-requests.json',
        'query-results.json',
    ].forEach(name => {
        const file = path.join(root, name);
        if (name.endsWith('.md')) fs.writeFileSync(file, '# instructions\n');
        else writeJson(file, {});
    });
    new AgentRunStore(root).start('rec-1', 'plan-1');
    return root;
}

function extractGapIdFromPrompt(prompt = '') {
    const match = prompt.match(/"id":"(gap-[^"]+)"/);
    return match ? match[1] : 'gap-screen';
}

test('orchestrator propaga el modelo por ejecución y registra el modelo usado incluso ante fallo', async () => {
    const dir = packageFixture();
    const provider = {
        name: 'fake', getVersion: async () => '1', cancel() {},
        async execute(input) {
            assert.equal(input.model, 'gpt-5.6-terra');
            return { success: false, exitCode: 1, stdout: '', stderr: '', durationMs: 1,
                timedOut: false, cancelled: false, errorCode: 'AGENT_NON_ZERO_EXIT',
                modelUsage: { requestedModel: input.model, actualModels: ['gpt-5.6-terra'] } };
        },
    };
    const result = await new AgentOrchestrator({ execute() { throw new Error('unexpected query'); } }, provider)
        .run(dir, 'automatic', { model: 'gpt-5.6-terra' });
    assert.equal(result.success, false);
    assert.deepEqual(new AgentRunStore(dir).read().agentModelUsage,
        { requestedModel: 'gpt-5.6-terra', actualModels: ['gpt-5.6-terra'] });
});

function packageFiles(root) {
    return fs.readdirSync(root)
        .map(name => path.join(root, name))
        .filter(file => fs.statSync(file).isFile());
}

function hasAbsolutePath(text) {
    const unix = /(^|[\s("'`=])\/(?:Users|home|var|tmp|private|opt|Volumes|etc)\/[^\s"'`]+/m;
    const windows = /(^|[\s("'`=])[A-Za-z]:\\[^\s"'`]+/m;
    return unix.test(text) || windows.test(text);
}

test('orchestrator ejecuta dos pasadas y genera query-results', async () => {
    const dir = packageFixture();
    const prompts = [];
    const provider = {
        name: 'fake',
        getVersion: async () => '1.2.3',
        cancel() {},
        async execute(input) {
            assert.equal(fs.existsSync(path.join(input.cwd, 'query-requests.json')), false);
            assert.equal(fs.existsSync(path.join(input.cwd, 'agent-response.json')), false);
            prompts.push(input.prompt);
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [{
                        id: 'q1',
                        gapId: 'gap-screen',
                        query: 'findExistingScreen',
                        args: { term: 'Movements', limit: 1 },
                    }],
                });
                return { success: true, exitCode: 0, stdout: 'pass1', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: 'pass2', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'screenObject', name: 'MovementsScreen', path: 'screenobjects/payment/movements.screen.ts' }],
                relations: [],
                metrics: {
                    durationMs: 1,
                    indexDurationMs: 1,
                    cacheHit: true,
                    filesExamined: 1,
                    filesRead: 0,
                    bytesRead: 0,
                    resultCount: 1,
                    returnedBytes: 100,
                    truncated: false,
                },
            };
        },
    };
    const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    assert.equal(result.invocations, 2);
    const queryResults = JSON.parse(fs.readFileSync(path.join(dir, 'query-results.json'), 'utf-8'));
    assert.equal(queryResults.results[0].status, 'resolved');
    const breakdown = JSON.parse(fs.readFileSync(path.join(dir, 'context-breakdown.json'), 'utf-8'));
    assert.ok(breakdown.pass1.totalBytes > 0);
    assert.ok(breakdown.pass2.totalBytes > 0);
    assert.equal(breakdown.pass1.totalBytes <= 20_000, true);
    const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
    assert.equal(status.state, 'completed');
    assert.match(prompts[0], /allowedQueryArgsSchemas/);
});

test('orchestrator hace fallback manual cuando provider no está instalado', async () => {
    const dir = packageFixture();
    const provider = {
        name: 'fake',
        getVersion: async () => null,
        cancel() {},
        async execute() {
            return {
                success: false,
                exitCode: null,
                stdout: '',
                stderr: 'not found',
                durationMs: 1,
                timedOut: false,
                cancelled: false,
                errorCode: 'AGENT_NOT_INSTALLED',
                errorMessage: 'copilot not found',
            };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, false);
    assert.equal(result.state, 'fallback-manual');
    assert.equal(result.fallback, true);
});

test('orchestrator falla por schema inválido en query-requests', async () => {
    const dir = packageFixture();
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '9.9',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [],
                });
            }
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'SCHEMA_INVALID');
});

test('orchestrator rechaza args inválidos en query requests con invalid-args', async () => {
    const dir = packageFixture();
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [{
                        id: 'q1',
                        gapId: 'gap-screen',
                        query: 'findExistingScreen',
                        args: { symbolOrPath: 'home/home.lblRecentMovements' },
                    }],
                });
                return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    const queryResults = JSON.parse(fs.readFileSync(path.join(dir, 'query-results.json'), 'utf-8'));
    assert.equal(queryResults.results[0].status, 'rejected');
    assert.equal(queryResults.results[0].code, 'invalid-args');
    assert.match(queryResults.results[0].evidence.join(' '), /Campos válidos:/);
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
    assert.equal(run.invalidArgsRejected, 1);
});

test('orchestrator no bloquea PASS 1 por context budget', async () => {
    const dir = packageFixture({
        budgets: { maxContextBytes: 200 },
    });
    let calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            calls += 1;
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [],
                });
                return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: 'gap-screen', decision: 'resolved' }],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
    assert.equal(status.state, 'completed');
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
    assert.ok(run.pass1ContextBytes > 0);
    assert.equal(calls, 2);
});

test('orchestrator usa hang-stop fijo en PASS 1 y PASS 2', async () => {
    const dir = packageFixture();
    const timeouts = [];
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            timeouts.push(input.timeoutMs);
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [{
                        id: 'q1',
                        gapId: 'gap-screen',
                        query: 'findExistingScreen',
                        args: { term: 'Movements', limit: 1 },
                    }],
                });
                return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 240000, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'screenObject', name: 'MovementsScreen', path: 'screenobjects/payment/movements.screen.ts' }],
                relations: [],
                metrics: {
                    durationMs: 1, indexDurationMs: 1, cacheHit: true,
                    filesExamined: 1, filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 100, truncated: false,
                },
            };
        },
    };
    const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    assert.equal(timeouts[0], 3600000);
    assert.equal(timeouts[1], 3600000);
});

test('orchestrator sigue a PASS 2 aunque PASS 1 tome todo el presupuesto histórico', async () => {
    const dir = packageFixture();
    let calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            calls += 1;
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [],
                });
                return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 300000, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: 'gap-screen', decision: 'resolved' }],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    assert.equal(calls, 2);
});

test('orchestrator particiona por gap y fusiona respuestas cuando hay múltiples gaps', async () => {
    const dir = packageFixture({
        gaps: [
            {
                id: 'gap-one', type: 'semantic-naming', description: 'resolver 1', requiredOutput: 'x',
                intent: 'uno', reason: 'uno', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 1, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
            {
                id: 'gap-two', type: 'semantic-naming', description: 'resolver 2', requiredOutput: 'x',
                intent: 'dos', reason: 'dos', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 1, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
        ],
    });
    let calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            assert.equal(fs.existsSync(path.join(input.cwd, 'query-requests.json')), false);
            assert.equal(fs.existsSync(path.join(input.cwd, 'agent-response.json')), false);
            calls += 1;
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(input.cwd, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [{
                        id: 'q1',
                        gapId: extractGapIdFromPrompt(input.prompt),
                        query: 'findExistingScreen',
                        args: { symbol: 'Movements' },
                    }],
                });
                return { success: true, exitCode: 0, stdout: 'p1', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(input.cwd, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: extractGapIdFromPrompt(input.prompt), decision: 'reuse' }],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: 'p2', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'screenObject', name: 'MovementsScreen', path: 'screenobjects/payment/movements.screen.ts' }],
                relations: [],
                metrics: {
                    durationMs: 1, indexDurationMs: 1, cacheHit: true,
                    filesExamined: 1, filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 100, truncated: false,
                },
            };
        },
    };
    const previousStrategy = process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY;
    process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY = 'per-gap-parallel';
    try {
        const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
        assert.equal(result.success, true);
        assert.equal(result.invocations, 4);
        assert.equal(calls, 4);
        const merged = JSON.parse(fs.readFileSync(path.join(dir, 'agent-response.json'), 'utf-8'));
        assert.equal(merged.resolutions.length, 2);
        const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
        assert.equal(status.strategy, 'per-gap-parallel');
        const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
        assert.equal(run.agentInvocationCount, 4);
        assert.ok(run.pass1ContextBytes > 0);
        assert.ok(run.pass2ContextBytes > 0);
        assert.ok(run.totalContextBytes > 0);
    } finally {
        if (previousStrategy === undefined) delete process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY;
        else process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY = previousStrategy;
    }
});

test('orchestrator usa estrategia compacta por defecto con múltiples gaps', async () => {
    const dir = packageFixture({
        gaps: [
            {
                id: 'gap-one', type: 'semantic-naming', description: 'resolver 1', requiredOutput: 'x',
                intent: 'uno', reason: 'uno', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 2, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
            {
                id: 'gap-two', type: 'semantic-naming', description: 'resolver 2', requiredOutput: 'x',
                intent: 'dos', reason: 'dos', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 2, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
        ],
    });
    let calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            assert.equal(fs.existsSync(path.join(input.cwd, 'query-requests.json')), false);
            assert.equal(fs.existsSync(path.join(input.cwd, 'agent-response.json')), false);
            calls += 1;
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(input.cwd, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [
                        { id: 'q1', gapId: 'gap-one', query: 'findExistingScreen', args: { symbol: 'MovementsOne' } },
                        { id: 'q2', gapId: 'gap-two', query: 'findExistingScreen', args: { symbol: 'MovementsTwo' } },
                    ],
                });
                return { success: true, exitCode: 0, stdout: 'p1', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(input.cwd, 'agent-response.json'), {
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [
                    { gapId: 'gap-one', decision: 'reuse' },
                    { gapId: 'gap-two', decision: 'reuse' },
                ],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: 'p2', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'screenObject', name: 'MovementsScreen', path: 'screenobjects/payment/movements.screen.ts' }],
                relations: [],
                metrics: {
                    durationMs: 1, indexDurationMs: 1, cacheHit: true,
                    filesExamined: 1, filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 100, truncated: false,
                },
            };
        },
    };
    const previousStrategy = process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY;
    delete process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY;
    try {
        const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
        assert.equal(result.success, true);
        assert.equal(result.invocations, 2);
        assert.equal(calls, 2);
        const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
        assert.equal(status.strategy, 'compact-case');
        const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
        assert.equal(run.agentInvocationCount, 2);
    } finally {
        if (previousStrategy === undefined) delete process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY;
        else process.env.RECORDER_AGENT_MULTI_GAP_STRATEGY = previousStrategy;
    }
});

test('orchestrator falla con QUERY_RESULT_TRUNCATED cuando una query llega truncada', async () => {
    const dir = packageFixture();
    let calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            calls += 1;
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [{
                        id: 'q1',
                        gapId: 'gap-screen',
                        query: 'findExistingScreen',
                        args: { symbol: 'Movements' },
                    }],
                });
            }
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'screenObject', name: 'MovementsScreen', path: 'screenobjects/payment/movements.screen.ts' }],
                relations: [],
                metrics: {
                    durationMs: 1, indexDurationMs: 1, cacheHit: true,
                    filesExamined: 1, filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 100, truncated: true,
                },
            };
        },
    };
    const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'QUERY_RESULT_TRUNCATED');
    assert.equal(calls, 1);
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
    assert.equal(run.queryTruncatedRejected, 1);
});

test('orchestrator no descarta gaps por deadline global', async () => {
    const dir = packageFixture({
        gaps: [
            {
                id: 'gap-one', type: 'semantic-naming', description: 'resolver 1', requiredOutput: 'x',
                intent: 'uno', reason: 'uno', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 1, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
            {
                id: 'gap-two', type: 'semantic-naming', description: 'resolver 2', requiredOutput: 'x',
                intent: 'dos', reason: 'dos', blocking: false, allowedQueries: ['findExistingScreen'],
                maxQueries: 1, expectedAnswerSchema: { type: 'object' }, evidenceRequired: [], resolvedBy: null, status: 'open',
            },
        ],
    });
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute() {
            return {
                success: false,
                exitCode: null,
                stdout: '',
                stderr: '',
                durationMs: 1,
                timedOut: true,
                cancelled: false,
                errorCode: 'AGENT_TIMEOUT',
                errorMessage: 'Timeout simulado',
            };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(
        dir,
        'automatic',
        { deadlineAtMs: Date.now() - 1 }
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'AGENT_TIMEOUT');
});

test('orchestrator atiende needs en PASS 2 y reinvoca una vez', async () => {
    const dir = packageFixture();
    let pass2Calls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [],
                });
                return { success: true, exitCode: 0, stdout: 'pass1', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            pass2Calls += 1;
            if (pass2Calls === 1) {
                writeJson(path.join(dir, 'agent-response.json'), {
                    schemaVersion: 1,
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    resolutions: [{
                        gapId: 'gap-screen',
                        decision: 'unresolved',
                        reason: 'falta ejemplo',
                        needs: [{
                            query: 'findExample',
                            args: { squad: 'payment', term: 'movements', limit: 1 },
                        }],
                    }],
                    actionTrace: [],
                    files: [],
                });
                return { success: true, exitCode: 0, stdout: 'pass2-needs', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            writeJson(path.join(dir, 'agent-response.json'), {
                schemaVersion: 1,
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: 'gap-screen', decision: 'resolved', reason: 'ok' }],
                actionTrace: [],
                files: [],
            });
            return { success: true, exitCode: 0, stdout: 'pass2-final', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const queryService = {
        execute(query) {
            return {
                schemaVersion: 1,
                query,
                success: true,
                items: [{ type: 'scenario', name: 'Example', path: 'features/x.feature' }],
                relations: [],
                metrics: {
                    durationMs: 1, indexDurationMs: 1, cacheHit: true,
                    filesExamined: 1, filesRead: 0, bytesRead: 0, resultCount: 1, returnedBytes: 100, truncated: false,
                },
            };
        },
    };
    const result = await new AgentOrchestrator(queryService, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    assert.equal(pass2Calls, 2);
    assert.equal(result.invocations, 3);
    const queryResults = JSON.parse(fs.readFileSync(path.join(dir, 'query-results.json'), 'utf-8'));
    assert.equal(queryResults.results.some(item => String(item.requestId || '').startsWith('p2need-1-')), true);
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
    assert.equal(run.repairAttempts, 1);
    assert.equal(run.missingContextRequests.some(item => item.source === 'pass2-needs'), true);
});

test('orchestrator sanitiza rutas absolutas en artefactos de paquete', async () => {
    const dir = packageFixture();
    const outsidePath = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute() {
            return {
                success: false,
                exitCode: null,
                stdout: '',
                stderr: '',
                durationMs: 1,
                timedOut: false,
                cancelled: false,
                errorCode: 'AGENT_TOOL_DENIED',
                errorMessage: `Herramienta denegada: bash (command=cd "/Users/qa/Desktop/fwk-mobile-test" && ls; path=${outsidePath}).`,
            };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, false);
    const statusText = fs.readFileSync(path.join(dir, 'status.json'), 'utf-8');
    const responseText = fs.readFileSync(path.join(dir, 'agent-response.json'), 'utf-8');
    assert.equal(hasAbsolutePath(statusText), false);
    assert.equal(hasAbsolutePath(responseText), false);
    for (const file of packageFiles(dir)) {
        const content = fs.readFileSync(file, 'utf-8');
        assert.equal(hasAbsolutePath(content), false, `ruta absoluta detectada en ${path.basename(file)}`);
    }
});

test('orchestrator no modifica bytes de files[].content al sanear artefactos', async () => {
    const dir = packageFixture({
        gaps: [
            {
                id: 'gap-a',
                type: 'semantic-naming',
                description: 'gap a',
                requiredOutput: 'resolver',
                intent: 'resolver',
                reason: 'falta contexto',
                blocking: false,
                allowedQueries: ['findExistingScreen'],
                maxQueries: 2,
                expectedAnswerSchema: { type: 'object' },
                evidenceRequired: [],
                resolvedBy: null,
                status: 'open',
            },
            {
                id: 'gap-b',
                type: 'semantic-naming',
                description: 'gap b',
                requiredOutput: 'resolver',
                intent: 'resolver',
                reason: 'falta contexto',
                blocking: false,
                allowedQueries: ['findExistingScreen'],
                maxQueries: 2,
                expectedAnswerSchema: { type: 'object' },
                evidenceRequired: [],
                resolvedBy: null,
                status: 'open',
            },
        ],
    });
    const expectedSteps = [
        "import { When, Then } from '@wdio/cucumber-framework';",
        "import sampleScreen from '@screenobjects/payment/sample.screen.ts';",
        "When(/^el usuario consulta todos sus movimientos$/, async () => { await sampleScreen.consult(); });",
        "Then(/^se muestran los movimientos esperados$/, async () => { await sampleScreen.verify(); });",
        '',
    ].join('\n');
    const expectedScreen = [
        "import Locators from '@locators/payment/sample.locator.json' with { type: 'json' };",
        'export default class SampleScreen {}',
        '',
    ].join('\n');
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(input.cwd, 'query-requests.json'), {
                    schemaVersion: '1.0',
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    requests: [],
                });
                return { success: true, exitCode: 0, stdout: 'pass1', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
            }
            const gapId = extractGapIdFromPrompt(input.prompt);
            writeJson(path.join(input.cwd, 'agent-response.json'), {
                schemaVersion: 1,
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId, decision: 'resolved', reason: 'ok' }],
                actionTrace: [],
                files: [
                    { layer: 'feature', path: 'features/yape-features/payment/sample.feature', content: '@payment\nFeature: Sample\n' },
                    { layer: 'steps', path: 'features/yape-steps-definitions/payment/sample.steps.ts', content: expectedSteps },
                    { layer: 'screen', path: 'screenobjects/payment/sample.screen.ts', content: expectedScreen },
                    { layer: 'locators', path: 'resources/locators/payment/sample.locator.json', content: '{\n  \"sampleAndroid\": {}\n}\n' },
                ],
            });
            return { success: true, exitCode: 0, stdout: 'pass2', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
    assert.equal(result.success, true);
    const merged = JSON.parse(fs.readFileSync(path.join(dir, 'agent-response.json'), 'utf-8'));
    const mergedSteps = merged.files.find(file => file.layer === 'steps').content;
    const mergedScreen = merged.files.find(file => file.layer === 'screen').content;
    assert.equal(mergedSteps, expectedSteps);
    assert.equal(mergedScreen, expectedScreen);
});

test('orchestrator deterministic usa planner local y materializa agent-response sin codegen del agente', async () => {
    const dir = packageFixture();
    writeJson(path.join(dir, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp',
        deterministicCoverage: 0.6,
        status: 'needs-agent',
        unresolvedGapIds: ['gap-screen'],
        files: [
            { layer: 'feature', path: 'features/yape-features/payment/sample.feature', operation: 'create' },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/sample.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/sample.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/sample.locator.json', operation: 'create' },
        ],
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'abrir movimientos',
            resolution: 'create',
            locatorName: 'movementsButton',
            confidence: 0.7,
            gapId: 'gap-screen',
            reason: 'falta contexto semántico',
        }],
        budgets: { ...DEFAULT_AGENT_OPERATIONAL_BUDGETS },
    });
    writeJson(path.join(dir, 'scenario.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        revision: 1,
        fingerprint: 'fp',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos',
        request: {
            squad: 'payment',
            featureName: 'Flujo mobile',
            scenarioName: 'Escenario grabado',
            fileName: 'sample',
            locatorModule: 'sample',
            caseId: 'TC-10239',
            pathType: 'Happy Path',
            tag: 'sample',
            platform: 'android',
            scenarioRows: [{
                keyword: 'When',
                text: 'el usuario consulta movimientos',
                status: 'missing',
                wording: 'template',
                actions: [{
                    sequence: 1,
                    action: 'CLICK',
                    selector: 'id=btn_movements',
                    variableName: 'movementsButton',
                }],
            }],
        },
        actions: [{
            sequence: 1,
            action: 'CLICK',
            selector: 'id=btn_movements',
            variableName: 'movementsButton',
        }],
    });
    writeJson(path.join(dir, 'gap-resolutions.schema.json'), { type: 'object' });
    const prompts = [];
    let validationCalls = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            prompts.push(input.prompt);
            const candidate = {
                schemaVersion: '1.0',
                recordingId: 'rec-1',
                planId: 'plan-1',
                resolutions: [{ gapId: 'gap-screen', decision: 'create', reason: 'no hay candidato reutilizable autorizado' }],
                testDesignReview: {
                    status: 'pass',
                    summary: 'El resultado esperado queda observado por la aserción funcional del escenario.',
                    issues: [],
                },
                gherkinResolutions: [{
                    keyword: 'When',
                    text: 'el usuario consulta sus movimientos disponibles',
                    actionSequences: [1],
                    reason: 'Reemplaza la plantilla por intención de negocio.',
                }],
            };
            writeJson(path.join(input.cwd, 'gap-resolutions.json'), candidate);
            assert.equal(input.stopOnValidatedOutput.acceptOutput(candidate), false);
            const corrected = {
                ...candidate,
                resolutions: [{ gapId: 'gap-screen', decision: 'create', reason: 'corregido con feedback oficial' }],
            };
            writeJson(path.join(input.cwd, 'gap-resolutions.json'), corrected);
            assert.equal(input.stopOnValidatedOutput.acceptOutput(corrected), true);
            return { success: true, exitCode: 0, stdout: 'pass2', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const previousMode = process.env.RECORDER_GENERATION_MODE;
    process.env.RECORDER_GENERATION_MODE = 'deterministic';
    try {
        const result = await new AgentOrchestrator(
            { execute: () => ({}) },
            provider,
            undefined,
            undefined,
            () => {
                validationCalls += 1;
                return validationCalls > 1
                    ? { valid: true, errors: [] }
                    : {
                        valid: false,
                        errors: [{ code: 'trace-screen-method', message: 'La acción debe usar un único getter.' }],
                    };
            },
        ).run(dir, 'automatic');
        assert.equal(result.success, true);
        assert.equal(result.invocations, 1);
        assert.equal(prompts.length, 1);
        assert.match(prompts[0], /PASS 2 \(SEMANTIC\)/);
        assert.match(prompts[0], /"replace-existing"/);
        assert.match(prompts[0], /nunca edites agent-response\.json/);
        assert.match(prompts[0], /replacement:\{platform,sequence\}/);
        assert.match(prompts[0], /validation-feedback\.json/);
        assert.match(prompts[0], /gherkinResolutions/);
        assert.equal(validationCalls, 2);
        const feedback = JSON.parse(fs.readFileSync(path.join(dir, 'validation-feedback.json'), 'utf-8'));
        assert.equal(feedback.status, 'valid');
        assert.equal(feedback.automaticRepairAttempts, 1);
        const response = JSON.parse(fs.readFileSync(path.join(dir, 'agent-response.json'), 'utf-8'));
        assert.equal(response.recordingId, 'rec-1');
        assert.equal(response.files.length, 4);
        assert.equal(response.actionTrace[0].gherkinStep, 'When el usuario consulta sus movimientos disponibles');
        assert.ok(fs.existsSync(path.join(dir, 'query-requests.json')));
    } finally {
        if (previousMode === undefined) delete process.env.RECORDER_GENERATION_MODE;
        else process.env.RECORDER_GENERATION_MODE = previousMode;
    }
});

test('orchestrator termina y solicita regeneración cuando Pass 2 no puede corregir el Gherkin del plan', async () => {
    const dir = packageFixture();
    writeJson(path.join(dir, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp',
        deterministicCoverage: 0.6,
        status: 'needs-agent',
        unresolvedGapIds: ['gap-screen'],
        files: [
            { layer: 'feature', path: 'features/yape-features/payment/sample.feature', operation: 'create' },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/sample.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/sample.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/sample.locator.json', operation: 'create' },
        ],
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'abrir movimientos',
            resolution: 'create',
            locatorName: 'movementsButton',
            confidence: 0.7,
            gapId: 'gap-screen',
            reason: 'falta contexto semántico',
        }],
        budgets: { ...DEFAULT_AGENT_OPERATIONAL_BUDGETS },
    });
    writeJson(path.join(dir, 'scenario.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        revision: 1,
        fingerprint: 'fp',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos',
        request: {
            squad: 'payment', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado',
            fileName: 'sample', locatorModule: 'sample', caseId: 'TC-10239',
            pathType: 'Happy Path', tag: 'sample', platform: 'android',
            scenarioRows: [{
                keyword: 'When', text: 'el usuario completa flujo mobile', status: 'missing',
                actions: [{ sequence: 1, action: 'CLICK', selector: 'id=btn_movements', variableName: 'movementsButton' }],
            }],
        },
        actions: [{ sequence: 1, action: 'CLICK', selector: 'id=btn_movements', variableName: 'movementsButton' }],
    });
    writeJson(path.join(dir, 'gap-resolutions.schema.json'), { type: 'object' });
    let evaluated = 0;
    const provider = {
        name: 'fake',
        getVersion: async () => '1.0.0',
        cancel() {},
        async execute(input) {
            const candidate = {
                schemaVersion: '1.0', recordingId: 'rec-1', planId: 'plan-1',
                resolutions: [{ gapId: 'gap-screen', decision: 'create' }],
                testDesignReview: {
                    status: 'pass',
                    summary: 'El escenario conserva una evidencia funcional suficiente para esta prueba.',
                    issues: [],
                },
            };
            writeJson(path.join(input.cwd, 'gap-resolutions.json'), candidate);
            evaluated += 1;
            assert.equal(input.stopOnValidatedOutput.acceptOutput(candidate), true,
                'el provider debe cerrar sin esperar una edición imposible');
            return { success: true, exitCode: null, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const previousMode = process.env.RECORDER_GENERATION_MODE;
    process.env.RECORDER_GENERATION_MODE = 'deterministic';
    try {
        const result = await new AgentOrchestrator(
            { execute: () => ({}) },
            provider,
            undefined,
            undefined,
            () => ({
                valid: false,
                errors: [{
                    code: 'generic-template-gherkin',
                    message: 'El Gherkin de plantilla debe consolidarse.',
                    file: 'features/yape-features/payment/sample.feature',
                }],
            }),
        ).run(dir, 'automatic');

        assert.equal(evaluated, 1);
        assert.equal(result.success, false);
        assert.equal(result.errorCode, 'PLANNER_REGENERATION_REQUIRED');
        const feedback = JSON.parse(fs.readFileSync(path.join(dir, 'validation-feedback.json'), 'utf-8'));
        assert.equal(feedback.status, 'planner-regeneration-required');
        assert.equal(feedback.nextAction, 'regenerate-package-or-review-draft');
        const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
        assert.equal(status.state, 'failed');
        assert.equal(status.errorCode, 'PLANNER_REGENERATION_REQUIRED');
        const run = JSON.parse(fs.readFileSync(path.join(dir, 'agent-run.json'), 'utf-8'));
        assert.equal(run.result, 'planner-regeneration-required');
        assert.equal(run.timers?.agentStartedAtMs, undefined);
        assert.ok(fs.existsSync(path.join(dir, 'agent-response.json')), 'el borrador materializado se conserva');
    } finally {
        if (previousMode === undefined) delete process.env.RECORDER_GENERATION_MODE;
        else process.env.RECORDER_GENERATION_MODE = previousMode;
    }
});

test('orchestrator conserva como sugerencia la revisión funcional y continúa generando', async () => {
    const dir = packageFixture();
    writeJson(path.join(dir, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-qa-review',
        recordingId: 'rec-qa-review',
        fingerprint: 'fp',
        deterministicCoverage: 1,
        status: 'resolved',
        unresolvedGapIds: [],
        files: [
            { layer: 'feature', path: 'features/yape-features/payment/filters.feature', operation: 'create' },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/filters.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/filters.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/filters.locator.json', operation: 'create' },
        ],
        resolutions: [],
        budgets: { ...DEFAULT_AGENT_OPERATIONAL_BUDGETS },
    });
    writeJson(path.join(dir, 'scenario.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-qa-review',
        revision: 1,
        fingerprint: 'fp',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Usar los filtros de movimientos',
        acceptanceCriteria: 'Mostrar únicamente movimientos del periodo seleccionado',
        request: {
            squad: 'payment', featureName: 'Filtros', scenarioName: 'Filtrar movimientos',
            fileName: 'filters', locatorModule: 'filters', caseId: 'TC-10239',
            pathType: 'Happy Path', tag: 'filters', platform: 'android',
            scenarioRows: [{
                keyword: 'When', text: 'el usuario filtra sus movimientos', status: 'missing', wording: 'domain',
                actions: [
                    { sequence: 1, action: 'CLICK', selector: 'id=filter', variableName: 'filterButton' },
                    { sequence: 2, action: 'VERIFICAR_EXISTE', selector: 'id=today', variableName: 'todayOption' },
                    { sequence: 3, action: 'CLICK', selector: 'id=today', variableName: 'todayOption' },
                ],
            }],
        },
        actions: [
            { sequence: 1, action: 'CLICK', selector: 'id=filter', variableName: 'filterButton', contextHint: 'abrir filtros' },
            { sequence: 2, action: 'VERIFICAR_EXISTE', selector: 'id=today', variableName: 'todayOption', contextHint: 'validar opción solo hoy' },
            { sequence: 3, action: 'CLICK', selector: 'id=today', variableName: 'todayOption', contextHint: 'seleccionar solo hoy' },
        ],
    });
    writeJson(path.join(dir, 'gap-resolutions.schema.json'), { type: 'object' });
    const review = {
        status: 'qa-required',
        summary: 'Se selecciona el filtro Solo hoy, pero no se comprueba el resultado producido.',
        issues: [{
            code: 'missing-business-assertion',
            severity: 'blocking',
            message: 'La existencia de la opción no demuestra que los movimientos hayan sido filtrados.',
            actionSequences: [2, 3],
            recommendation: 'Vuelve a grabar y valida el rango o un movimiento esperado después de aplicar Solo hoy.',
        }],
    };
    const provider = {
        name: 'fake', getVersion: async () => '1.0.0', cancel() {},
        async execute(input) {
            const candidate = {
                schemaVersion: '1.0', recordingId: 'rec-qa-review', planId: 'plan-qa-review',
                resolutions: [], testDesignReview: review,
            };
            writeJson(path.join(input.cwd, 'gap-resolutions.json'), candidate);
            assert.equal(input.stopOnValidatedOutput.acceptOutput(candidate), true);
            return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
        },
    };
    const previousMode = process.env.RECORDER_GENERATION_MODE;
    process.env.RECORDER_GENERATION_MODE = 'deterministic';
    try {
        const result = await new AgentOrchestrator({ execute: () => ({}) }, provider).run(dir, 'automatic');
        assert.equal(result.success, true);
        assert.equal(result.errorCode, undefined);
        assert.equal(result.testDesignReview.status, 'suggestion');
        assert.equal(fs.existsSync(path.join(dir, 'agent-response.json')), true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'test-design-review.json'), 'utf-8')).status, 'suggestion');
        const feedback = JSON.parse(fs.readFileSync(path.join(dir, 'validation-feedback.json'), 'utf-8'));
        assert.equal(feedback.status, 'valid');
        assert.equal(feedback.valid, true);
        assert.equal(feedback.testDesignReview.issues[0].code, 'missing-business-assertion');
    } finally {
        if (previousMode === undefined) delete process.env.RECORDER_GENERATION_MODE;
        else process.env.RECORDER_GENERATION_MODE = previousMode;
    }
});
