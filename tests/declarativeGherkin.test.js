const test = require('node:test');
const assert = require('node:assert/strict');
const { gherkinBusinessWordingProblem, gherkinPersonProblem } = require('../dist/core/automation/contracts');
const { imperativeGherkinSteps } = require('../dist/core/validation/infrastructure/rules/gherkinInspection');
const { gherkinQualityRules } = require('../dist/core/validation/infrastructure/rules/gherkinQualityRules');

const mechanical = [
    'el usuario selecciona cerrar',
    'When el usuario selecciona cerrar en realiza yapeo numero comentario',
    'el usuario selecciona seleccionar número destino',
    'el usuario escribe su número <number> y selecciona seleccionar número destino',
    'el usuario selecciona el botón Yapear',
    'el usuario selecciona el "botón" Yapear',
    'el usuario selecciona el “botón” Yapear',
    'el usuario selecciona el ‘botón’ Yapear',
    'el usuario presiona en el botón Yapear',
    'el usuario mantiene presionado el destinatario',
    'el usuario escribe en el campo monto',
    'el usuario hace clic en Yapear',
    'el usuario realiza un swipe',
    'el usuario espera 300 milisegundos',
    'el usuario espera <timeout> segundos',
    'el usuario selecciona «Atrás»',
    'el usuario confirma el pago y selecciona cerrar',
    'el usuario selecciona permitir',
    'el usuario pulsa cerrar',
    'When el usuario presiona Atrás',
    'el usuario toca aceptar',
    'el usuario selecciona "Aceptar"',
];
const business = [
    'el usuario selecciona el destinatario',
    'el usuario elige el método de pago',
    'el usuario ingresa el monto <amount> y confirma el pago',
    'el usuario identifica al destinatario mediante el número <number>',
    'el usuario solicita sus movimientos al correo <email>',
    'el usuario regresa a la vista anterior',
    'el usuario cierra el detalle del yapeo',
    'el usuario autoriza el acceso a sus contactos',
    'el usuario acepta los términos',
    'el usuario selecciona permitir pagos internacionales',
    'se muestra el número de celular ofuscado',
    'Then se muestra la pantalla de yapear',
    'se muestran las opciones de pago disponibles',
    'se muestra el mensaje "el usuario selecciona cerrar"',
    'se muestra el mensaje «hace click en el botón para continuar»',
    'se muestra el mensaje "Espera 30 segundos"',
    'Then se muestra el mensaje “Pulsa el botón para continuar”',
    'Then se muestra el mensaje ‘Pulsa el botón para continuar’',
    'el usuario ingresa el comentario "hacer click"',
];

test('business detector rejects explicit UI mechanics even in third person or a full Gherkin line', () => {
    assert.equal(gherkinPersonProblem('el usuario selecciona cerrar'), undefined,
        'grammatical person does not establish business intent');
    for (const text of mechanical) assert.equal(typeof gherkinBusinessWordingProblem(text), 'string', text);
    assert.equal(typeof gherkinBusinessWordingProblem('WHEN EL USUARIO SELECCIONA EL BOTO\u0301N YAPEAR'), 'string');
});

test('business detector permits domain choices, parameters and observable results without inventing meaning', () => {
    for (const text of business) assert.equal(gherkinBusinessWordingProblem(text), undefined, text);
    assert.equal(gherkinBusinessWordingProblem(''), undefined);
});

test('Feature inspection uses the shared business detector for exactly the authored step text', () => {
    const steps = [...mechanical.map(text => text.replace(/^(?:When)\s+/, '')), ...business];
    const content = 'Feature: Declarative\n Scenario: [TC-1] Request\n' + steps.map(text => `  When ${text}`).join('\n');
    assert.deepEqual(imperativeGherkinSteps(content), steps.filter(text => gherkinBusinessWordingProblem(text)));
});

function feature(steps) {
    return '@payment @android\nFeature: Request\n Scenario: [TC-1] Request\n' +
        steps.map(text => `  When ${text}`).join('\n') + '\n  Then se muestra el número ofuscado\n';
}
function validateStyle(content, { rows = [], baseline = '' } = {}) {
    const report = { errors: [], warnings: [] };
    const file = { layer: 'feature', path: 'features/payment/request.feature', content };
    gherkinQualityRules({
        scenario: { platform: 'android', actions: [], request: { scenarioRows: rows } },
        plan: { files: [{ ...file, operation: baseline ? 'update' : 'create' }] },
        response: { files: [file], actionTrace: [] },
        preview: { featureContent: content }, definitions: [],
        updateBaselines: new Map(baseline ? [['feature', baseline]] : []),
    }, report);
    return report.errors.filter(issue => ['imperative-gherkin', 'generic-template-gherkin', 'gherkin-person'].includes(issue.code));
}

test('only new or changed wording is checked; exact reused and inherited technical steps remain intact', () => {
    const inherited = 'el usuario selecciona el botón Yapear';
    const reused = 'el usuario selecciona cerrar';
    const newText = 'el usuario selecciona seleccionar número destino';
    const content = feature([inherited, reused, newText]);
    const issues = validateStyle(content, {
        baseline: feature([inherited]), rows: [{ status: 'reused', text: reused }],
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'imperative-gherkin');
    assert.match(issues[0].message, /selecciona seleccionar número destino/);
});

test('baseline exemptions are literal: changed accents or case are authored, whitespace alone is preserved', () => {
    const inherited = 'el usuario selecciona el botón Yapear';
    const baseline = feature([inherited]);
    assert.deepEqual(validateStyle(feature(['el   usuario selecciona el botón Yapear']), { baseline }), []);
    for (const changed of [inherited.replace('botón', 'boton'), inherited.replace('Yapear', 'yapear')]) {
        assert.equal(validateStyle(feature([changed]), { baseline }).length, 1, changed);
    }
});

test('qa or memory wording does not make newly generated mechanical steps exempt', () => {
    const text = 'el usuario selecciona cerrar';
    for (const wording of ['qa', 'domain', 'memory', 'agent', 'template']) {
        const issues = validateStyle(feature([text]), { rows: [{ status: 'missing', wording, text }] });
        assert.equal(issues.length, 1, wording);
        assert.equal(issues[0].code, 'imperative-gherkin');
    }
});

test('style preservation also covers inherited templates and grammatical instructions without hiding new ones', () => {
    const inherited = ['el usuario completa proceso antiguo', 'selecciona el botón antiguo'];
    assert.deepEqual(validateStyle(feature(inherited), { baseline: feature(inherited) }), []);
    assert.deepEqual(validateStyle(feature(inherited), { rows: inherited.map(text => ({ status: 'reused', text })) }), []);
    const issues = validateStyle(feature([...inherited, 'selecciona el botón nuevo']), { baseline: feature(inherited) });
    assert.equal(issues.length, 2);
    assert.deepEqual(issues.map(issue => issue.code), ['imperative-gherkin', 'gherkin-person']);
});
