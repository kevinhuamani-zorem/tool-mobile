const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { effectiveGenerationPlan } = require('../dist/core/generation');
const { parseGapResolutions } = require('../dist/core/automation');

function fixturePlan() {
    return {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp-1',
        deterministicCoverage: 0,
        status: 'needs-agent',
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'ver movimientos',
            resolution: 'create',
            locatorName: 'showMovementsButton',
            selector: '~Mostrar movimientos',
            confidence: 1,
            gapId: 'gap-duplicate-element-1',
            reason: 'candidate exists',
            reuseCandidates: [{
                file: 'resources/locators/home/home.locator.json',
                module: 'home/home',
                name: 'lblRecentMovements',
            }],
        }],
        files: [],
        unresolvedGapIds: ['gap-duplicate-element-1'],
        budgets: {},
    };
}

function writeIdentityFixture(dir, {
    recordedName = 'showMovementsButton',
    candidateName = 'showMovementsButton',
    recordedType = 'ID',
    recordedValue = 'Mostrar movimientos',
    candidateType = 'ID',
    candidateValue = 'Mostrar movimientos',
} = {}) {
    fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({
        platform: 'android',
        actions: [{
            sequence: 1,
            variableName: recordedName,
            locatorType: recordedType,
            locatorValue: recordedValue,
        }],
    }));
    fs.writeFileSync(path.join(dir, 'resolved-context.json'), JSON.stringify({
        elementDeclarations: [{
            module: 'home/home',
            elements: [{
                name: candidateName,
                locators: {
                    android: { type: candidateType, value: candidateValue },
                },
            }],
        }],
    }));
}

test('effective plan materializa selectedCandidate autorizado como reuse', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-'));
    const source = fixturePlan();
    writeIdentityFixture(dir, {
        candidateName: 'lblRecentMovements',
    });
    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-duplicate-element-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/home/home.locator.json',
            // Alias abreviado emitido por el agente. El plan conserva el
            // módulo canónico porque file + name identifican el candidato.
            module: 'home',
            name: 'lblRecentMovements',
        },
    }]);
    assert.deepEqual(plan.resolutions[0].source, {
        file: 'resources/locators/home/home.locator.json',
        module: 'home/home',
        scope: 'home',
    });
    assert.equal(plan.resolutions[0].resolution, 'reuse');
    assert.equal(plan.resolutions[0].locatorName, 'lblRecentMovements');
});

test('effective plan rechaza candidatos que no ofrecieron plan ni findLocator', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-denied-'));
    assert.throws(() => effectiveGenerationPlan(dir, fixturePlan(), [{
        gapId: 'gap-duplicate-element-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/payment/other.locator.json',
            module: 'payment/other',
            name: 'inventedLocator',
        },
    }]), /no fue ofrecido/);
});

test('effective plan traduce un método existente al único locator que consume', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-method-'));
    const source = fixturePlan();
    source.resolutions[0].existingMethod = {
        file: 'screenobjects/payment/movements.screen.ts',
        name: 'showMovements',
        signature: 'showMovements()',
        locatorKeys: ['lblRecentMovements'],
        score: 0.95,
    };
    source.resolutions[0].gapId = 'gap-weak-assertion-1';
    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-weak-assertion-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'screenobjects/payment/movements.screen.ts',
            module: 'payment/movements',
            name: 'showMovements',
        },
    }]);
    assert.equal(plan.resolutions[0].resolution, 'reuse');
    assert.equal(plan.resolutions[0].locatorName, 'lblRecentMovements');
});

test('effective plan conserva create cuando TypeLocator o selector difieren', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-deterministic-reuse-'));
    const source = fixturePlan();
    source.resolutions[0].existingMethod = {
        file: 'screenobjects/payment/movements.screen.ts',
        name: 'showMovements',
        signature: 'showMovements()',
        locatorKeys: ['lblRecentMovements'],
        score: 0.87,
    };
    writeIdentityFixture(dir, {
        candidateName: 'lblRecentMovements',
        candidateType: 'XPATH',
        candidateValue: '//android.widget.TextView[@text="Mostrar movimientos"]',
    });
    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-duplicate-element-1',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/home/home.locator.json',
            module: 'home/home',
            name: 'lblRecentMovements',
        },
    }]);
    assert.equal(plan.resolutions[0].resolution, 'create');
    assert.equal(plan.resolutions[0].locatorName, 'showMovementsButton');
    assert.equal(plan.resolutions[0].existingMethod.name, 'showMovements');
    assert.match(plan.resolutions[0].reason, /valor normalizado.*difiere del locator verificado/);
});

test('effective plan crea una sola clave para acciones repetidas del mismo recording', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-recording-reuse-'));
    const source = fixturePlan();
    source.files = [{
        layer: 'locators',
        operation: 'update',
        path: 'resources/locators/payment/movements.locator.json',
    }];
    source.resolutions.push({
        ...source.resolutions[0],
        sequence: 2,
        gapId: 'gap-duplicate-element-2',
        locatorName: 'openMovementsButton',
    });
    source.unresolvedGapIds.push('gap-duplicate-element-2');
    fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({
        platform: 'android',
        actions: [
            {
                sequence: 1,
                variableName: 'showMovementsButton',
                locatorType: 'ID',
                locatorValue: 'Mostrar movimientos',
            },
            {
                sequence: 2,
                variableName: 'openMovementsButton',
                locatorType: 'ID',
                locatorValue: 'Mostrar movimientos',
            },
        ],
    }));

    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-duplicate-element-2',
        decision: 'reuse',
        selectedCandidate: {
            file: 'resources/locators/payment/movements.locator.json',
            module: 'payment/movements',
            name: 'showMovementsButton',
        },
    }]);

    assert.equal(plan.resolutions[0].resolution, 'create');
    assert.equal(plan.resolutions[1].resolution, 'create');
    assert.equal(plan.resolutions[1].locatorName, 'showMovementsButton');
    assert.match(plan.resolutions[1].reason, /creada una sola vez dentro del recording/);
});

test('effective plan fortalece una aserción débil con un locator semántico único', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-weak-assertion-'));
    const source = fixturePlan();
    source.resolutions[0].gapId = 'gap-weak-assertion-1';
    source.resolutions[0].reuseCandidates = [{
        file: 'resources/locators/payment/movements.locator.json',
        module: 'payment/movements',
        name: 'titleMovements',
    }];
    source.resolutions[0].existingMethod = {
        file: 'screenobjects/payment/movements.screen.ts',
        name: 'validateMovementsScreen',
        signature: 'validateMovementsScreen()',
        locatorKeys: ['titleMovements'],
        score: 0.96,
    };

    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-weak-assertion-1',
        decision: 'create',
    }]);

    assert.equal(plan.resolutions[0].resolution, 'reuse');
    assert.equal(plan.resolutions[0].locatorName, 'titleMovements');
    assert.equal(plan.resolutions[0].source.file, 'resources/locators/payment/movements.locator.json');
    assert.match(plan.resolutions[0].reason, /Aserción fortalecida/);
});

test('effective plan autoriza reemplazo explícito desde la acción verificada', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-plan-replacement-'));
    const source = fixturePlan();
    source.files = [{
        layer: 'locators',
        operation: 'update',
        path: 'resources/locators/home/home.locator.json',
    }];
    fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({
        platform: 'android',
        actions: [{
            sequence: 1,
            variableName: 'showMovementsButton',
            locatorType: 'ID',
            locatorValue: 'Mostrar movimientos',
        }],
    }));

    const plan = effectiveGenerationPlan(dir, source, [{
        gapId: 'gap-duplicate-element-1',
        decision: 'replace-existing',
        selectedCandidate: {
            file: 'resources/locators/home/home.locator.json',
            module: 'home/home',
            name: 'lblRecentMovements',
        },
        replacement: { platform: 'android', sequence: 1 },
    }]);

    assert.equal(plan.resolutions[0].resolution, 'create');
    assert.equal(plan.resolutions[0].locatorName, 'lblRecentMovements');
    assert.deepEqual(plan.resolutions[0].locatorReplacement, {
        file: 'resources/locators/home/home.locator.json',
        module: 'home/home',
        name: 'lblRecentMovements',
        platform: 'android',
        sequence: 1,
    });
});

test('gap-resolutions exige candidato estructurado para reuse nuevo', () => {
    const valid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{
            gapId: 'gap-1',
            decision: 'reuse',
            selectedCandidate: {
                file: 'resources/locators/home/home.locator.json',
                module: 'home/home',
                name: 'lblRecentMovements',
            },
        }],
    }), 4);
    assert.equal(valid.valid, true);

    const invalid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{ gapId: 'gap-1', decision: 'reuse' }],
    }), 4);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'reuse-candidate-required'), true);
});

test('gap-resolutions acepta wording Gherkin trazado y rechaza secuencias duplicadas', () => {
    const valid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [],
        gherkinResolutions: [{
            keyword: 'And',
            text: 'el usuario consulta sus movimientos mediante los filtros disponibles',
            actionSequences: [4, 5, 6],
            reason: 'Consolida el ciclo técnico.',
        }],
    }), 8);
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.value.gherkinResolutions[0].actionSequences, [4, 5, 6]);

    const invalid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [],
        gherkinResolutions: [
            { keyword: 'And', text: 'primer comportamiento', actionSequences: [4, 5] },
            { keyword: 'Then', text: 'resultado observable', actionSequences: [5, 6] },
        ],
    }), 8);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'duplicate-gherkin-sequence'), true);
});

test('gap-resolutions valida la revisión funcional y sus secuencias', () => {
    const valid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0', recordingId: 'rec-1', planId: 'plan-1', resolutions: [],
        testDesignReview: {
            status: 'qa-required',
            summary: 'El caso selecciona un filtro sin observar el resultado.',
            roast: 'Aplicaste el filtro y luego miraste hacia otro lado. El resultado quedó trabajando sin supervisión.',
            issues: [{
                code: 'missing-business-assertion', severity: 'blocking',
                message: 'No existe una aserción posterior sobre los movimientos filtrados.',
                actionSequences: [6],
                recommendation: 'Agrega una validación del rango de fechas después del filtro.',
            }],
        },
    }), 20);
    assert.equal(valid.valid, true);
    assert.equal(valid.value.testDesignReview.status, 'qa-required');
    assert.match(valid.value.testDesignReview.roast, /Aplicaste el filtro/);

    const missingRoast = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0', recordingId: 'rec-1', planId: 'plan-1', resolutions: [],
        testDesignReview: {
            status: 'qa-required', summary: 'El caso necesita una validación funcional.',
            issues: [{
                code: 'missing-test-oracle', severity: 'blocking',
                message: 'Falta un resultado verificable.', actionSequences: [1],
                recommendation: 'Define un resultado observable.',
            }],
        },
    }), 20);
    assert.equal(missingRoast.valid, false);
    assert.equal(missingRoast.errors.some(error => error.code === 'test-design-review-roast'), true);

    const invalid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0', recordingId: 'rec-1', planId: 'plan-1', resolutions: [],
        testDesignReview: {
            status: 'pass', summary: 'La revisión contiene una contradicción.',
            issues: [{
                code: 'missing-test-oracle', severity: 'blocking',
                message: 'Falta un resultado verificable.', actionSequences: [],
                recommendation: 'Define un resultado observable.',
            }],
        },
    }), 20);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'test-design-review-pass-blocking'), true);
});

test('gap-resolutions normaliza aliases copiados del plan', () => {
    const parsed = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [
            { gapId: 'gap-artifacts', decision: 'extend-existing' },
            { gapId: 'gap-create', decision: 'create-new' },
        ],
    }), 4);
    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.value.resolutions.map(item => item.decision), ['resolved', 'create']);
});

test('gap-resolutions exige fuente grabada para replace-existing', () => {
    const valid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{
            gapId: 'gap-1',
            decision: 'replace-existing',
            selectedCandidate: {
                file: 'resources/locators/payment/movements.locator.json',
                module: 'payment/movements',
                name: 'btntoday',
            },
            replacement: { platform: 'android', sequence: 6 },
        }],
    }), 4);
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.value.resolutions[0].replacement, { platform: 'android', sequence: 6 });

    const invalid = parseGapResolutions(JSON.stringify({
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        resolutions: [{
            gapId: 'gap-1',
            decision: 'replace-existing',
            selectedCandidate: {
                file: 'resources/locators/payment/movements.locator.json',
                module: 'payment/movements',
                name: 'btntoday',
            },
        }],
    }), 4);
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'replacement-source-required'), true);
});
