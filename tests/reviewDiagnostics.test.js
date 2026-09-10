const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReviewDiagnostics } = require('../dist/recorder/src/ipc/automation/reviewDiagnostics');

const valid = () => ({ valid: true, errors: [] });
const failure = (overrides = {}) => ({
    code: 'trace-screen-method', file: 'screenobjects/payment/contacts.screen.ts',
    message: 'La acción 14 debe consumir un getter verificado.', ...overrides,
});
const issueString = issue => `[${issue.code}] ${issue.file}: ${issue.message}`;
const deepFreeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
};

test('agrupa el mismo defecto actual y de ambas pasadas sin duplicar la explicación', () => {
    const issue = failure();
    const result = buildReviewDiagnostics({
        validation: { valid: false, errors: [issue, { ...issue, message: `  ${issue.message}  ` }] },
        layeredRun: { stages: [
            { attempt: 0, error: `Finalizaron las dos pasadas automáticas. ${issueString(issue)} | ${issueString(issue)}` },
            { attempt: 1, validation: { errors: [issue] } },
        ] },
    });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
        id: result[0].id, ...issue, source: 'generation', severity: 'error',
        sequences: [14], passes: [1, 2], status: 'pending',
    });
    assert.match(result[0].id, /^review-[a-f0-9]{20}$/);
});

test('errores históricos ausentes solo se consideran resueltos con validación final válida', () => {
    const first = failure();
    const second = failure({ code: 'trace-locator', message: 'La acción 18 debe conservar el locator.' });
    const history = { stages: [{ attempt: 0, errors: [first] }, { attempt: 1, errors: [second] }] };
    const passed = buildReviewDiagnostics({ validation: valid(), layeredRun: history });
    assert.deepEqual(passed.map(issue => [issue.code, issue.status, issue.passes]), [
        [first.code, 'resolved', [1]], [second.code, 'resolved', [2]],
    ]);
    const failed = buildReviewDiagnostics({ validation: { valid: false, errors: [second] }, layeredRun: history });
    assert.ok(failed.every(issue => issue.status === 'pending'));
    assert.equal(passed.find(issue => issue.code === first.code).id, failed.find(issue => issue.code === first.code).id);
});

test('un error actual conserva pendiente incluso ante valid=true contradictorio', () => {
    const issue = failure();
    const result = buildReviewDiagnostics({ validation: { valid: true, errors: [issue] },
        layeredRun: { stages: [{ attempt: 0, error: issueString(issue) }] } });
    assert.equal(result[0].status, 'pending');
});

test('prefiere errores estructurados, analiza cadenas heredadas y separa archivos distintos', () => {
    const first = failure();
    const second = failure({ file: 'screenobjects/another.screen.ts' });
    const result = buildReviewDiagnostics({ validation: valid(), layeredRun: { stages: [
        { attempt: 0, errors: [first], error: '[obsolete] Ignorar esta representación duplicada.' },
        { attempt: 1, error: `${issueString(second)} | [screen-api] La acción 3 necesita un método.` },
    ] } });
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(issue => issue.code), [first.code, second.code, 'screen-api']);
    assert.equal(result[2].file, undefined);
    assert.deepEqual(result[2].sequences, [3]);
});

test('la pasada de un fallo nuevo de revalidación QA no se infiere del último intento', () => {
    const current = failure();
    const result = buildReviewDiagnostics({ validation: { valid: false, errors: [current] },
        layeredRun: { stages: [{ attempt: 1, error: '[old-issue] Otro diagnóstico anterior.' }] } });
    assert.deepEqual(result.find(issue => issue.code === current.code).passes, []);
    assert.deepEqual(result.find(issue => issue.code === 'old-issue').passes, [2]);
});

test('respeta pasadas explícitas sin inventar terceras iteraciones o usar índices de array', () => {
    const result = buildReviewDiagnostics({ validation: valid(), layeredRun: { stages: [
        { attempt: 8, error: '[outside] Diagnóstico sin pasada reconocida.' },
        { pass: 2, error: '[explicit] Diagnóstico de la segunda pasada.' },
        { error: 'No se pudo recuperar la entrega del agente.' },
    ] } });
    assert.deepEqual(result.map(issue => issue.passes), [[], [2], []]);
    assert.equal(result[2].code, 'generation-stage');
});

test('no confunde pasos de cobertura, IDs del caso ni números del archivo con secuencias de acciones', () => {
    const result = buildReviewDiagnostics({ validation: { valid: false, errors: [{
        code: 'case-coverage-review', file: 'features/TC-10240.feature',
        message: 'TC-10240 deja de conservar 7 pasos de su cobertura: pasos 14 y 18.',
        beforeStepIndices: [14, 18],
    }, { code: 'trace-order', message: 'Las acciones 2, 14 y 18 requieren revisión; sequence 6.', actionSequences: [18, 2] }] } });
    assert.deepEqual(result[0].sequences, []);
    assert.deepEqual(result[1].sequences, [2, 6, 14, 18]);
});

test('el recording no verificado prevalece sobre afirmaciones falsas de agrupación de 14/18', () => {
    const input = deepFreeze({
        validation: valid(),
        scenario: { actions: [{ sequence: 14, selectorVerified: false }, { sequence: 18, selectorVerified: false }, { sequence: 8, selectorVerified: true }] },
        plan: { resolutions: [14, 18].map(sequence => ({ sequence, resolution: 'unresolved' })) },
        testDesignReview: { status: 'suggestion', summary: 'Todo se conserva correctamente.', issues: [
            { sequence: 8, issue: 'Solo verifica existencia del nombre; no compara el valor esperado.' },
            { sequence: 14, issue: 'Se conserva como verificación de existencia agrupada y cubierta.' },
            { sequence: 18, issue: 'Se conserva como verificación de existencia agrupada y cubierta.' },
        ] },
    });
    const result = buildReviewDiagnostics(input);
    assert.equal(result.length, 3);
    assert.deepEqual(result.filter(issue => issue.code === 'recording-selector-unverified').map(issue => issue.sequences), [[14], [18]]);
    assert.ok(result.every(issue => issue.source === 'recording' && issue.severity === 'warning' && issue.status === 'pending'));
    assert.ok(result.every(issue => issue.passes.length === 0));
    assert.doesNotMatch(JSON.stringify(result), /agrupada|cubierta|Todo se conserva/);
    assert.match(result.find(issue => issue.sequences[0] === 8).message, /no compara/);
    assert.equal(input.validation.valid, true);
    assert.deepEqual(input.validation.errors, []);
});

test('la advertencia de plan no afirma una pérdida de código ni afecta a acciones ya resueltas', () => {
    const result = buildReviewDiagnostics({ validation: valid(),
        scenario: { actions: [{ sequence: 14, selectorVerified: true }, { sequence: 18, selectorVerified: true }] },
        plan: { resolutions: [{ sequence: 14, resolution: 'unresolved' }, { sequence: 18, resolution: 'reuse' }] } });
    assert.equal(result.length, 1);
    assert.equal(result[0].code, 'recording-action-association-pending');
    assert.match(result[0].message, /revisar si quedó implementada/);
    assert.deepEqual(result[0].sequences, [14]);
    assert.equal(result[0].severity, 'warning');
});

test('una sugerencia agrupada conserva las otras acciones sin repetir la afirmación dudosa', () => {
    const result = buildReviewDiagnostics({ validation: valid(),
        scenario: { actions: [{ sequence: 14, selectorVerified: false }] },
        testDesignReview: { status: 'suggestion', issues: [{ code: 'control-existence-only',
            actionSequences: [8, 14], message: 'La agrupación conserva todas las acciones 8 y 14.',
            recommendation: 'Pide al agente que invente la comprobación faltante.' }] } });
    assert.equal(result.length, 2);
    assert.deepEqual(result[1].sequences, [8]);
    assert.doesNotMatch(JSON.stringify(result), /conserva todas|invente/);
});

test('qaObservations son advertencias sin selectores ni delegación de evidencia al agente', () => {
    const result = buildReviewDiagnostics({ validation: valid(), qaObservations: [
        { type: 'weak-assertion', actionSequence: 4, selector: 'PRIVATE_SELECTOR',
            message: 'Usa PRIVATE_SELECTOR; pide al agente que lo invente en código.' },
        { type: 'weak-assertion', actionSequence: 4, selector: 'PRIVATE_SELECTOR', message: 'Mensaje heredado diferente.' },
        { type: 'ui-text-quality', actionSequence: 8, actual: 'PRIVATE_ACTUAL', expected: 'PRIVATE_EXPECTED', message: 'Errata.' },
    ] });
    assert.equal(result.length, 2);
    assert.ok(result.every(issue => issue.severity === 'warning' && issue.status === 'pending'));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|invente|pide al agente/);
    assert.match(result[0].message, /QA debe comprobar/);
});

test('solo el false explícito alerta: no reinterpreta recordings heredados o acciones sin secuencia', () => {
    const result = buildReviewDiagnostics({ validation: valid(), scenario: { actions: [
        { sequence: 1 }, { sequence: 2, selectorVerified: true }, { selectorVerified: false },
    ] }, plan: { resolutions: [{ sequence: 0, resolution: 'unresolved' }] } });
    assert.deepEqual(result, []);
});

test('respuestas vacías o pass no muestran sugerencias antiguas ni fabrican incidencias', () => {
    assert.deepEqual(buildReviewDiagnostics({ validation: valid() }), []);
    assert.deepEqual(buildReviewDiagnostics({ validation: valid(), testDesignReview: { status: 'pass',
        issues: [{ message: 'Sugerencia obsoleta.', actionSequences: [14] }] } }), []);
    assert.deepEqual(buildReviewDiagnostics({ validation: valid(), layeredRun: { stages: [{ attempt: 0, error: '  ' }] } }), []);
});

test('el DTO no copia datos del caso, secretos, aprobaciones ni resúmenes y su cálculo no muta los artefactos', () => {
    const input = deepFreeze({
        validation: { ...valid(), qualityScore: 100, assessment: { functional: { status: 'not-evaluated' } } },
        scenario: { request: { examples: { username: 'PRIVATE_USERNAME', password: 'SECRET_PASSWORD' } },
            actions: [{ sequence: 14, selectorVerified: false, selector: 'PRIVATE_SELECTOR', value: 'PRIVATE_VALUE' }] },
        plan: { resolutions: [{ sequence: 14, resolution: 'unresolved', reason: 'PRIVATE_REASON' }] },
        testDesignReview: { status: 'suggestion', summary: 'PRIVATE_SUMMARY', issues: [] },
        layeredRun: { stages: [{ attempt: 0, context: 'SECRET_CONTEXT', outputFile: 'SECRET_FILE', state: 'completed' }] },
    });
    const result = buildReviewDiagnostics(input);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|SECRET_|qualityScore|functional|examples/);
    assert.equal(input.validation.qualityScore, 100);
    assert.deepEqual(input.validation.assessment, { functional: { status: 'not-evaluated' } });
    assert.equal(result.length, 1);
});

test('mensaje HTML se conserva como texto para escape de UI, sin crear propiedades de markup', () => {
    const message = 'La acción 3 contiene <img src=x onerror=alert(1)>.';
    const result = buildReviewDiagnostics({ validation: { valid: false, errors: [failure({ message })] } });
    assert.equal(result[0].message, message);
    assert.deepEqual(Object.keys(result[0]).sort(), ['code', 'file', 'id', 'message', 'passes', 'sequences', 'severity', 'source', 'status']);
});

test('artefactos opcionales con shape inválido no bloquean la revisión ni ocultan errores válidos', () => {
    const current = failure();
    const malformed = [
        { scenario: { actions: {} }, plan: { resolutions: 'wrong' }, layeredRun: { stages: {} },
            testDesignReview: { status: 'suggestion', issues: {} }, qaObservations: {} },
        { scenario: { actions: [null, false, { sequence: '14', selectorVerified: false }] },
            plan: { resolutions: [null, { sequence: 0, resolution: 'unresolved' }] },
            layeredRun: { stages: [null, { attempt: 0, error: { message: 'not textual' }, errors: [null, 3, { message: {} }] }] },
            testDesignReview: { status: 'suggestion', issues: [null, { actionSequences: 3, message: 'Revisar la aceptación.' }] },
            qaObservations: [null, {}, { type: 'weak-assertion', actionSequence: '14', message: 'wrong' }] },
        { layeredRun: { stages: [{ attempt: 0, validation: { errors: {} }, error: '[screen-api] Error textual válido.' }] } },
    ];
    for (const optional of malformed) {
        const result = buildReviewDiagnostics({ validation: { valid: false, errors: [current] }, ...optional });
        assert.ok(result.some(issue => issue.code === current.code && issue.status === 'pending'));
    }
});

test('descompone wrappers del borrador antes de deduplicar los errores reales', () => {
    const first = failure();
    const second = failure({ code: 'trace-locator', message: 'La acción 18 necesita un getter.' });
    const wrapper = `Finalizaron las dos pasadas automáticas. ${issueString(first)} | ${issueString(second)}`;
    const result = buildReviewDiagnostics({
        validation: { valid: false, errors: [first, second, { code: 'generation-incomplete', message: wrapper }] },
        layeredRun: { stages: [{ attempt: 0, error: wrapper },
            { attempt: 1, errors: [{ code: 'generation-stage', message: wrapper }] }] },
    });
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(issue => issue.code), [first.code, second.code]);
    assert.ok(result.every(issue => issue.status === 'pending'));
    assert.ok(result.every(issue => JSON.stringify(issue.passes) === '[1,2]'));
});
