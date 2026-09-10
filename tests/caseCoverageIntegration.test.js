const test = require('node:test');
const assert = require('node:assert/strict');
const { compareCaseCoverage } = require('../dist/core/indexing');
const { caseIdentityRules } = require('../dist/core/validation/infrastructure/rules/caseIdentityRules');
const { mergeFeatureUpdate } = require('../dist/core/generation/infrastructure/deterministicGenerator');
const { classifyValidationErrors } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
const FEATURE = 'features/yape-features/payment/coverage.feature';
const STEPS = 'features/yape-steps-definitions/payment/coverage.steps.ts';
const SCREEN = 'screenobjects/payment/coverage.screen.ts';
const LOCATORS = 'resources/locators/payment/coverage.locator.json';
const beforeFeature = `Feature: Yapeo
  Scenario Outline: [TC-10240] Yapeo
    When escribe el monto <amount> y el comentario <comment>
    Then comprueba el resultado
    Examples:
      | amount | comment |
      | 2 | prueba sintetica |
`;
const afterFeature = beforeFeature.replace('escribe el monto', 'solicita un yapeo por').replace('comprueba el resultado', 'el yapeo está confirmado');
const definitions = `import { When, Then } from '@wdio/cucumber-framework';
import screen from '@screenobjects/payment/coverage.screen';
When(/^escribe el monto (.*) y el comentario (.*)$/, async (amount: string, comment: string) => {
  await screen.pay(amount, comment);
});
Then(/^comprueba el resultado$/, async () => {
  const result = await screen.confirmed();
  expect(result).toBe(true);
});
`;
const aliases = `
When(/^solicita un yapeo por (.*) y el comentario (.*)$/, async (value: string, note: string) => {
  await screen.pay(value, note);
});
Then(/^el yapeo está confirmado$/, async () => {
  const visible = await screen.confirmed();
  expect(visible).toBe(true);
});
`;
function snapshots(afterOverrides = {}) {
  const beforeFiles = {
    [FEATURE]: beforeFeature, [STEPS]: definitions,
    [SCREEN]: `import locator from '@locators/payment/coverage.locator.json';
class Screen {
  async pay(amount: string, comment: string) { await $(locator.amount).setValue(amount); await $(locator.comment).setValue(comment); }
  async confirmed() { return $(locator.confirmation).isDisplayed(); }
}
export default new Screen();`,
    [LOCATORS]: JSON.stringify({ amount: '~amount', comment: '~comment', confirmation: '~success' }),
  };
  return { before: { featurePath: FEATURE, files: beforeFiles }, after: { featurePath: FEATURE,
    files: { ...beforeFiles, [FEATURE]: afterFeature, [STEPS]: definitions + aliases, ...afterOverrides } } };
}
function validate(pair) {
  const report = { errors: [], warnings: [] };
  caseIdentityRules({ scenario: { squad: 'payment', platform: 'android', request: { caseId: 'TC-10240' } },
    plan: { files: [] }, response: { files: [{ layer: 'feature', path: FEATURE, content: pair.after.files[FEATURE] }] },
    updateBaselines: new Map([['feature', pair.before.files[FEATURE]]]),
    reuseAnalyzer: { getCatalog: () => ({ scenarios: [] }) }, coverageSnapshots: pair }, report);
  return report;
}
function merged(pair) {
  return mergeFeatureUpdate(pair.before.files[FEATURE], pair.after.files[FEATURE], true,
    caseId => compareCaseCoverage({ caseId, platform: 'android', ...pair }).status);
}

test('merge y regla aceptan la misma redacción declarativa con cadena y datos intactos', () => {
  const pair = snapshots();
  const report = validate(pair);
  assert.deepEqual(report.errors, []);
  assert.equal(report.caseCoverage.status, 'preserved');
  assert.equal(report.caseCoverage.checkedExamples, 1);
  assert.match(report.caseCoverage.baselineHash, /^[a-f0-9]{64}$/);
  assert.notEqual(report.caseCoverage.baselineHash, report.caseCoverage.candidateHash);
  assert.equal(report.caseCoverage.deviceExecution, undefined);
  assert.equal(report.caseCoverage.goldenApproval, undefined);
  assert.doesNotMatch(merged(pair), /<<<<<<<|escribe el monto/);
  assert.match(merged(pair), /solicita un yapeo/);
});

test('una frase idéntica con la aserción eliminada falla en regla y merge', () => {
  const pair = snapshots({ [FEATURE]: beforeFeature, [STEPS]: definitions.replace('  expect(result).toBe(true);', '') });
  const report = validate(pair);
  assert.equal(report.caseCoverage.status, 'lost');
  assert.equal(report.errors[0].code, 'case-coverage-review');
  assert.match(merged(pair), /<<<<<<< COBERTURA EXISTENTE/);
});

test('cambiar código compartido exige revisión y nunca se presenta como pérdida demostrada', () => {
  const pair = snapshots();
  pair.after.files[SCREEN] = pair.before.files[SCREEN].replace('isDisplayed()', 'isExisting()');
  const report = validate(pair);
  assert.equal(report.caseCoverage.status, 'unverified');
  assert.equal(report.errors[0].code, 'case-coverage-unverified');
  assert.match(merged(pair), /<<<<<<< COBERTURA EXISTENTE/);
  const feedback = classifyValidationErrors(report.errors, { files: [{ layer: 'feature', path: FEATURE }] });
  assert.equal(feedback.behavior.length, 1, 'Lorem recibe la comprobación pendiente en la pasada de corrección');
});

test('quitar dependencias no permite aprobar equivalencia ni cambiar el baseline', () => {
  const pair = snapshots();
  delete pair.before.files[LOCATORS];
  const before = JSON.stringify(pair.before);
  assert.equal(validate(pair).caseCoverage.status, 'unverified');
  assert.equal(JSON.stringify(pair.before), before);
});

test('fallback del merge preserva orden y repeticiones sin un snapshot disponible', () => {
  const baseline = 'Feature: Caso\n Scenario: [TC-1] Original\n  When abrir\n  Then validar\n  When abrir\n';
  const reordered = 'Feature: Caso\n Scenario: [TC-1] Nuevo\n  When abrir\n  When abrir\n  Then validar\n';
  assert.match(mergeFeatureUpdate(baseline, reordered, true), /<<<<<<</);
});
