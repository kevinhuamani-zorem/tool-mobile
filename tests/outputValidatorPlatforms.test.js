const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { OutputValidator } = require('../dist/core/validation');
const { projectPaths } = require('../dist/core/workspace');

function preview(locatorContent) {
    const marker = `platform-${process.pid}-${Math.random().toString(16).slice(2)}`;
    const featurePath = path.join(projectPaths.features, `${marker}.feature`);
    const locatorPath = path.join(projectPaths.locators, `${marker}.locator.json`);
    return {
        featurePath,
        featureContent: 'Feature: Cobertura parcial\n\n@miflujo @android\nScenario: [TC-10239][Happy Path][AUTO-FRONT] Caso\n  Then visualiza el resultado\n',
        locatorPath,
        locatorContent,
        files: [featurePath, locatorPath],
    };
}

test('acepta locators Android-only y deja iOS como cobertura pendiente', () => {
    const result = new OutputValidator().validate(preview(JSON.stringify({
        movementsAndroid: { showMovements: 'new UiSelector().text("Movimientos")' },
    })), 'android');

    assert.equal(result.errors.some(error => /bloque iOS/i.test(error)), false);
    assert.equal(result.valid, true);
    assert.equal(result.warnings.some(warning => /Cobertura iOS pendiente/.test(warning)), true);
});

test('acepta locators iOS-only y deja Android como cobertura pendiente', () => {
    const candidate = preview(JSON.stringify({
        movementsIos: { showMovements: 'Movimientos' },
    }));
    candidate.featureContent = candidate.featureContent.replace('@android', '@ios');
    const result = new OutputValidator().validate(candidate, 'ios');

    assert.equal(result.errors.some(error => /bloque Android/i.test(error)), false);
    assert.equal(result.valid, true);
    assert.equal(result.warnings.some(warning => /Cobertura Android pendiente/.test(warning)), true);
});

test('bloquea únicamente cuando falta el bloque de la plataforma grabada', () => {
    const result = new OutputValidator().validate(preview(JSON.stringify({
        movementsIos: { showMovements: 'Movimientos' },
    })), 'android');

    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error === 'Locators sin bloque Android activo'), true);
});

test('rechaza And y But como funciones TypeScript de Cucumber', () => {
    const candidate = preview(JSON.stringify({
        movementsAndroid: { showMovements: '~Movimientos' },
    }));
    candidate.stepPath = path.join(projectPaths.stepDefinitions, 'payment', 'invalid-and.steps.ts');
    candidate.stepContent = [
        "import { Given, And } from '@cucumber/cucumber';",
        "Given(/^inicio$/, async () => {});",
        "And(/^continúa$/, async () => {});",
    ].join('\n');
    candidate.files.push(candidate.stepPath);

    const result = new OutputValidator().validate(candidate, 'android');

    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => /And\/But como función TypeScript/.test(error)), true);
});
