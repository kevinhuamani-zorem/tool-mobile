const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    buildValidationRuleContractFromFile,
    defaultValidatorSourcePath,
    validatorRuleCodesFromSource,
} = require('../dist/core/validatorRuleCatalog');

test('el contrato declara todos los códigos que emite el validador', () => {
    const sourcePath = defaultValidatorSourcePath();
    const source = fs.readFileSync(sourcePath, 'utf8');
    const emitted = validatorRuleCodesFromSource(source);
    const contract = buildValidationRuleContractFromFile(sourcePath);
    const declared = contract.rules.map(rule => rule.code).sort();
    assert.deepEqual(declared, emitted);
});

test('automation package publica validation-contract.json', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'core', 'automationPackageBuilder.ts'),
        'utf8'
    );
    assert.match(source, /validation-contract\.json/);
});

test('el paquete informa al agente el alias semantico y la notacion de punto para locators', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'core', 'automationPackageBuilder.ts'),
        'utf8'
    );
    assert.match(source, /notation:\s*'dot-only'/);
    assert.match(source, /LocatorMovements\.movementsAndroid\.showMovements/);
    assert.match(source, /LocatorMovements\.movementsIos\.showMovements/);
    assert.match(source, /locatorContract\.modules/);
    assert.match(source, /charset:\s*'UTF-8'/);
    assert.match(source, /unicodeNormalization:\s*'NFC'/);
    assert.match(source, /preserveDiacritics:\s*true/);
});

test('el contrato publica requisitos positivos y ejemplo minimo por regla', () => {
    const contract = buildValidationRuleContractFromFile(defaultValidatorSourcePath());
    const withoutExample = contract.rules.filter(rule => !rule.minimalExample);
    assert.equal(withoutExample.length, 0, `Reglas sin ejemplo: ${withoutExample.map(rule => rule.code).join(', ')}`);
    const nonPositive = contract.rules
        .filter(rule => !/\b(debe|deben|tiene que|incluye|usar|usar)\b/i.test(rule.requirement));
    assert.equal(nonPositive.length, 0, `Reglas sin requisito positivo: ${nonPositive.map(rule => rule.code).join(', ')}`);
    const critical = new Set([
        'assertion',
        'imperative-gherkin',
        'non-english-identifier',
        'platform-coverage',
        'missing-examples',
        'invented-selector',
        'reused-step-rewritten',
        'ungrouped-technical-action',
        'verbatim-context-hint',
    ]);
    for (const code of critical) {
        const rule = contract.rules.find(entry => entry.code === code);
        assert.ok(rule, `Falta regla critica ${code}`);
        assert.ok(rule.minimalExample && rule.minimalExample.length > 0, `Falta ejemplo en ${code}`);
    }
});
