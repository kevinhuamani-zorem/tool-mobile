const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { screenReturnedBooleanGetters, stepBooleanAssertions } = require('../dist/core/validation/infrastructure/rules/returnedBooleanUsage');
const { locatorContractRules } = require('../dist/core/validation/infrastructure/rules/locatorContractRules');
const { isolatedFramework } = require('./helpers/isolatedFramework');
const { frameworkContract, projectPaths } = require('../dist/core/workspace');

isolatedFramework({ after: callback => test.after(callback) }, 'avr-boolean-trace-');
const contract = frameworkContract(projectPaths.frameworkRoot);
const screenPath = 'screenobjects/payment/contacts.screen.ts';
const stepsPath = 'features/yape-steps-definitions/payment/contacts.steps.ts';
const modulePath = source => (source.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(stepsPath), source))
    : source.replace(/^@screenobjects\//, 'screenobjects/')).replace(/\.(?:ts|js)$/, '');
const screen = body => `class ContactsScreen {
    get a() { return $('a'); } get b() { return $('b'); } get c() { return $('c'); }
    async check() { ${body} }
}`;
const returned = body => [...(screenReturnedBooleanGetters(screen(body), 'ContactsScreen').get('check') || [])].sort();
const steps = (body, parameters = '') => `
import contactsScreen from '@screenobjects/payment/contacts.screen.ts';
import { expect } from '@wdio/globals';
import { Then } from '@wdio/cucumber-framework';
Then(/^se muestra el contacto$/, async (${parameters}) => { ${body} });`;
const asserted = content => stepBooleanAssertions(content, screenPath, modulePath)('check', 'se muestra el contacto');

test('reconoce retorno directo, alias const y conjunciones de lecturas verificadas', () => {
    for (const body of [
        'return this.a.isDisplayed();',
        'return await this.a.isExisting();',
        'const a = await this.a.isDisplayed(); return a;',
        'const element = this.a; const result = await element.isDisplayed(); const alias = result; return alias;',
    ]) assert.deepEqual(returned(body), ['a'], body);
    assert.deepEqual(returned(`const a = await this.a.isDisplayed();
        const b = await this.b.isDisplayed(); const c = await this.c.isDisplayed(); return a && b && c;`), ['a', 'b', 'c']);
    assert.deepEqual(returned('return (await this.a.isDisplayed()) && (await this.b.isDisplayed());'), ['a', 'b']);
});

test('reconoce Promise.all con every(Boolean) sin confundir promesas con booleanos', () => {
    assert.deepEqual(returned(`const values = await Promise.all([
        this.a.isDisplayed(), this.b.isDisplayed(), this.c.isDisplayed()
    ]); return values.every(Boolean);`), ['a', 'b', 'c']);
    assert.deepEqual(returned('return (await Promise.all([this.a.isDisplayed(), this.b.isExisting()])).every(Boolean);'), ['a', 'b']);
    assert.deepEqual(returned('const pending = Promise.all([this.a.isDisplayed()]); const values = await pending; return values.every(Boolean);'), ['a']);
});

test('no autoriza lecturas descartadas, constantes, OR, promesas truthy, mutaciones ni funciones señuelo', () => {
    for (const body of [
        'await this.a.isDisplayed(); return true;',
        'const a = await this.a.isDisplayed(); return true;',
        'const check = async () => await this.a.isDisplayed(); return true;',
        'return (await this.a.isDisplayed()) || true;',
        'return (await this.a.isDisplayed()) || (await this.b.isDisplayed());',
        'return this.a.isDisplayed() && this.b.isDisplayed();',
        'const a = this.a.isDisplayed(); const b = this.b.isDisplayed(); return a && b;',
        'const values = Promise.all([this.a.isDisplayed()]); return values.every(Boolean);',
        'const values = await Promise.all([true]); return values.every(Boolean);',
        'const values = await Promise.all([this.a.isDisplayed()]); values.pop(); return values.every(Boolean);',
        'const values = await Promise.all([this.a.isDisplayed()]); const alias = values; alias.pop(); return values.every(Boolean);',
        'const values = await Promise.all([this.a.isDisplayed()]); mutate(values); return values.every(Boolean);',
        'const Boolean = () => true; const values = await Promise.all([this.a.isDisplayed()]); return values.every(Boolean);',
        'const Promise = fake; const values = await Promise.all([this.a.isDisplayed()]); return values.every(Boolean);',
        'if (true) return true; return await this.a.isDisplayed();',
        'let value = await this.a.isDisplayed(); value = true; return value;',
    ]) assert.deepEqual(returned(body), [], body);
});

test('el Step debe afirmar el retorno esperado del Screen importado y la definition trazada', () => {
    for (const body of [
        'const value = await contactsScreen.check(); expect(value).toBe(true);',
        'const value = await contactsScreen.check(); const alias = value; expect(alias).toEqual(true);',
        'expect(await contactsScreen.check()).toBeTruthy();',
        'expect(await contactsScreen.check()).toStrictEqual(true);',
    ]) assert.equal(asserted(steps(body)), true, body);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);')
        .replace('@screenobjects/payment/contacts.screen.ts', '../../../screenobjects/payment/contacts.screen.js')), true);
    for (const body of [
        'await contactsScreen.check();',
        'await contactsScreen.check(); expect(true).toBe(true);',
        'const value = contactsScreen.check(); expect(value).toBeTruthy();',
        'const value = await contactsScreen.check(); console.log(value);',
        'const value = await contactsScreen.check(); expect(value).toBe(false);',
        'const value = await contactsScreen.check(); expect(value).not.toBe(true);',
        'const value = await contactsScreen.check(); expect(value || true).toBe(true);',
        'const unused = async () => { expect(await contactsScreen.check()).toBe(true); };',
        'return; expect(await contactsScreen.check()).toBe(true);',
        'let value = await contactsScreen.check(); value = true; expect(value).toBe(true);',
        'const expect = () => fake; expect(await contactsScreen.check()).toBe(true);',
        'const contactsScreen = fake; expect(await contactsScreen.check()).toBe(true);',
    ]) assert.equal(asserted(steps(body)), false, body);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);', 'contactsScreen')), false);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);', 'expect')), false);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);')
        .replace('@screenobjects/payment/contacts.screen.ts', '@screenobjects/other/contacts.screen.ts')), false);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);')
        .replace('se muestra el contacto', 'se muestra otro caso')), false);
    assert.equal(asserted(steps('expect(await contactsScreen.check()).toBe(true);')
        .replace("import { expect } from '@wdio/globals';", "import { expect } from 'fake';")), false);
});

function fixture(platform = 'android') {
    // Mismas dos agrupaciones del caso 85a9110f, sin copiar datos ni tocar su recording.
    const keys = ['yapearScreen', 'nameYapero', 'numberYapero', 'nameYapero15', 'dateActual', 'addedMessage'];
    const sequences = [7, 8, 9, 15, 16, 17];
    const actions = keys.map((name, i) => ({ sequence: sequences[i], action: 'VERIFICAR_EXISTE',
        selector: `//*[@resource-id="${name}"]`, selectorVerified: true }));
    const body = `public async isContactDisplayed() {
        const values = await Promise.all([this.yapearScreen.isDisplayed(), this.nameYapero.isDisplayed(), this.numberYapero.isDisplayed()]);
        return values.every(Boolean);
    }
    public async isDetailDisplayed() {
        const name = await this.nameYapero15.isDisplayed(); const date = await this.dateActual.isDisplayed();
        const message = await this.addedMessage.isDisplayed(); return name && date && message;
    }`;
    const content = `import ${contract.baseScreenClass} from '${contract.baseScreenImport}';
    import ${contract.locatorFactorySymbol} from '${contract.locatorFactoryImport}';
    import { ${contract.typeLocatorSymbol} } from '${contract.typeLocatorImport}';
    import Locators from '@locators/payment/contacts.locator.json' with { type: 'json' };
    class ContactsScreen extends ${contract.baseScreenClass} {
        ${keys.map(name => `public get ${name}() { return ${contract.locatorFactorySymbol}.getElement(
            ${contract.typeLocatorSymbol}.XPATH, Locators.contactsIos.${name},
            ${contract.typeLocatorSymbol}.XPATH, Locators.contactsAndroid.${name}); }`).join('\n')}
        ${body}
    } export default new ContactsScreen();`;
    const response = {
        files: [
            { layer: 'screen', path: screenPath, content },
            { layer: 'steps', path: stepsPath, content: steps('expect(await contactsScreen.isContactDisplayed()).toBe(true);')
                + '\nThen(/^se muestra el detalle$/, async () => { const value = await contactsScreen.isDetailDisplayed(); expect(value).toBe(true); });' },
            { layer: 'locators', path: 'resources/locators/payment/contacts.locator.json', content: JSON.stringify({
                contactsAndroid: Object.fromEntries(keys.map((name, i) => [name, platform === 'android' ? actions[i].selector : ''])),
                contactsIos: Object.fromEntries(keys.map((name, i) => [name, platform === 'ios' ? actions[i].selector : ''])),
            }) },
        ],
        actionTrace: keys.map((name, i) => ({ sequence: sequences[i], locatorName: name,
            screenMethod: i < 3 ? 'isContactDisplayed' : 'isDetailDisplayed',
            gherkinStep: i < 3 ? 'se muestra el contacto' : 'se muestra el detalle' })),
    };
    return { scenario: { platform, actions }, response, relaxedContract: false,
        plan: { files: response.files.map(file => ({ path: file.path, layer: file.layer, operation: 'create' })),
            resolutions: keys.map((name, i) => ({ sequence: sequences[i], resolution: 'create', locatorName: name })) } };
}
const validate = context => { const report = { errors: [], warnings: [] }; locatorContractRules(context, report); return report; };

test('regresión 85a9110f: acepta los seis getters agrupados en Android/iOS sin alterar inputs', () => {
    for (const platform of ['android', 'ios']) {
        const context = fixture(platform);
        const before = JSON.stringify(context);
        assert.deepEqual(validate(context).errors, []);
        assert.equal(JSON.stringify(context), before);
    }
});

test('feedback dirige un retorno no afirmado a Steps; no consume reparación de Zorem', () => {
    const context = fixture();
    context.response.files.find(file => file.layer === 'steps').content = steps('await contactsScreen.isContactDisplayed();');
    const errors = validate(context).errors;
    assert.equal(errors.length, 6);
    assert.ok(errors.every(error => error.code === 'trace-screen-method' && error.file === stepsPath && /Step no afirma/.test(error.message)));
});

test('mantiene rechazo de getters ajenos, selectores inline, resultados falsos y acciones de click', () => {
    for (const edit of [
        context => { context.response.actionTrace[0].screenMethod = 'isDetailDisplayed'; },
        context => { context.scenario.actions[0].action = 'CLICK'; },
        context => { context.response.files[0].content = context.response.files[0].content.replace('return values.every(Boolean);', 'return true;'); },
        context => { context.response.files[0].content = context.response.files[0].content.replace('return values.every(Boolean);', 'await $("//unverified").click(); return values.every(Boolean);'); },
        context => { context.response.files[0].content = context.response.files[0].content.replace('this.numberYapero.isDisplayed()', 'this.dateActual.isDisplayed()'); },
    ]) {
        const context = fixture(); edit(context);
        assert.ok(validate(context).errors.some(error => error.code === 'trace-screen-method'));
    }
});

test('autores y catálogo reciben el contrato de retorno y permiten agrupar getters', () => {
    const { partialPrompt } = require('../dist/core/automation/infrastructure/layered/prompts');
    const { buildValidationRuleContractFromFile, defaultValidatorSourcePath } = require('../dist/core/validation');
    for (const role of ['behavior-author', 'interaction-author']) {
        const prompt = partialPrompt(role);
        assert.match(prompt, /VERIFICAR_EXISTE/);
        assert.match(prompt, /expect\(visible\)\.toBe\(true\)/);
        assert.doesNotMatch(prompt, /cada screenMethod debe consumir un único getter/);
    }
    const rule = buildValidationRuleContractFromFile(defaultValidatorSourcePath()).rules.find(rule => rule.code === 'trace-screen-method');
    assert.match(rule.requirement, /Varias acciones pueden compartir/);
    assert.match(rule.minimalExample, /Promise<boolean>/);
});
