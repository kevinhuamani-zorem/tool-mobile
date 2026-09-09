const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { interactionLocatorProblems } = require('../dist/core/validation/infrastructure/rules/interactionLocatorCheck');
const { writeInteractionLocatorTools } = require('../dist/core/validation');
const { interactionCheckScript } = require('../dist/core/automation/infrastructure/layered/checkScript');
const { projectRoleJson } = require('../dist/core/automation/infrastructure/layered/projections');

function fixture(order = ['android', 'ios']) {
    const value = 'new UiSelector().resourceId("com.android.permissioncontroller:id/permission_allow_button")';
    const evidence = {
        platform: 'android',
        contract: {
            typeLocatorImport: '@utils/Enums.ts', typeLocatorSymbol: 'TypeLocator',
            locatorFactoryImport: '@utils/LocatorFactory.ts', locatorFactorySymbol: 'LocatorFactory',
            locatorSignature: { platformOrder: order, parameterCount: 4 },
        },
        actions: [{ sequence: 2, action: 'CLICK', resolution: 'create', locatorName: 'permitirButton',
            primary: { locatorType: 'ANDROID', locatorValue: value,
                selector: 'id=com.android.permissioncontroller:id/permission_allow_button' } }],
    };
    const pairs = { android: 'TypeLocator.ANDROID, Locators.yapearAndroid.allowButton',
        ios: 'TypeLocator.XPATH, Locators.yapearIos.allowButton' };
    const response = {
        files: [{ layer: 'screen', path: 'screenobjects/payment/contacts.screen.ts', content: [
            "import BaseScreen from '@screenobjects/commons/base.screen.ts';",
            "import { TypeLocator } from '@utils/Enums.ts';",
            "import LocatorFactory from '@utils/LocatorFactory.ts';",
            "import Locators from '@locators/payment/yapear-contact.locator.json' with { type: 'json' };",
            'class ContactsScreen extends BaseScreen {',
            `get allowButton() { return LocatorFactory.getElement(${order.map(platform => pairs[platform]).join(', ')}); }`,
            'async startYapeoFlow() {',
            'const visible = await this.allowButton.waitForDisplayed({ timeout: 5000 }).catch(() => false);',
            'if (visible) await this.allowButton.click();',
            '}',
            '}',
            'export default new ContactsScreen();',
        ].join('\n') }, { layer: 'locators', path: 'resources/locators/payment/yapear-contact.locator.json',
            content: JSON.stringify({ yapearAndroid: { allowButton: value }, yapearIos: { allowButton: '' } }) }],
        actionTrace: [{ sequence: 2, locatorName: 'allowButton', screenMethod: 'startYapeoFlow' }],
    };
    return { evidence, response };
}

test('portable check accepts English alias and optional permission using exact recorded pair in either platform order', () => {
    for (const order of [['android', 'ios'], ['ios', 'android']]) {
        const { evidence, response } = fixture(order);
        assert.deepEqual(interactionLocatorProblems(evidence, response).errors, []);
    }
});

test('permission regression changes both enum and value: checker rejects without correcting bytes', () => {
    const { evidence, response } = fixture();
    response.files[0].content = response.files[0].content.replace('TypeLocator.ANDROID', 'TypeLocator.XPATH');
    const json = JSON.parse(response.files[1].content);
    json.yapearAndroid.allowButton = evidence.actions[0].primary.selector;
    response.files[1].content = JSON.stringify(json);
    const before = JSON.stringify(response);
    assert.ok(interactionLocatorProblems(evidence, response).errors.some(error => error.code === 'locator-type-mismatch'));
    assert.equal(JSON.stringify(response), before);
});

test('local check rejects missing platform key, missing/duplicate trace, and method using a literal', () => {
    const { evidence, response } = fixture();
    const variants = [
        output => { output.files[1].content = output.files[1].content.replace('"allowButton":""', ''); },
        output => { output.actionTrace = []; },
        output => { output.actionTrace.push({ ...output.actionTrace[0] }); },
        output => { output.files[0].content = output.files[0].content.replace('await this.allowButton.click()', "await $('id=other').click()"); },
    ];
    for (const mutate of variants) {
        const output = structuredClone(response);
        mutate(output);
        assert.ok(interactionLocatorProblems(evidence, output).errors.length);
    }
});

test('local checking does not demand Feature/Steps or confuse a returned boolean with an unasserted Step', () => {
    const { evidence, response } = fixture();
    evidence.actions[0].action = 'VERIFICAR_EXISTE';
    response.files[0].content = response.files[0].content.replace(/async startYapeoFlow\(\) \{[\s\S]*?\n\}/,
        'async startYapeoFlow() { return await this.allowButton.isDisplayed(); }');
    const checked = interactionLocatorProblems(evidence, response);
    assert.deepEqual(checked.errors, []);
    assert.match(checked.notes.join('\n'), /integración verifica el enlace/);
});

test('adopted candidate and reuse with a stronger selector are deferred rather than falsely rejected against old recording', () => {
    const { evidence, response } = fixture();
    evidence.actions[0].reuseCandidates = [{ name: 'allowButton' }];
    response.files[1].content = response.files[1].content.replace('permission_allow_button', 'permission_allow_foreground_only_button');
    assert.deepEqual(interactionLocatorProblems(evidence, response).errors, []);
    evidence.actions[0].resolution = 'reuse';
    evidence.actions[0].locatorName = 'allowButton';
    delete evidence.actions[0].reuseCandidates;
    assert.deepEqual(interactionLocatorProblems(evidence, response).errors, []);
});

test('confined Node checker runs copied validator readers without importing target code or using target module resolution', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-locator-check-'));
    try {
        const tools = path.join(directory, 'tools'); fs.mkdirSync(tools);
        const { evidence, response } = fixture();
        writeInteractionLocatorTools(tools, evidence, require.resolve('typescript/lib/typescript.js'));
        fs.writeFileSync(path.join(tools, 'check.js'), interactionCheckScript(require.resolve('typescript/lib/typescript.js')));
        fs.writeFileSync(path.join(directory, 'interaction-result.json'), JSON.stringify(response));
        let run = spawnSync(process.execPath, ['tools/check.js'], { cwd: directory, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.match(run.stdout, /OK: comprobaciones locales/);
        response.files[0].content = response.files[0].content.replace('TypeLocator.ANDROID', 'TypeLocator.XPATH');
        fs.writeFileSync(path.join(directory, 'interaction-result.json'), JSON.stringify(response));
        run = spawnSync(process.execPath, ['tools/check.js'], { cwd: directory, encoding: 'utf8' });
        assert.equal(run.status, 1, run.stdout + run.stderr);
        assert.match(run.stdout, /locator-type-mismatch/);
        run = spawnSync(process.execPath, ['tools/check.js', '../outside.json'], { cwd: directory, encoding: 'utf8' });
        assert.equal(run.status, 1);
        assert.match(run.stdout, /\[path\]/);
        fs.symlinkSync(__filename, path.join(directory, 'outside-link.json'));
        run = spawnSync(process.execPath, ['tools/check.js', 'outside-link.json'], { cwd: directory, encoding: 'utf8' });
        assert.equal(run.status, 1);
        assert.match(run.stdout, /\[path\]/);
        fs.writeFileSync(path.join(tools, 'check.js'), interactionCheckScript(null));
        run = spawnSync(process.execPath, ['tools/check.js'], { cwd: directory, encoding: 'utf8' });
        assert.equal(run.status, 1);
        assert.match(run.stdout, /locator-check-unavailable/);
        for (const name of ['interactionLocatorCheck', 'screenLocatorTypes', 'screenMethodUsage', 'screenAst']) {
            const code = fs.readFileSync(path.join(tools, `${name}.js`), 'utf8');
            assert.doesNotMatch(code, /require\(["'](?:fs|path|.*workspace|.*indexing)["']\)/);
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Zorem plan projection exposes canonical pair while preserving raw selector and original plan', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-locator-plan-'));
    try {
        const { evidence } = fixture();
        const primary = evidence.actions[0].primary;
        const scenario = { platform: 'android', actions: [{ sequence: 2, action: 'CLICK', selector: primary.selector,
            selectorVerified: true, locatorType: primary.locatorType, locatorValue: primary.locatorValue }] };
        const plan = { resolutions: [{ sequence: 2, resolution: 'create', locatorName: 'permitirButton', selector: primary.selector }] };
        fs.writeFileSync(path.join(directory, 'scenario.json'), JSON.stringify(scenario));
        const projected = projectRoleJson('generation-plan.json', plan, 'interaction-author', directory);
        assert.equal(projected.resolutions[0].recordedLocator.locatorType, 'ANDROID');
        assert.equal(projected.resolutions[0].recordedLocator.locatorValue, primary.locatorValue);
        assert.equal(projected.resolutions[0].selector, primary.selector);
        assert.equal(plan.resolutions[0].recordedLocator, undefined);
        assert.deepEqual(projectRoleJson('generation-plan.json', plan, 'behavior-author', directory), plan);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
