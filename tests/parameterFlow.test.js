/**
 * El dato que el QA parametrizo llega hasta el codigo por argumento, nunca
 * como literal: Examples -> <columna> en el step -> argumento de la definition
 * -> argumento del metodo del Screen Object -> uso en el metodo.
 *
 * Origen: en rec-e84b3413 el Gherkin declaraba <email> en Examples y el Screen
 * escribia `setValue('joseamendoza@yape.com.pe')`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    DeterministicResolver,
    AutomationMemory,
    AutomationPackageBuilder,
    scenarioExampleValues,
    unusedExamplesColumns,
    unusedParameterProblems,
    hardcodedExampleProblems,
    screenMethodBodies,
} = require('../dist/core/automation');
const { DeterministicGenerator } = require('../dist/core/generation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { unforwardedStepParameters } = require('../dist/core/validation/infrastructure/rules/parameterFlowRules');

const emptyCatalog = {
    getCatalog: (squad, platform) => ({
        squad, platform, featureScope: '', stepDefinitions: [], screenMethods: [], locators: [], features: [], scenarios: [], artifactBundles: [],
    }),
};

function scenario(actions) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-param-flow', revision: 1,
        fingerprint: 'a'.repeat(64), createdAt: '2026-09-06T00:00:00.000Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'enviar el reporte de movimientos por correo',
        acceptanceCriteria: 'se confirma el envío del reporte',
        request: {
            squad: 'payment', featureName: 'Envío de reporte', scenarioName: 'Enviar reporte por correo',
            fileName: 'send-report-by-email', locatorModule: 'send-report-by-email',
            caseId: 'TC-77001', pathType: 'Happy Path', tag: 'reporte', dataName: 'Usuario QA',
            platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: actions.map((item, index) => ({ ...item, sequence: index + 1 })),
    };
}

const FLOW = [
    { action: 'CLICK', selector: '~Enviar reporte', selectorVerified: true, contextHint: 'boton enviar reporte' },
    { action: 'ESCRIBIR', selector: 'id=email-input', selectorVerified: true, contextHint: 'ingresar el correo', value: 'qa.reporte@yape.com.pe' },
    { action: 'CLICK', selector: '~Confirmar', selectorVerified: true, contextHint: 'boton confirmar' },
    { action: 'VERIFICAR_EXISTE', selector: '~Reporte enviado', selectorVerified: true, contextHint: 'mensaje de reporte enviado' },
];

test('scenarioExampleValues reúne Examples y celdas de DataTables por columna', () => {
    const values = scenarioExampleValues({
        request: {
            examples: { username: 'Usuario QA', email: 'qa@yape.com.pe' },
            scenarioRows: [{ keyword: 'When', text: 'x', dataTable: { headers: ['filtro'], rows: [['Solo hoy'], ['Últimos 7 días'], ['Solo hoy']] } }],
        },
    });
    assert.deepEqual(values, { username: ['Usuario QA'], email: ['qa@yape.com.pe'], filtro: ['Solo hoy', 'Últimos 7 días'] });
});

test('una columna de Examples que ningún step nombra es un dato que el caso ignora', () => {
    const feature = (steps) => [
        'Feature: Envío',
        '  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Envío',
        ...steps.map(step => `    ${step}`),
        '',
        '    Examples:',
        '      | username | email          |',
        '      | qa       | qa@yape.com.pe |',
        '',
        '  Scenario: otro sin parámetros',
        '    Given algo',
    ].join('\n');
    const unused = unusedExamplesColumns(feature([
        'Given el usuario <username> inicia sesión en Yape',
        'When el usuario selecciona enviar correo',
    ]));
    assert.equal(unused.length, 1);
    assert.match(unused[0], /<email>/);
    assert.deepEqual(unusedExamplesColumns(feature([
        'Given el usuario <username> inicia sesión en Yape',
        'When el usuario ingresa su correo <email> y confirma',
    ])), []);
});

test('una definition que recibe el parámetro debe pasarlo al Screen Object', () => {
    const steps = [
        "import { Then, When, DataTable } from '@wdio/cucumber-framework';",
        "import screen from '@screenobjects/payment/x.screen.ts';",
        "When(/^el usuario ingresa su correo (.*) y confirma$/, async (email: string) => {",
        '    await screen.enterEmailAndConfirm();',
        '});',
        "When(/^el usuario ingresa su correo (.*)$/, async (email: string) => {",
        '    await screen.enterEmail(email);',
        '});',
        "When(/^el usuario aplica cada filtro$/, async (dataTable: DataTable) => {",
        '    const filtroValues = dataTable.hashes().map((row) => row["filtro"]);',
        '    await screen.applyFilters(filtroValues);',
        '});',
    ].join('\n');
    assert.deepEqual(unforwardedStepParameters(steps), [
        { expression: '/^el usuario ingresa su correo (.*) y confirma$/', parameters: ['email'] },
    ]);
});

test('el Screen Object usa cada parámetro y nunca deja fijo un valor de Examples', () => {
    const screen = [
        'class XScreen extends BaseScreen {',
        '    public async enterEmailAndConfirm(email: string): Promise<void> {',
        "        await this.emailInput.setValue('qa@yape.com.pe');",
        '        await this.confirm.click();',
        '    }',
        '    public async enterEmail(email: string): Promise<void> {',
        '        await this.emailInput.setValue(email);',
        '    }',
        '    private filtroOptionFor(filtro: string) {',
        '        switch (filtro) {',
        "            case 'Solo hoy': return this.filterOnlyToday;",
        '            default: throw new Error(`Valor no registrado: ${filtro}`);',
        '        }',
        '    }',
        '}',
    ].join('\n');
    assert.deepEqual(screenMethodBodies(screen).map(method => [method.name, method.parameters]), [
        ['enterEmailAndConfirm', ['email']], ['enterEmail', ['email']],
    ]);
    assert.deepEqual(unusedParameterProblems(screen).map(problem => problem.message.split(':')[0]), [
        'El método enterEmailAndConfirm declara el parámetro email y no lo usa',
    ]);
    const hardcoded = hardcodedExampleProblems(screen, { email: ['qa@yape.com.pe'], filtro: ['Solo hoy'] });
    assert.deepEqual(hardcoded.map(problem => problem.code), ['example-value-hardcoded']);
    assert.match(hardcoded[0].message, /"qa@yape.com.pe".*<email>/);
    assert.equal(hardcoded.some(problem => /Solo hoy/.test(problem.message)), false, 'el case del mapa valor→getter no es un dato fijo');
});

test('el validador bloquea el correo fijo en el Screen, la definition que no lo pasa y la columna sin usar', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'param-flow-'));
    try {
        const builder = new AutomationPackageBuilder(new DeterministicResolver(emptyCatalog), new AutomationMemory(path.join(root, 'memory')));
        const prepared = builder.prepare(scenario(FLOW), root);
        const packageDirectory = prepared.packageDirectory;
        const response = new DeterministicGenerator().generate(packageDirectory, []);
        const packagedScenario = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'scenario.json'), 'utf8'));
        const plan = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'effective-generation-plan.json'), 'utf8'));
        const validator = new AutomationResponseValidator(undefined, emptyCatalog);
        const feature = response.files.find(file => file.layer === 'feature');
        const steps = response.files.find(file => file.layer === 'steps');
        const screen = response.files.find(file => file.layer === 'screen');
        assert.match(feature.content, /<email>/, 'el borrador nombra el dato en el step');
        assert.match(steps.content, /async \(email: string\)/);
        assert.match(screen.content, /setValue\(email\)/);
        assert.equal(packagedScenario.request.examples.email, 'qa.reporte@yape.com.pe');
        const baseline = validator.validate(packagedScenario, plan, response);
        assert.equal(baseline.valid, true, JSON.stringify(baseline.errors));

        const hardcoded = JSON.parse(JSON.stringify(response));
        hardcoded.files.find(file => file.layer === 'screen').content = screen.content.replace('setValue(email)', "setValue('qa.reporte@yape.com.pe')");
        const screenValidation = validator.validate(packagedScenario, plan, hardcoded);
        assert.deepEqual(
            [...new Set(screenValidation.errors.map(error => `${error.code}@${error.file}`))].sort(),
            [`example-value-hardcoded@${screen.path}`, `parameter-unused@${screen.path}`],
        );

        const dropped = JSON.parse(JSON.stringify(response));
        dropped.files.find(file => file.layer === 'steps').content = steps.content.replace(/\((email)\);/, '();');
        dropped.files.find(file => file.layer === 'screen').content = screen.content
            .replace('(email: string)', '()')
            .replace('setValue(email)', "setValue('qa.reporte@yape.com.pe')");
        const stepsValidation = validator.validate(packagedScenario, plan, dropped);
        assert.ok(stepsValidation.errors.some(error => error.code === 'parameter-not-forwarded' && error.file === steps.path),
            JSON.stringify(stepsValidation.errors));
        assert.ok(stepsValidation.errors.some(error => error.code === 'example-value-hardcoded' && error.file === screen.path));

        const unusedColumn = JSON.parse(JSON.stringify(response));
        unusedColumn.files.find(file => file.layer === 'feature').content = feature.content.replace('<email>', 'un correo');
        const featureValidation = validator.validate(packagedScenario, plan, unusedColumn);
        assert.ok(featureValidation.errors.some(error => error.code === 'examples-unused-column' && error.file === feature.path),
            JSON.stringify(featureValidation.errors));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
