const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    createAutomationPackageProvenance,
    requireTrustedAutomationPackageSnapshot,
} = require('../dist/core/automationPackageProvenance');
const {
    createAutomationApplicationReceipt,
    planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles,
} = require('../dist/core/automationApplicationReceipt');
const { packageAutomationScenario } = require('../dist/core/automationScenarioPackage');
const {
    restoreUpdateBaselinesForCorrection,
    rollbackCorrectionBaselines,
} = require('../dist/core/automationCorrectionBaseline');

function fixture() {
    const action = {
        action: 'CLICK', selector: '~movimientos', selectorVerified: true,
        elementIntent: 'mostrar movimientos', sequence: 1,
    };
    const recording = {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-correction',
        revision: 2,
        fingerprint: 'fingerprint-correction',
        createdAt: '2026-08-31T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestran los movimientos',
        request: {
            squad: 'payment', featureName: 'Movimientos', scenarioName: 'Consultar movimientos',
            fileName: 'movements', locatorModule: 'movements', caseId: 'TC-1',
            pathType: 'Happy Path', tag: 'payments', dataName: 'QA', platform: 'android',
        },
        actions: [action],
    };
    const resolved = {
        ...recording,
        request: {
            ...recording.request,
            scenarioRows: [{
                keyword: 'When', text: 'el usuario consulta sus movimientos', status: 'missing',
                actions: [action],
            }],
        },
    };
    const packaged = packageAutomationScenario(resolved);
    const plan = {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-correction',
        recordingId: recording.recordingId,
        fingerprint: recording.fingerprint,
        deterministicCoverage: 1,
        status: 'needs-agent',
        resolutions: [],
        files: [
            { layer: 'feature', path: 'features/payment/movements.feature', operation: 'create' },
        ],
        unresolvedGapIds: [],
        budgets: {
            maxDurationMs: 300000, maxContextBytes: 20000, maxResponseBytes: 400000,
            maxAgentInvocations: 2, maxTotalQueries: 24, maxQueriesPerGap: 6,
            maxRepairAttempts: 1,
        },
    };
    return { recording, resolved, packaged, plan };
}

test('reimporta contra la instantánea del paquete sin volver a resolver el framework', () => {
    const { recording, packaged, plan } = fixture();
    const provenance = createAutomationPackageProvenance(recording, packaged, plan);
    const trusted = requireTrustedAutomationPackageSnapshot(recording, packaged, plan, provenance);

    assert.equal(trusted.request.scenarioRows[0].text, 'el usuario consulta sus movimientos');
    assert.equal(trusted.request.scenarioRows[0].actions[0].selector, '~movimientos');
});

test('bloquea cambios de la grabación, scenario empaquetado o plan', async t => {
    const { recording, packaged, plan } = fixture();
    const provenance = createAutomationPackageProvenance(recording, packaged, plan);
    const cases = {
        recording: [
            { ...recording, objective: 'Objetivo editado' }, packaged, plan,
            /grabación original continuó o fue editada/,
        ],
        scenario: [
            recording,
            { ...packaged, objective: 'Objetivo manipulado' },
            plan,
            /scenario\.json fue modificado/,
        ],
        plan: [
            recording, packaged, { ...plan, planId: 'plan-otro' }, /planId cambió/,
        ],
    };
    for (const [name, [currentRecording, currentScenario, currentPlan, expected]] of Object.entries(cases)) {
        await t.test(name, () => assert.throws(
            () => requireTrustedAutomationPackageSnapshot(
                currentRecording, currentScenario, currentPlan, provenance
            ),
            expected,
        ));
    }
});

test('application receipt permite corrección si el archivo aplicado sigue intacto', t => {
    const framework = fs.mkdtempSync(path.join(os.tmpdir(), 'application-receipt-'));
    t.after(() => fs.rmSync(framework, { recursive: true, force: true }));
    const { resolved, plan } = fixture();
    const file = path.join(framework, plan.files[0].path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'Feature: Movimientos\n', 'utf8');
    const response = {
        schemaVersion: 1,
        recordingId: resolved.recordingId,
        planId: plan.planId,
        resolutions: [], actionTrace: [], files: [], assumptions: [],
    };
    const receipt = createAutomationApplicationReceipt(framework, resolved, plan, response);

    assert.doesNotThrow(() => requireUnchangedAppliedFiles(
        framework, receipt, resolved.recordingId, plan.planId
    ));
    fs.writeFileSync(file, 'Feature: Editado externamente\n', 'utf8');
    assert.throws(
        () => requireUnchangedAppliedFiles(framework, receipt, resolved.recordingId, plan.planId),
        /modificado fuera del recorder/,
    );
});

test('un update corregido toma como base el afterHash aplicado', () => {
    const { plan } = fixture();
    plan.files[0].operation = 'update';
    plan.files[0].baseHash = 'hash-original';
    const effective = planAgainstApplicationReceipt(plan, {
        schemaVersion: 1,
        recordingId: plan.recordingId,
        planId: plan.planId,
        responseHash: 'response',
        appliedAt: '2026-08-31T00:00:00.000Z',
        files: [{ path: plan.files[0].path, operation: 'update', afterHash: 'hash-aplicado' }],
    });
    assert.equal(effective.files[0].baseHash, 'hash-aplicado');
});

test('corrección de update restaura baseline y permite rollback', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'correction-baseline-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const framework = path.join(root, 'framework');
    const packageDirectory = path.join(root, 'package');
    const relative = 'screenobjects/payment/movements.screen.ts';
    const target = path.join(framework, relative);
    const baseline = path.join(packageDirectory, 'baselines/screen-movements.screen.ts');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(baseline), { recursive: true });
    fs.writeFileSync(target, 'class Movements { correctedV1() {} }\n', 'utf8');
    fs.writeFileSync(baseline, 'class Movements {}\n', 'utf8');
    fs.writeFileSync(path.join(packageDirectory, 'reuse-context.json'), JSON.stringify({
        updateBaselines: [{
            path: relative,
            reference: 'baselines/screen-movements.screen.ts',
        }],
    }));
    const plan = fixture().plan;
    plan.files = [{ layer: 'screen', path: relative, operation: 'update' }];

    const backups = restoreUpdateBaselinesForCorrection(packageDirectory, framework, plan);
    assert.equal(fs.readFileSync(target, 'utf8'), 'class Movements {}\n');
    rollbackCorrectionBaselines(backups);
    assert.equal(fs.readFileSync(target, 'utf8'), 'class Movements { correctedV1() {} }\n');
});

test('baseline faltante no modifica parcialmente otros archivos', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'correction-baseline-atomic-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const framework = path.join(root, 'framework');
    const packageDirectory = path.join(root, 'package');
    const first = 'features/payment/first.feature';
    const second = 'features/payment/second.feature';
    fs.mkdirSync(path.join(framework, 'features/payment'), { recursive: true });
    fs.mkdirSync(path.join(packageDirectory, 'baselines'), { recursive: true });
    fs.writeFileSync(path.join(framework, first), 'Feature: Aplicada\n');
    fs.writeFileSync(path.join(framework, second), 'Feature: Segunda\n');
    fs.writeFileSync(path.join(packageDirectory, 'baselines/first.feature'), 'Feature: Base\n');
    fs.writeFileSync(path.join(packageDirectory, 'reuse-context.json'), JSON.stringify({
        updateBaselines: [
            { path: first, reference: 'baselines/first.feature' },
            { path: second, reference: 'baselines/missing.feature' },
        ],
    }));
    const plan = fixture().plan;
    plan.files = [
        { layer: 'feature', path: first, operation: 'update' },
        { layer: 'feature', path: second, operation: 'update' },
    ];

    assert.throws(
        () => restoreUpdateBaselinesForCorrection(packageDirectory, framework, plan),
        /No se pudo reconstruir/,
    );
    assert.equal(fs.readFileSync(path.join(framework, first), 'utf8'), 'Feature: Aplicada\n');
});
