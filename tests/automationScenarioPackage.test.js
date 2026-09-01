const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AutomationPackageBuilder,
} = require('../dist/core/automation');
const {
    packageAutomationScenario,
} = require('../dist/core/automation');
const {
    createAutomationPackageProvenance,
} = require('../dist/core/automation');
const {
    locatorCandidatePackage,
    requireTrustedLocatorCandidatePackage,
} = require('../dist/core/automation');

function request() {
    return {
        squad: 'payment',
        featureName: 'Flujo mobile',
        scenarioName: 'Escenario grabado',
        fileName: 'flujo-mobile',
        locatorModule: 'nueva-pantalla',
        caseId: 'TC-10239',
        pathType: 'Happy Path',
        tag: 'miflujo',
        dataName: '',
        platform: 'android',
    };
}

function selectorCandidate() {
    return {
        candidateId: 'primary-movements',
        selector: 'id=movimientos',
        inspectorStrategy: 'id',
        locatorType: 'XPATH',
        locatorValue: '//*[@resource-id="movimientos"]',
        priority: 0,
        stability: 'manual',
        sourceReason: 'Manual Inspector selection',
        primary: true,
        verification: {
            protocolVersion: 3,
            verifiedAt: '2026-08-28T00:00:00.000Z',
            matchCount: 1,
            sameElement: true,
        },
    };
}

function recording(withCandidates = false) {
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-package-test',
        revision: 5,
        fingerprint: 'fingerprint-package-test',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestra la lista de movimientos',
        request: request(),
        actions: [{
            action: 'VERIFICAR_EXISTE',
            selector: 'id=movimientos',
            selectorVerified: true,
            elementIntent: 'lista de movimientos',
            sequence: 1,
            ...(withCandidates ? { selectorCandidates: [selectorCandidate()] } : {}),
        }],
    };
}

function resolvedScenario(source) {
    return {
        ...source,
        request: {
            ...source.request,
            featureName: 'Consultar movimientos',
            scenarioName: 'Consultar movimientos',
            fileName: 'view-movements',
            locatorModule: 'view-movements',
            dataName: 'Usuario QA Temporal',
            scenarioRows: [
                {
                    keyword: 'Given',
                    text: 'el usuario <username> inicia sesión en Yape',
                    status: 'reused',
                    actions: [],
                },
                {
                    keyword: 'Then',
                    text: 'se muestra la lista de movimientos',
                    status: 'missing',
                    actions: [{ ...source.actions[0] }],
                },
            ],
            examples: { username: 'Usuario QA Temporal' },
        },
    };
}

function builderFor(resolved) {
    return new AutomationPackageBuilder({
        resolve: () => ({ scenario: resolved }),
    });
}

test('con procedencia usa la instantánea y no reejecuta el resolver al reimportar', t => {
    const original = recording();
    const resolved = resolvedScenario(original);
    const packaged = packageAutomationScenario(resolved);
    const plan = {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-package-snapshot',
        recordingId: original.recordingId,
        fingerprint: original.fingerprint,
        deterministicCoverage: 1,
        status: 'needs-agent',
        resolutions: [], files: [], unresolvedGapIds: [],
        budgets: {
            maxDurationMs: 300000, maxContextBytes: 20000, maxResponseBytes: 400000,
            maxAgentInvocations: 2, maxTotalQueries: 24, maxQueriesPerGap: 6,
            maxRepairAttempts: 1,
        },
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-package-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, 'generation-plan.json'), JSON.stringify(plan));
    fs.writeFileSync(
        path.join(directory, 'package-provenance.json'),
        JSON.stringify(createAutomationPackageProvenance(original, packaged, plan)),
    );
    const builder = new AutomationPackageBuilder({
        resolve: () => { throw new Error('el resolver no debe ejecutarse'); },
    });

    const trusted = builder.requireTrustedScenarioPackage(original, packaged, directory);
    assert.equal(trusted.request.scenarioRows[1].text, 'se muestra la lista de movimientos');
});

test('acepta la normalización determinista y las filas/Examples agregadas', () => {
    const original = recording();
    const resolved = resolvedScenario(original);
    const packaged = packageAutomationScenario(resolved);
    const trusted = builderFor(resolved).requireTrustedScenarioPackage(original, packaged);

    assert.notEqual(packaged.request.featureName, original.request.featureName);
    assert.notEqual(packaged.request.scenarioName, original.request.scenarioName);
    assert.notEqual(packaged.request.fileName, original.request.fileName);
    assert.notEqual(packaged.request.locatorModule, original.request.locatorModule);
    assert.notEqual(packaged.request.dataName, original.request.dataName);
    assert.deepEqual(packaged.request.examples, { username: 'Usuario QA Temporal' });
    assert.deepEqual(packaged.request.scenarioRows[1].actions, [{ sequence: 1 }]);
    assert.deepEqual(trusted.request.scenarioRows[1].actions, resolved.request.scenarioRows[1].actions);
    assert.notEqual(trusted, packaged);
});

test('el paquete agentic nunca publica selectorCandidates, con o sin candidatos en la grabación', async t => {
    for (const withCandidates of [false, true]) {
        await t.test(withCandidates ? 'con candidatos' : 'sin candidatos', () => {
            const original = recording(withCandidates);
            const resolved = resolvedScenario(original);
            const packaged = packageAutomationScenario(resolved);
            const candidates = locatorCandidatePackage(original);

            assert.equal(
                Object.hasOwn(packaged.actions[0], 'selectorCandidates'),
                false
            );
            assert.doesNotThrow(() =>
                builderFor(resolved).requireTrustedScenarioPackage(original, packaged)
            );
            assert.doesNotThrow(() =>
                requireTrustedLocatorCandidatePackage(original, candidates)
            );
            // Contrato vigente: un unico selector verificado por acción.
            // locator-candidates.json ya no publica candidatos, haya o no
            // selectorCandidates en la grabación local.
            assert.equal(candidates.actions.length, 0);
        });
    }
});

test('rechaza cambios reales del escenario empaquetado', async t => {
    const original = recording(true);
    const resolved = resolvedScenario(original);
    const valid = packageAutomationScenario(resolved);
    const mutations = {
        acción: value => { value.actions[0].action = 'CLICK'; },
        selector: value => { value.actions[0].selector = '~otro'; },
        objective: value => { value.objective = 'Otro objetivo'; },
        recordingId: value => { value.recordingId = 'otra-grabacion'; },
        platform: value => { value.platform = 'ios'; },
        fingerprint: value => { value.fingerprint = 'otro-fingerprint'; },
    };

    for (const [name, mutate] of Object.entries(mutations)) {
        await t.test(name, () => {
            const tampered = structuredClone(valid);
            mutate(tampered);
            assert.throws(
                () => builderFor(resolved).requireTrustedScenarioPackage(original, tampered),
                // El mensaje nombra el campo que divergio: el fallo mas comun no
                // es una manipulacion sino un paquete viejo, y sin el detalle el
                // QA no sabia que habia cambiado ni que hacer.
                /ya no corresponde a la grabación: difiere en /
            );
        });
    }
});

test('preserva revisiones de refinement sin aceptar retrocesos', () => {
    const original = recording();
    const resolved = resolvedScenario(original);
    const refined = packageAutomationScenario(resolved);
    refined.revision += 1;

    assert.doesNotThrow(() =>
        builderFor(resolved).requireTrustedScenarioPackage(original, refined)
    );
    assert.equal(
        builderFor(resolved).requireTrustedScenarioPackage(original, refined).revision,
        refined.revision
    );

    const stale = structuredClone(refined);
    stale.revision = original.revision - 1;
    assert.throws(
        () => builderFor(resolved).requireTrustedScenarioPackage(original, stale),
        /ya no corresponde a la grabación: su revisión es/
    );
});

test('locator-candidates.json siempre viaja vacío y conserva validación de identidad', () => {
    // Contrato vigente: selectorCandidates fue retirado del paquete agentic
    // (un único selector verificado por acción); locator-candidates.json ya
    // no transporta candidatos, pero sigue validando que la identidad de la
    // grabación (recordingId, platform, schemaVersion) no haya cambiado.
    const original = recording(true);
    const resolved = resolvedScenario(original);
    const packaged = packageAutomationScenario(resolved);
    const candidates = locatorCandidatePackage(original);

    assert.deepEqual(candidates.actions, []);
    assert.doesNotThrow(() =>
        builderFor(resolved).requireTrustedScenarioPackage(original, packaged)
    );
    assert.doesNotThrow(() =>
        requireTrustedLocatorCandidatePackage(original, candidates)
    );

    const tamperedIdentity = { ...candidates, recordingId: 'otra-grabacion' };
    assert.throws(
        () => requireTrustedLocatorCandidatePackage(original, tamperedIdentity),
        /locator-candidates\.json fue modificado/
    );
    assert.throws(
        () => requireTrustedLocatorCandidatePackage(original, undefined),
        /locator-candidates\.json fue modificado/
    );
});
