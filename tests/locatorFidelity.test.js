const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { recordedLocator } = require('../dist/core/indexing');
const { candidateAllowlist } = require('../dist/core/automation/contracts');
const { prepareRecordedStep } = require('../dist/core/automation/infrastructure/automationRecordingStore');
const { FwkMobileGenerator } = require('../dist/core/generation');
const { frameworkContract, projectPaths, configureWorkspacePaths } = require('../dist/core/workspace');
const { auditRecordedLocators, reconcileRecordedLocatorTypes } = require('../dist/core/validation');
const { recordedLocatorRules } = require('../dist/core/validation/infrastructure/rules/recordedLocatorRules');

const action = () => ({ action: 'CLICK', sequence: 1, variableName: 'movementsButton', selectorVerified: true,
    selector: 'android=new UiSelector().text("Movimientos")', locatorType: 'ANDROID', locatorValue: 'new UiSelector().text("Movimientos")' });
function fixture(kind = 'create') {
    const a = action(), contract = frameworkContract(projectPaths.frameworkRoot);
    const request = { squad: 'payment', platform: 'android', caseId: 'TC-1', pathType: 'Happy Path', tag: 'movements',
        featureName: 'Movimientos', scenarioName: 'Consultar movimientos', fileName: 'movements', locatorModule: 'movements',
        scenarioRows: [{ keyword: 'When', text: 'consulta sus movimientos', methodName: 'viewMovements', status: 'missing', actions: [a] }] };
    const preview = new FwkMobileGenerator().preview(request, [a]);
    const files = [{ layer: 'screen', path: path.relative(projectPaths.frameworkRoot, preview.screenPath), content: preview.screenContent },
        { layer: 'locators', path: path.relative(projectPaths.frameworkRoot, preview.locatorPath), content: preview.locatorContent }];
    return { scenario: { actions: [a], platform: 'android', request }, contract,
        plan: { resolutions: [{ sequence: 1, resolution: kind, locatorName: a.variableName,
            ...(kind === 'reuse' ? { source: { file: files[1].path } } : {}) }], files: files.map(f => ({ layer: f.layer, path: f.path, operation: kind === 'reuse' ? 'update' : 'create' })) },
        response: { files, actionTrace: [{ sequence: 1, locatorName: a.variableName, screenMethod: 'viewMovements' }] } };
}

test('persisted type/value remain authoritative, inconsistent metadata is diagnosed without rewriting it', () => {
    const a = action();
    const bad = { ...a, locatorType: 'XPATH' };
    const stored = prepareRecordedStep(bad, 1, 'android');
    assert.equal(stored.locatorType, 'XPATH');
    assert.match(stored.locatorWarning, /contradice/);
    assert.deepEqual(candidateAllowlist(stored, 'android'), []);
    assert.equal(recordedLocator(a, 'android').type, 'ANDROID');
    assert.equal(recordedLocator({ ...a, platform: 'ios' }, 'android').ok, false);
    assert.equal(recordedLocator({ ...a, locatorValue: undefined }, 'android').ok, false);
});

test('legacy strategies and explicit bare values survive round trip without guessing XPath or changing whitespace', () => {
    for (const [selector, platform] of [['~Ver  todos', 'android'], ['android=new UiSelector().text("Útimos  30 días")', 'android'],
        ['//Button[@text="A  B"]', 'android'], ['iosPredicate=label == "Sí"', 'ios'], ['iosClassChain=**/XCUIElementTypeButton', 'ios']]) {
        const legacy = recordedLocator({ selector }, platform);
        assert.equal(legacy.ok, true, legacy.reason);
        const saved = { selector, locatorType: legacy.type, locatorValue: legacy.value };
        assert.deepEqual(recordedLocator(saved, platform), legacy);
        assert.ok(legacy.composed.includes('  ') || !selector.includes('  '));
    }
    assert.equal(recordedLocator({ selector: 'Ver todos' }, 'android').ok, false);
    assert.equal(recordedLocator({ selector: 'Ver todos', locatorType: 'ID', locatorValue: 'Ver todos' }, 'android').composed, '~Ver todos');
});

test('new and reused getters reject Android-to-XPath changes even with identical locator JSON', () => {
    for (const kind of ['create', 'reuse']) {
        const f = fixture(kind);
        assert.equal(auditRecordedLocators(f.scenario, f.plan, f.response).matched, 1);
        f.response.files[0].content = f.response.files[0].content.replace('TypeLocator.ANDROID', 'TypeLocator.XPATH');
        const report = { errors: [], warnings: [] };
        recordedLocatorRules(f, report);
        assert.equal(report.errors[0].code, 'locator-type-mismatch');
        const original = JSON.stringify(f.response);
        const fixed = reconcileRecordedLocatorTypes(f.scenario, f.plan, f.response);
        assert.equal(fixed.changed, true);
        assert.equal(auditRecordedLocators(f.scenario, f.plan, fixed.response).matched, 1);
        assert.equal(JSON.stringify(f.response), original, 'original provider evidence is untouched');
        assert.equal(fixed.response.files[1].content, f.response.files[1].content);
        assert.equal(reconcileRecordedLocatorTypes(f.scenario, f.plan, fixed.response).changed, false);
    }
});

test('wrong values and contradictory evidence never authorize a mechanical type correction', () => {
    const f = fixture();
    f.response.files[0].content = f.response.files[0].content.replace('TypeLocator.ANDROID', 'TypeLocator.XPATH');
    f.response.files[1].content = f.response.files[1].content.replace('Movimientos', 'Otro elemento');
    assert.equal(reconcileRecordedLocatorTypes(f.scenario, f.plan, f.response).changed, false);
    f.scenario.actions[0].locatorType = 'XPATH';
    const audit = auditRecordedLocators(f.scenario, f.plan, f.response);
    assert.equal(audit.invalidEvidence.length, 1);
    assert.equal(reconcileRecordedLocatorTypes(f.scenario, f.plan, f.response).changed, false);
});

test('getter arguments follow the local framework signature in either platform order', t => {
    const old = { ...projectPaths };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locator-order-'));
    t.after(() => { Object.assign(projectPaths, old); fs.rmSync(root, { recursive: true, force: true }); });
    for (const order of [['android', 'ios'], ['ios', 'android']]) {
        const fwk = path.join(root, order.join('-'));
        for (const dir of ['support/utils', 'features/yape-features', 'features/yape-steps-definitions', 'resources/locators', 'screenobjects']) fs.mkdirSync(path.join(fwk, dir), { recursive: true });
        fs.writeFileSync(path.join(fwk, 'package.json'), '{}');
        fs.writeFileSync(path.join(fwk, 'support/utils/LocatorFactory.ts'), `export default class LocatorFactory { static getElement(${order.map(p => 'type' + p + ': TypeLocator, value' + p + ': string').join(', ')}) { return ''; } }`);
        configureWorkspacePaths({ targetProject: fwk, runtimeRoot: root, source: 'selected' });
        const contract = frameworkContract(fwk);
        assert.deepEqual(contract.locatorSignature.platformOrder, order);
        // Framework with no switch falls back to the known composition table.
        const f = fixture();
        assert.equal(auditRecordedLocators(f.scenario, f.plan, f.response).matched, 1);
        const types = f.response.files[0].content.match(/TypeLocator\.(?:XPATH|ANDROID)/g);
        assert.deepEqual(types, order.map(p => 'TypeLocator.' + (p === 'android' ? 'ANDROID' : 'XPATH')));
    }
});

test('unreadable reused enum bindings and swapped platform arguments cannot pass silently', () => {
    const f = fixture('reuse');
    f.response.files[0].content = f.response.files[0].content.replace('TypeLocator.ANDROID', 'someType');
    const report = { errors: [], warnings: [] };
    recordedLocatorRules(f, report);
    assert.ok(report.errors.some(e => e.code === 'locator-type-unverified'));
    assert.equal(reconcileRecordedLocatorTypes(f.scenario, f.plan, f.response).changed, false);
    const swapped = fixture('reuse');
    swapped.response.files[0].content = swapped.response.files[0].content.replace(/movementsAndroid/g, 'temporaryBlock').replace(/movementsIos/g, 'movementsAndroid').replace(/temporaryBlock/g, 'movementsIos');
    const swappedReport = { errors: [], warnings: [] };
    recordedLocatorRules(swapped, swappedReport);
    assert.ok(swappedReport.errors.some(e => e.code === 'locator-type-mismatch'));
    assert.equal(reconcileRecordedLocatorTypes(swapped.scenario, swapped.plan, swapped.response).changed, false);
});

test('generator uses an explicit recorded ID instead of treating its bare value as XPath', () => {
    const f = fixture();
    const a = { ...action(), selector: 'Ver todos', locatorType: 'ID', locatorValue: 'Ver todos' };
    f.scenario.request.scenarioRows[0].actions = [a];
    const before = JSON.stringify(a);
    const preview = new FwkMobileGenerator().preview(f.scenario.request, [a]);
    assert.match(preview.screenContent, /TypeLocator\.ID/);
    assert.equal(JSON.parse(preview.locatorContent).movementsAndroid.movementsButton, 'Ver todos');
    assert.equal(JSON.stringify(a), before);
});
