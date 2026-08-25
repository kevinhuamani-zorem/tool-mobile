const test = require('node:test');
const assert = require('node:assert/strict');
const { screenObjectProblems, signatureHint, callArguments } = require('../dist/core/screenObjectContract');
const { frameworkContract } = require('../dist/core/frameworkContract');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');
const { projectPaths } = require('../dist/core/projectPaths');

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);
const RULES = {
    typeLocatorSymbol: CONTRACT.typeLocatorSymbol,
    platformOrder: CONTRACT.locatorSignature.platformOrder,
    parameterCount: CONTRACT.locatorSignature.parameterCount,
};
const codes = content => screenObjectProblems(content, RULES).map(problem => problem.code);

// La firma sale del framework, no de la memoria del agente.
test('la firma de getElement se lee del framework', () => {
    assert.equal(CONTRACT.locatorSignature.parameterCount, 4);
    assert.deepEqual(CONTRACT.locatorSignature.platformOrder, ['ios', 'android']);
    assert.match(signatureHint(RULES), /getElement\(TypeLocator\.<IOS>, <valor ios>, TypeLocator\.<ANDROID>, <valor android>\)/);
});

// Sin el atributo de tipo Node lanza al cargar el JSON: no es estilo, el caso
// no corre. 114 de 114 imports del framework lo llevan.
test('un import de locators sin atributo de tipo es un error', () => {
    const sin = `import LocatorContac from '@locators/payment/yapear-contact.locator.json';`;
    assert.deepEqual(codes(sin), ['json-import-attribute']);
    assert.match(
        screenObjectProblems(sin, RULES)[0].message,
        /with \{ type: 'json' \}/,
        'el mensaje trae la linea corregida, no solo la queja'
    );
    const con = `import LocatorContac from '@locators/payment/yapear-contact.locator.json' with { type: 'json' };`;
    assert.deepEqual(codes(con), []);
});

// El agujero real: solo se comprobaba el modulo planificado, asi que los
// reutilizados entraban con ruta relativa y sin atributo.
test('un modulo reutilizado tambien tiene que ir por alias', () => {
    const relativo = `import LocatorContac from "../../resources/locators/payment/yapear-contact.locator.json" with { type: "json" };`;
    const problems = screenObjectProblems(relativo, RULES);
    assert.deepEqual(problems.map(p => p.code), ['locator-import-alias']);
    assert.match(problems[0].message, /@locators\/payment\/yapear-contact\.locator\.json/);
});

test('el atributo vale con comillas simples o dobles', () => {
    assert.deepEqual(codes(
        `import L from '@locators/payment/x.locator.json' with { type: "json" };`
    ), []);
});

// 860 de 860 llamadas del framework tienen exactamente 4 argumentos.
test('getElement con solo la plataforma activa es un error', () => {
    const dos = `
        const locator = LocatorProvider.getElement(
            TypeLocator.ANDROID, LocatorContac.yapearAndroid.titleYapear
        );`;
    const problems = screenObjectProblems(dos, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-arity']);
    assert.match(problems[0].message, /son 4 siempre/);
    assert.match(problems[0].message, /su valor va vacio, pero el argumento se escribe/);
});

test('el valor antes del TypeLocator es un error', () => {
    const invertido = `
        const locator = LocatorProvider.getElement(
            LocatorContac.yapearIos.titleYapear, TypeLocator.ID,
            LocatorContac.yapearAndroid.titleYapear, TypeLocator.ANDROID
        );`;
    const problems = screenObjectProblems(invertido, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-order']);
    assert.match(problems[0].message, /argumento 1 deberia ser TypeLocator/);
});

// Este no lo habia reportado nadie y es peor: mantiene 4 argumentos, compila,
// pasa el review y ejecuta el locator de la plataforma contraria.
test('intercambiar los valores de iOS y Android es un error', () => {
    const cruzado = `
        const locator = LocatorProvider.getElement(
            TypeLocator.ID, LocatorContac.yapearAndroid.titleYapear,
            TypeLocator.ANDROID, LocatorContac.yapearIos.titleYapear
        );`;
    const problems = screenObjectProblems(cruzado, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-order']);
    assert.match(problems[0].message, /apunta a un bloque de android/);
});

test('la llamada correcta no produce ningun problema', () => {
    assert.deepEqual(codes(`
        const locator = LocatorProvider.getElement(
            TypeLocator.ID, LocatorContac.yapearIos.titleYapear,
            TypeLocator.ANDROID, LocatorContac.yapearAndroid.titleYapear
        );`), []);
});

test('los argumentos se parten balanceando parentesis', () => {
    assert.deepEqual(
        callArguments(`TypeLocator.ID, L.a.b.replace('{x}', x), TypeLocator.ANDROID, L.c.d`),
        ['TypeLocator.ID', "L.a.b.replace('{x}', x)", 'TypeLocator.ANDROID', 'L.c.d']
    );
});

// La ruta determinista tiene que cumplir su propio contrato: si el generador lo
// rompiera, la regla estaria midiendo solo al agente.
test('el generador determinista cumple el contrato que exige al agente', () => {
    const actions = [
        { action: 'CLICK', variableName: 'showMovementsButton', selector: 'id=com.yape.qa:id/btnShow' },
        { action: 'VERIFICAR_TEXTO', variableName: 'movementLabel', selector: '~lblMovimiento', value: '<movimiento>' },
    ];
    const preview = new FwkMobileGenerator().preview({
        squad: 'payment', featureName: 'Movimientos', scenarioName: 'Ver',
        fileName: 'movements', locatorModule: 'movements', caseId: 'TC-1',
        pathType: 'Happy Path', tag: 'movimientos', platform: 'android',
        examples: { movimiento: 'Primer yapeo' },
        scenarioRows: [{
            keyword: 'Then', text: 'se muestra el movimiento <movimiento>',
            status: 'missing', methodName: 'showMovement', actions,
        }],
    }, actions);

    assert.deepEqual(screenObjectProblems(preview.screenContent, RULES), []);
});
