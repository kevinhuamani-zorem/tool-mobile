const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AutomationHistoryStore, AgentRunStore, createAutomationApplicationReceipt, requireUnchangedAppliedFiles } = require('../dist/core/automation');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-history-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return { root, history: new AutomationHistoryStore(root) };
}

test('revisiones y intentos conservan identidad, plan y bytes originales al reabrir', t => {
    const { root, history } = fixture(t);
    const first = history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-70001', source: 'recording' });
    const run = new AgentRunStore(root);
    const attempt = run.start('rec-a');
    run.setPlan('plan-a');
    assert.equal(attempt.attemptId, attempt.runId);
    assert.equal(history.identity().planId, 'plan-a');
    const original = Buffer.from('{ "files": [invalid UTF8 \xff', 'latin1');
    const captured = history.capture('agent-response.json', original, 'agent', 'before-normalization', 1);
    history.capture('agent-response.json', '{"normalized":true}', 'recorder', 'normalized', 1);
    const child = history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-70001', source: 'regeneration' });
    const secondAttempt = run.start('rec-a', 'plan-b');
    assert.notEqual(secondAttempt.runId, attempt.runId);
    assert.equal(child.parentRevisionId, first.revisionId);
    assert.equal(child.basedOnAttemptId, attempt.runId);
    assert.equal(secondAttempt.revisionId, child.revisionId);
    const reopened = new AutomationHistoryStore(root);
    assert.deepEqual(reopened.readArtifact(captured.artifacts[0]), original);
    assert.equal(reopened.current().caseId, 'TC-70001');
    assert.equal(reopened.events().filter(event => event.kind === 'attempt-started').length, 2);
});

test('cada relanzamiento crea otro intento y la primera ejecución consume el preparado', t => {
    const { root, history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-1', source: 'recording' });
    const store = new AgentRunStore(root);
    const prepared = store.start('rec-a', 'plan-a');
    store.claimExecution('rec-a', 'plan-a');
    assert.equal(store.read().runId, prepared.runId);
    store.claimExecution('rec-a', 'plan-a');
    assert.notEqual(store.read().runId, prepared.runId);
    assert.equal(store.read().revisionId, prepared.revisionId);
    history.beginRevision({ recordingId: 'rec-a', source: 'qa-edit' });
    store.claimExecution('rec-a', 'plan-a');
    assert.equal(store.read().revisionId, history.current().revisionId);
    assert.equal(history.events().filter(event => event.kind === 'attempt-started').length, 3);
});

test('exportar y validar una corrección QA no convierten un fallo autónomo en éxito', t => {
    const { root, history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', source: 'recording' });
    new AgentRunStore(root).start('rec-a', 'plan-a');
    const original = history.identity();
    history.append({ ...original, kind: 'generation-result', origin: 'recorder', result: 'failed' });
    history.append({ ...original, kind: 'export-result', origin: 'qa', result: 'exported' });
    assert.deepEqual(history.lifecycle(), { generation: 'failed', export: 'exported', qaApproval: 'pending', functionalVerification: 'not-reported' });
    history.beginRevision({ recordingId: 'rec-a', source: 'qa-edit' });
    history.append({ ...history.identity(), kind: 'qa-validation-result', origin: 'recorder', result: 'passed' });
    assert.equal(history.lifecycle(original.revisionId).generation, 'failed');
    assert.equal(history.lifecycle().generation, 'not-started');
    assert.equal(history.lifecycle().qaApproval, 'pending');
});

test('un checkpoint conserva salidas incompletas y no sigue enlaces ni vuelve a copiar history', t => {
    const { root, history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', source: 'recording' });
    fs.mkdirSync(path.join(root, 'agents/lorem'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents/lorem/behavior-result.json'), 'incomplete {');
    fs.symlinkSync('/etc/hosts', path.join(root, 'external.json'));
    history.checkpoint('before-reset');
    fs.rmSync(path.join(root, 'agents'), { recursive: true });
    const event = history.events().find(event => event.stage === 'before-reset');
    assert.deepEqual(event.artifacts.map(item => item.name), ['agents/lorem/behavior-result.json']);
    assert.equal(history.readArtifact(event.artifacts[0]).toString(), 'incomplete {');
    assert.throws(() => history.captureFile(path.join(root, 'external.json'), 'agent', 'raw'), /fuera del paquete/);
});

test('captura rutas canónicas equivalentes y rechaza un directorio padre redirigido fuera', t => {
    const { root, history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', source: 'recording' });
    const output = path.join(root, 'response.json');
    fs.writeFileSync(output, 'response');
    history.captureFile(fs.realpathSync(output), 'agent', 'canonical');
    assert.equal(history.events().at(-1).artifacts[0].name, 'response.json');
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-history-'));
    t.after(() => fs.rmSync(external, { recursive: true, force: true }));
    fs.writeFileSync(path.join(external, 'private.json'), 'external');
    fs.symlinkSync(external, path.join(root, 'redirect'), 'dir');
    assert.throws(() => history.captureFile(path.join(root, 'redirect/private.json'), 'agent', 'raw'), /fuera del paquete/);
});

test('falla una publicación sin dejar un evento que apunte a un snapshot incompleto', t => {
    const { history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', source: 'recording' });
    const before = history.events();
    const link = fs.linkSync;
    fs.linkSync = (source, target) => {
        if (target.includes(`${path.sep}events${path.sep}`)) throw new Error('disk full');
        return link(source, target);
    };
    try { assert.throws(() => history.capture('response.json', 'partial', 'agent', 'raw'), /disk full/); }
    finally { fs.linkSync = link; }
    assert.deepEqual(history.events(), before);
    const recovered = history.capture('response.json', 'partial', 'agent', 'raw');
    assert.equal(history.readArtifact(recovered.artifacts[0]).toString(), 'partial');
});

test('detecta alteraciones en blobs y eventos y rechaza un historial ajeno', t => {
    const { history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-1', source: 'recording' });
    assert.throws(() => history.beginRevision({ recordingId: 'rec-b', source: 'recording' }), /otra grabación/);
    assert.throws(() => history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-2', source: 'recording' }), /caseId/);
    const event = history.capture('response.json', 'original', 'agent', 'raw');
    fs.writeFileSync(path.join(history.root, 'blobs', event.artifacts[0].sha256), 'changed');
    assert.throws(() => history.readArtifact(event.artifacts[0]), /alterado/);
    const file = fs.readdirSync(path.join(history.root, 'events')).filter(name => name.endsWith('.json'))[0];
    fs.appendFileSync(path.join(history.root, 'events', file), ' ');
    assert.throws(() => history.events(), /evento.*alterado/);
});

test('recibo v2 vincula exportación y revisión, conservando compatibilidad con v1', t => {
    const { root, history } = fixture(t);
    history.beginRevision({ recordingId: 'rec-a', caseId: 'TC-1', source: 'recording' });
    const run = new AgentRunStore(root).start('rec-a', 'plan-a');
    fs.writeFileSync(path.join(root, 'case.feature'), 'Feature: A');
    const scenario = { recordingId: 'rec-a' };
    const plan = { planId: 'plan-a', files: [{ path: 'case.feature', operation: 'create' }] };
    const response = { files: [] };
    const receipt = createAutomationApplicationReceipt(root, scenario, plan, response, history.identity());
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.attemptId, run.runId);
    assert.equal(receipt.revisionId, history.current().revisionId);
    assert.ok(receipt.exportId);
    assert.doesNotThrow(() => requireUnchangedAppliedFiles(root, receipt, 'rec-a', 'plan-a'));
    const legacy = createAutomationApplicationReceipt(root, scenario, plan, response);
    assert.equal(legacy.schemaVersion, 1);
    assert.doesNotThrow(() => requireUnchangedAppliedFiles(root, legacy, 'rec-a', 'plan-a'));
    fs.writeFileSync(path.join(root, 'case.feature'), 'QA correction');
    assert.throws(() => requireUnchangedAppliedFiles(root, receipt, 'rec-a', 'plan-a'), /modificado fuera/);
});
