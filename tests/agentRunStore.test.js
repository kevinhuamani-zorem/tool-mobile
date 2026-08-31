const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentRunStore } = require('../dist/core/agentRunStore');

test('agent-run registra éxito, cache y tiempos sin contenido sensible', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-'));
    let now = Date.parse('2026-08-29T10:00:00.000Z');
    const store = new AgentRunStore(root, () => now);
    store.start('recording-1', 'plan-1');
    store.addDuration('resolverDurationMs', 15);
    store.recordFrameworkAccess({
        cacheHit: true, filesExamined: 12, filesRead: 2, bytesRead: 500,
        indexedFiles: 12, reindexedFiles: 2, indexDurationMs: 8, queryCount: 1,
    });
    store.setContextBytes(900);
    store.markAgentStarted();
    now += 50;
    store.markAgentFinished();
    store.setResponseBytes(400);
    now += 25;
    store.mark('generated', true);

    const artifact = JSON.parse(fs.readFileSync(path.join(root, 'agent-run.json'), 'utf-8'));
    assert.equal(artifact.totalDurationMs, 75);
    assert.equal(artifact.resolverDurationMs, 15);
    assert.equal(artifact.indexDurationMs, 8);
    assert.equal(artifact.agentDurationMs, 50);
    assert.equal(artifact.filesRead, 2);
    assert.equal(artifact.bytesRead, 500);
    assert.equal(artifact.queryCount, 1);
    assert.equal(artifact.cacheHits, 1);
    assert.equal(artifact.totalContextBytes, 0);
    assert.equal(artifact.aggregatedContextBytes, 0);
    assert.equal(artifact.tokensInput, null);
    assert.equal(artifact.tokensOutput, null);
    assert.equal(artifact.result, 'generated');
    const serialized = JSON.stringify(artifact);
    assert.doesNotMatch(serialized, /prompt|xml|screenshot|secret/i);
});

test('agent-run conserva métricas y resultado en una ejecución fallida', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-failed-'));
    let now = 1_700_000_000_000;
    const store = new AgentRunStore(root, () => now);
    store.start('recording-failed');
    store.markRepairStarted();
    now += 30;
    store.markRepairFinished();
    store.setRepairAttempts(1);
    store.mark('repair-exhausted', true);
    const artifact = store.read();
    assert.equal(artifact.result, 'repair-exhausted');
    assert.equal(artifact.repairDurationMs, 30);
    assert.equal(artifact.repairAttempts, 1);
    assert.ok(artifact.finishedAt);
});

test('agent-run guarda contexto por pasada y breakdown', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-context-'));
    const store = new AgentRunStore(root);
    store.start('recording-pass');
    store.setPassContext('pass1', 900, {
        promptBaseBytes: 10,
        instructionsBytes: 10,
        scenarioBytes: 200,
        generationPlanBytes: 120,
        hintsBytes: 100,
        gapsBytes: 80,
        frameworkApiBytes: 0,
        reuseContextBytes: 0,
        resolvedContextBytes: 0,
        unresolvedContextBytes: 0,
        locatorCandidatesBytes: 0,
        collisionReportBytes: 0,
        queryRequestsBytes: 0,
        queryResultsBytes: 0,
        queryContractBytes: 40,
        wrapperBytes: 340,
        totalBytes: 900,
    });

    test('setContextBytes no altera totalContextBytes sin pasadas de agente', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-context-total-'));
        const store = new AgentRunStore(root);
        store.start('recording-pass');
        store.setContextBytes(15560);
        const artifact = store.read();
        assert.equal(artifact.contextBytes, 15560);
        assert.equal(artifact.pass1ContextBytes, 0);
        assert.equal(artifact.pass2ContextBytes, 0);
        assert.equal(artifact.totalContextBytes, 0);
        assert.equal(artifact.aggregatedContextBytes, 0);
    });
    store.setPassContext('pass2', 1200, {
        promptBaseBytes: 12,
        instructionsBytes: 18,
        scenarioBytes: 300,
        generationPlanBytes: 150,
        hintsBytes: 100,
        gapsBytes: 80,
        frameworkApiBytes: 180,
        reuseContextBytes: 120,
        resolvedContextBytes: 0,
        unresolvedContextBytes: 0,
        locatorCandidatesBytes: 90,
        collisionReportBytes: 60,
        queryRequestsBytes: 0,
        queryResultsBytes: 40,
        queryContractBytes: 40,
        wrapperBytes: 10,
        totalBytes: 1200,
    });
    const artifact = store.read();
    assert.equal(artifact.pass1ContextBytes, 900);
    assert.equal(artifact.pass2ContextBytes, 1200);
    assert.equal(artifact.contextBytes, 1200);
    assert.equal(artifact.totalContextBytes, 2100);
    assert.equal(artifact.aggregatedContextBytes, 2100);
    assert.equal(artifact.pass1ContextBreakdown.totalBytes, 900);
    assert.equal(artifact.pass2ContextBreakdown.totalBytes, 1200);
});
