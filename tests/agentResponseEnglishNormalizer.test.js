const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeAgentResponseEnglishIdentifiers,
} = require('../dist/core/automation');

function sampleResponse() {
    return {
        schemaVersion: '1.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        summary: 'sample',
        files: [
            {
                layer: 'feature',
                path: 'features/payment/demo.feature',
                content: [
                    'Feature: Demo',
                    '',
                    '  @payment @smoke @android',
                    '  Scenario Outline: demo',
                    '    When el usuario aplica <filtro>',
                    '    Then valida resultado',
                    '',
                    '    Examples:',
                    '      | filtro |',
                    '      | hoy |',
                    '',
                ].join('\n'),
            },
            {
                layer: 'steps',
                path: 'steps/payment/demo.steps.ts',
                content: [
                    'When(/^el usuario aplica <filtro>$/, async ({ filtro }) => {',
                    '  await demoScreen.applyFiltro(filtro);',
                    '});',
                    '',
                ].join('\n'),
            },
            {
                layer: 'screen',
                path: 'screenobjects/payment/demo.screen.ts',
                content: [
                    'export default class DemoScreen {',
                    '  public async applyFiltro(filtro: string) {',
                    '    return filtro;',
                    '  }',
                    '}',
                    '',
                ].join('\n'),
            },
            {
                layer: 'locators',
                path: 'locators/payment/demo.locator.json',
                content: JSON.stringify({
                    demoAndroid: {
                        filtroButton: {
                            type: 'id',
                            value: 'filtro',
                        },
                    },
                    demoIos: {},
                }, null, 2) + '\n',
            },
        ],
        resolutions: [],
    };
}

test('normalizes spanish identifiers consistently across generated layers', () => {
    const result = normalizeAgentResponseEnglishIdentifiers(sampleResponse());
    assert.equal(result.renamed.filtro, 'filter');

    const feature = result.response.files.find(file => file.layer === 'feature');
    const steps = result.response.files.find(file => file.layer === 'steps');
    const screen = result.response.files.find(file => file.layer === 'screen');
    const locators = result.response.files.find(file => file.layer === 'locators');

    assert.ok(feature.content.includes('<filter>'));
    assert.ok(feature.content.includes('| filter |'));
    assert.ok(!feature.content.includes('<filtro>'));

    assert.ok(steps.content.includes('{ filter }'));
    assert.ok(steps.content.includes('applyFilter(filter)'));
    assert.ok(!steps.content.includes('{ filtro }'));

    assert.ok(screen.content.includes('applyFilter(filter: string)'));
    assert.ok(!screen.content.includes('applyFiltro('));

    const locatorDoc = JSON.parse(locators.content);
    assert.ok(locatorDoc.demoAndroid.filterButton);
    assert.equal(locatorDoc.demoAndroid.filterButton.value, 'filtro');
    assert.equal(locatorDoc.demoAndroid.filtroButton, undefined);
});

test('skips rename entirely when english target already exists', () => {
    const response = sampleResponse();
    response.files.find(file => file.layer === 'steps').content = [
        'When(/^el usuario aplica <filtro>$/, async ({ filtro, filter }) => {',
        '  await demoScreen.applyFiltro(filtro);',
        '  return filter;',
        '});',
        '',
    ].join('\n');
    const result = normalizeAgentResponseEnglishIdentifiers(response);
    assert.equal(result.renamed.filtro, undefined);
    assert.ok(result.skipped.some(entry => entry.identifier === 'filtro' && entry.reason === 'collision'));
});

// Un identificador que ya existe en el framework (baseline de un archivo
// update) no se traduce: renombrar `titleVentas` a `salesTitle` destruia una
// clave existente (TC-10239: "elimina APIs existentes" + "selector inventado"
// sobre una salida correcta de Zorem).
test('no renombra identificadores heredados del baseline de un update', () => {
    const { inheritedIdentifiersOf } = require('../dist/core/automation');
    const inherited = inheritedIdentifiersOf([
        { layer: 'locators', content: JSON.stringify({ demoAndroid: { filtro: 'id=filtro', titleVentas: 'x' }, demoIos: {} }) },
    ]);
    assert.ok(inherited.has('filtro'));
    assert.ok(inherited.has('titleVentas'));
    const result = normalizeAgentResponseEnglishIdentifiers(sampleResponse(), { inheritedIdentifiers: inherited });
    assert.equal(result.renamed.filtro, undefined);
    assert.ok(result.skipped.some(item => item.identifier === 'filtro' && item.reason === 'inherited'));
    const locators = result.response.files.find(file => file.layer === 'locators');
    assert.match(locators.content, /"filtro"/);
});
