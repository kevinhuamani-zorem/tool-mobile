const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    frameworkContract, clearFrameworkContractCache, aliasImport,
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
    'support/utils/LocatorFactory.ts': 'export default class LocatorFactory {}\n',
    'support/utils/Enums.ts': 'export enum TypeLocator { XPATH }\n',
};

test('resuelve los anclajes desde el framework, no desde una constante', () => {
    clearFrameworkContractCache();
    const contract = frameworkContract(buildFramework(CANONICAL));
    assert.equal(contract.baseScreenImport, '@screenobjects/commons/base.screen.ts');
    assert.equal(contract.locatorFactoryImport, '@utils/LocatorFactory.ts');
    assert.equal(contract.typeLocatorImport, '@utils/Enums.ts');
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
        'support/helpers/LocatorFactory.ts': 'export default class LocatorFactory {}\n',
        'support/helpers/Enums.ts': 'export enum TypeLocator { XPATH }\n',
    });
    fs.rmSync(path.join(root, 'screenobjects/commons/base.screen.ts'));
    fs.rmSync(path.join(root, 'support/utils'), { recursive: true });

    const contract = frameworkContract(root);
    assert.equal(contract.baseScreenImport, '@screenobjects/base/AbstractScreen.ts');
    assert.equal(contract.baseScreenClass, 'AbstractScreen');
    assert.equal(contract.locatorFactoryImport, '@helpers/LocatorFactory.ts');
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

test('elige el alias mas especifico', () => {
    const aliases = { '@resources': 'resources', '@locators': 'resources/locators' };
    assert.equal(aliasImport('resources/locators/payment/x.json', aliases), '@locators/payment/x.json');
    assert.equal(aliasImport('resources/data/x.json', aliases), '@resources/data/x.json');
    assert.equal(aliasImport('otro/x.ts', aliases), undefined);
});
