const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createElementStub } = require('./helpers/fakeDom');
const load = () => import('../recorder/renderer/src/features/shared/caseCoverageControls.js');
const coverage = (status = 'preserved') => ({ schemaVersion: 1, caseId: 'TC-10240', platform: 'android', status,
    baselineHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), checkedExamples: 2,
    mappings: [{ beforeStepIndices: [2, 3], afterStepIndices: [2], exampleIndex: 1 }],
    differences: status === 'preserved' ? [] : [{ code: status === 'lost' ? 'required-operation-missing' : 'source-dependency-changed',
        message: status === 'lost' ? 'Falta la comprobación anterior.' : 'Cambió una dependencia y debe revisarse.', beforeStepIndices: [4], afterStepIndices: [], exampleIndex: 2 }] });

for (const [status, expected] of [['preserved', 'Cobertura anterior conservada'], ['lost', 'Hay cobertura por recuperar'], ['unverified', 'Equivalencia pendiente de revisión']]) {
    test(`review distinguishes ${status} and preserves export guidance`, async () => {
        const { caseCoverageMarkup } = await load();
        const html = caseCoverageMarkup({ coverage: coverage(status) });
        assert.match(html, new RegExp(expected));
        assert.match(html, /no demuestra que el caso pase en el dispositivo/);
        assert.match(html, /Puedes exportar los archivos disponibles/);
        assert.doesNotMatch(html, /<button|100%|Golden aprobado|Ejecución correcta/);
    });
}

test('comparison explains before/after indices and Examples without exposing source or test data', async () => {
    const { caseCoverageMarkup } = await load();
    const report = coverage();
    report.examples = [{ username: 'PRIVATE TEST USER', amount: 'PRIVATE AMOUNT' }];
    report.mappings.push({ ...report.mappings[0] });
    const html = caseCoverageMarkup({ coverage: report });
    assert.match(html, /Pasos anteriores/); assert.match(html, /Pasos generados/);
    assert.match(html, /Paso 2/); assert.match(html, /Paso 3/);
    assert.match(html, /Fila 1 de Examples/);
    assert.match(html, /orden de los pasos del escenario en cada versión/);
    assert.equal((html.match(/class="coverage-match"/g) || []).length, 1, 'repeated operation mappings should appear only once');
    assert.doesNotMatch(html, /PRIVATE|aaaaaaaa|bbbbbbbb/);
});

test('missing mappings are described as unproven, never fabricated', async () => {
    const { caseCoverageMarkup } = await load();
    const html = caseCoverageMarkup({ coverage: coverage('unverified') });
    assert.match(html, /Cambió una dependencia/); assert.match(html, /Paso 4/);
    assert.match(html, /Sin correspondencia demostrada/);
    assert.doesNotMatch(html, /Paso 0|Paso undefined|comportamiento eliminado/);
});

test('pending diagnostics merge repeated passes and resolved ones remain collapsed', async () => {
    const { caseCoverageMarkup } = await load();
    const diagnostic = { code: 'trace-locator', message: 'Revisar el getter.', file: 'resources/locators/payment/case.locator.json', source: 'generation', severity: 'error', status: 'pending' };
    const html = caseCoverageMarkup({ diagnostics: [{ ...diagnostic, passes: [1] }, { ...diagnostic, passes: [2] },
        { ...diagnostic, message: 'Definición recuperada.', code: 'step-undefined', status: 'resolved', passes: [1] }] });
    assert.equal((html.match(/Revisar el getter\./g) || []).length, 1);
    assert.match(html, /Detectado en pasadas 1, 2/);
    assert.match(html, /<details class="coverage-diagnostic-group" open>/);
    assert.match(html, /<details class="coverage-diagnostic-group coverage-resolved">/);
    assert.match(html, /no indica quién los corrigió/);
});

test('recording diagnostics guide QA to device evidence without triggering generation', async () => {
    const { caseCoverageMarkup } = await load();
    const html = caseCoverageMarkup({ diagnostics: [{ code: 'recording-selector-unverified', source: 'recording', severity: 'warning',
        status: 'pending', message: 'La comprobación requiere evidencia.', sequences: [14, 18], passes: [1, 2] }] });
    assert.match(html, /Grabación: revisión del QA/);
    assert.match(html, /Acciones de la grabación: 14, 18/);
    assert.match(html, /Corrige la comprobación o vuelve a grabar/);
    assert.match(html, /Puedes exportar el borrador/);
    assert.doesNotMatch(html, /<button|onclick|runAutomation|Reintentar con el agente/);
});

test('coverage diagnostics refer to the comparison without repeating the long error', async () => {
    const { caseCoverageMarkup } = await load();
    const html = caseCoverageMarkup({ coverage: coverage('unverified'), diagnostics: [{ code: 'case-coverage-unverified',
        message: 'VERY LONG DUPLICATED COVERAGE ERROR', source: 'generation', status: 'pending', passes: [1, 2] }] });
    assert.doesNotMatch(html, /VERY LONG DUPLICATED/);
    assert.match(html, /revisión indicada arriba/);
    assert.match(html, /Detectado en pasadas 1, 2/);
});

test('editing invalidates green status and code diagnostics until a fresh render', async () => {
    const { createCaseCoverageControls } = await load();
    const panel = createElementStub();
    const document = { getElementById: id => id === 'caseCoveragePanel' ? panel : null };
    const review = createCaseCoverageControls({ document });
    review.render({ coverage: coverage(), diagnostics: [{ code: 'test-design', source: 'recording', status: 'pending', message: 'Verificar esperado.', sequences: [14] }] });
    assert.match(panel.innerHTML, /coverage-state-preserved/);
    review.markStale();
    assert.match(panel.innerHTML, /Comparación pendiente de revalidación/);
    assert.doesNotMatch(panel.innerHTML, /coverage-state-preserved|Cobertura anterior conservada|Ver correspondencias/);
    assert.match(panel.innerHTML, /Verificar esperado/);
    review.render({ coverage: coverage('unverified') });
    assert.match(panel.innerHTML, /coverage-state-unverified/);
    assert.doesNotMatch(panel.innerHTML, /Has editado los archivos|Verificar esperado/);
    review.clear(); review.markStale();
    assert.equal(panel.innerHTML, ''); assert.equal(panel.style.display, 'none');
});

test('legacy errors and absent coverage remain readable without false completeness', async () => {
    const { caseCoverageMarkup, createCaseCoverageControls } = await load();
    assert.equal(caseCoverageMarkup(), '');
    const html = caseCoverageMarkup({ diagnostics: [{ code: 'trace-locator', message: 'Revisa el locator.' }, 'Falta un archivo.'] });
    assert.match(html, /Revisa el locator/); assert.match(html, /Falta un archivo/);
    assert.doesNotMatch(html, /conservada|Fila 0|undefined|null/);
    assert.doesNotThrow(() => { const c = createCaseCoverageControls({ document: null }); c.render(); c.markStale(); c.clear(); });
});

test('untrusted coverage fields and diagnostics are escaped and invalid indices discarded', async () => {
    const { caseCoverageMarkup } = await load();
    const payload = '<img src=x onerror="alert(1)">';
    const report = coverage('unverified'); report.caseId = payload; report.platform = payload;
    report.status = '__proto__'; report.differences[0].message = payload;
    report.differences[0].beforeStepIndices = [0, -1, 1.5, payload, 5];
    const html = caseCoverageMarkup({ coverage: report, diagnostics: [{ message: payload, file: payload, passes: [payload], sequences: [payload] }] });
    assert.doesNotMatch(html, /<img|onerror="|coverage-state-__proto__|Paso 0|Paso -1|Paso 1\.5/);
    assert.match(html, /&lt;img/); assert.match(html, /Paso 5/);
    assert.match(html, /coverage-state-unverified/);
});

test('review host has an accessible section and native disclosure controls', async () => {
    const component = fs.readFileSync(path.join(__dirname, '../recorder/renderer/src/components/ScenarioBuilderModal.tsx'), 'utf8');
    assert.equal((component.match(/id="caseCoveragePanel"/g) || []).length, 1);
    assert.match(component, /id="caseCoveragePanel"[^>]*aria-label="Comparación de cobertura y diagnósticos"/);
    const { caseCoverageMarkup } = await load();
    const html = caseCoverageMarkup({ coverage: coverage() });
    assert.match(html, /role="status"/); assert.match(html, /<details class="coverage-mappings"><summary>/);
});
