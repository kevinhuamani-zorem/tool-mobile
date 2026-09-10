const test = require('node:test');
const assert = require('node:assert/strict');
const { compareCaseCoverage } = require('../dist/core/indexing');

const featurePath = 'features/yape-features/payment/yapeo.feature';
const stepsPath = 'features/yape-steps-definitions/payment/yapeo.steps.ts';
const screenPath = 'screenobjects/payment/contacts.screen.ts';
const locatorPath = 'resources/locators/payment/yapeo.locator.json';
const screen = `
import locators from '@locators/payment/yapeo.locator.json';
import { TypeLocator } from '@common/locator-type.ts';
import helper from '@common/ui-helper.ts';
import { $, expect } from '@wdio/globals';
class ContactsScreen {
  get target() { return $(helper.locator(TypeLocator.ANDROID, locators.android.target)); }
  async startYapeoFlow() { await this.target.click(); if (await this.target.isDisplayed()) { await this.target.click(); } }
  async validateSelectContactScreen() { await expect(this.target).toBeDisplayed(); }
  async inputNumberToYapear(number: string) { await this.target.setValue(number); await this.target.click(); }
  async isYapeoDestinationInfoVisible() { return await this.target.isDisplayed(); }
  async enterAmountAndCommentThenConfirmYapeo(amount: string, comment: string) { await this.target.setValue(amount); await this.target.setValue(comment); await this.target.click(); }
  async getYapeoConfirmationTitleText() { return await this.target.getText(); }
  async isYapeoConfirmationDetailsVisible() { return await this.target.isDisplayed(); }
  async closeYapeoConfirmation() { await this.target.click(); }
  async login(username: string) { await this.target.setValue(username); }
}
export default new ContactsScreen();`;
const oldLines = [
  'el usuario selecciona cerrar',
  'se muestra la pantalla de yapear',
  'el usuario escribe su numero destino <number> y selecciona seleccionar numero destino',
  'se muestra numero del yapero',
  'el usuario ingresa el monto <amount> y el comentario <comment> para yapear',
  'se muestra numero de celular ofuscado',
  'el usuario selecciona cerrar en realiza yapeo numero comentario',
];
const newLines = [
  'el usuario inicia un yapeo',
  'el usuario puede identificar al destinatario',
  'el usuario identifica al destinatario mediante el número <number>',
  'se muestran los datos del destinatario',
  'el usuario solicita un yapeo por <amount> con el comentario <comment>',
  'se muestra la confirmación del yapeo',
  'el usuario finaliza la consulta del yapeo',
];
const bodies = [
  `async () => { await contactsScreen.startYapeoFlow(); }`,
  `async () => { await contactsScreen.validateSelectContactScreen(); }`,
  `async (number: string) => { await contactsScreen.inputNumberToYapear(number); }`,
  `async () => { const visible: boolean = await contactsScreen.isYapeoDestinationInfoVisible(); expect(visible).toBe(true); }`,
  `async (amount: string, comment: string) => { await contactsScreen.enterAmountAndCommentThenConfirmYapeo(amount, comment); }`,
  `async () => { const text: string = await contactsScreen.getYapeoConfirmationTitleText(); expect(text).toContain('¡Yapeaste!'); const visible: boolean = await contactsScreen.isYapeoConfirmationDetailsVisible(); expect(visible).toBe(true); }`,
  `async () => { await contactsScreen.closeYapeoConfirmation(); }`,
];
const definitions = (lines, callbacks = bodies) => `import { Given, When, Then } from '@wdio/cucumber-framework';\nimport { expect } from '@wdio/globals';\nimport contactsScreen from '@screenobjects/payment/contacts.screen.ts';\n`
  + lines.map((line, index) => `When(/^${line.replace(/<[^>]+>/g, '(.*)')}$/, ${callbacks[index]});`).join('\n');
const feature = (lines = oldLines) => `Feature: Yapeo\nScenario Outline: [TC-10240] Yapeo con comentario\nGiven el usuario <username> inicia sesión\n${lines.map(line => `And ${line}`).join('\n')}\nExamples:\n| username | number | amount | comment |\n| Usuario fixture | 900000000 | 1 | Mensaje fixture |\n`;
const fixture = () => {
  const files = {
    [featurePath]: feature(),
    [stepsPath]: definitions(oldLines),
    'features/yape-steps-definitions/login.steps.ts': `import { Given } from '@wdio/cucumber-framework'; import contactsScreen from '@screenobjects/payment/contacts.screen.ts'; Given(/^el usuario (.*) inicia sesión$/, async (username: string) => { await contactsScreen.login(username); });`,
    [screenPath]: screen,
    [locatorPath]: JSON.stringify({ android: { target: 'new UiSelector().text("Destino")' }, ios: { target: '' } }),
    'support/common/locator-type.ts': 'export enum TypeLocator { ANDROID = "android", XPATH = "xpath" }',
    'support/common/ui-helper.ts': 'export default { locator(type: string, value: string) { return type + value; } };',
  };
  return { featurePath, files };
};
const revised = () => {
  const snapshot = fixture();
  snapshot.files[featurePath] = feature(newLines);
  snapshot.files[stepsPath] = definitions(newLines);
  return snapshot;
};
const compare = (after = revised(), before = fixture()) => compareCaseCoverage({ caseId: 'TC-10240', before, after, platform: 'android' });

test('seven declarative yapeo steps preserve ordered methods, parameters and compound assertions', () => {
  const report = compare();
  assert.equal(report.status, 'preserved', JSON.stringify(report));
  assert.equal(report.mappings.length, 8);
  assert.equal(report.checkedExamples, 1);
  assert.match(report.baselineHash, /^[a-f0-9]{64}$/);
  assert.notEqual(report.baselineHash, report.candidateHash);
  assert.deepEqual(report.differences, []);
});

test('local callback variable and parameter names are irrelevant after binding Examples', () => {
  const after = revised();
  after.files[stepsPath] = after.files[stepsPath].replaceAll('visible', 'shown').replaceAll('number: string', 'destination: string').replace('inputNumberToYapear(number)', 'inputNumberToYapear(destination)');
  assert.equal(compare(after).status, 'preserved');
});

test('merging and dividing ordinary Step statements conserves execution order', () => {
  const after = revised();
  const lines = ['el usuario inicia un yapeo y puede elegir destinatario', ...newLines.slice(2)];
  const callbacks = [`async () => { await contactsScreen.startYapeoFlow(); await contactsScreen.validateSelectContactScreen(); }`, ...bodies.slice(2)];
  after.files[featurePath] = feature(lines);
  after.files[stepsPath] = definitions(lines, callbacks);
  assert.equal(compare(after).status, 'preserved');
  assert.equal(compareCaseCoverage({ caseId: 'TC-10240', before: after, after: revised(), platform: 'android' }).status, 'preserved');
});

test('nested await assertion and temporary result are equivalent', () => {
  const after = revised();
  after.files[stepsPath] = after.files[stepsPath].replace('const visible: boolean = await contactsScreen.isYapeoDestinationInfoVisible(); expect(visible).toBe(true);', 'expect(await contactsScreen.isYapeoDestinationInfoVisible()).toBe(true);');
  assert.equal(compare(after).status, 'preserved');
});

for (const [name, change] of [
  ['dropped action', after => { after.files[featurePath] = feature(newLines.slice(1)); }],
  ['reordered action', after => { after.files[featurePath] = feature([newLines[1], newLines[0], ...newLines.slice(2)]); }],
  ['swapped parameters', after => { after.files[stepsPath] = after.files[stepsPath].replace('enterAmountAndCommentThenConfirmYapeo(amount, comment)', 'enterAmountAndCommentThenConfirmYapeo(comment, amount)'); }],
  ['changed Examples value', after => { after.files[featurePath] = after.files[featurePath].replace('900000000', '911111111'); }],
  ['dropped assertion', after => { after.files[stepsPath] = after.files[stepsPath].replace("expect(text).toContain('¡Yapeaste!');", ''); }],
  ['weakened assertion', after => { after.files[stepsPath] = after.files[stepsPath].replace("expect(text).toContain('¡Yapeaste!');", 'expect(text).toBeTruthy();'); }],
]) test(name + ' cannot claim preserved coverage', () => {
  const after = revised(); change(after);
  const report = compare(after);
  assert.equal(report.status, 'lost', JSON.stringify(report));
  assert(report.differences.some(item => item.code === 'required-operation-missing'));
});

test('repetitions cannot collapse into a set of methods', () => {
  const before = fixture();
  before.files[featurePath] = feature([...oldLines, oldLines[6]]);
  assert.equal(compare(revised(), before).status, 'lost');
});

for (const [name, change] of [
  ['Screen implementation changed', after => { after.files[screenPath] = screen.replace('return await this.target.isDisplayed()', 'return true'); }],
  ['TypeLocator changed', after => { after.files[screenPath] = screen.replace('TypeLocator.ANDROID', 'TypeLocator.XPATH'); }],
  ['locator JSON changed', after => { after.files[locatorPath] = after.files[locatorPath].replace('Destino', 'Otro'); }],
  ['transitive helper changed', after => { after.files['support/common/ui-helper.ts'] += '\nexport const revision = 2;'; }],
  ['missing transitive source', after => { delete after.files['support/common/ui-helper.ts']; }],
  ['ambiguous Step', after => { after.files[stepsPath] += '\nWhen(/^el usuario inicia un yapeo$/, async () => { await contactsScreen.startYapeoFlow(); });'; }],
  ['missing Step', after => { delete after.files[stepsPath]; }],
  ['dynamic import', after => { after.files[screenPath] += '\nconst helper = import("./runtime.ts");'; }],
  ['custom paths', after => { after.files['tsconfig.json'] = JSON.stringify({ compilerOptions: { paths: { '@screenobjects/*': ['other/*'] } } }); }],
]) test(name + ' leaves equivalence explicitly unverified', () => {
  const after = revised(); change(after);
  assert.equal(compare(after).status, 'unverified');
});

test('the same opaque callback is preserved only with pinned dependencies', () => {
  const before = fixture();
  const opaque = 'async () => { if (await contactsScreen.isYapeoDestinationInfoVisible()) { await contactsScreen.closeYapeoConfirmation(); } }';
  before.files[stepsPath] = definitions(oldLines, [opaque, ...bodies.slice(1)]);
  const after = revised();
  after.files[stepsPath] = definitions(newLines, [opaque, ...bodies.slice(1)]);
  assert.equal(compare(after, before).status, 'preserved');
  after.files[stepsPath] = after.files[stepsPath].replace('if (await', 'if (!await');
  assert.equal(compare(after, before).status, 'unverified');
});

test('omitted or duplicate case identity is not equivalent', () => {
  const after = revised();
  after.files[featurePath] = after.files[featurePath].replace('[TC-10240]', '[TC-10241]');
  assert.equal(compare(after).status, 'lost');
  after.files[featurePath] = feature(newLines) + feature(newLines);
  assert.equal(compare(after).status, 'unverified');
});

test('unsupported data tables and missing Examples bindings remain unverified', () => {
  const after = revised();
  after.files[featurePath] = after.files[featurePath].replace(newLines[0], newLines[0] + '\n| hidden | input |');
  assert.equal(compare(after).status, 'unverified');
  after.files[featurePath] = feature(newLines).replace('<number>', '<absent>');
  assert.equal(compare(after).status, 'unverified');
});

test('every previous Examples row must retain a corresponding execution', () => {
  const before = fixture();
  before.files[featurePath] += '| Usuario fixture | 922222222 | 2 | Otro mensaje |\n';
  assert.equal(compare(revised(), before).status, 'lost');
  const after = revised();
  after.files[featurePath] += '| Usuario fixture | 922222222 | 2 | Otro mensaje |\n';
  assert.equal(compare(after, before).status, 'preserved');
});

test('reports contain hashes and indices without leaking input or assertion values', () => {
  const after = revised();
  after.files[stepsPath] = after.files[stepsPath].replace('enterAmountAndCommentThenConfirmYapeo(amount, comment)', 'enterAmountAndCommentThenConfirmYapeo(comment, amount)');
  const serialized = JSON.stringify(compare(after));
  for (const value of ['900000000', 'Usuario fixture', 'Mensaje fixture', '¡Yapeaste!']) assert.equal(serialized.includes(value), false);
});

test('unanchored foreign regex participates in the same ambiguity check as Cucumber', () => {
  const after = revised();
  after.files[stepsPath] += '\nWhen(/inicia un yapeo/, async () => { await contactsScreen.startYapeoFlow(); });';
  const report = compare(after);
  assert.equal(report.status, 'unverified');
  assert(report.differences.some(item => item.code === 'ambiguous-step-binding'));
});

test('screen import aliases and Cucumber keyword imports do not alter behavior', () => {
  const after = revised();
  after.files[stepsPath] = after.files[stepsPath].replaceAll('contactsScreen', 'contacts').replace('{ Given, When, Then }', '{ When, Then }');
  assert.equal(compare(after).status, 'preserved');
});

test('changed shared hooks in any Step module require review', () => {
  const before = fixture();
  const other = 'features/yape-steps-definitions/common/hooks.steps.ts';
  const content = `import { Before } from '@wdio/cucumber-framework'; import contacts from '@screenobjects/payment/contacts.screen.ts'; Before(async () => { await contacts.startYapeoFlow(); });`;
  before.files[other] = content;
  const after = revised();
  after.files[other] = content;
  assert.equal(compare(after, before).status, 'preserved');
  after.files[other] = content.replace('startYapeoFlow', 'closeYapeoConfirmation');
  const report = compare(after, before);
  assert.equal(report.status, 'unverified');
  assert(report.differences.some(item => item.code === 'step-context-changed'));
});

test('duplicated Examples rows are distinct executions that cannot silently disappear', () => {
  const before = fixture();
  before.files[featurePath] += '| Usuario fixture | 900000000 | 1 | Mensaje fixture |\n';
  const report = compare(revised(), before);
  assert.equal(report.status, 'lost');
  assert.equal(report.checkedExamples, 2);
});

test('Step options remain bound to their callback when definitions are reordered', () => {
  const before = fixture();
  const after = fixture();
  before.files[featurePath] = feature(['a', 'b']);
  after.files[featurePath] = before.files[featurePath];
  const imports = definitions([], []).trim();
  before.files[stepsPath] = imports + `\nWhen(/^a$/, { timeout: 1 }, async () => { await contactsScreen.startYapeoFlow(); });\nWhen(/^b$/, { timeout: 2 }, async () => { await contactsScreen.validateSelectContactScreen(); });`;
  after.files[stepsPath] = imports + `\nWhen(/^b$/, { timeout: 1 }, async () => { await contactsScreen.validateSelectContactScreen(); });\nWhen(/^a$/, { timeout: 2 }, async () => { await contactsScreen.startYapeoFlow(); });`;
  assert.equal(compare(after, before).status, 'unverified');
});

test('literal external dynamic imports use the same pinned external-runtime assumption', () => {
  const before = fixture();
  before.files['support/common/ui-helper.ts'] += '\nexport async function load() { return await import("dotenv-flow"); }';
  const after = revised();
  after.files['support/common/ui-helper.ts'] = before.files['support/common/ui-helper.ts'];
  assert.equal(compare(after, before).status, 'preserved');
  after.files['support/common/ui-helper.ts'] = after.files['support/common/ui-helper.ts'].replace('import("dotenv-flow")', 'import(process.env.MODULE)');
  assert.equal(compare(after, before).status, 'unverified');
});

test('adding an independent operation before an assertion does not shift result bindings', () => {
  const before = fixture();
  const after = revised();
  before.files[screenPath] = before.files[screenPath].replace('async login(', 'async extra() { return 1; } async login(');
  after.files[screenPath] = before.files[screenPath];
  after.files[stepsPath] = after.files[stepsPath].replace('await contactsScreen.startYapeoFlow();', 'await contactsScreen.extra(); await contactsScreen.startYapeoFlow();');
  assert.equal(compare(after, before).status, 'preserved');
});

function extractionFixture() {
  const before = fixture(), after = fixture();
  const prefix = 'await this.target.waitForDisplayed(); await this.target.click();';
  const suffix = 'await this.target.setValue("enviar"); await this.target.click();';
  before.files[screenPath] = screen.replace('async login(', `async send(): Promise<void> { ${prefix} ${suffix} } async login(`);
  after.files[screenPath] = screen.replace('async login(', `async send(): Promise<void> { ${suffix} } async navigate(): Promise<void> { ${prefix} } async login(`);
  before.files[featurePath] = feature(['envía el reporte']);
  before.files[stepsPath] = definitions(['envía el reporte'], ['async () => { await contactsScreen.send(); }']);
  after.files[featurePath] = feature(['consulta sus movimientos', 'envía el reporte']);
  after.files[stepsPath] = definitions(['consulta sus movimientos', 'envía el reporte'], ['async () => { await contactsScreen.navigate(); }', 'async () => { await contactsScreen.send(); }']);
  after.files[locatorPath] = JSON.stringify({ ios: { target: '' }, android: { target: 'new UiSelector().text("Destino")' } });
  return { before, after };
}

test('an exact awaited prefix extraction preserves Screen behavior across two Steps', () => {
  const { before, after } = extractionFixture();
  const report = compare(after, before);
  assert.equal(report.status, 'preserved', JSON.stringify(report));
  assert.deepEqual(report.mappings.find(mapping => mapping.beforeStepIndices[0] === 2).afterStepIndices, [2, 3]);
});

for (const [label, edit] of [
  ['omitted prefix', after => { after.files[featurePath] = feature(['envía el reporte']); }],
  ['reordered prefix', after => { after.files[featurePath] = feature(['envía el reporte', 'consulta sus movimientos']); }],
]) test('extraction detects ' + label, () => {
  const { before, after } = extractionFixture(); edit(after);
  assert.equal(compare(after, before).status, 'lost');
});

for (const [label, edit] of [
  ['changed selector', ({ after }) => { after.files[locatorPath] = after.files[locatorPath].replace('Destino', 'Incorrecto'); }],
  ['changed getter TypeLocator', ({ after }) => { after.files[screenPath] = after.files[screenPath].replace('TypeLocator.ANDROID', 'TypeLocator.XPATH'); }],
  ['changed initializer', ({ after }) => { after.files[screenPath] = after.files[screenPath].replace('class ContactsScreen {', 'class ContactsScreen { flag = true;'); }],
  ['constructor dispatch', ({ before, after }) => { for (const side of [before, after]) side.files[screenPath] = side.files[screenPath].replace('class ContactsScreen {', 'class ContactsScreen { constructor() { this.send(); }'); }],
  ['static initializer dispatch', ({ before, after }) => { for (const side of [before, after]) side.files[screenPath] = side.files[screenPath].replace('class ContactsScreen {', 'class ContactsScreen { static init = (() => true)();'); }],
  ['other method dispatch', ({ before, after }) => { for (const side of [before, after]) side.files[screenPath] = side.files[screenPath].replace('async login(', 'async other() { await this.send(); } async login('); }],
  ['hook dispatch', ({ before, after }) => { for (const side of [before, after]) side.files[stepsPath] += '\nBefore(async () => { await contactsScreen.send(); });'; }],
  ['JSON enumeration', ({ before, after }) => { for (const side of [before, after]) side.files[screenPath] = side.files[screenPath].replace('async login(', 'keys() { return Object.keys(locators); } async login('); }],
  ['inherited virtual dispatch', ({ before, after }) => { for (const side of [before, after]) {
    side.files[screenPath] = 'import Base from "./base.screen.ts";\n' + side.files[screenPath].replace('class ContactsScreen {', 'class ContactsScreen extends Base {');
    side.files['screenobjects/payment/base.screen.ts'] = 'export default class Base { constructor() { this.send(); } }';
  } }],
]) test('extraction cannot conceal ' + label, () => {
  const pair = extractionFixture(); edit(pair);
  assert.equal(compare(pair.after, pair.before).status, 'unverified');
});

test('inherited initialization with pinned helper construction permits exact extraction', () => {
  const { before, after } = extractionFixture();
  for (const side of [before, after]) {
    side.files[screenPath] = 'import Base from "./base.screen.ts";\n' + side.files[screenPath].replace('class ContactsScreen {', 'class ContactsScreen extends Base {');
    side.files['screenobjects/payment/base.screen.ts'] = 'import Helper from "./helper.ts"; export default class Base { constructor() { this.helper = new Helper(); } }';
    side.files['screenobjects/payment/helper.ts'] = 'export default class Helper {}';
  }
  assert.equal(compare(after, before).status, 'preserved');
});

test('detaching a method loses its receiver and cannot be substituted as the same call', () => {
  const after = revised();
  after.files[stepsPath] = after.files[stepsPath].replace('await contactsScreen.startYapeoFlow();', 'const start = contactsScreen.startYapeoFlow; await start();');
  assert.equal(compare(after).status, 'unverified');
});

test('eager getter reads cannot be moved across another operation through substitution', () => {
  const before = fixture(), after = fixture();
  before.files[featurePath] = after.files[featurePath] = feature(['realiza el flujo']);
  before.files[stepsPath] = definitions(['realiza el flujo'], ['async () => { const target = contactsScreen.target; await contactsScreen.startYapeoFlow(); await target.click(); }']);
  after.files[stepsPath] = definitions(['realiza el flujo'], ['async () => { await contactsScreen.startYapeoFlow(); await contactsScreen.target.click(); }']);
  assert.equal(compare(after, before).status, 'unverified');
});

test('BeforeStep from a captured helper prevents claiming equivalent changed boundaries', () => {
  const { before, after } = extractionFixture();
  for (const side of [before, after]) {
    side.files[stepsPath] = 'import "../../../support/hooks.ts";\n' + side.files[stepsPath];
    side.files['support/hooks.ts'] = `import { BeforeStep } from '@wdio/cucumber-framework'; import { browser } from '@wdio/globals'; BeforeStep(async () => { await browser.pause(1); });`;
  }
  const report = compare(after, before);
  assert.equal(report.status, 'unverified');
  assert(report.differences.some(item => item.code === 'step-hook-boundaries-changed'));
});

test('step hooks detect moved boundaries even when both scenarios have the same step count', () => {
  const before = fixture(), after = fixture();
  before.files[featurePath] = after.files[featurePath] = feature(['primero', 'segundo']);
  before.files[stepsPath] = definitions(['primero', 'segundo'], ['async () => { await contactsScreen.startYapeoFlow(); }', 'async () => { await contactsScreen.validateSelectContactScreen(); await contactsScreen.closeYapeoConfirmation(); }']);
  after.files[stepsPath] = definitions(['primero', 'segundo'], ['async () => { await contactsScreen.startYapeoFlow(); await contactsScreen.validateSelectContactScreen(); }', 'async () => { await contactsScreen.closeYapeoConfirmation(); }']);
  for (const side of [before, after]) side.files[stepsPath] += '\nBeforeStep(async () => { });';
  assert.equal(compare(after, before).status, 'unverified');
});

for (const [label, code] of [
  ['an extra module-level instance', 'const warmup = new ContactsScreen(); void warmup.send();'],
  ['a prototype call at module load', 'void ContactsScreen.prototype.send.call(new ContactsScreen());'],
]) test('extraction cannot hide changed behavior through ' + label, () => {
  const { before, after } = extractionFixture();
  for (const side of [before, after]) side.files[screenPath] += '\n' + code;
  assert.equal(compare(after, before).status, 'unverified');
});

test('class decorators can inspect the prototype during load and prevent extraction proof', () => {
  const { before, after } = extractionFixture();
  for (const side of [before, after]) side.files[screenPath] = 'import { decorate } from "@runtime/decorators";\n' + side.files[screenPath].replace('class ContactsScreen {', '@decorate\nclass ContactsScreen {');
  assert.equal(compare(after, before).status, 'unverified');
});

test('prototype access through this prevents hiding calls to the extracted method', () => {
  const { before, after } = extractionFixture();
  for (const side of [before, after]) side.files[screenPath] = side.files[screenPath].replace('async login(', 'async peek() { await this.__proto__.send(); } async login(');
  assert.equal(compare(after, before).status, 'unverified');
});
