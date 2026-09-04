'use strict';
// Aplica al framework una respuesta validada por el mismo camino que el
// handler `generate-automation-response`: `AutomationApplier` en core.
const fs = require('node:fs');
const path = require('node:path');
const { AutomationApplier } = require('../../dist/core/automation');
const { AutomationResponseValidator } = require('../../dist/core/validation');

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function applyAutomationResponse(packageDirectory) {
    const scenario = readJson(path.join(packageDirectory, 'scenario.json'));
    const plan = readJson(path.join(packageDirectory, 'generation-plan.json'));
    const response = readJson(path.join(packageDirectory, 'agent-response.json'));
    const validator = new AutomationResponseValidator();
    const validation = validator.validate(scenario, plan, response);
    if (!validation.valid) {
        throw new Error(`Respuesta invalida: ${validation.errors.map(error => error.message).join(' | ')}`);
    }
    const preview = validator.toPreview(response);
    const applier = new AutomationApplier();
    const { generated, patched, managed } = applier.apply(scenario, plan, response, preview);
    return { scenario, plan, response, validation, generated, outcomes: patched.outcomes, managed };
}

module.exports = { applyAutomationResponse };
