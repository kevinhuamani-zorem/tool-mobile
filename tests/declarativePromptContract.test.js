const test = require('node:test');
const assert = require('node:assert/strict');
const { buildValidationRuleContractFromFile, defaultValidatorSourcePath } = require('../dist/core/validation');
const { gherkinBusinessWordingProblem } = require('../dist/core/automation/contracts');
const { expandExampleRow, matchingStepDefinitions, stepDefinitionRegExp } = require('../dist/core/shared');

// Exercise the actual examples handed to authors against the production wording
// and Cucumber matching contracts, without prescribing implementation prose.
function guidance(code) {
    const value = buildValidationRuleContractFromFile(defaultValidatorSourcePath()).rules.find(rule => rule.code === code);
    assert.ok(value?.minimalExample, `No example delivered for ${code}`);
    return value.minimalExample;
}

test('los ejemplos nuevos del contrato cumplen la misma redacción declarativa que exige el validador', () => {
    for (const code of ['imperative-gherkin', 'step-ambiguous', 'step-undefined', 'verbatim-context-hint']) {
        const lines = guidance(code).split('\n').filter(line => /^(?:Given|When|Then|And|But)\s/.test(line));
        assert.ok(lines.length > 0, `No Gherkin example in ${code}`);
        for (const line of lines) {
            assert.equal(gherkinBusinessWordingProblem(line), undefined, `${code}: ${line}`);
        }
    }
});

test('reformular los ejemplos conserva sus bindings y evita la definición heredada que atrapaba el correo', () => {
    const foreign = { expression: '^el usuario ingresa su (.*) y (.*)$' };
    for (const code of ['step-ambiguous', 'step-undefined']) {
        const example = guidance(code);
        const line = example.split('\n').find(line => /^(?:Given|When|Then)\s/.test(line));
        const definition = example.match(/(?:Given|When|Then)\(\/(\^.+?\$)\//);
        assert.ok(line && definition, `${code} must teach a bound Feature/Steps pair`);
        const own = { expression: definition[1] };
        const expanded = expandExampleRow(line, { email: 'qa@example.invalid' });
        const matches = matchingStepDefinitions(expanded, [foreign, own]);
        assert.deepEqual(matches, [own], `${code}: declaration is neither missing nor ambiguous`);
        if (line.includes('<email>')) {
            const captures = stepDefinitionRegExp(own.expression).exec(expanded.replace(/^\w+\s+/, ''));
            assert.equal(captures?.[1], 'qa@example.invalid', 'the real parameter must survive the wording change');
        }
    }
});
