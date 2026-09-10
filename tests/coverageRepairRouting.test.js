const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyValidationErrors } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
const { projectRoleJson } = require('../dist/core/automation/infrastructure/layered/projections');
const { caseIdentityRules } = require('../dist/core/validation/infrastructure/rules/caseIdentityRules');
const { validatePreparedAgentResponse } = require('../dist/core/automation/infrastructure/validatePreparedAgentResponse');
const { LayeredGenerationOrchestrator } = require('../dist/core/automation');
const { projectPaths, configureWorkspacePaths } = require('../dist/core/workspace');
const frameworkRoot = projectPaths.frameworkRoot;

const paths = {
  feature: 'features/yape-features/payment/coverage.feature',
  steps: 'features/yape-steps-definitions/payment/coverage.steps.ts',
  screen: 'screenobjects/payment/coverage.screen.ts',
  locators: 'resources/locators/payment/coverage.locator.json',
  shared: 'support/helper.ts',
};
const plan = { schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-1', planId: 'plan-1', fingerprint: 'fp',
  deterministicCoverage: 0, status: 'needs-agent', resolutions: [], budgets: {}, unresolvedGapIds: ['gap-1'],
  files: ['feature', 'steps', 'screen', 'locators'].map(layer => ({ layer, path: paths[layer], operation: 'create' })) };
const targets = (layers, complete = true) => ({ complete, files: layers.map(layer => ({ path: paths[layer], layer })) });
const issue = (layers, code = 'case-coverage-unverified') => ({ code, file: paths.feature,
  message: 'TC-1 requiere comprobar su cobertura.', coverageRepairTargets: targets(layers) });
const counts = feedback => [feedback.behavior.length, feedback.interaction.length, feedback.integration.length];

for (const [layers, expected] of [
  [['feature'], [1, 0, 0]], [['steps'], [1, 0, 0]], [['screen'], [0, 1, 0]], [['locators'], [0, 1, 0]],
  [['feature', 'screen'], [1, 1, 0]], [['steps', 'locators'], [1, 1, 0]], [['shared'], [1, 1, 1]],
  [['feature', 'shared'], [1, 1, 1]], [[], [1, 1, 1]],
]) test(`coverage repair follows snapshot changes ${layers.join('+') || 'unknown'} instead of Feature error anchor`, () => {
  for (const code of ['case-coverage-review', 'case-coverage-unverified']) {
    const feedback = classifyValidationErrors([issue(layers, code)], plan);
    assert.deepEqual(counts(feedback), expected);
    assert.equal(feedback.all.length, 1);
  }
});

test('missing/incomplete attribution reaches all roles without losing its original diagnostic', () => {
  const original = { code: 'case-coverage-unverified', file: paths.feature, message: 'No hay snapshot.' };
  for (const item of [original, { ...original, coverageRepairTargets: targets(['screen'], false) }, '[case-coverage-unverified] No hay snapshot.']) {
    assert.deepEqual(counts(classifyValidationErrors([item], plan)), [1, 1, 1]);
  }
});

test('duplicate original/prepared diagnoses union their technical owners while retaining one issue', () => {
  const feedback = classifyValidationErrors([issue(['steps']), issue(['screen'])], plan);
  assert.deepEqual(counts(feedback), [1, 1, 0]);
  assert.equal(feedback.all.length, 1);
  assert(feedback.behavior[0].includes(paths.steps));
  assert(feedback.interaction[0].includes(paths.screen));
  assert.match(feedback.interaction[0], /pertenecen al QA/);
});

test('coverage rule contract is available to both authors without changing other ownership', () => {
  const contract = { rules: [{ code: 'case-coverage-review' }, { code: 'case-coverage-unverified' }, { code: 'assertion' }, { code: 'create-locator-contract' }] };
  for (const role of ['behavior-author', 'interaction-author']) {
    const codes = projectRoleJson('validation-contract.json', contract, role, '/unused').rules.map(rule => rule.code);
    assert(codes.includes('case-coverage-review'));
    assert(codes.includes('case-coverage-unverified'));
    assert.equal(codes.includes('assertion'), role === 'behavior-author');
    assert.equal(codes.includes('create-locator-contract'), role === 'interaction-author');
  }
  const other = classifyValidationErrors([{ ...issue(['screen']), code: 'gherkin-keyword' }], plan);
  assert.deepEqual(counts(other), [1, 0, 0]);
});

function coverageSnapshots() {
  const files = {
    [paths.feature]: 'Feature: Caso\nScenario: [TC-1] Confirmación\n Then se confirma el resultado\n',
    [paths.steps]: `import { Then } from '@wdio/cucumber-framework'; import screen from '@screenobjects/payment/coverage.screen.ts'; Then(/^se confirma el resultado$/, async () => { const result = await screen.confirmed(); expect(result).toBe(true); });`,
    [paths.screen]: `import locator from '@locators/payment/coverage.locator.json'; import helper from '../../support/helper.ts'; class Screen { async confirmed() { return await $(locator.success).isDisplayed(); } } export default new Screen();`,
    [paths.locators]: '{"success":"~success"}', [paths.shared]: 'export default function helper() { return 1; }',
  };
  return { before: { featurePath: paths.feature, files }, after: { featurePath: paths.feature, files: { ...files } } };
}
function validate(pair) {
  const report = { errors: [], warnings: [] };
  caseIdentityRules({ scenario: { squad: 'payment', platform: 'android', request: { caseId: 'TC-1' } }, plan,
    response: { files: plan.files.map(file => ({ ...file, content: pair.after.files[file.path] })) },
    updateBaselines: new Map([['feature', pair.before.files[paths.feature]]]),
    reuseAnalyzer: { getCatalog: () => ({ scenarios: [] }) }, coverageSnapshots: pair }, report);
  return report;
}
for (const [layer, edit, expected] of [
  ['steps', source => source.replace('expect(result).toBe(true);', ''), [1, 0, 0]],
  ['screen', source => source.replace('isDisplayed()', 'isExisting()'), [0, 1, 0]],
  ['locators', source => source.replace('~success', '~other'), [0, 1, 0]],
  ['shared', source => source.replace('return 1', 'return 2'), [1, 1, 1]],
]) test(`real coverage rule attributes changed ${layer} from its validated snapshots`, () => {
  const pair = coverageSnapshots(); pair.after.files[paths[layer]] = edit(pair.after.files[paths[layer]]);
  const snapshotsBefore = JSON.stringify(pair);
  const report = validate(pair);
  assert.equal(report.errors.length, 1, JSON.stringify(report));
  assert.deepEqual(report.errors[0].coverageRepairTargets, targets([layer]));
  assert.deepEqual(counts(classifyValidationErrors(report.errors, plan)), expected);
  assert.equal(JSON.stringify(pair), snapshotsBefore, 'routing never edits the recording or either source snapshot');
  assert(!JSON.stringify(report.errors[0].coverageRepairTargets).includes('~success'));
});

function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
function packageFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-routing-'));
  configureWorkspacePaths({ targetProject: frameworkRoot, runtimeRoot: path.join(root, 'runtime'), source: 'selected' });
  t.after(() => { configureWorkspacePaths({ targetProject: frameworkRoot, runtimeRoot: projectPaths.toolRoot, source: 'auto' }); fs.rmSync(root, { recursive: true, force: true }); });
  writeJson(path.join(root, 'generation-plan.json'), plan);
  writeJson(path.join(root, 'scenario.json'), { recordingId: 'rec-1', request: { caseId: 'TC-1', pathType: 'Happy Path', actions: [] } });
  writeJson(path.join(root, 'gaps.json'), { gaps: [] });
  writeJson(path.join(root, 'agent-response.schema.json'), { type: 'object', required: ['recordingId', 'planId', 'resolutions', 'actionTrace', 'files'] });
  return root;
}
const outputFiles = plan.files.map(file => ({ layer: file.layer, path: file.path,
  content: { feature: 'Feature: Caso', steps: 'export {}', screen: 'export class CaseScreen {}', locators: '{}' }[file.layer] }));

test('preparation preserves and unions snapshot attribution from both validations', t => {
  const root = packageFixture(t);
  let checks = 0;
  const validator = { validate() { return { valid: false, qualityScore: 0, errors: [issue([checks++ ? 'steps' : 'screen'])], warnings: [] }; }, toPreview() { return {}; } };
  const response = { recordingId: 'rec-1', planId: 'plan-1', files: outputFiles, actionTrace: [], resolutions: [] };
  const applier = { prepare() { return { response: { ...response, files: response.files.map(file => ({ ...file, content: file.content + '\n' })) }, diagnostics: [], conflicts: [] }; } };
  const result = validatePreparedAgentResponse(root, response, validator, applier, 1);
  assert.equal(checks, 2);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.errors[0].coverageRepairTargets.files.map(file => file.layer).sort(), ['screen', 'steps']);
  assert.deepEqual(counts(classifyValidationErrors(result.errors, plan)), [1, 1, 0]);
});

for (const [layers, expectedAuthors] of [[['screen'], ['Lorem', 'Zorem', 'Sumrak', 'Zorem', 'Sumrak']], [['steps'], ['Lorem', 'Zorem', 'Sumrak', 'Lorem', 'Sumrak']], [['shared'], ['Lorem', 'Zorem', 'Sumrak', 'Lorem', 'Zorem', 'Sumrak']]]) {
  test(`two-pass orchestration repairs ${layers[0]} with its owners and preserves an exportable final draft`, async t => {
    const root = packageFixture(t), calls = [];
    const agent = { name: 'fixture', cancel() {}, async getVersion() { return '1'; }, async execute(input) {
      calls.push(input.agentName);
      const role = { Lorem: 'behavior-author', Zorem: 'interaction-author', Sumrak: 'integration-reviewer' }[input.agentName];
      const layers = role === 'behavior-author' ? ['feature', 'steps'] : role === 'interaction-author' ? ['screen', 'locators'] : ['feature', 'steps', 'screen', 'locators'];
      const response = { schemaVersion: 1, recordingId: 'rec-1', planId: 'plan-1', files: outputFiles.filter(file => layers.includes(file.layer)), actionTrace: [],
        ...(role === 'integration-reviewer' ? { resolutions: [{ gapId: 'gap-1', decision: 'resolved' }] } : { role }),
        ...(role === 'behavior-author' ? { testDesignReview: { status: 'suggestion', summary: 'Revisar aceptación.', issues: [] } } : {}) };
      writeJson(path.join(input.cwd, { Lorem: 'behavior-result.json', Zorem: 'interaction-result.json', Sumrak: 'agent-response.json' }[input.agentName]), response);
      return { success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, cancelled: false };
    } };
    let checks = 0;
    const result = await new LayeredGenerationOrchestrator(agent, agent, () => { checks++; return { valid: false, qualityScore: 0, errors: [issue(layers)] }; }, { build() { throw new Error('Sin borrador en fixture.'); } }).run(root, { parallelAuthors: false });
    assert.equal(result.success, false);
    assert.equal(checks, 2);
    assert.deepEqual(calls, expectedAuthors);
    assert.match(result.error, /dos pasadas/);
    assert(fs.existsSync(path.join(root, 'agent-response.json')));
    const draft = JSON.parse(fs.readFileSync(path.join(root, 'layered-draft.json')));
    assert.equal(draft.files.length, 4);
    const report = JSON.parse(fs.readFileSync(result.reportFile));
    assert.equal(report.repairAttempts, 1);
    for (const name of new Set(calls)) assert(calls.filter(call => call === name).length <= 2);
    const assigned = layers[0] === 'screen' ? 'zorem' : 'lorem';
    const feedback = JSON.parse(fs.readFileSync(path.join(root, 'agents', assigned, 'repair-feedback.json')));
    assert(feedback.errors.some(error => error.includes('[coverage-repair]')));
    assert.match(fs.readFileSync(path.join(root, 'scenario.json'), 'utf8'), /"actions":\[\]/);
  });
}
