const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectCaseCoverageSnapshots } = require('../dist/core/indexing/infrastructure/caseCoverageSnapshot');

const FEATURE = 'features/yape-features/payment/coverage.feature';
const STEPS = 'features/yape-steps-definitions/payment/coverage.steps.ts';
const SCREEN = 'screenobjects/payment/coverage.screen.ts';
const LOCATORS = 'resources/locators/payment/coverage.locator.json';
function fixture(t, files = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-coverage-snapshot-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
    }
    return root;
}
const source = {
    [FEATURE]: 'Feature: Pago\n  Scenario: [TC-100] Consulta\n    Then existe resultado',
    [STEPS]: "import payment from '@screenobjects/payment/coverage.screen.js'; Then(/^existe resultado$/, async () => { await payment.show(); });",
    [SCREEN]: "import locators from '@locators/payment/coverage.locator.json'; export default class Screen { show() { return locators.title; } }",
    [LOCATORS]: '{"title":"id=title"}',
};
function collect(root, overrides = {}) {
    return collectCaseCoverageSnapshots({ frameworkRoot: root, featurePath: FEATURE, stepFiles: [STEPS], afterFiles: {}, ...overrides });
}

test('coverage snapshots preserve captured baseline and isolate generated overlays', t => {
    const root = fixture(t, { ...source, [SCREEN]: 'checkout changed after capture' });
    const beforeFiles = { [SCREEN]: source[SCREEN] };
    const afterFiles = { [SCREEN]: 'export default class ChangedScreen {}', [FEATURE]: 'Feature: Nueva redacción' };
    const snapshots = collect(root, { beforeFiles, afterFiles });
    assert.equal(snapshots.before.files[SCREEN], source[SCREEN]);
    assert.equal(snapshots.before.files[FEATURE], source[FEATURE]);
    assert.equal(snapshots.after.files[SCREEN], afterFiles[SCREEN]);
    assert.equal(snapshots.after.files[FEATURE], afterFiles[FEATURE]);
    assert.equal(fs.readFileSync(path.join(root, SCREEN), 'utf8'), 'checkout changed after capture');
    beforeFiles[SCREEN] = 'later mutation';
    afterFiles[SCREEN] = 'later mutation';
    assert.equal(snapshots.before.files[SCREEN], source[SCREEN]);
    assert.notEqual(snapshots.after.files[SCREEN], 'later mutation');
    assert.ok(Object.isFrozen(snapshots.before.files));
    assert.ok(Object.isFrozen(snapshots.after.files));
});

test('coverage snapshots independently follow old/new imports and their transitive helpers', t => {
    const oldHelper = 'support/common/old.ts';
    const newHelper = 'support/utils/new.ts';
    const leaf = 'support/utils/leaf/index.ts';
    const root = fixture(t, {
        ...source,
        [SCREEN]: "import old from '@common/old'; export default old;",
        [oldHelper]: 'export default 1;',
        [newHelper]: "export { default } from './leaf';",
        [leaf]: 'export default 2;',
    });
    const snapshots = collect(root, { afterFiles: { [SCREEN]: "import next from '@utils/new.js'; export default next;" } });
    assert.equal(snapshots.before.files[oldHelper], 'export default 1;');
    assert.equal(snapshots.before.files[newHelper], undefined);
    assert.equal(snapshots.after.files[oldHelper], undefined);
    assert.equal(snapshots.after.files[newHelper], "export { default } from './leaf';");
    assert.equal(snapshots.after.files[leaf], 'export default 2;');
});

test('generated dependencies are never used to fabricate the baseline graph', t => {
    const root = fixture(t, source);
    const generated = 'support/utils/brand-new.ts';
    const snapshots = collect(root, { afterFiles: {
        [SCREEN]: "import helper from '@utils/brand-new'; export default helper;",
        [generated]: 'export default "new";',
    } });
    assert.equal(snapshots.before.files[generated], undefined);
    assert.equal(snapshots.before.files[SCREEN], source[SCREEN]);
    assert.equal(snapshots.after.files[generated], 'export default "new";');
});

test('missing local imports remain absent and external packages are not traversed', t => {
    const root = fixture(t, { ...source, [SCREEN]: "import missing from '@utils/missing'; import packageModule from '@wdio/globals'; export default missing;" });
    const snapshots = collect(root);
    assert.equal(snapshots.before.files['support/utils/missing.ts'], undefined);
    assert.deepEqual(Object.keys(snapshots.before.files), [FEATURE, STEPS, SCREEN].sort());
});

test('all supplied framework Step files participate, including another squad', t => {
    const foreign = 'features/yape-steps-definitions/other/conflicting.steps.ts';
    const root = fixture(t, { ...source, [foreign]: 'Then(/^existe resultado$/, async () => {});' });
    const snapshots = collect(root, { stepFiles: [foreign, STEPS] });
    assert.equal(snapshots.before.files[foreign], 'Then(/^existe resultado$/, async () => {});');
    assert.deepEqual(Object.keys(snapshots.before.files), Object.keys(snapshots.before.files).sort());
});

test('captures each physical checkout file at most once across both graphs and aliases', t => {
    const root = fixture(t, source);
    const alias = 'screenobjects/payment/alias.screen.ts';
    fs.symlinkSync(path.join(root, SCREEN), path.join(root, alias));
    const reads = new Map();
    const original = fs.readFileSync;
    fs.readFileSync = function (file, ...args) {
        if (typeof file === 'string' && file.startsWith(fs.realpathSync(root))) reads.set(file, (reads.get(file) || 0) + 1);
        return original.call(this, file, ...args);
    };
    let snapshots;
    try { snapshots = collect(root, { stepFiles: [STEPS, alias] }); }
    finally { fs.readFileSync = original; }
    assert.equal(snapshots.before.files[SCREEN], source[SCREEN]);
    assert.equal(snapshots.after.files[SCREEN], source[SCREEN]);
    assert.equal(reads.size, 4);
    assert.ok([...reads.values()].every(count => count === 1));
});

test('records tsconfig to let the comparator reject unsupported alias configurations', t => {
    const config = '{"compilerOptions":{"paths":{"@screenobjects/*":["alternate/*"]}}}';
    const root = fixture(t, { ...source, 'tsconfig.json': config });
    const snapshots = collect(root);
    assert.equal(snapshots.before.files['tsconfig.json'], config);
    assert.equal(snapshots.after.files['tsconfig.json'], config);
});

for (const file of ['../outside.ts', '/private/tmp/outside.ts', 'nested/../outside.ts', 'resources/data/users.json', '.env', 'runtime/session.json', 'secrets/key.json']) {
    test(`rejects invalid or sensitive caller source path ${file}`, t => {
        const root = fixture(t, source);
        assert.throws(() => collect(root, { afterFiles: { [file]: 'sensitive value' } }), /^Error: case-coverage-invalid-source$/);
    });
}

test('rejects symlink escapes for existing and new generated source paths', t => {
    const root = fixture(t, source);
    const outside = fixture(t, { 'secret.ts': 'outside contents' });
    fs.symlinkSync(outside, path.join(root, 'linked'));
    for (const file of ['linked/secret.ts', 'linked/new.ts']) {
        assert.throws(() => collect(root, { afterFiles: { [file]: 'generated' } }), /^Error: case-coverage-invalid-source$/);
    }
});

test('excludes imported symlinks, traversal, credentials and data even when aliased', t => {
    const root = fixture(t, { ...source,
        [SCREEN]: "import external from './external'; import data from '@resources/data/users.json'; import secret from './secret'; import outside from '../../../../outside.ts'; export default external;",
        'resources/data/users.json': '{"sensitive":"never copied"}',
    });
    const outside = fixture(t, { 'external.ts': 'outside contents' });
    fs.symlinkSync(path.join(outside, 'external.ts'), path.join(root, 'screenobjects/payment/external.ts'));
    fs.symlinkSync(path.join(root, 'resources/data/users.json'), path.join(root, 'screenobjects/payment/secret.ts'));
    const snapshots = collect(root);
    assert.deepEqual(Object.keys(snapshots.before.files), [FEATURE, STEPS, SCREEN].sort());
    assert.ok(!JSON.stringify(snapshots).includes('never copied'));
    assert.ok(!JSON.stringify(snapshots).includes('outside contents'));
});


test('empty captured source is authoritative and does not fall back to checkout contents', t => {
    const root = fixture(t, source);
    const snapshots = collect(root, { beforeFiles: { [SCREEN]: '' } });
    assert.equal(snapshots.before.files[SCREEN], '');
    assert.equal(snapshots.after.files[SCREEN], '');
    assert.equal(snapshots.before.files[LOCATORS], undefined);
});

test('absolute imports do not resolve to an unrelated nested path inside the framework', t => {
    const root = fixture(t, { ...source,
        [SCREEN]: "import wrong from '/private/module.ts'; export default wrong;",
        'screenobjects/payment/private/module.ts': 'export default "unrelated";',
    });
    const snapshots = collect(root);
    assert.equal(snapshots.before.files['screenobjects/payment/private/module.ts'], undefined);
    assert.equal(snapshots.after.files['screenobjects/payment/private/module.ts'], undefined);
});


test('session implementation imports remain source dependencies outside runtime', t => {
    const session = 'support/common/session/scenario-session.ts';
    const root = fixture(t, { ...source,
        [SCREEN]: "import session from '@common/session/scenario-session'; export default session;",
        [session]: 'export default class ScenarioSession {}',
    });
    const snapshots = collect(root);
    assert.equal(snapshots.before.files[session], 'export default class ScenarioSession {}');
    assert.equal(snapshots.after.files[session], 'export default class ScenarioSession {}');
});
