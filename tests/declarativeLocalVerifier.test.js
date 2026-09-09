const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AutomationPackageBuilder, AutomationMemory, DeterministicResolver } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { DeterministicGenerator } = require('../dist/core/generation');
const { isolatedFramework } = require('./helpers/isolatedFramework');

isolatedFramework({ after: callback => test.after(callback) }, 'avr-local-declarative-');
const catalog = { getCatalog: (squad, platform) => ({ squad, platform,
    stepDefinitions: [], screenMethods: [], locators: [], features: [] }) };
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

function packageFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-declarative-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const scenario = {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-local-wording', revision: 1,
        fingerprint: 'local-wording-fingerprint', createdAt: new Date(0).toISOString(), squad: 'payment',
        platform: 'android', environment: 'qa', objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos',
        request: { squad: 'payment', featureName: 'Flujo mobile', scenarioName: 'Consultar movimientos',
            fileName: 'local-business-wording', locatorModule: 'local-business-wording', caseId: 'TC-10239',
            pathType: 'Happy Path', tag: 'localwording', dataName: 'Usuario QA', platform: 'android' },
        actions: [{ action: 'VERIFICAR_EXISTE', selector: 'id=movimientos', selectorVerified: true,
            contextHint: 'lista de movimientos', sequence: 1 }],
    };
    const result = new AutomationPackageBuilder(new DeterministicResolver(catalog),
        new AutomationMemory(path.join(root, 'memory')), undefined, new AutomationResponseValidator(undefined, catalog))
        .prepare(scenario, root);
    const directory = result.packageDirectory;
    // Materialize the fixture locally even when the plan requests a semantic author.
    // This suite exercises the generated checker, without starting any provider.
    const response = new DeterministicGenerator().createDraft(directory);
    const plan = JSON.parse(fs.readFileSync(path.join(directory, 'generation-plan.json')));
    response.resolutions = plan.unresolvedGapIds.map(gapId => ({ gapId, decision: 'create' }));
    write(path.join(directory, 'agent-response.json'), response);
    const packagedScenario = JSON.parse(fs.readFileSync(path.join(directory, 'scenario.json')));
    const feature = response.files.find(file => file.layer === 'feature');
    const putStep = text => {
        feature.content = feature.content.replace(/^(\s*Then\s+)/m, '    When ' + text + '\n$1');
        write(path.join(directory, 'agent-response.json'), response);
    };
    const verify = () => {
        const run = spawnSync(process.execPath, ['verify-package.js'], { cwd: directory, encoding: 'utf8' });
        return { status: run.status, output: run.stdout + run.stderr };
    };
    return { directory, response, packagedScenario, feature, putStep, verify };
}

test('generated local verifier rejects a new mechanics-only step through the shared Gherkin contract', t => {
    const f = packageFixture(t);
    assert.ok(fs.existsSync(path.join(f.directory, 'gherkin-contract.js')));
    f.putStep('el usuario selecciona cerrar');
    const result = f.verify();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Gherkin técnico\/imperativo: el usuario selecciona cerrar/);
});

test('generated local verifier accepts declarative business wording', t => {
    const f = packageFixture(t);
    f.putStep('el usuario consulta sus movimientos');
    const result = f.verify();
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /PASS: contrato del paquete válido/);
});

test('mechanical wording already reused from the framework is preserved literally', t => {
    const f = packageFixture(t);
    const text = 'el usuario selecciona cerrar';
    f.packagedScenario.request.scenarioRows.push({ keyword: 'When', text, status: 'reused', actions: [] });
    write(path.join(f.directory, 'scenario.json'), f.packagedScenario);
    f.putStep(text);
    const result = f.verify();
    assert.equal(result.status, 0, result.output);
});

test('unchanged baseline Feature wording is exempt, but a changed mechanical step is checked', t => {
    const f = packageFixture(t);
    f.putStep('el usuario selecciona cerrar');
    fs.mkdirSync(path.join(f.directory, 'baselines'), { recursive: true });
    const reference = 'baselines/feature-wording.feature';
    fs.writeFileSync(path.join(f.directory, reference), f.feature.content);
    const reuse = JSON.parse(fs.readFileSync(path.join(f.directory, 'reuse-context.json')));
    reuse.updateBaselines = [...(reuse.updateBaselines || []), { layer: 'feature', path: f.feature.path, reference }];
    write(path.join(f.directory, 'reuse-context.json'), reuse);
    const inherited = f.verify();
    assert.equal(inherited.status, 0, inherited.output);
    f.feature.content = f.feature.content.replace('el usuario selecciona cerrar', 'el usuario selecciona continuar');
    write(path.join(f.directory, 'agent-response.json'), f.response);
    const changed = f.verify();
    assert.equal(changed.status, 1, changed.output);
    assert.match(changed.output, /Gherkin técnico\/imperativo: el usuario selecciona continuar/);
});

test('a baseline from another Feature cannot exempt new mechanical wording', t => {
    const f = packageFixture(t);
    f.putStep('el usuario selecciona cerrar');
    fs.mkdirSync(path.join(f.directory, 'baselines'), { recursive: true });
    const reference = 'baselines/feature-other.feature';
    fs.writeFileSync(path.join(f.directory, reference), f.feature.content);
    const reuse = JSON.parse(fs.readFileSync(path.join(f.directory, 'reuse-context.json')));
    reuse.updateBaselines = [{ layer: 'feature', path: 'features/yape-features/payment/other.feature', reference }];
    write(path.join(f.directory, 'reuse-context.json'), reuse);
    const result = f.verify();
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Gherkin técnico\/imperativo/);
});

test('QA or memory wording flags do not exempt a newly generated mechanics-only step', t => {
    const f = packageFixture(t);
    f.putStep('el usuario selecciona cerrar');
    for (const wording of ['qa', 'memory']) {
        const scenario = structuredClone(f.packagedScenario);
        scenario.request.scenarioRows.push({ keyword: 'When', text: 'el usuario selecciona cerrar',
            status: 'missing', wording, actions: [] });
        write(path.join(f.directory, 'scenario.json'), scenario);
        const result = f.verify();
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /Gherkin técnico\/imperativo/);
    }
});
