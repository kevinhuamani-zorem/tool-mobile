const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { projectPaths, readFrameworkUserCatalog } = require('../dist/core/workspace');
const { testDataRules, featureLoginUsers } = require('../dist/core/validation/infrastructure/rules/testDataRules');
const { prepareTestDataContext } = require('../dist/core/automation/infrastructure/testDataContext');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-test-data-'));
    const previous = projectPaths.frameworkRoot; projectPaths.frameworkRoot = root;
    t.after(() => { projectPaths.frameworkRoot = previous; fs.rmSync(root, { recursive: true, force: true }); });
    const data = path.join(root, 'resources/data/payment'); fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'approved.yml'), '- name: Jose Mendoza Dni7 AutoFE\n  password: DO-NOT-DISCLOSE\n');
    const feature = 'Feature: Ventas\n  Scenario Outline: [TC-10239] Ventas\n    Given el usuario <username> inicia sesión en Yape\n    Then se muestra el mensaje\n    Examples:\n      | username |\n      | Jose Mendoza Dni7 AutoFE |\n';
    const run = content => {
        const report = { errors: [], warnings: [] };
        testDataRules({ scenario: { request: { caseId: 'TC-10239' } }, response: { files: [{ layer: 'feature', path: 'features/ventas.feature', content }] } }, report);
        return report;
    };
    return { root, data, feature, run };
}

test('missing second Examples row is reported; existing user remains valid, using framework case matching', t => {
    const f = fixture(t);
    assert.deepEqual(f.run(f.feature).errors, []);
    assert.deepEqual(f.run(f.feature.replace('Jose Mendoza Dni7 AutoFE', 'JOSE MENDOZA DNI7 AUTOFE')).errors, []);
    const report = f.run(f.feature + '      | Jose Mendoza Dni10 |\n');
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, 'test-data-user-missing');
    assert.equal(report.errors[0].file, 'features/ventas.feature');
    assert.match(report.errors[0].message, /Dni10/);
    assert.ok(!JSON.stringify(report).includes('DO-NOT-DISCLOSE'));
    fs.writeFileSync(path.join(f.data, 'new.yml'), 'name: Jose Mendoza Dni10\n');
    assert.deepEqual(f.run(f.feature + '      | Jose Mendoza Dni10 |\n').errors, [], 'fresh validation sees QA data added after the preview');
});

test('login fixture checks cover every Examples block and ignore other cases and unrelated username inputs', t => {
    const f = fixture(t);
    const content = f.feature + '\n    @extra\n    Examples: Second\n      | username |\n      | missing |\n\n  Scenario: [TC-OTHER]\n    Given el usuario foreign inicia sesión en Yape\n';
    assert.deepEqual(featureLoginUsers(content, 'TC-10239'), ['Jose Mendoza Dni7 AutoFE', 'missing']);
    assert.deepEqual(featureLoginUsers('Feature: Login\n Scenario: Plain\n Given el usuario literal inicia sesión en Yape'), ['literal']);
    assert.deepEqual(featureLoginUsers(f.feature.replace('inicia sesión en Yape', 'escribe su nombre'), 'TC-10239'), []);
    assert.deepEqual(featureLoginUsers(content, 'TC-UNKNOWN'), []);
});

test('catalog mirrors .yml loading and reads list/mapping/aliases without retaining fixture secrets', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.data, 'map.yml'), 'name: "QA: Escapado"\npassword: SECRET-TWO\n');
    fs.writeFileSync(path.join(f.data, 'aliases.yml'), '- &base\n  name: QA Uno\n- <<: *base\n  name: QA Dos\n');
    fs.writeFileSync(path.join(f.data, 'ignored.yaml'), 'name: Not Loaded\n');
    const catalog = readFrameworkUserCatalog();
    assert.equal(catalog.status, 'available');
    assert.ok(catalog.names.has('QA: ESCAPADO')); assert.ok(catalog.names.has('QA DOS'));
    assert.ok(!catalog.names.has('NOT LOADED'));
    assert.ok(!JSON.stringify({ ...catalog, names: [...catalog.names] }).includes('SECRET'));
});

test('missing, malformed or redirected data is unavailable, never a false missing-user diagnosis or secret leak', t => {
    const f = fixture(t);
    const bad = path.join(f.data, 'bad.yml');
    fs.writeFileSync(bad, 'name: [SECRET-FROM-PARSER\n');
    let report = f.run(f.feature + ' | missing |\n');
    assert.equal(report.errors.length, 0); assert.match(report.warnings[0], /test-data-unavailable/);
    assert.ok(!JSON.stringify(report).includes('SECRET-FROM-PARSER'));
    fs.unlinkSync(bad); fs.symlinkSync(path.join(f.data, 'approved.yml'), bad);
    assert.equal(readFrameworkUserCatalog().status, 'unavailable');
    fs.rmSync(path.join(f.root, 'resources'), { recursive: true });
    assert.equal(readFrameworkUserCatalog().status, 'unavailable');
});

test('agent gets only existence for requested and current case baseline names, even when golden is disabled', t => {
    const f = fixture(t), pkg = path.join(f.root, 'pkg'); fs.mkdirSync(pkg);
    fs.writeFileSync(path.join(pkg, 'scenario.json'), JSON.stringify({ request: { caseId: 'TC-10239', dataName: 'Jose Mendoza Dni10' } }));
    fs.writeFileSync(path.join(pkg, 'baseline-response.json'), JSON.stringify({ files: [{ layer: 'feature', content: f.feature }] }));
    fs.writeFileSync(path.join(f.data, 'unrelated.yml'), 'name: UNRELATED-PRIVATE\npassword: DO-NOT-DISCLOSE\n');
    prepareTestDataContext(pkg);
    const output = fs.readFileSync(path.join(pkg, 'test-data-context.json'), 'utf8');
    assert.deepEqual(JSON.parse(output).users, [{ name: 'Jose Mendoza Dni10', exists: false }, { name: 'Jose Mendoza Dni7 AutoFE', exists: true }]);
    assert.ok(!output.includes('UNRELATED-PRIVATE')); assert.ok(!output.includes('DO-NOT-DISCLOSE'));
});
