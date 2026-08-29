const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AgentOrchestrator } = require('../dist/core/agentOrchestrator');
const { DEFAULT_AGENT_OPERATIONAL_BUDGETS } = require('../dist/core/automationContracts');

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function packageFixture(overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-orchestrator-'));
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
        unresolvedGapIds: ['gap-screen'],
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
    return root;
}

test('orchestrator ejecuta dos pasadas y genera query-results', async () => {
    const dir = packageFixture();
    const provider = {
        name: 'fake',
        getVersion: async () => '1.2.3',
        cancel() {},
        async execute(input) {
            if (/PASS 1/.test(input.prompt)) {
                writeJson(path.join(dir, 'query-requests.json'), {
                    schemaVersion: '1.0',
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
    const status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf-8'));
    assert.equal(status.state, 'completed');
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
