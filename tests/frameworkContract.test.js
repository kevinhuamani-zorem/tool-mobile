const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    frameworkContract, clearFrameworkContractCache, aliasImport, composeLocator,
} = require('../dist/core/frameworkContract');

function buildFramework(layout) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fwk-contract-'));
    for (const [relative, content] of Object.entries(layout)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
    return root;
}

// Prefijos deliberadamente distintos a los del framework real: si el contrato
// devolviera los de la convencion en vez de leer estos, el test lo veria.
const CONSTANTS = `export class Constants {
  static ID: string = '@@';
  static XPATH: string = '';
  static ANDROID_LOCATOR: string = 'droid=';
  static PREDICATE_STRING: string = '-pred:';
}
`;

/** Clase resolutora con su `switch` real: es de donde sale la composicion. */
function provider(name) {
    // Sin extension a proposito: el fixture no debe votar en el conteo `.ts`/`.js`.
    return `import { Constants } from './constants';
export default class ${name} {
  static getElement(a, b, c, d) { return b; }
  private static getObjectAndroid(type, value) {
    switch (type) {
    case TypeLocator.ID: return Constants.ID + value;
    case TypeLocator.ANDROID: return Constants.ANDROID_LOCATOR + value;
    case TypeLocator.XPATH: return Constants.XPATH + value;
    }
  }
  private static getObjectIos(type, value) {
    switch (type) {
    case TypeLocator.ID: return Constants.ID + value;
    case TypeLocator.PREDICATESTRING: return Constants.PREDICATE_STRING + value;
    case TypeLocator.XPATH: return Constants.XPATH + value;
    }
  }
}
`;
}

const CANONICAL = {
    // El tsconfig real trae comentarios: JSON.parse no sirve.
    'tsconfig.json': `{
  "compilerOptions": {
    /* Path mapping */
    "paths": {
      "@resources/*": ["resources/*"],
      "@locators/*": ["resources/locators/*"],
      "@screenobjects/*": ["screenobjects/*"],
      "@utils/*": ["support/utils/*"]
    }
  }
}`,
    'screenobjects/commons/base.screen.ts': 'export default abstract class BaseScreen {}\n',
    // La deteccion es por forma: la clase que expone `static getElement`.
    'support/utils/LocatorFactory.ts': provider('LocatorFactory'),
    'support/utils/constants.ts': CONSTANTS,
    'support/utils/Enums.ts': 'export enum TypeLocator { XPATH }\n',
};

test('resuelve los anclajes desde el framework, no desde una constante', () => {
    clearFrameworkContractCache();
    const contract = frameworkContract(buildFramework(CANONICAL));
    assert.equal(contract.baseScreenImport, '@screenobjects/commons/base.screen.ts');
    assert.equal(contract.locatorFactoryImport, '@utils/LocatorFactory.ts');
    assert.equal(contract.typeLocatorImport, '@utils/Enums.ts');
    assert.equal(contract.typeLocatorExportKind, 'named');
    assert.deepEqual(contract.typeLocatorMembers, ['XPATH']);
    assert.equal(contract.baseScreenClass, 'BaseScreen');
    assert.deepEqual(contract.warnings, []);
});

// Este es el caso que motivo todo: mover un ancla no puede pasar inadvertido.
test('sigue al ancla cuando el framework la mueve o la renombra', () => {
    clearFrameworkContractCache();
    const root = buildFramework({
        ...CANONICAL,
        'tsconfig.json': CANONICAL['tsconfig.json'].replace('"@utils/*": ["support/utils/*"]',
            '"@helpers/*": ["support/helpers/*"]'),
        'screenobjects/base/AbstractScreen.ts': 'export default abstract class AbstractScreen {}\n',
        'support/helpers/LocatorProvider.ts': provider('LocatorProvider'),
        'support/helpers/constants.ts': CONSTANTS,
        'support/helpers/Enums.ts': 'export enum TypeLocator { XPATH }\n',
    });
    fs.rmSync(path.join(root, 'screenobjects/commons/base.screen.ts'));
    fs.rmSync(path.join(root, 'support/utils'), { recursive: true });

    const contract = frameworkContract(root);
    assert.equal(contract.baseScreenImport, '@screenobjects/base/AbstractScreen.ts');
    assert.equal(contract.baseScreenClass, 'AbstractScreen');
    assert.equal(contract.locatorFactoryImport, '@helpers/LocatorProvider.ts');
    assert.equal(contract.locatorFactorySymbol, 'LocatorProvider',
        'el simbolo viaja: el generador lo escribe en cada getter');
    assert.equal(contract.typeLocatorImport, '@helpers/Enums.ts');
    assert.deepEqual(contract.warnings, []);
});

test('recalcula cuando el arbol cambia, sin reiniciar el proceso', () => {
    clearFrameworkContractCache();
    const root = buildFramework(CANONICAL);
    assert.equal(frameworkContract(root).locatorFactoryImport, '@utils/LocatorFactory.ts');

    fs.mkdirSync(path.join(root, 'support/utils/factories'), { recursive: true });
    fs.renameSync(
        path.join(root, 'support/utils/LocatorFactory.ts'),
        path.join(root, 'support/utils/factories/LocatorFactory.ts')
    );
    // El mtime del directorio raiz escaneado cambia al mover el archivo.
    fs.utimesSync(path.join(root, 'support'), new Date(), new Date());

    assert.equal(
        frameworkContract(root).locatorFactoryImport,
        '@utils/factories/LocatorFactory.ts'
    );
});

test('avisa en vez de mentir cuando no encuentra un ancla', () => {
    clearFrameworkContractCache();
    const root = buildFramework(CANONICAL);
    fs.rmSync(path.join(root, 'support/utils/LocatorFactory.ts'));

    const contract = frameworkContract(root);
    assert.equal(contract.locatorFactoryImport, '@utils/LocatorFactory.ts', 'cae al valor por convención');
    assert.equal(contract.warnings.some(warning => /locatorFactory/.test(warning)), true);
});

test('sin tsconfig usa los alias por convención y lo dice', () => {
    clearFrameworkContractCache();
    const layout = { ...CANONICAL };
    delete layout['tsconfig.json'];
    const contract = frameworkContract(buildFramework(layout));
    assert.equal(contract.baseScreenImport, '@screenobjects/commons/base.screen.ts');
    assert.equal(contract.warnings.some(warning => /tsconfig/.test(warning)), true);
});

// El repo actualizado escribe sus imports internos con .js en los 74 Screen
// Objects; el codigo generado tiene que parecerse al que ya esta.
test('toma la extension de import que usa el framework', () => {
    clearFrameworkContractCache();
    const conJs = buildFramework({
        ...CANONICAL,
        'screenobjects/payment/a.screen.ts':
            "import LocatorFactory from '@utils/LocatorFactory.js';\n" +
            "import { TypeLocator } from '@utils/Enums.js';\n",
        'screenobjects/payment/b.screen.ts':
            "import LocatorFactory from '@utils/LocatorFactory.js';\n",
    });
    const contract = frameworkContract(conJs);
    assert.equal(contract.importExtension, '.js');
    assert.equal(contract.locatorFactoryImport, '@utils/LocatorFactory.js');
    assert.equal(contract.baseScreenImport, '@screenobjects/commons/base.screen.js');

    clearFrameworkContractCache();
    // Sin evidencia gana .ts, que es lo que el recorder generaba hasta ahora.
    assert.equal(frameworkContract(buildFramework(CANONICAL)).importExtension, '.ts');
});

test('elige el alias mas especifico', () => {
    const aliases = { '@resources': 'resources', '@locators': 'resources/locators' };
    assert.equal(aliasImport('resources/locators/payment/x.json', aliases), '@locators/payment/x.json');
    assert.equal(aliasImport('resources/data/x.json', aliases), '@resources/data/x.json');
    assert.equal(aliasImport('otro/x.ts', aliases), undefined);
});

// La composicion es parte del contrato: sin ella el recorder no puede afirmar
// que `TypeLocator.<tipo> + valor` reconstruye el selector que grabo.
test('lee la tabla de composicion del framework, no de una convencion', () => {
    clearFrameworkContractCache();
    const contract = frameworkContract(buildFramework(CANONICAL));
    assert.deepEqual(contract.locatorComposition.android.ID, { prefix: '@@', suffix: '' });
    assert.deepEqual(contract.locatorComposition.android.ANDROID, { prefix: 'droid=', suffix: '' });
    assert.deepEqual(contract.locatorComposition.ios.PREDICATESTRING, { prefix: '-pred:', suffix: '' });
    assert.equal(contract.locatorComposition.android.PREDICATESTRING, undefined,
        'PREDICATESTRING no existe en Android: componerlo ahi seria inventar');
    assert.equal(composeLocator(contract, 'ANDROID', 'new UiSelector()', 'android'), 'droid=new UiSelector()');
    assert.equal(composeLocator(contract, 'CLASSCHAIN', '**/Button', 'android'), undefined);
});

test('avisa en vez de mentir cuando el framework no declara la composicion', () => {
    clearFrameworkContractCache();
    const layout = { ...CANONICAL };
    layout['support/utils/LocatorFactory.ts'] =
        'export default class LocatorFactory {\n  static getElement(a, b, c, d) { return b; }\n}\n';
    const contract = frameworkContract(buildFramework(layout));
    assert.equal(contract.warnings.some(warning => /composicion/.test(warning)), true);
    // Cae a la convencion, nunca a una tabla vacia que dejaria pasar cualquier tipo.
    assert.deepEqual(contract.locatorComposition.android.ID, { prefix: '~', suffix: '' });
});

// Misma trampa que en el mapa de helpers: el contrato se leía una vez y el
// mtime del directorio no cambia al editar un archivo dentro, así que agregar
// una estrategia al switch dejaba la tabla de composición congelada.
test('una estrategia nueva en el switch entra sin reiniciar', () => {
    clearFrameworkContractCache();
    const root = buildFramework(CANONICAL);
    assert.equal(frameworkContract(root).locatorComposition.android.CLASSNAME, undefined);

    const withClassName = provider('LocatorFactory').replace(
        '    case TypeLocator.ANDROID: return Constants.ANDROID_LOCATOR + value;',
        '    case TypeLocator.ANDROID: return Constants.ANDROID_LOCATOR + value;\n'
        + '    case TypeLocator.CLASSNAME: return Constants.ANDROID_LOCATOR + value;'
    );
    assert.notEqual(withClassName, provider('LocatorFactory'), 'el fixture tiene que cambiar de verdad');
    fs.writeFileSync(path.join(root, 'support/utils/LocatorFactory.ts'), withClassName);

    assert.deepEqual(
        frameworkContract(root).locatorComposition.android.CLASSNAME,
        { prefix: 'droid=', suffix: '' }
    );
});

test('un prefijo cambiado en las constantes entra sin reiniciar', () => {
    clearFrameworkContractCache();
    const root = buildFramework(CANONICAL);
    assert.deepEqual(frameworkContract(root).locatorComposition.android.ID, { prefix: '@@', suffix: '' });

    const constants = path.join(root, 'support/utils/constants.ts');
    fs.writeFileSync(constants, CONSTANTS.replace("static ID: string = '@@';", "static ID: string = '##';"));
    // El fixture reescribe el archivo en el mismo milisegundo y con el mismo
    // tamaño, algo que un guardado real nunca hace. Se adelanta el mtime para
    // representar la edición real en vez de un caso que no ocurre.
    const later = new Date(Date.now() + 1000);
    fs.utimesSync(constants, later, later);

    assert.deepEqual(frameworkContract(root).locatorComposition.android.ID, { prefix: '##', suffix: '' });
});
