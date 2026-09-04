'use strict';
// Aplica al framework una respuesta validada tal como lo hace el handler
// `generate-automation-response`: valida, evalua el registro de archivos
// administrados, convierte las capas `update` en un patch aditivo, escribe
// las capas `create` y registra todo. Espejo del flujo de
// recorder/src/ipc/automationHandlers.ts (sin completions).
const fs = require('node:fs');
const path = require('node:path');
const {
    AutomationPatchWriter,
    GeneratedFileRegistry,
    featureAdditions,
    locatorAdditions,
    screenAdditions,
    stepsAdditions,
} = require('../../dist/core/automation');
const { FwkMobileGenerator } = require('../../dist/core/generation');
const { AutomationResponseValidator } = require('../../dist/core/validation');
const { projectPaths } = require('../../dist/core/workspace');

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function applyAutomationResponse(packageDirectory) {
    const frameworkRoot = projectPaths.frameworkRoot;
    const scenario = readJson(path.join(packageDirectory, 'scenario.json'));
    const plan = readJson(path.join(packageDirectory, 'generation-plan.json'));
    const response = readJson(path.join(packageDirectory, 'agent-response.json'));
    if ((response.completions || []).length) {
        throw new Error('Este helper no aplica completions; usa el handler real.');
    }
    const validator = new AutomationResponseValidator();
    const validation = validator.validate(scenario, plan, response);
    if (!validation.valid) {
        throw new Error(`Respuesta invalida: ${validation.errors.map(error => error.message).join(' | ')}`);
    }
    const preview = validator.toPreview(response);
    const registry = new GeneratedFileRegistry();
    const managed = registry.assess(preview, scenario.squad, plan.files);
    if (managed.conflicts.length) {
        throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
    }
    const contentOf = layer => response.files.find(file => file.layer === layer)?.content;
    const read = relative => fs.readFileSync(path.join(frameworkRoot, relative), 'utf-8');
    const exists = relative => fs.existsSync(path.join(frameworkRoot, relative));
    const updates = new Map(plan.files
        .filter(file => file.operation === 'update')
        .map(file => [file.layer, file.path]));
    const input = { recordingId: scenario.recordingId, createdAt: new Date().toISOString() };
    const locatorsPath = updates.get('locators');
    if (locatorsPath && contentOf('locators') && exists(locatorsPath)) {
        input.locators = { file: locatorsPath, additions: locatorAdditions(read(locatorsPath), contentOf('locators')), completions: [] };
    }
    const screenPath = updates.get('screen');
    if (screenPath && contentOf('screen') && exists(screenPath)) {
        input.screen = { file: screenPath, ...screenAdditions(read(screenPath), contentOf('screen')) };
    }
    const stepsPath = updates.get('steps');
    if (stepsPath && contentOf('steps') && exists(stepsPath)) {
        const { definitions, imports } = stepsAdditions(read(stepsPath), contentOf('steps'));
        input.steps = { file: stepsPath, definitions, screenImport: imports[0] };
    }
    const featurePath = updates.get('feature');
    if (featurePath && contentOf('feature') && exists(featurePath)) {
        const block = featureAdditions(read(featurePath), contentOf('feature'));
        if (block) input.feature = { file: featurePath, scenario: block };
    }
    const outcomes = new AutomationPatchWriter().apply(input, frameworkRoot);
    const patchedAbsolute = new Set(outcomes.map(outcome => path.join(frameworkRoot, outcome.file)));
    const createOnly = { ...preview, files: preview.files.filter(file => !patchedAbsolute.has(file)) };
    const generated = new FwkMobileGenerator().writePreview(
        createOnly,
        new Set([...managed.writable].filter(file => !patchedAbsolute.has(file))),
    );
    registry.register(generated, scenario.squad, plan.files);
    for (const outcome of outcomes) {
        if (!outcome.added.length) continue;
        registry.registerPatch(path.join(frameworkRoot, outcome.file), scenario.squad, scenario.recordingId, outcome.added);
    }
    return { scenario, plan, response, validation, generated, outcomes, registry };
}

module.exports = { applyAutomationResponse };
