const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { indexMethodBehaviors, stepDelegation } = require('../dist/core/indexing/domain/behaviorContract');
const { resolveBehaviorRows } = require('../dist/core/automation/application/resolver/behaviorReuse');

const SCREEN = 'screenobjects/payment/transfer.screen.ts';
const LOCATORS = 'resources/locators/payment/transfer.locator.json';
const STEPS = 'features/yape-steps-definitions/payment/transfer.steps.ts';
const getter = name => `public get ${name}() { const locator = LocatorProvider.getElement(TypeLocator.XPATH, L.flowIos.${name}, TypeLocator.ID, L.flowAndroid.${name}); return $(locator); }`;
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
function behavior(body, name = 'send') {
    const source = parse(SCREEN, `class Screen { ${['amount', 'comment', 'confirm'].map(getter).join('\n')} ${body} }`);
    return indexMethodBehaviors(source, source.statements[0]).get(name);
}
const METHOD = `public async send(amount: string, comment: string): Promise<void> {
    await this.amount.waitForDisplayed();
    await this.amount.setValue(amount);
    await this.comment.setValue(comment);
    await this.confirm.click();
}`;
const EXPRESSION = '^el usuario solicita un yapeo por (.*) con el comentario (.*)$';
function definition(expression = EXPRESSION, args = 'amount, comment', params = 'amount: string, comment: string') {
    const source = parse(STEPS, `When(/${expression}/, async (${params}) => { await screen.send(${args}); });`);
    return { keyword: 'When', expression, file: STEPS, squad: 'payment', scope: 'squad',
        screenMethods: [{ file: SCREEN, method: 'send' }], delegation: stepDelegation(source, expression) };
}
function fixture(body = METHOD, definitions = [definition()]) {
    const locators = ['amount', 'comment', 'confirm'].map(name => ({ name, selector: name, file: LOCATORS, module: 'payment/transfer', scope: 'squad',
        platform: 'android', androidSelector: name, androidStrategy: 'ID', androidBlock: 'flowAndroid', iosSelector: '', iosBlock: 'flowIos' }));
    return { squad: 'payment', platform: 'android', revision: 'controlled-revision', locators,
        screenMethods: [{ name: 'send', className: 'Screen', file: SCREEN, squad: 'payment', locatorFiles: [LOCATORS],
            signature: 'send(amount: string, comment: string): Promise<void>', visibility: 'public', exported: true, behavior: behavior(body) }],
        stepDefinitions: definitions, frameworkStepDefinitions: definitions, scenarios: [], artifactBundles: [], features: [] };
}
const examples = { amount: '5.20', comment: 'Pago de prueba' };
function rows(values = ['<amount>', '<comment>']) {
    return [{ keyword: 'When', text: 'el usuario envía <amount> con la referencia <comment>', status: 'missing', actions: [
        { sequence: 1, action: 'ESCRIBIR', variableName: 'amount', selector: 'id=amount', value: values[0] },
        { sequence: 2, action: 'ESCRIBIR', variableName: 'comment', selector: 'id=comment', value: values[1] },
        { sequence: 3, action: 'CLICK', variableName: 'confirm', selector: 'id=confirm', value: '' },
    ] }];
}
function resolve(catalog = fixture(), input = rows(), values = examples) {
    const resolutions = input.flatMap(row => row.actions).map(action => ({ sequence: action.sequence, action: action.action,
        resolution: 'reuse', locatorName: action.variableName, selector: action.selector, reason: 'Exact recorded locator',
        source: { file: LOCATORS, module: 'payment/transfer', scope: 'squad' } }));
    return resolveBehaviorRows(input, catalog, resolutions, SCREEN, values);
}

test('direct scalar writes retain positional parameter references without embedding example values', () => {
    const contract = behavior(METHOD);
    assert.equal(contract.complete, true);
    assert.deepEqual(contract.parameterNames, ['amount', 'comment']);
    assert.deepEqual(contract.operations, [
        { kind: 'write', locator: 'amount', valueParameter: 0 },
        { kind: 'write', locator: 'comment', valueParameter: 1 },
        { kind: 'click', locator: 'confirm' },
    ]);
    assert.equal(JSON.stringify(contract).includes('5.20'), false);
});

test('nested calls substitute argument positions and preserve implementation hashes', () => {
    const contract = behavior(`public async send(comment: string, amount: string): Promise<void> { await this.fill(amount, comment); }
        private async fill(amount: string, comment: string): Promise<void> { await this.amount.setValue(amount); await this.comment.setValue(comment); }`);
    assert.equal(contract.complete, true);
    assert.deepEqual(contract.operations.map(operation => operation.valueParameter), [1, 0]);
    assert.match(contract.dependencies.fill, /^[a-f0-9]{64}$/);
});

for (const [name, method] of Object.entries({
    transformed: METHOD.replace('setValue(amount)', 'setValue(amount.trim())'),
    unused: METHOD.replace('setValue(comment)', "setValue('fixed')"),
    optional: METHOD.replace('comment: string', 'comment?: string'),
    defaulted: METHOD.replace('comment: string', "comment: string = 'default'"),
    numeric: METHOD.replace('amount: string', 'amount: number'),
    destructured: METHOD.replace('amount: string, comment: string', '{amount, comment}: Input'),
    extraEffect: METHOD.replace('await this.confirm.click();', 'await this.confirm.click(); await transferOutside();'),
})) test(`unproved ${name} parameter contract remains pending`, () => assert.equal(behavior(method).complete, false));

test('Step forwarding records argument positions; never accepts omitted, repeated, literal or computed bindings', () => {
    assert.deepEqual(definition().delegation.parameterBindings, [0, 1]);
    assert.deepEqual(definition(EXPRESSION, 'comment, amount').delegation.parameterBindings, [1, 0]);
    for (const argumentsText of ['amount', 'amount, amount', 'amount, "fixed"', 'amount.trim(), comment']) {
        assert.equal(definition(EXPRESSION, argumentsText).delegation, undefined);
    }
});

test('a declarative existing Step is reused with the original placeholders and actions', () => {
    const result = resolve();
    assert.equal(result[0].status, 'reused');
    assert.equal(result[0].text, 'el usuario solicita un yapeo por <amount> con el comentario <comment>');
    assert.deepEqual(result[0].reuse.sequences, [1, 2, 3]);
    assert.equal(result[0].reuse.kind, 'step');
    assert.deepEqual(result[0].actions.map(action => action.value), ['<amount>', '<comment>', '']);
    assert.deepEqual(resolve(fixture(), result), result, 'a second resolution does not create another alias');
});

test('literal recorded values use a uniquely bound existing Examples column', () => {
    const result = resolve(fixture(), rows([examples.amount, examples.comment]));
    assert.equal(result[0].text, 'el usuario solicita un yapeo por <amount> con el comentario <comment>');
    assert.equal(result[0].status, 'reused');
});

test('missing Examples and two columns for the same literal do not establish a binding', () => {
    assert.equal(resolve(fixture(), rows(), {})[0].reuse, undefined);
    assert.equal(resolve(fixture(), rows(['same', 'same']), { amount: 'same', comment: 'same' })[0].reuse, undefined);
});

test('parameterized method without a uniquely callable Step does not invent a wrapper signature', () => {
    assert.equal(resolve(fixture(METHOD, []))[0].reuse, undefined);
    const catalog = fixture();
    catalog.frameworkStepDefinitions.push({ expression: '^el usuario solicita un yapeo por 5\\.20 con el comentario (.*)$', file: 'other-squad.steps.ts' });
    assert.equal(resolve(catalog)[0].reuse, undefined, 'collision is checked on expanded Examples');
});

test('noncanonical regex and greedy captures with different argument boundaries remain pending', () => {
    assert.equal(resolve(fixture(METHOD, [definition('^el usuario solicita un yapeo por ([0-9.]+) con el comentario (.*)$')]))[0].reuse, undefined);
    assert.equal(resolve(fixture(), rows(), { amount: '5.20', comment: 'nota con el comentario distinta' })[0].reuse, undefined);
});

test('parameter bindings do not weaken locator type, action order or action coverage', () => {
    const catalog = fixture();
    catalog.locators.push({ ...catalog.locators[0], name: 'wrongAlias', androidStrategy: 'XPATH' });
    const changed = rows(); changed[0].actions[0].variableName = 'wrongAlias';
    assert.equal(resolve(catalog, changed)[0].reuse, undefined);
    const reordered = rows(); reordered[0].actions.reverse();
    assert.equal(resolve(fixture(), reordered)[0].reuse, undefined);
    const omitted = rows(); omitted[0].actions.splice(1, 1);
    assert.equal(resolve(fixture(), omitted)[0].reuse, undefined);
});

test('explicit visible assertions remain observable even before clicking the same element', () => {
    const contract = behavior('public async send(): Promise<void> { await expect(this.confirm).toBeDisplayed(); await this.confirm.click(); }');
    assert.equal(contract.complete, true);
    assert.deepEqual(contract.operations.map(operation => operation.kind), ['visible', 'click']);
});

test('parameterized text comparisons preserve equality and never become mere presence', () => {
    const contract = behavior('public async send(amount: string, comment: string): Promise<void> { await expect(this.amount).toHaveText(amount); await expect(this.comment).toHaveText(comment); }');
    assert.equal(contract.complete, true);
    assert.deepEqual(contract.operations, [
        { kind: 'text', locator: 'amount', operator: 'equals', valueParameter: 0 },
        { kind: 'text', locator: 'comment', operator: 'equals', valueParameter: 1 },
    ]);
});

test('a repeated parameter must keep the same recorded value at every write', () => {
    const method = 'public async send(value: string): Promise<void> { await this.amount.setValue(value); await this.comment.setValue(value); await this.confirm.click(); }';
    const catalog = fixture(method, [definition('^el usuario repite el dato (.*)$', 'value', 'value: string')]);
    assert.equal(resolve(catalog)[0].reuse, undefined, 'two different columns cannot be collapsed into one parameter');
    const result = resolve(catalog, rows(['<amount>', '<amount>']));
    assert.equal(result[0].status, 'reused');
    assert.equal(result[0].text, 'el usuario repite el dato <amount>');
});

test('parameterized equality rejects a weaker assertion operator or a different text source', () => {
    const method = 'public async send(amount: string, comment: string): Promise<void> { await expect(this.amount).toHaveText(amount); await expect(this.comment).toHaveText(comment); await this.confirm.click(); }';
    for (const textAssertion of [{ version: 1, source: 'element', operator: 'contains' }, { version: 1, source: 'container', operator: 'equals' }]) {
        const input = rows();
        input[0].actions[0] = { ...input[0].actions[0], action: 'VERIFICAR_TEXTO', textAssertion };
        input[0].actions[1] = { ...input[0].actions[1], action: 'VERIFICAR_TEXTO' };
        assert.equal(resolve(fixture(method), input)[0].reuse, undefined);
    }
});
