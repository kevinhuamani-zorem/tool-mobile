const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { summarizePilot, summarizeControlledFaults } = require('../dist/core/automation/domain/evaluationMetrics');
const { evaluateBehaviorReuse } = require('../dist/core/automation/domain/reuseEvaluation');
const { AutomationHistoryStore, AgentRunStore, evaluateAutomationPackages } = require('../dist/core/automation');
const { preparePilot, executePilot, reportPilot, validatePilotOutput, roleExecution } = require('../scripts/agent-pilot');
const { evaluateControlledFixture, controlledMutations } = require('../scripts/validator-evaluate');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const json = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
function temporary(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-pilot-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }

test('pilot keeps missing and interrupted trials in denominators and separates corrected/static/functional outcomes', () => {
    const scheduled = [1, 2, 3].map(repetition => ({ caseId: 'TC-1', repetition, examples: true }));
    const observations = scheduled.slice(0, 2).map(row => ({ ...row, status: 'completed', static: 'passed', acceptance: 'passed', functional: 'not-evaluated', qaCorrected: false, modelVerified: true, pipelinePassed: true, prepared: true, compilationStatus: 'passed' }));
    observations[1].qaCorrected = true;
    const report = summarizePilot(observations, scheduled);
    assert.equal(report.autonomousTaskSuccess.rate, 1 / 3); assert.equal(report.termination.rate, 2 / 3);
    assert.equal(report.allRepetitionsPassRate.rate, 0); assert.equal(report.functionalPassRate.rate, null);
    assert.equal(report.functionalPassRate.notEvaluated, 3);
    assert.throws(() => summarizePilot([...observations, observations[0]], scheduled), /duplicadas/);
});

test('history aggregation includes interrupted attempts and rejects acceptance evidence bound to other bytes', t => {
    const directory = temporary(t), pkg = path.join(directory, 'pkg');
    const history = new AutomationHistoryStore(pkg), run = new AgentRunStore(pkg);
    history.beginRevision({ recordingId: 'r', caseId: 'TC-1', source: 'recording' });
    run.start('r', 'plan'); run.claimExecution('r', 'plan'); run.mark('interrupted', true);
    run.start('r', 'plan2'); run.claimExecution('r', 'plan2');
    const response = { files: [{ layer: 'feature', path: 'x.feature', content: 'Feature: x' }] };
    history.capture('agent-response.json', JSON.stringify(response), 'agent', 'final-response');
    history.capture('validation.json', JSON.stringify({ assessment: { artifactHash: 'wrong', acceptance: { status: 'passed' } } }), 'recorder', 'evaluation:assessment');
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'passed' }, [{ name: 'layered-generation-run.json', content: JSON.stringify({ stages: [{ invoked: true, execution: 'agent' }] }) }]);
    const report = evaluateAutomationPackages([pkg], path.join(directory, 'golden'));
    assert.equal(report.metrics.autonomousFinal.denominator, 2); assert.equal(report.metrics.interrupted.numerator, 1);
    assert.equal(report.metrics.autonomousTaskSuccess.numerator, 0); assert.equal(report.metrics.functionalTaskSuccess.rate, null);
});

function reuseFixture() {
    const screen = { layer: 'screen', path: 'screenobjects/payment/m.screen.ts', content: 'class Screen { public async open() { await this.button.click(); } } export default new Screen();' };
    const steps = { layer: 'steps', path: 'features/yape-steps-definitions/payment/m.steps.ts', content: "import screen from '@screenobjects/payment/m.screen.js'; When(/^abre movimientos$/, async () => { await screen.open(); });" };
    const report = { decisions: [{ kind: 'step', sequences: [1], method: 'open' }] };
    const labels = { caseId: 'TC-1', groups: [{ sequences: [1], expected: 'reuse', method: 'open', screenFile: screen.path }] };
    const evidence = { response: { files: [screen, steps, { layer: 'feature', path: 'features/yape-features/payment/m.feature', content: 'Feature: movimientos\n Scenario: [TC-1] movimientos\n  When abre movimientos\n' }], actionTrace: [{ sequence: 1, screenMethod: 'open', gherkinStep: 'abre movimientos' }] }, baselineFiles: [screen] };
    return { report, labels, evidence };
}
test('reuse earns precision/recall only from actual files, independent baseline and invoked Step', () => {
    const f = reuseFixture();
    assert.equal(evaluateBehaviorReuse(f.report, f.labels).status, 'not-evaluated');
    const valid = evaluateBehaviorReuse(f.report, f.labels, f.evidence);
    assert.equal(valid.precision.rate, 1); assert.equal(valid.recall.rate, 1);
    f.evidence.response.files[0] = { ...f.evidence.response.files[0], content: f.evidence.response.files[0].content.replace('click()', 'isDisplayed()') };
    assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).missedReuse, 1);
});
test('unused/dead/wrongly imported Screen calls do not prove reuse', () => {
    for (const replacement of ["if (false) { await screen.open(); }", "await other.open();"]) {
        const f = reuseFixture(); f.evidence.response.files[1].content = f.evidence.response.files[1].content.replace('await screen.open();', replacement);
        assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).correctlyReused, 0);
    }
    const f = reuseFixture(); f.labels.groups[0].expected = 'create';
    assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).incorrectlyReused, 1);
});

test('mutation scoring exposes missed target rules and false positives without counting missing fixtures', () => {
    const report = summarizeControlledFaults([
        { id: 'clean', expected: 'valid', observed: 'invalid', actualCodes: ['noise'] },
        { id: 'type', expected: 'invalid', observed: 'invalid', expectedCode: 'type', actualCodes: ['type'] },
        { id: 'range', expected: 'invalid', observed: 'invalid', expectedCode: 'range', actualCodes: ['noise'] },
        { id: 'missing', expected: 'invalid', observed: 'not-evaluated', actualCodes: [] },
    ]);
    assert.equal(report.precision.rate, 0.5); assert.equal(report.recall.rate, 0.5); assert.equal(report.notEvaluated, 1);
});
test('controlled runner modifies copies and requires valid baseline before injecting defects', () => {
    const scenario = { actions: [] }, response = { files: [{ layer: 'feature', content: 'Feature: x\n Scenario: [TC-1] caso\n  Then listo\n' }, { layer: 'screen', path: 'screenobjects/payment/pilot.screen.ts', content: 'class PilotScreen {}' }] };
    const before = JSON.stringify(response), mutations = controlledMutations(scenario, response);
    assert.deepEqual(mutations.map(row => row.id), ['duplicate-case']); assert.equal(JSON.stringify(response), before);
    const result = evaluateControlledFixture(scenario, response, () => ({ valid: false, errors: [{ code: 'baseline-drift' }] }));
    assert.equal(result.samples.length, 1); assert.equal(result.samples[0].observed, 'invalid');
    assert.equal(summarizeControlledFaults(result.samples).falsePositives, 1);
});

function pilotFixture(t) {
    const directory = temporary(t), framework = path.join(directory, 'framework'), goldenRoot = path.join(directory, 'golden');
    for (const name of ['features/yape-features', 'features/yape-steps-definitions', 'resources/locators', 'screenobjects', 'support']) {
        fs.mkdirSync(path.join(framework, name), { recursive: true }); fs.writeFileSync(path.join(framework, name, '.keep'), 'fixture');
    }
    json(path.join(framework, 'package.json'), { name: 'framework' }); fs.mkdirSync(goldenRoot);
    execFileSync('git', ['init', '-q', framework]); execFileSync('git', ['-C', framework, 'add', '.']);
    execFileSync('git', ['-C', framework, '-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    const frameworkCommit = execFileSync('git', ['-C', framework, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const scenario = path.join(directory, 'scenario.json'); json(scenario, { recordingId: 'r', request: { caseId: 'TC-1' }, actions: [{ sequence: 1, action: 'CLICK' }] });
    return { directory, framework, config: { framework, goldenRoot, frameworkCommit, model: 'test-model', repetitions: 3, cases: [{ caseId: 'TC-1', scenario }] } };
}
test('pilot prepares without provider and runs both arms in fresh pinned frameworks with two simulated passes', async t => {
    const f = pilotFixture(t), directory = path.join(f.directory, 'pilot'), manifest = preparePilot(f.config, directory);
    assert.equal(manifest.trials.length, 6); assert.equal(manifest.purpose, 'evaluation');
    await assert.rejects(executePilot(directory), /--execute/);
    let calls = 0; const roots = new Set();
    const report = await executePilot(directory, { execute: true,
        prepare(recording) {
            const pkg = path.join(recording, 'generation', 'automation'); fs.mkdirSync(pkg, { recursive: true });
            new AutomationHistoryStore(pkg).beginRevision({ recordingId: 'r', caseId: 'TC-1', source: 'recording' });
        },
        providerFactory: () => ({ name: 'simulated', cancel() {}, async getVersion() { return 'fixture'; }, async execute(request) {
            calls++; roots.add(request.cwd); assert.equal(process.env.RECORDER_GOLDEN_PURPOSE, 'evaluation');
            const response = { files: [], actionTrace: [] }; json(path.join(request.cwd, 'agent-response.json'), response);
            return { success: true, modelUsage: { actualModels: ['test-model'] } };
        } }),
        async run(pkg, provider, pinned) {
            for (const pass of [1, 2]) await provider.execute({ cwd: pkg, model: pinned.model, agentName: 'Lorem', prompt: `pass-${pass}` });
            await assert.rejects(provider.execute({ cwd: pkg, model: pinned.model, agentName: 'Lorem', prompt: 'pass-3' }), /dos pasadas/);
            return { success: true, responseFile: path.join(pkg, 'agent-response.json') };
        },
        finalize: (_pkg, response) => ({ response, prepared: true, compilation: { status: 'passed' }, validation: { valid: true, errors: [], assessment: { artifactHash: sha('[]'), acceptance: { status: 'passed' } } } }),
    });
    assert.equal(calls, 12); assert.equal(roots.size, 6); assert.equal(report.metrics.autonomousTaskSuccess.rate, 1);
    assert.equal(report.metrics.functionalPassRate.rate, null); assert.equal(report.observations.every(row => row.calls.length === 2), true);
    assert.equal(reportPilot(directory).metrics.termination.rate, 1);
    await assert.rejects(executePilot(directory, { execute: true }), /ya inició/);
    assert.equal(execFileSync('git', ['-C', f.framework, 'status', '--porcelain'], { encoding: 'utf8' }), '');
});
test('pilot detects interrupted runs and rejects modified authoritative inputs before any execution', async t => {
    const f = pilotFixture(t), directory = path.join(f.directory, 'pilot'), manifest = preparePilot(f.config, directory);
    json(path.join(directory, 'trials', '001', 'started.json'), manifest.trials[0]);
    assert.equal(reportPilot(directory).metrics.interrupted, 1);
    fs.appendFileSync(path.join(directory, manifest.cases[0].input), ' ');
    await assert.rejects(executePilot(directory, { execute: true }), /grabación/);
});


test('mutation targets the recorded Android getter while preserving its iOS type', () => {
    const { frameworkContract, projectPaths } = require('../dist/core/workspace');
    const contract = frameworkContract(projectPaths.frameworkRoot);
    const args = contract.locatorSignature.platformOrder.map(platform => `TypeLocator.${platform === 'android' ? 'ANDROID' : 'XPATH'}, L.${platform}.button`).join(', ');
    const content = `import LocatorProvider from '${contract.locatorFactoryImport}';
import { TypeLocator } from '${contract.typeLocatorImport}';
import L from '@locators/payment/pilot.locator.json';
class PilotScreen { public get siButton() { const locator = LocatorProvider.getElement(${args}); return $(locator); } }
export default new PilotScreen();`;
    const response = { files: [{ layer: 'screen', path: 'screenobjects/payment/pilot.screen.ts', content }], actionTrace: [{ sequence: 1, locatorName: 'siButton' }] };
    const result = controlledMutations({ platform: 'android', actions: [{ sequence: 1, selector: 'android=UiSelector()', selectorVerified: true }] }, response).find(row => row.id === 'locator-type');
    assert.ok(result); assert.equal(result.platform, 'android'); assert.equal(result.getter, 'siButton'); assert.equal(result.before, 'ANDROID');
    assert.ok(result.response.files[0].content.includes('TypeLocator.XPATH, L.ios.button'));
    assert.notEqual(result.response.files[0].content, content);
});

test('final import assessment binds prepared bytes while preserving earlier actual invocation evidence', t => {
    const { acceptanceArtifactHash } = require('../dist/core/automation/contracts/acceptanceCriteria');
    const directory = temporary(t), pkg = path.join(directory, 'pkg'), history = new AutomationHistoryStore(pkg);
    history.beginRevision({ recordingId: 'r', caseId: 'TC-2', source: 'recording' });
    const run = new AgentRunStore(pkg); run.start('r', 'p'); run.claimExecution('r', 'p');
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'failed' }, [{ name: 'layered-generation-run.json', content: JSON.stringify({ stages: [{ invoked: true, execution: 'agent' }] }) }]);
    const files = [{ layer: 'feature', path: 'x.feature', content: 'Feature: x' }];
    const assessment = { artifactHash: acceptanceArtifactHash(files), acceptance: { status: 'passed' } };
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'passed', stage: 'import-validation' }, [
        { name: 'validation.json', content: JSON.stringify({ assessment }) }, { name: 'prepared-response.json', content: JSON.stringify({ files }) },
    ]);
    const result = evaluateAutomationPackages([pkg], path.join(directory, 'golden'));
    assert.equal(result.attempts[0].invocations, 1); assert.equal(result.metrics.autonomousTaskSuccess.numerator, 1);
    assert.equal(result.metrics.functionalTaskSuccess.numerator, 0);
});


test('reuse does not credit orphaned Steps or Steps invoked only by another TC', () => {
    for (const feature of ['Feature: x\n Scenario: [TC-1] objetivo\n  When otro paso\n',
        'Feature: x\n Scenario: [TC-1] objetivo\n  When otro paso\n Scenario: [TC-2] ajeno\n  When abre movimientos\n']) {
        const f = reuseFixture(); f.evidence.response.files.find(file => file.layer === 'feature').content = feature;
        assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).correctlyReused, 0);
        assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).missedReuse, 1);
    }
    const f = reuseFixture(); f.evidence.response.files = f.evidence.response.files.filter(file => file.layer !== 'feature');
    assert.equal(evaluateBehaviorReuse(f.report, f.labels, f.evidence).status, 'not-evaluated');
});


test('pipeline failure never passes task success even when it delivered statically valid files', () => {
    const scheduled = [{ caseId: 'TC-1', repetition: 1, examples: true }];
    const base = { ...scheduled[0], status: 'completed', static: 'passed', acceptance: 'passed', functional: 'not-evaluated', qaCorrected: false, modelVerified: true, prepared: true, compilationStatus: 'passed' };
    for (const pipelinePassed of [false, undefined]) {
        const result = summarizePilot([{ ...base, pipelinePassed }], scheduled);
        assert.equal(result.autonomousTaskSuccess.numerator, 0); assert.equal(result.allRepetitionsPassRate.numerator, 0);
    }
    assert.equal(summarizePilot([{ ...base, pipelinePassed: true, compilationStatus: 'unavailable' }], scheduled).autonomousTaskSuccess.numerator, 0);
    assert.equal(summarizePilot([{ ...base, pipelinePassed: true, prepared: false }], scheduled).autonomousTaskSuccess.numerator, 0);
});

test('report rejects manifest tampering and preserves all programmed trials', t => {
    const f = pilotFixture(t), directory = path.join(f.directory, 'pilot'), manifest = preparePilot(f.config, directory);
    json(path.join(directory, 'manifest.json'), { ...manifest, trials: [] });
    assert.throws(() => reportPilot(directory), /protocolo fue alterado/);
});

test('final pilot validation compiles prepared bytes and marks missing dependencies unavailable without writes', t => {
    const { projectPaths, configureWorkspacePaths } = require('../dist/core/workspace');
    const { acceptanceArtifactHash } = require('../dist/core/automation/contracts/acceptanceCriteria');
    const f = pilotFixture(t), pkg = path.join(f.directory, 'pkg');
    const original = { targetProject: projectPaths.frameworkRoot, runtimeRoot: projectPaths.runtimeRoot, source: 'selected' };
    t.after(() => configureWorkspacePaths(original));
    configureWorkspacePaths({ targetProject: f.framework, runtimeRoot: path.join(f.directory, 'runtime'), source: 'selected' });
    json(path.join(f.framework, 'tsconfig.json'), { compilerOptions: { target: 'ES2021', module: 'CommonJS', types: [], skipLibCheck: true } });
    json(path.join(pkg, 'scenario.json'), {}); json(path.join(pkg, 'generation-plan.json'), {});
    const raw = { files: [{ layer: 'screen', path: 'screenobjects/pilot.ts', content: 'export const answer: number = 1;' }] };
    const validator = { toPreview: () => ({}), validate(_scenario, _plan, response) {
        return { valid: true, qualityScore: 100, errors: [], warnings: [], assessment: { artifactHash: acceptanceArtifactHash(response.files), static: { status: 'passed', errorCount: 0 }, acceptance: { status: 'passed' }, functional: { status: 'not-evaluated' } } };
    } };
    for (const [content, status] of [['export const answer: number = "wrong";', 'failed'], ['import unknown from "missing-evaluation-dependency"; export default unknown;', 'unavailable']]) {
        const preparedResponse = { files: [{ ...raw.files[0], content }] };
        const applier = { prepare: () => ({ response: preparedResponse, files: [{ path: raw.files[0].path, content, before: null }] }) };
        const result = validatePilotOutput(pkg, raw, { applier, validator });
        assert.equal(result.compilation.status, status); assert.equal(result.validation.valid, false);
        assert.equal(result.validation.assessment.artifactHash, acceptanceArtifactHash(preparedResponse.files));
        assert.equal(result.validation.assessment.static.status, 'failed');
        assert.equal(fs.existsSync(path.join(f.framework, raw.files[0].path)), false);
    }
});

test('role report exposes deterministic framework reuse without inventing provider invocations', t => {
    const directory = temporary(t);
    json(path.join(directory, 'layered-generation-run.json'), { stages: [
        { role: 'behavior-author', execution: 'design-review', invoked: true, state: 'completed', attempt: 0 },
        { role: 'interaction-author', execution: 'deterministic', invoked: false, state: 'completed', attempt: 0 },
        { role: 'integration-reviewer', execution: 'deterministic', invoked: false, state: 'completed', attempt: 0 },
    ] });
    const result = roleExecution(directory, [{ agent: 'Lorem' }]);
    assert.equal(result[0].mode, 'agent'); assert.equal(result[0].invocations, 1);
    assert.equal(result[1].mode, 'deterministic'); assert.equal(result[1].invocations, 0);
    assert.equal(result[2].mode, 'deterministic'); assert.equal(result[2].invocations, 0);
});


test('manual or deterministic imports without provider evidence never earn agent task success', t => {
    const { acceptanceArtifactHash } = require('../dist/core/automation/contracts/acceptanceCriteria');
    const directory = temporary(t), pkg = path.join(directory, 'pkg'), history = new AutomationHistoryStore(pkg);
    history.beginRevision({ recordingId: 'r', caseId: 'TC-9', source: 'recording' });
    const run = new AgentRunStore(pkg); run.start('r', 'p'); run.claimExecution('r', 'p');
    const files = [{ layer: 'feature', path: 'x.feature', content: 'Feature: x' }];
    history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', result: 'passed', stage: 'import-validation' }, [
        { name: 'validation.json', content: JSON.stringify({ assessment: { artifactHash: acceptanceArtifactHash(files), acceptance: { status: 'passed' } } }) },
        { name: 'prepared-response.json', content: JSON.stringify({ files }) },
    ]);
    const result = evaluateAutomationPackages([pkg], path.join(directory, 'golden'));
    assert.equal(result.attempts[0].agentInvoked, false);
    assert.deepEqual(result.metrics.autonomousTaskSuccess, { numerator: 0, denominator: 1, rate: 0, notEvaluated: 1 });
    assert.equal(result.metrics.acceptanceImplementation.numerator, 1, 'implementation evidence remains visible separately');
});
