const test = require('node:test');
const assert = require('node:assert/strict');
const { caseIdentityRules } = require('../dist/core/validation/infrastructure/rules/caseIdentityRules');
const file = 'features/yape-features/payment/movements.feature';
const original = `Feature: Movimientos
  @android
  Scenario Outline: [TC-10140][Happy Path][AUTO-FRONT] Filtro de movimientos
    Given el usuario <username> inicia sesión
    When el usuario consulta todos sus movimientos
    Then se muestran los movimientos esperados
    When el usuario filtra 30 días
    Then se valida el rango de 30 días
    When el usuario filtra 90 días
    Then se valida el rango de 90 días
    Examples:
      | username |
      | Carla |
`;
function check(after, before = '', scenarios = [], getCatalog = () => ({ scenarios })) {
    const report = { errors: [], warnings: [] };
    caseIdentityRules({ scenario: { squad: 'payment', platform: 'android', request: { caseId: 'TC-10140' } },
        plan: { files: [] }, response: { files: [{ layer: 'feature', path: file, content: after }] },
        updateBaselines: new Map([['feature', before]]), reuseAnalyzer: { getCatalog } }, report);
    return report;
}

test('un nuevo título del mismo TC no permite duplicar su identidad', () => {
    const after = original + original.slice(original.indexOf('  @android')).replace('Filtro de movimientos', 'Visualiza movimientos últimos días');
    assert.equal(check(after, original).errors.find(error => error.code === 'case-duplicate')?.file, file);
    assert.equal(check(after).errors.filter(error => error.code === 'case-duplicate').length, 1);
});

test('duplicados exactos nuevos también fallan, los heredados intactos se atribuyen a la deuda previa', () => {
    const duplicate = original + original.slice(original.indexOf('  @android'));
    assert.equal(check(duplicate).errors[0].code, 'case-duplicate');
    const inherited = check(duplicate, duplicate);
    assert.equal(inherited.errors[0].code, 'case-duplicate', 'exportar y revalidar no transforma un TC duplicado en éxito');
    assert.match(inherited.errors[0].message, /preexistente.*sin atribuirla/);
    const foreignDuplicate = duplicate.replaceAll('TC-10140', 'TC-77777');
    const foreign = check(original + foreignDuplicate, original + foreignDuplicate);
    assert.equal(foreign.errors.length, 0);
    assert.match(foreign.warnings[0], /case-preexisting-duplicate/);
    assert.ok(check(duplicate.replace('Filtro de movimientos', 'Nueva descripción'), duplicate).errors.some(error => error.code === 'case-duplicate'));
});

test('un Scenario Outline con varios Examples sigue siendo un solo caso', () => {
    const after = original.replace('      | Carla |', '      | Carla |\n      | Jose |');
    assert.deepEqual(check(after, original).errors, []);
});

test('renombrar el título conservando identidad, pasos y cobertura adicional es válido', () => {
    const after = original.replace('Filtro de movimientos', 'Consulta y filtra movimientos')
        .replace('    Examples:', '    When el usuario regresa al inicio\n    Examples:');
    assert.deepEqual(check(after, original).errors, []);
});

test('sustituir un rango por presencia o eliminar el TC conserva un diagnóstico de cobertura', () => {
    const after = original.replace('se valida el rango de 30 días', 'se muestra una fecha');
    assert.equal(check(after, original).errors[0].code, 'case-coverage-review');
    assert.match(check(after, original).errors[0].message, /rango de 30 dias/);
    assert.equal(check(original.replaceAll('TC-10140', 'TC-99999'), original).errors[0].code, 'case-coverage-review');
});

test('la cobertura previa considera el orden y las repeticiones', () => {
    const after = original.replace('    When el usuario filtra 30 días\n    Then se valida el rango de 30 días', '    Then se valida el rango de 30 días\n    When el usuario filtra 30 días');
    assert.equal(check(after, original).errors[0].code, 'case-coverage-review');
    const repeated = original.replace('    Examples:', '    When el usuario filtra 30 días\n    Then se valida el rango de 30 días\n    Examples:');
    assert.equal(check(original, repeated).errors[0].code, 'case-coverage-review');
});

test('el mismo TC en otra ruta debe actualizar su Feature de origen', () => {
    const other = [{ caseId: 'TC-10140', name: '[TC-10140] Original', file: 'features/payment/main.feature' }];
    assert.equal(check(original, '', other).errors[0].code, 'framework-case-collision');
    assert.deepEqual(check(original, original, other).errors, [], 'un duplicado histórico en otra ruta no fue creado por este intento');
    assert.deepEqual(check(original, '', [{ ...other[0], caseId: 'TC-10141' }]).errors, []);
});

test('los diagnósticos de identidad y aceptación llegan al autor de su archivo', () => {
    const { classifyValidationErrors } = require('../dist/core/automation/infrastructure/layered/gapJudgment');
    const screen = 'screenobjects/payment/movements.screen.ts';
    const steps = 'features/yape-steps-definitions/payment/movements.steps.ts';
    const plan = { files: [{ layer: 'feature', path: file }, { layer: 'steps', path: steps }, { layer: 'screen', path: screen }] };
    const feedback = classifyValidationErrors([
        { code: 'case-duplicate', message: 'TC repetido' },
        { code: 'framework-case-collision', message: 'TC en otra ruta' },
        { code: 'acceptance-contract', message: 'Criterio sin evidencia' },
        { code: 'acceptance-date-range', message: 'Rango sin comprobar' },
        { code: 'acceptance-recorded-assertion', message: 'Esperado alterado', file: steps },
        { code: 'acceptance-recorded-assertion', message: 'Lectura alterada', file: screen },
    ], plan);
    assert.equal(feedback.behavior.length, 4);
    assert.equal(feedback.interaction.length, 2);
    assert.equal(feedback.integration.length, 0);
});


test('un catálogo ilegible no aborta el borrador ni acredita una identidad desconocida', () => {
    const report = check(original, original, [], () => { throw new Error('index unavailable'); });
    assert.equal(report.errors.length, 1);
    assert.equal(report.errors[0].code, 'case-identity-unavailable');
    assert.equal(report.errors[0].file, file);
    const removed = original.replace('    Then se valida el rango de 30 días\n', '');
    const remaining = check(removed, original, [], () => { throw new Error('index unavailable'); });
    assert.ok(remaining.errors.some(error => error.code === 'case-coverage-review'), 'también conserva las comprobaciones locales disponibles');
});
