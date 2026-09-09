const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validatePreparedAgentResponse, AutomationApplier, AutomationHistoryStore, AgentRunStore } = require('../dist/core/automation');
const { projectPaths } = require('../dist/core/workspace');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prepared-agent-'));
    const beforePaths = { frameworkRoot: projectPaths.frameworkRoot, toolConfig: projectPaths.toolConfig };
    projectPaths.frameworkRoot = root;
    projectPaths.toolConfig = path.join(root, 'config');
    t.after(() => { Object.assign(projectPaths, beforePaths); fs.rmSync(root, { recursive: true, force: true }); });
    const pkg = path.join(root, 'recording/generation/automation');
    fs.mkdirSync(pkg, { recursive: true });
    const file = 'screenobjects/payment/contacts.screen.ts';
    const before = 'export class ContactsScreen {\n public async enterNumber() { await this.oldButton.click(); }\n}\nexport default new ContactsScreen();\n';
    fs.mkdirSync(path.join(root, 'screenobjects/payment'), { recursive: true });
    fs.writeFileSync(path.join(root, file), before);
    const scenario = { schemaVersion: 1, recordingId: 'recording', createdAt: '2026-09-09T10:00:00Z', actions: [], request: { caseId: 'TC-10240' } };
    const plan = { schemaVersion: 1, recordingId: scenario.recordingId, planId: 'plan', files: [{ layer: 'screen', path: file, operation: 'update' }], resolutions: [], unresolvedGapIds: [] };
    const json = (name, value) => fs.writeFileSync(path.join(pkg, name), JSON.stringify(value));
    json('scenario.json', scenario); json('generation-plan.json', plan);
    const history = new AutomationHistoryStore(pkg); history.ensureRevision(scenario.recordingId, scenario.request.caseId);
    new AgentRunStore(pkg).start(scenario.recordingId, plan.planId);
    const response = { schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId, files: [{ layer: 'screen', path: file, content: before.replace('oldButton', 'destinationButton') }],
        actionTrace: [{ sequence: 6, screenMethod: 'enterNumber', locatorName: 'destinationButton', gherkinStep: 'When el usuario elige un destino' }], resolutions: [] };
    const applier = new AutomationApplier(undefined, undefined, undefined, root);
    return { root, pkg, file, before, response, plan, json, applier, history };
}

function validator(calls, predicate) {
    return {
        toPreview: response => ({ files: response.files.map(file => file.path), featurePath: '', featureContent: '' }),
        validate(_scenario, _plan, response) {
            calls.push(structuredClone(response));
            const valid = predicate(response);
            return { valid, qualityScore: valid ? 100 : 80, errors: valid ? [] : [{ code: 'trace-screen-method', file: response.files[0].path, message: 'La acción 6 no consume el getter destinationButton.' }], warnings: [] };
        },
    };
}

test('el callback de generación valida el cuerpo realmente exportable antes de agotar la reparación', t => {
    const f = fixture(t);
    const calls = [];
    const original = JSON.stringify(f.response);
    const result = validatePreparedAgentResponse(f.pkg, f.response, validator(calls, value => value.files[0].content.includes('destinationButton')), f.applier, 1);
    assert.equal(result.valid, false);
    assert.equal(calls.length, 2);
    assert.match(calls[0].files[0].content, /destinationButton/);
    assert.match(calls[1].files[0].content, /oldButton/);
    assert.ok(result.errors.some(issue => issue.code === 'trace-screen-method'));
    assert.ok(result.errors.some(issue => issue.code === 'shared-symbol-change-discarded'));
    assert.equal(JSON.stringify(f.response), original, 'el diagnóstico no sustituye la respuesta de los autores');
    assert.equal(fs.readFileSync(path.join(f.root, f.file), 'utf8'), f.before, 'preparar no escribe el framework');
    assert.deepEqual(calls[1].actionTrace, f.response.actionTrace);
    const event = f.history.events().find(item => item.stage === 'integration:prepared');
    assert.equal(event.pass, 1);
    const recorded = JSON.parse(f.history.readArtifact(event.artifacts[0]));
    assert.match(recorded.files[0].content, /oldButton/);
});

test('una API nueva específica del caso conserva el método compartido y pasa la validación preparada', t => {
    const f = fixture(t);
    f.response.files[0].content = f.before.replace('\n}', '\n public async enterCaseDestination() { await this.destinationButton.click(); }\n}');
    f.response.actionTrace[0].screenMethod = 'enterCaseDestination';
    const calls = [];
    const result = validatePreparedAgentResponse(f.pkg, f.response, validator(calls, value =>
        value.files[0].content.includes('enterCaseDestination()') && value.files[0].content.includes('this.oldButton.click()')), f.applier, 2);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.qualityScore, 100);
    assert.deepEqual(result.errors, []);
    assert.equal(fs.readFileSync(path.join(f.root, f.file), 'utf8'), f.before);
});

test('el fallo de preparación se reporta y conserva los errores originales y los archivos', t => {
    const f = fixture(t);
    const calls = [];
    const result = validatePreparedAgentResponse(f.pkg, f.response, validator(calls, () => false), {
        prepare() { throw new Error('El baseline cambió.'); },
    }, 2);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(issue => issue.code === 'trace-screen-method'));
    assert.ok(result.errors.some(issue => issue.code === 'preparation' && /baseline cambió/.test(issue.message)));
    assert.equal(fs.readFileSync(path.join(f.root, f.file), 'utf8'), f.before);
});
