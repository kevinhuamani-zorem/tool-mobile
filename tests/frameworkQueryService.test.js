const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CodeGraph } = require('../dist/core/codeGraph');
const { FrameworkQueryService } = require('../dist/core/frameworkQueryService');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'framework-query-'));
    const write = (relative, content) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
        return file;
    };
    write('features/yape-features/payment/movements.feature', `Feature: Movimientos
  Scenario Outline: [TC-1][Happy Path][AUTO-FRONT] Consultar movimientos
    When el usuario consulta movimientos
    Then visualiza sus movimientos
    Examples:
      | username |
      | QA User  |
`);
    write('features/yape-steps-definitions/payment/movements.steps.ts', `
import movementsScreen from '@screenobjects/payment/movements.screen.ts';
When(/^el usuario consulta movimientos$/, async () => { await movementsScreen.openMovements(); });
Then(/^visualiza sus movimientos$/, async () => { await movementsScreen.expectMovements(); });
`);
    write('screenobjects/payment/movements.screen.ts', `
import Locators from '@locators/payment/movements.locator.json' with { type: 'json' };
class MovementsScreen {
  public async openMovements(): Promise<void> { return this.button; }
  public async expectMovements(): Promise<void> { return this.title; }
  get button() { return Locators.movementsAndroid.openMovements; }
  get title() { return Locators.movementsAndroid.title; }
}
`);
    const locator = write('resources/locators/payment/movements.locator.json', JSON.stringify({
        movementsAndroid: { openMovements: '~Movimientos', title: '~Título movimientos' },
        movementsIos: { openMovements: '~Movements', title: '' },
    }));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: {
        '@screenobjects/*': ['screenobjects/*'], '@locators/*': ['resources/locators/*'],
    } } }));
    const cacheFile = path.join(root, '.cache', 'codegraph.json');
    const create = () => {
        const graph = new CodeGraph({ frameworkRoot: root, cacheFile });
        return new FrameworkQueryService(graph, root);
    };
    return { root, locator, cacheFile, create };
}

test('expone las ocho consultas con resultados estructurados y sin archivos completos', () => {
    const fx = fixture();
    const service = fx.create();
    const cases = [
        service.inspectScenario({ squad: 'payment', term: 'movimientos' }),
        service.findExistingScreen({ squad: 'payment', term: 'movements' }),
        service.findExistingStep({ squad: 'payment', term: 'consulta movimientos' }),
        service.findExample({ squad: 'payment', term: 'movimientos' }),
        service.findLocator({ squad: 'payment', term: 'openMovements' }),
        service.getContract(),
        service.getHelperApi(),
        service.validateImports({ imports: ['@screenobjects/payment/movements.screen.ts', '../../screen.ts'] }),
    ];
    for (const response of cases) {
        assert.equal(response.success, true, response.query);
        assert.equal(Array.isArray(response.items), true);
        assert.equal(Array.isArray(response.relations), true);
        assert.equal(typeof response.metrics.filesExamined, 'number');
        assert.equal(JSON.stringify(response).includes('class MovementsScreen {'), false);
    }
    assert.ok(cases[1].items.some(item => item.signature || item.type === 'screenObject'));
    assert.ok(cases[3].items.some(item => item.metadata.rowCount === 1));
    assert.ok(cases[4].items.some(item => item.metadata.androidSelector === '~Movimientos'));
    assert.equal(cases[7].items[1].metadata.valid, false);
});

test('valida cache frío, caliente y actualización incremental', () => {
    const fx = fixture();
    const cold = fx.create().findLocator({ squad: 'payment', term: 'openMovements' });
    assert.equal(cold.metrics.cacheHit, false);
    assert.ok(cold.metrics.filesRead >= 4);
    assert.ok(cold.metrics.bytesRead > 0);

    const hot = fx.create().findLocator({ squad: 'payment', term: 'openMovements' });
    assert.equal(hot.metrics.cacheHit, true);
    assert.equal(hot.metrics.filesRead, 0);

    const content = JSON.parse(fs.readFileSync(fx.locator, 'utf-8'));
    content.movementsAndroid.filter = '~Filtrar';
    fs.writeFileSync(fx.locator, JSON.stringify(content));
    const incremental = fx.create().findLocator({ squad: 'payment', term: 'filter' });
    assert.equal(incremental.metrics.cacheHit, false);
    assert.ok(incremental.metrics.filesRead >= 1);
    assert.ok(incremental.items.some(item => item.name === 'filter'));
});

test('aplica límites de resultados y bytes y maneja consultas inválidas', () => {
    const fx = fixture();
    const limited = fx.create().inspectScenario({
        squad: 'payment', term: 'movimientos', limit: 1, maxBytes: 1200,
    });
    assert.ok(limited.items.length <= 1);
    assert.ok(limited.metrics.returnedBytes <= 1200);

    const invalid = fx.create().execute('not-supported', {});
    assert.equal(invalid.success, false);
    assert.equal(invalid.error.code, 'framework-query-failed');
    assert.equal(invalid.items.length, 0);
});
