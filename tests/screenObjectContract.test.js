const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    screenObjectProblems,
    signatureHint,
    callArguments,
    SCREEN_OBJECT_CONTRACT_RULE_CODES,
} = require('../dist/core/screenObjectContract');
const { frameworkContract } = require('../dist/core/frameworkContract');
const { FwkMobileGenerator } = require('../dist/core/fwkMobileGenerator');
const { projectPaths } = require('../dist/core/projectPaths');

const CONTRACT = frameworkContract(projectPaths.frameworkRoot);
const RULES = {
    typeLocatorSymbol: CONTRACT.typeLocatorSymbol,
    typeLocatorImport: CONTRACT.typeLocatorImport,
    platformOrder: CONTRACT.locatorSignature.platformOrder,
    parameterCount: CONTRACT.locatorSignature.parameterCount,
};
// Un Screen Object siempre trae el import del enum; los fragmentos de estos
// tests tambien, o dispararian la regla de import en cada caso.
const ENUM_IMPORT = `import { ${CONTRACT.typeLocatorSymbol} } from '${CONTRACT.typeLocatorImport}';\n`;
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
    const dos = ENUM_IMPORT + `
        const locator = LocatorProvider.getElement(
            TypeLocator.ANDROID, LocatorContac.yapearAndroid.titleYapear
        );`;
    const problems = screenObjectProblems(dos, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-arity']);
    assert.match(problems[0].message, /son 4 siempre/);
    assert.match(problems[0].message, /nunca un literal vacio/);
});

test('el valor antes del TypeLocator es un error', () => {
    const invertido = ENUM_IMPORT + `
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
    const cruzado = ENUM_IMPORT + `
        const locator = LocatorProvider.getElement(
            TypeLocator.ID, LocatorContac.yapearAndroid.titleYapear,
            TypeLocator.ANDROID, LocatorContac.yapearIos.titleYapear
        );`;
    const problems = screenObjectProblems(cruzado, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-order']);
    assert.match(problems[0].message, /apunta a un bloque de android/);
});

test('usar literal vacio en getElement es un error aunque el locator exista', () => {
    const vacio = ENUM_IMPORT + `
        const locator = LocatorProvider.getElement(
            TypeLocator.ID, '',
            TypeLocator.ANDROID, LocatorContac.yapearAndroid.titleYapear
        );`;
    const problems = screenObjectProblems(vacio, RULES);
    assert.deepEqual(problems.map(p => p.code), ['getElement-order']);
    assert.match(problems[0].message, /no puede ser literal vacío/);
});

test('la llamada correcta no produce ningun problema', () => {
    assert.deepEqual(codes(ENUM_IMPORT + `
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

// El enum es un export nombrado. Importarlo por defecto no compila, y ademas
// hacia que el analisis dejara de reconocer TypeLocator.X: el validador
// disparaba cuatro errores sobre "el par primary" y ninguno nombraba la linea
// del import, que era el unico problema real.
test('el enum importado por defecto se nombra como lo que es', () => {
    const roto = `import ${CONTRACT.typeLocatorSymbol} from '${CONTRACT.typeLocatorImport}';
        const locator = LocatorProvider.getElement(
            TypeLocator.ID, L.xIos.a,
            TypeLocator.ANDROID, L.xAndroid.a
        );`;
    const problems = screenObjectProblems(roto, RULES);
    assert.deepEqual(problems.map(p => p.code), ['type-locator-import']);
    assert.match(problems[0].message, /export nombrado, no un default/);
    assert.match(problems[0].message, /import \{ TypeLocator \} from/);
});

test('usar el enum sin importarlo tambien se marca', () => {
    const problems = screenObjectProblems('TypeLocator.ID', RULES);
    assert.deepEqual(problems.map(p => p.code), ['type-locator-import']);
    assert.match(problems[0].message, /pero no lo importa/);
});

test('el import nombrado correcto no produce nada', () => {
    assert.deepEqual(
        screenObjectProblems(ENUM_IMPORT + 'const x = TypeLocator.ID;', RULES).map(p => p.code),
        []
    );
});

test('nombra alias y singleton desde los nombres esperados del Screen Object', () => {
    const problems = screenObjectProblems(
        `class WrongScreen extends ${CONTRACT.baseScreenClass} {}\nexport default new WrongScreen();`,
        {
            ...RULES,
            stepsContent: `import badAlias from '@screenobjects/payment/verify-sales-message.screen.ts';`,
            expectedNames: {
                className: 'VerifySalesMessageScreen',
                instanceName: 'verifySalesMessageScreen',
                importSource: '@screenobjects/payment/verify-sales-message.screen.ts',
                baseScreenClass: CONTRACT.baseScreenClass,
            },
        }
    );
    assert.deepEqual(
        problems
            .filter(problem => ['screen-alias', 'screen-class-name', 'screen-singleton-name'].includes(problem.code))
            .map(problem => problem.code)
            .sort(),
        ['screen-alias', 'screen-class-name', 'screen-singleton-name']
    );
});

test('el validador no debe hardcodear reglas de alias/clase/singleton fuera del contrato', () => {
    const validatorSource = fs.readFileSync(
        path.join(process.cwd(), 'core', 'automationResponseValidator.ts'),
        'utf8'
    );
    assert.ok(SCREEN_OBJECT_CONTRACT_RULE_CODES.includes('screen-alias'));
    assert.ok(SCREEN_OBJECT_CONTRACT_RULE_CODES.includes('screen-class-name'));
    assert.ok(SCREEN_OBJECT_CONTRACT_RULE_CODES.includes('screen-singleton-name'));
    assert.equal(/code:\s*'screen-class-name'/.test(validatorSource), false);
    assert.equal(/code:\s*'screen-singleton-name'/.test(validatorSource), false);
    assert.equal(/Alias Screen Object inválido/.test(validatorSource), false);
});
