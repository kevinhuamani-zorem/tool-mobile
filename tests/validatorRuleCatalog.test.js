const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    validatorRuleCodesFromSource,
    buildValidationRuleContractFromSource,
} = require('../dist/core/validation');
const {
    buildValidationRuleContractFromFile,
    defaultValidatorSourcePath,
    readValidatorRuleSource,
    validatorRuleSourcePaths,
} = require('../dist/core/validation');

test('el contrato declara todos los códigos que emite el validador', () => {
    const sourcePath = defaultValidatorSourcePath();
    // Las reglas viven en familias separadas: la fuente del contrato es el
    // orquestador mas su directorio `rules/`, no un unico archivo.
    const source = readValidatorRuleSource(sourcePath);
    const emitted = validatorRuleCodesFromSource(source);
    const contract = buildValidationRuleContractFromFile(sourcePath);
    const declared = contract.rules.map(rule => rule.code).sort();
    assert.deepEqual(declared, emitted);
    assert.deepEqual(contract, buildValidationRuleContractFromSource(source));
});

test('la fuente del contrato incluye cada familia de reglas del validador', () => {
    const sourcePath = defaultValidatorSourcePath();
    const paths = validatorRuleSourcePaths(sourcePath);
    assert.equal(paths[0], sourcePath, 'el orquestador encabeza la fuente');
    const families = [
        'envelopeRules',
        'syntaxRules',
        'completionRules',
        'layerRules',
        'gapRules',
        'locatorContractRules',
        'existingAutomationRules',
        'outputRules',
        'gherkinQualityRules',
        'codeStructureRules',
        'updateSafetyRules',
        'frameworkCollisionRules',
    ];
    const extension = path.extname(sourcePath);
    for (const family of families) {
        assert.ok(
            paths.some(candidate => path.basename(candidate) === `${family}${extension}`),
            `Falta la familia ${family} en la fuente del contrato`
        );
    }
    // El orquestador ya no declara reglas de contenido: solo compone familias.
    // Conserva `preview` porque es su propio contrato, el fallo al construir el
    // preview o al leer el framework. Cualquier otro codigo que reaparezca aqui
    // es una regla que se escapo de su familia.
    assert.deepEqual(
        validatorRuleCodesFromSource(fs.readFileSync(sourcePath, 'utf8')),
        ['preview'],
        'las reglas de contenido viven en rules/, no en el orquestador'
    );
    const emitted = validatorRuleCodesFromSource(readValidatorRuleSource(sourcePath));
    assert.ok(emitted.length > 40, `El contrato quedo con ${emitted.length} codigos`);
});

test('automation package publica validation-contract.json', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'core', 'automation', 'infrastructure', 'automationPackageBuilder.ts'),
        'utf8'
    );
    assert.match(source, /validation-contract\.json/);
});

test('el paquete informa al agente el alias semantico y la notacion de punto para locators', () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'core', 'automation', 'infrastructure', 'automationPackageBuilder.ts'),
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
        'generic-template-gherkin',
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
