/**
 * Elección del Screen Object que un caso extiende, con el recording 18167698
 * ("enviar movimientos por correo") como fixture: cinco locators reutilizados
 * de payment/movements, uno de payment/showsales y un campo de texto grabado
 * con `className("android.widget.EditText")`, el mismo selector genérico que
 * el campo del código OTP. El plan original extendió el Screen del OTP.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DeterministicResolver, analyzeUiTextQuality } = require('../dist/core/automation');
const { bestArtifactBundle, bundleTargetLocator } = require('../dist/core/automation/application/resolver/artifactPlanning');
const { selectorIsUnspecific } = require('../dist/core/shared');
const { inferredStrategy } = require('../dist/core/indexing');

const MOVEMENTS_SCREEN = 'screenobjects/payment/movements.screen.ts';
const MOVEMENTS_LOCATORS = 'resources/locators/payment/movements.locator.json';
const HOME_LOCATORS = 'resources/locators/home/home.locator.json';
const OTP_SCREEN = 'screenobjects/payment/yapear-otp.screen.ts';
const OTP_LOCATORS = 'resources/locators/payment/yapear-otp.locator.json';
const OTP_STEPS = 'features/yape-steps-definitions/payment/otp.steps.ts';
const SALES_SCREEN = 'screenobjects/payment/sales.screen.ts';
const SALES_LOCATORS = 'resources/locators/payment/showsales.locator.json';
const SALES_STEPS = 'features/yape-steps-definitions/payment/verify-sales-message.steps.ts';
const EMAIL_STEPS = 'features/yape-steps-definitions/payment/confirmation-send-email-report.steps.ts';
const FILTERS_STEPS = 'features/yape-steps-definitions/payment/movements-cases-filters-container.steps.ts';
const EDIT_TEXT = 'new UiSelector().className("android.widget.EditText")';

function locator(module, file, name, selector, strategy) {
    return {
        name, selector, androidSelector: selector, iosSelector: '',
        androidStrategy: strategy || inferredStrategy(selector) || 'ID',
        androidBlock: `${module.split('/')[1]}Android`, iosBlock: `${module.split('/')[1]}Ios`,
        file, module, squad: 'payment', scope: 'squad', platform: 'android',
    };
}

function method(file, locatorFiles, name, locatorKeys) {
    return { name, file, squad: 'payment', locatorFiles, signature: `${name}()`, locatorKeys, className: 'S' };
}

function definition(file, expression, screen, methodName) {
    return { keyword: 'When', expression, file, squad: 'payment', scope: 'squad', screenMethods: [{ file: screen, method: methodName }] };
}

/** Catálogo con el estado del framework al grabar 18167698. */
function frameworkCatalog({ editTextIn = 'otp' } = {}) {
    const movementsLocators = [
        ['movementsButton', 'new UiSelector().text("Mostrar movimientos")'],
        ['seeAllMovementsButton', 'Ver todos'],
        ['titleMovements', 'new UiSelector().text("Movimientos")'],
        ['btnsend', 'new UiSelector().text("ENVIAR")'],
        ['backButton', 'Atrás'],
        ['sendReportEmailMovements', 'new UiSelector().description("Botón de enviar por correo")'],
        ...(editTextIn === 'movements' ? [['emailInput', EDIT_TEXT]] : []),
    ].map(([name, selector]) => locator('payment/movements', MOVEMENTS_LOCATORS, name, selector));
    const otpLocators = [
        ['txttitleYapeoAlto', 'new UiSelector().text("Confirma tu yapeo alto")'],
        ['btnValidateCode', 'new UiSelector().className("android.view.View").instance(7)'],
        ...(editTextIn === 'otp' ? [['txtboxinputcode', EDIT_TEXT]] : []),
    ].map(([name, selector]) => locator('payment/yapear-otp', OTP_LOCATORS, name, selector));
    const salesLocators = [
        ['btnunderstood', 'new UiSelector().text("ENTENDIDO")'],
        ['titleSales', 'new UiSelector().text("Ventas")'],
    ].map(([name, selector]) => locator('payment/showsales', SALES_LOCATORS, name, selector));
    const screenMethods = [
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'showMovements', ['movementsButton']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'showAll', ['seeAllMovementsButton']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'validateMovementsScreen', ['titleMovements']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'sendEmailReportMovements', ['sendReportEmailMovements', 'btnsend']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'confirmationSendEmail', ['btnsend']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'filterMovements', ['btnfilter']),
        method(MOVEMENTS_SCREEN, [MOVEMENTS_LOCATORS, HOME_LOCATORS], 'goBack', ['backButton']),
        method(OTP_SCREEN, [OTP_LOCATORS], 'validateConfirmaYapeoAltoScreen', ['txttitleYapeoAlto']),
        method(OTP_SCREEN, [OTP_LOCATORS], 'pressButtonValideCode', ['txtboxinputcode', 'btnValidateCode']),
        method(SALES_SCREEN, [SALES_LOCATORS], 'pressUnderstood', ['btnunderstood']),
        method(SALES_SCREEN, [SALES_LOCATORS], 'validateSalesScreen', ['titleSales']),
    ];
    const stepDefinitions = [
        definition(EMAIL_STEPS, '^enviar un correo de reporte de movimientos$', MOVEMENTS_SCREEN, 'sendEmailReportMovements'),
        definition(EMAIL_STEPS, '^confirmacion de envio de correo$', MOVEMENTS_SCREEN, 'confirmationSendEmail'),
        definition(FILTERS_STEPS, '^el usuario consulta todos sus movimientos$', MOVEMENTS_SCREEN, 'showAll'),
        definition(FILTERS_STEPS, '^el usuario aplica los filtros de movimientos disponibles$', MOVEMENTS_SCREEN, 'filterMovements'),
        definition(OTP_STEPS, '^se valida con codigo OTP$', OTP_SCREEN, 'pressButtonValideCode'),
        definition(OTP_STEPS, '^selecciona el boton de validacion$', OTP_SCREEN, 'validateConfirmaYapeoAltoScreen'),
        definition(SALES_STEPS, '^el usuario consulta sus ventas$', SALES_SCREEN, 'validateSalesScreen'),
    ];
    const bundle = (steps, screens, locators) => ({
        steps, screens, locators,
        stepExpressions: stepDefinitions.filter(item => item.file === steps).map(item => item.expression),
        screenMethods: screenMethods.filter(item => screens.includes(item.file)).map(item => item.name),
    });
    return {
        squad: 'payment', featureScope: '', platform: 'android',
        locators: [...movementsLocators, ...otpLocators, ...salesLocators],
        stepDefinitions, features: [], scenarios: [],
        screenMethods,
        artifactBundles: [
            bundle(EMAIL_STEPS, [MOVEMENTS_SCREEN], [HOME_LOCATORS, MOVEMENTS_LOCATORS]),
            bundle(FILTERS_STEPS, [MOVEMENTS_SCREEN], [HOME_LOCATORS, MOVEMENTS_LOCATORS]),
            bundle(OTP_STEPS, [OTP_SCREEN], [OTP_LOCATORS]),
            bundle(SALES_STEPS, [SALES_SCREEN], [SALES_LOCATORS]),
        ],
    };
}

const action = (kind, contextHint, selector, value = '') => ({
    action: kind, contextHint, elementIntent: '', selector, value, selectorVerified: Boolean(selector),
});

/** Las 11 acciones grabadas en 18167698. */
function sendMovementsByEmailScenario() {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-e5d4332d-a848-47a7-be18-c51d18167698', revision: 1,
        fingerprint: 'f'.repeat(64), createdAt: '2026-09-05T21:11:16.206Z',
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'enviar los movimientos por correo',
        acceptanceCriteria: 'el usuario ingresa su correo y valida mensaje de correo enviado',
        request: {
            squad: 'payment', featureName: '', scenarioName: '', fileName: '', locatorModule: '',
            caseId: 'TC-10240', pathType: 'Happy Path', tag: 'movimientos', dataName: 'QA',
            platform: 'android', examples: {}, scenarioRows: [],
        },
        actions: [
            action('CLICK', 'boton mostrar movimientos', 'android=new UiSelector().text("Mostrar movimientos")'),
            action('SCROLL_DOWN', '', ''),
            action('CLICK', 'boton ver todos los movimientos', '~Ver todos'),
            action('VERIFICAR_EXISTE', 'pantalla movimientos', 'android=new UiSelector().text("Movimientos")'),
            action('CLICK', 'boton correo', '~Botón de enviar por correo'),
            action('VERIFICAR_TEXTO', 'pantalla enviar movimientos', 'android=new UiSelector().text("Enviar movimientos")', 'Enviar movimientos'),
            action('ESCRIBIR', 'ingresar el correo', `android=${EDIT_TEXT}`, 'joseamendoza@yape.com.pe'),
            action('CLICK', 'boton enviar correo', 'android=new UiSelector().text("ENVIAR")'),
            action('VERIFICAR_TEXTO', 'texto de correo enviado', '~Tu correo se estará enviando en los próximos minutos.', 'Tu correo se estará enviando en los próximos minutos.'),
            action('CLICK', 'boton entendido', 'android=new UiSelector().text("ENTENDIDO")'),
            action('CLICK', 'boton atras', '~Atrás'),
        ].map((item, index) => ({ ...item, sequence: index + 1 })),
    };
}

function provider(catalog) {
    return { getCatalog: () => catalog };
}

test('selectorIsUnspecific distingue tipo/posición de identidad', () => {
    for (const selector of [
        EDIT_TEXT, `android=${EDIT_TEXT}`,
        'new UiSelector().className("android.view.View").instance(7)',
        '//android.view.View', '//android.widget.EditText[2]', '//*', '(//android.widget.Button)[3]',
        '**/XCUIElementTypeTextField', '-ios class chain:**/XCUIElementTypeButton[2]',
    ]) assert.equal(selectorIsUnspecific(selector), true, selector);
    for (const selector of [
        'new UiSelector().text("ENVIAR")', 'android=new UiSelector().description("Botón de enviar por correo")',
        'new UiSelector().resourceId("com.yape:id/email")', 'new UiSelector().className("android.widget.EditText").textContains("correo")',
        '~Atrás', 'id=email', 'Ver todos',
        '//android.widget.EditText[@text="correo"]', '//*[contains(@text,"ENVIAR")]',
        '**/XCUIElementTypeButton[`name == "Enviar"`]', '-ios predicate string:label == "Enviar"',
        '',
    ]) assert.equal(selectorIsUnspecific(selector), false, selector || '(vacío)');
});

test('el flujo de movimientos por correo extiende movements, no el Screen del OTP', () => {
    const result = new DeterministicResolver(provider(frameworkCatalog())).resolve(sendMovementsByEmailScenario());
    const { reuseTarget, files, resolutions } = result.plan;
    assert.equal(reuseTarget.screen, MOVEMENTS_SCREEN);
    assert.equal(reuseTarget.locators, MOVEMENTS_LOCATORS, 'el locator del Screen, no el home compartido');
    assert.equal(reuseTarget.steps, EMAIL_STEPS, 'entre Steps del mismo Screen gana el que ya ejerce el flujo');
    assert.match(reuseTarget.reason, /5 de los 6 locators reutilizados/);
    assert.ok(reuseTarget.score > 0.9, String(reuseTarget.score));
    assert.deepEqual(
        files.filter(file => file.layer !== 'feature').map(file => [file.layer, file.path, file.operation]),
        [['steps', EMAIL_STEPS, 'update'], ['screen', MOVEMENTS_SCREEN, 'update'], ['locators', MOVEMENTS_LOCATORS, 'update']],
    );
    const email = resolutions.find(item => item.sequence === 7);
    assert.equal(email.resolution, 'create', 'el EditText genérico no adopta el campo del código OTP');
    assert.equal(email.unspecificSelector, true);
    assert.equal(email.selector, `android=${EDIT_TEXT}`, 'el selector grabado se conserva tal cual');
    assert.deepEqual(email.declinedReuse, { file: OTP_LOCATORS, module: 'payment/yapear-otp', name: 'txtboxinputcode' });
    assert.match(email.reason, /no lleva predicado identificador/);
    assert.equal(email.source, undefined);
    const understood = resolutions.find(item => item.sequence === 10);
    assert.equal(understood.resolution, 'reuse', 'un texto sí identifica: ENTENDIDO se reutiliza aunque viva en showsales');
    assert.equal(understood.source.module, 'payment/showsales');
    assert.equal(resolutions.filter(item => item.resolution === 'reuse' && item.source.module === 'payment/movements').length, 5);
    assert.ok(result.plan.unresolvedGapIds.includes('gap-extend-existing-artifacts'));
});

test('el mismo selector genérico sí se reutiliza cuando el locator vive en el módulo que se extiende', () => {
    const result = new DeterministicResolver(provider(frameworkCatalog({ editTextIn: 'movements' })))
        .resolve(sendMovementsByEmailScenario());
    assert.equal(result.plan.reuseTarget.screen, MOVEMENTS_SCREEN);
    const email = result.plan.resolutions.find(item => item.sequence === 7);
    assert.equal(email.resolution, 'reuse');
    assert.equal(email.locatorName, 'emailInput');
    assert.equal(email.unspecificSelector, true);
    assert.match(email.reason, /se adopta porque el locator vive en el modulo que este caso extiende/);
});

test('un selector genérico repetido en varios módulos no bloquea por ambigüedad y prefiere el módulo que se extiende', () => {
    const catalog = frameworkCatalog({ editTextIn: 'movements' });
    catalog.locators.push(locator('payment/yapear-otp', OTP_LOCATORS, 'txtboxinputcode', EDIT_TEXT));
    catalog.locators.push(locator('payment/showsales', SALES_LOCATORS, 'txtcomment', EDIT_TEXT));
    const result = new DeterministicResolver(provider(catalog)).resolve(sendMovementsByEmailScenario());
    assert.equal(result.unresolvedContext.gaps.some(gap => gap.id === 'gap-locator-candidate-ambiguity-7'), false);
    const email = result.plan.resolutions.find(item => item.sequence === 7);
    assert.equal(email.resolution, 'reuse');
    assert.equal(email.locatorName, 'emailInput');
    assert.equal(email.source.module, 'payment/movements');
    assert.match(email.reason, /vive en el modulo que este caso extiende/);

    const specific = frameworkCatalog();
    specific.locators.push(locator('payment/showsales', SALES_LOCATORS, 'btnsend', 'new UiSelector().text("ENVIAR")'));
    const tied = new DeterministicResolver(provider(specific)).resolve(sendMovementsByEmailScenario());
    assert.ok(tied.unresolvedContext.gaps.some(gap => gap.id === 'gap-locator-candidate-ambiguity-8'),
        'un texto idéntico en dos módulos sigue siendo una decisión del QA');
});

test('un único acierto sin cobertura no adopta un Screen ajeno; un caso corto sobre la misma pantalla sí', () => {
    const catalog = frameworkCatalog();
    const lone = new DeterministicResolver(provider(catalog)).resolve({
        ...sendMovementsByEmailScenario(),
        objective: 'registrar una nueva cuenta',
        acceptanceCriteria: 'se confirma el registro',
        actions: [
            action('CLICK', 'boton registrar', '~Registrar'),
            action('ESCRIBIR', 'nombre completo', 'id=fullName', 'QA'),
            action('ESCRIBIR', 'telefono', 'id=phone', '999'),
            action('CLICK', 'boton continuar', '~Continuar'),
            action('CLICK', 'boton entendido', 'android=new UiSelector().text("ENTENDIDO")'),
            action('VERIFICAR_EXISTE', 'mensaje de registro', '~Registro completo'),
        ].map((item, index) => ({ ...item, sequence: index + 1 })),
    });
    assert.equal(lone.plan.reuseTarget, undefined, 'ENTENDIDO solo no convierte el registro en un caso de ventas');
    assert.equal(lone.plan.resolutions.find(item => item.sequence === 5).resolution, 'reuse', 'el locator sí se reutiliza');
    assert.equal(lone.plan.files.find(file => file.layer === 'screen').operation, 'create');

    const short = new DeterministicResolver(provider(catalog)).resolve({
        ...sendMovementsByEmailScenario(),
        objective: 'cerrar el mensaje de ventas',
        acceptanceCriteria: 'se muestra la pantalla de ventas',
        actions: [
            action('CLICK', 'boton entendido', 'android=new UiSelector().text("ENTENDIDO")'),
            action('VERIFICAR_EXISTE', 'titulo de ventas', 'android=new UiSelector().text("Ventas")'),
        ].map((item, index) => ({ ...item, sequence: index + 1 })),
    });
    assert.equal(short.plan.reuseTarget.screen, SALES_SCREEN);
    assert.equal(short.plan.reuseTarget.locators, SALES_LOCATORS);
});

test('bestArtifactBundle puntúa por evidencia y elige el locator con aciertos o el del Screen', () => {
    const catalog = frameworkCatalog();
    const scenario = sendMovementsByEmailScenario();
    const resolutions = [
        { sequence: 1, action: 'CLICK', intent: 'boton mostrar movimientos', resolution: 'reuse', locatorName: 'movementsButton', source: { file: MOVEMENTS_LOCATORS, module: 'payment/movements', scope: 'squad' }, confidence: 1, reason: '' },
        { sequence: 2, action: 'CLICK', intent: 'boton enviar correo', resolution: 'reuse', locatorName: 'btnsend', source: { file: MOVEMENTS_LOCATORS, module: 'payment/movements', scope: 'squad' }, confidence: 1, reason: '' },
        { sequence: 3, action: 'ESCRIBIR', intent: 'ingresar el correo', resolution: 'reuse', locatorName: 'txtboxinputcode', unspecificSelector: true, source: { file: OTP_LOCATORS, module: 'payment/yapear-otp', scope: 'squad' }, confidence: 1, reason: '' },
        { sequence: 4, action: 'CLICK', intent: 'boton entendido', resolution: 'reuse', locatorName: 'btnunderstood', source: { file: SALES_LOCATORS, module: 'payment/showsales', scope: 'squad' }, confidence: 1, reason: '' },
    ];
    const best = bestArtifactBundle(catalog, scenario, resolutions);
    assert.equal(best.bundle.screens[0], MOVEMENTS_SCREEN);
    assert.equal(best.locators, MOVEMENTS_LOCATORS);
    assert.equal(best.bundle.steps, EMAIL_STEPS);
    assert.match(best.reason, /2 de los 3 locators reutilizados/, 'el selector genérico no cuenta como acierto');

    const hits = new Map([[HOME_LOCATORS, 2]]);
    assert.equal(bundleTargetLocator({ steps: '', screens: [MOVEMENTS_SCREEN], locators: [HOME_LOCATORS, MOVEMENTS_LOCATORS], stepExpressions: [], screenMethods: [] }, hits), HOME_LOCATORS);
    assert.equal(bundleTargetLocator({ steps: '', screens: [MOVEMENTS_SCREEN], locators: [HOME_LOCATORS, MOVEMENTS_LOCATORS], stepExpressions: [], screenMethods: [] }, new Map()), MOVEMENTS_LOCATORS);
});

test('qa-observations avisa del selector sin predicado y conserva el selector grabado', () => {
    const artifact = analyzeUiTextQuality('rec-x', sendMovementsByEmailScenario().actions, '2026-09-06T00:00:00.000Z', 'android');
    const unspecific = artifact.observations.filter(item => item.type === 'unspecific-selector');
    assert.deepEqual(unspecific.map(item => item.actionSequence), [7]);
    assert.equal(unspecific[0].selector, `android=${EDIT_TEXT}`);
    assert.equal(unspecific[0].severity, 'warning');
    assert.match(unspecific[0].message, /solo se reutiliza dentro del módulo del caso/);
});
