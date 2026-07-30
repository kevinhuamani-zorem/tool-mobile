const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertPlanPreservesApprovedRows,
    validateGenerationPlan,
    calculatePlanMetrics
} = require('../dist/ai/generationPlan');

const actions = [
    { action: 'CLICK', variableName: 'btnLogin' },
    { action: 'TYPE', variableName: 'txtEmail', value: 'qa@example.com' }
];

test('acepta un plan completo y obtiene calidad 100', () => {
    const plan = validateGenerationPlan({
        featureName: 'Inicio de sesión',
        scenarioName: 'Usuario válido',
        fileName: 'inicio-sesion',
        locatorModule: 'login',
        rows: [
            {
                keyword: 'Given', text: 'el usuario abre el inicio de sesión',
                actionIndices: [0], methodName: 'abrirInicioSesion'
            },
            {
                keyword: 'When', text: 'ingresa su correo <correoUser>',
                actionIndices: [1], methodName: 'ingresarCorreo'
            }
        ],
        actionNames: [
            { actionIndex: 0, locatorName: 'btnLogin' },
            { actionIndex: 1, locatorName: 'txtEmail' }
        ],
        assumptions: [],
        warnings: []
    }, actions);

    assert.deepEqual(calculatePlanMetrics(plan, actions.length), {
        actionCoverage: 1,
        linkedRows: 2,
        totalRows: 2,
        duplicateRows: 0,
        qualityScore: 100,
        passed: true
    });
});

test('rechaza referencias a acciones inexistentes', () => {
    assert.throws(() => validateGenerationPlan({
        featureName: 'Login',
        scenarioName: 'Login',
        fileName: 'login',
        locatorModule: 'login',
        rows: [{
            keyword: 'Given', text: 'el usuario inicia',
            actionIndices: [99], methodName: 'iniciar'
        }],
        actionNames: []
    }, actions), /acción inexistente/);
});

test('rechaza locators expuestos en el Gherkin', () => {
    assert.throws(() => validateGenerationPlan({
        featureName: 'Login',
        scenarioName: 'Login',
        fileName: 'login',
        locatorModule: 'login',
        rows: [{
            keyword: 'Given', text: 'pulsa {btnLogin}',
            actionIndices: [0], methodName: 'pulsarLogin'
        }],
        actionNames: [{ actionIndex: 0, locatorName: 'btnLogin' }]
    }, actions), /expone un locator/);
});

test('la métrica falla cuando una acción queda sin enlazar', () => {
    const plan = validateGenerationPlan({
        featureName: 'Login',
        scenarioName: 'Login',
        fileName: 'login',
        locatorModule: 'login',
        rows: [{
            keyword: 'Given', text: 'el usuario inicia',
            actionIndices: [0], methodName: 'iniciar'
        }],
        actionNames: [
            { actionIndex: 0, locatorName: 'btnLogin' },
            { actionIndex: 1, locatorName: 'txtEmail' }
        ]
    }, actions);
    const metrics = calculatePlanMetrics(plan, actions.length);
    assert.equal(metrics.actionCoverage, 0.5);
    assert.equal(metrics.passed, false);
});

test('Gemini puede nombrar archivos sin modificar el Gherkin aprobado', () => {
    const plan = validateGenerationPlan({
        featureName: 'Login',
        scenarioName: 'Login válido',
        fileName: 'login-valido',
        locatorModule: 'login',
        rows: [{
            keyword: 'Given',
            text: 'el usuario inicia sesión',
            actionIndices: [0, 1],
            methodName: 'iniciarSesion'
        }],
        actionNames: [
            { actionIndex: 0, locatorName: 'btnLogin' },
            { actionIndex: 1, locatorName: 'txtEmail' }
        ]
    }, actions);
    const approved = [{
        keyword: 'Given',
        text: 'el usuario inicia sesión',
        actionIndices: [0, 1]
    }];

    assert.doesNotThrow(() => assertPlanPreservesApprovedRows(plan, approved));
    assert.throws(
        () => assertPlanPreservesApprovedRows(plan, [{
            ...approved[0],
            text: 'otro texto aprobado'
        }]),
        /modificar el Gherkin aprobado/
    );
});
