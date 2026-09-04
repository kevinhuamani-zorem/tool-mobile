const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modal = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/components/ScenarioBuilderModal.tsx'),
    'utf8',
);
const controller = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/controller/recorderController.js'),
    'utf8',
);
const review = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/features/review/reviewFeature.js'),
    'utf8',
);
const generation = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/features/generation/generationFeature.js'),
    'utf8',
);
// El pipeline de automatización se registra en automationHandlers.ts y cada
// paso vive en ipc/automation/*.ts; los contratos de texto se verifican sobre
// el conjunto.
const automationHandlers = [
    path.join(root, 'recorder/src/ipc/automationHandlers.ts'),
    ...fs.readdirSync(path.join(root, 'recorder/src/ipc/automation'))
        .filter(name => name.endsWith('.ts'))
        .sort()
        .map(name => path.join(root, 'recorder/src/ipc/automation', name)),
].map(file => fs.readFileSync(file, 'utf8')).join('\n');

test('wizard expone evidencia, análisis y revisión sin un paso bloqueante de generación', () => {
    assert.match(modal, /\['1', 'Evidencia'\]/);
    assert.match(modal, /\['2', 'Análisis'\]/);
    assert.match(modal, /\['3', 'Revisión'\]/);
    assert.doesNotMatch(modal, /\['3', 'Generación'\]/);
    assert.doesNotMatch(modal, /\['4', 'Revisión'\]/);
    assert.doesNotMatch(modal, /\['3', 'Agente'\]/);
    assert.doesNotMatch(modal, /PASO 5/);
    assert.match(modal, /Paso 1 de 3/);
});

test('generación automática muestra progreso visual y oculta controles técnicos', () => {
    assert.match(modal, /id="btnRunAutomationPipeline"/);
    assert.match(modal, /Generar borrador/);
    assert.match(modal, /id="automationWorkingState"/);
    assert.doesNotMatch(modal, /role="progressbar"/);
    assert.doesNotMatch(modal, /id="automationProgressTrack"/);
    assert.match(modal, /id="automationCorrectionReimport"/);
    assert.match(modal, /id="btnReimportAutomationCorrection"/);
    assert.match(modal, /Reimportar corrección del agente/);
    assert.match(modal, /id="btnStartAutomationCorrection"/);
    assert.match(modal, /Corregir con Copilot/);
    assert.match(modal, /id="btnDeferAutomationCorrection"/);
    assert.match(modal, /Dejar pendiente/);
    assert.match(modal, /El recorder detectó errores\. ¿Deseas corregirlos con Copilot\?/);
    assert.match(modal, /id="btnUsePreviousAutomation"/);
    assert.match(modal, /Usar generación anterior/);
    assert.doesNotMatch(modal, /id="automationPipelineStages"/);
    assert.doesNotMatch(modal, /Opciones avanzadas \/ diagnóstico/);
    assert.doesNotMatch(modal, /id="btnPrepareAutomation"/);
    assert.doesNotMatch(modal, /id="btnLaunchAutomation"/);
    assert.doesNotMatch(modal, /id="btnImportAutomation"/);
    assert.match(automationHandlers, /Si solicita permiso para leer o escribir el paquete, autorízalo/);
    assert.match(review, /progress\.detail/);
});

test('revisión agrupa validación y acciones sin repetir el resultado', () => {
    assert.match(modal, /className="review-approval-panel"/);
    assert.match(modal, /className="review-primary-actions"/);
    assert.match(modal, /id="btnPreview">↻ Revalidar/);
    assert.match(modal, /id="btnGenerate">Aplicar automatización/);
    assert.equal((modal.match(/id="lblGenerateResult"/g) || []).length, 1);
    assert.doesNotMatch(modal, /id="wizardGenerationResult"/);
    assert.doesNotMatch(controller, /wizardGenerationResult/);
    assert.match(modal, /id="qaObservationsPanel"/);
    assert.match(modal, /id="btnCopyQaReport"/);
    assert.match(review, /function renderQaObservations\(/);
    assert.match(review, /El locator conserva el texto real/);
});

test('controller corre pipeline automático con y sin resolución semántica', () => {
    assert.match(review, /const PRODUCT_STAGES = \[/);
    assert.match(review, /async function runAutomationPipeline\(\)/);
    assert.match(review, /if \(!prepare\.result\.responseAvailable\)/);
    assert.match(review, /const launched = await api\.launchAutomationAgent\(\{[\s\S]*?mode: 'automatic',[\s\S]*?qaRoastMode: isQaRoastModeEnabled\(\)/);
    assert.match(automationHandlers, /process\.env\.RECORDER_AGENT_PIPELINE === 'deterministic' \? 'deterministic' : 'layered'/);
    assert.match(automationHandlers, /new LayeredGenerationOrchestrator|layeredGenerationOrchestrator\.run/);
    assert.match(automationHandlers, /generationMode === 'layered'/);
    assert.match(review, /else if \(launched\.fallbackSuggested\) \{/);
    assert.match(review, /api\.launchAutomationAgent\(\{ mode: 'manual', autorun: true, model \}\)/);
    assert.doesNotMatch(review, /Abrir terminal manual/);
    assert.match(review, /await api\.getAutomationQaDecisions\(\);/);
    assert.match(review, /on\(btnConfirmQaDecision, 'click', async \(\) => \{/);
    assert.match(review, /await api\.resolveAutomationQaDecisions\(\{ decisions \}\);/);
    assert.match(review, /api\.onAutomationProgress\?\.\(progress => \{/);
    assert.match(review, /function updateAutomationProgress\(/);
    assert.doesNotMatch(review, /automationProgressTrack/);
    assert.match(review, /is-running/);
    assert.match(review, /is-complete/);
    assert.match(review, /function setCorrectionReimportVisible\(/);
    assert.match(review, /on\(btnReimportAutomationCorrection, 'click', async \(\) => \{/);
    assert.match(review, /on\(btnStartAutomationCorrection, 'click', async \(\) => \{/);
    assert.match(review, /on\(btnDeferAutomationCorrection, 'click', \(\) => \{/);
    assert.match(review, /Reimportando la corrección del agente/);
    assert.match(generation, /if \(isAutomationWorkflow\(\) && deps\.hasInvalidAutomationDraft\(\)\) await revalidateReviewedAutomation\(\);/);
    assert.match(generation, /else if \(isAutomationWorkflow\(\)\) await importAutomationResponse\(false\);/);
    assert.match(review, /const imported = await importAutomationResponse\(false, true\);/);
    assert.equal(
        (generation.match(/importAutomationResponse\(false\)/g) || []).length +
        (review.match(/importAutomationResponse\(false, true\)/g) || []).length,
        2
    );
    assert.match(review, /on\(btnUsePreviousAutomation, 'click', \(\) => \{/);
    assert.match(review, /generation\.showPreviewDocuments\(state\.invalidAutomationDraft, false, false\);/);
    assert.match(review, /api\.revalidateAutomationResponse\(reviewedContents\)/);
    assert.match(generation, /btnGenerate\.disabled = true/);
    assert.match(review, /updateProductStage\('READY_FOR_REVIEW'/);
    assert.doesNotMatch(review, /setWizardPage\(4\);/);
    assert.match(review, /wizardPage = Math\.max\(1, Math\.min\(3, page\)\)/);
    assert.match(review, /reviewOnly: true/);
    assert.match(review, /reviewAvailable: Boolean\(result\.draft\)/);
    assert.match(review, /await runAutomationPipeline\(\);/);
});

test('reimportar y revalidar rematerializan gap-resolutions cuando cambió', () => {
    assert.match(automationHandlers, /rematerializeGapResolutions\(packageDirectory: string\): boolean/);
    assert.match(
        automationHandlers,
        /ipcMain\.handle\('import-automation-response',[\s\S]*?rematerializeGapResolutions\(state\.activeAutomationPackage\)/,
    );
    assert.match(
        automationHandlers,
        /ipcMain\.handle\('revalidate-automation-response',[\s\S]*?const rematerialized = rematerializeGapResolutions/,
    );
    assert.match(automationHandlers, /lastMaterializedGapResolutionsHash/);
    assert.match(automationHandlers, /lastMaterializedAgentResponseHash/);
    assert.match(automationHandlers, /Copilot modificó agent-response\.json directamente/);
    assert.match(automationHandlers, /sha256File\(responseFile\)/);
    assert.match(review, /Procesando gap-resolutions\.json, regenerando la propuesta/);
    assert.match(review, /corrija gap-resolutions\.json/);
    assert.match(review, /borrador sigue disponible para editar y reimportar/);
    assert.match(automationHandlers, /const reviewOnly = input\?\.reviewOnly !== false/);
    assert.match(automationHandlers, /reviewOnly \|\| manualCorrection/);
    assert.match(
        automationHandlers,
        /manualCorrection[\s\S]*?trackRepair: false[\s\S]*?manualCorrection: true/,
    );
    assert.match(automationHandlers, /status\.manualCorrectionAttempts/);
});

test('main conserva Copilot visible para legacy y usa Derek con tres agentes headless', () => {
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
    assert.match(main, /new VisibleCopilotProvider\(copilotCliAdapter, automationAgentLauncher\)/);
    assert.match(main, /new LayeredGenerationOrchestrator\(\s*copilotCliAdapter,\s*copilotCliAdapter,/);
    assert.match(automationHandlers, /pipeline: 'derek-lorem-zorem-sumrak'/);
    assert.match(automationHandlers, /Derek coordina la generación/);
    assert.match(automationHandlers, /Lorem redacta Feature y Steps/);
    assert.match(automationHandlers, /Zorem construye Screen Object y Locators/);
    assert.match(automationHandlers, /Sumrak integra y revisa la automatización/);
    assert.doesNotMatch(main, /openExecutionMonitor\(activeAutomationPackage\)/);
    assert.match(review, /qaRoastMode: isQaRoastModeEnabled\(\)/);
    assert.match(review, /const imported = await importAutomationResponse\(true\);/);
    assert.match(review, /setWizardPage\(3\);/);
});

test('un error propiedad del planner libera el flujo y muestra el borrador para revalidar', () => {
    assert.match(automationHandlers, /PLANNER_REGENERATION_REQUIRED/);
    assert.match(automationHandlers, /trackRepair: false/);
    assert.match(review, /code === 'PLANNER_REGENERATION_REQUIRED'/);
    assert.match(review, /generation\.showPreviewDocuments\(launched\.draft, false, false\)/);
    assert.match(review, /const recovered = await importAutomationResponse\(true, true\)/);
    assert.match(review, /El plan necesita regenerarse o revisarse/);
});

test('una revisión funcional se muestra como sugerencia y no bloquea la automatización', () => {
    assert.match(modal, /id="testDesignSuggestionsPanel"/);
    assert.match(modal, /Son recomendaciones de Copilot\. No bloquean/);
    assert.match(modal, /id="btnImproveTestDesign"/);
    assert.doesNotMatch(review, /QA_TEST_DESIGN_REQUIRED/);
    assert.match(review, /renderTestDesignSuggestions\(launched\.testDesignReview \|\| null\)/);
    assert.match(review, /review\?\.status === 'suggestion'/);
    assert.match(modal, /Volver y mejorar la grabación/);
    assert.match(review, /Las sugerencias de Copilot son informativas y no invalidan la automatización/);
    assert.match(review, /const imported = await importAutomationResponse\(true\)/);
    assert.match(review, /setWizardPage\(3\)/);
});

test('QA Roast Mode es opcional y conserva el diagnóstico técnico', () => {
    const configurationScreen = fs.readFileSync(path.join(
        root, 'recorder/renderer/src/components/ConfigurationScreen.tsx'
    ), 'utf8');
    const preferences = fs.readFileSync(path.join(
        root, 'recorder/renderer/src/features/shared/recorderPreferences.js'
    ), 'utf8');

    assert.match(configurationScreen, /id="chkQaRoastMode"/);
    assert.match(configurationScreen, /QA Roast Mode/);
    assert.match(preferences, /getItem\(QA_ROAST_MODE_STORAGE_KEY\) === 'true'/);
    assert.match(preferences, /removeItem\(QA_ROAST_MODE_STORAGE_KEY\)/);
    assert.match(review, /isQaRoastModeEnabled\(\)/);
    assert.match(review, /review\.roast/);
    assert.match(review, /testDesignSuggestionRoast\.textContent = review\.roast/);
    assert.doesNotMatch(review, /TEST_DESIGN_ROASTS/);
    assert.match(modal, /Sugerencias de diseño del caso/);
});

test('el roast se genera en otra sesión y nunca bloquea el diagnóstico semántico', () => {
    const orchestrator = fs.readFileSync(path.join(
        root, 'core/automation/infrastructure/agent/prompts.ts'
    ), 'utf8');

    assert.match(orchestrator, /No incluyas roast ni contenido humorístico/);

    const contracts = fs.readFileSync(path.join(
        root, 'core/automation/domain/qaRoastContracts.ts'
    ), 'utf8');
    assert.match(contracts, /SARCASTIC_PUNCHLINE/);
    assert.match(contracts, /Critica el caso, nunca a la persona/);

    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
    const handlers = automationHandlers;
    assert.match(main, /new CopilotQaRoastGenerator\(copilotCliAdapter\)/);
    assert.match(handlers, /input\?\.qaRoastMode/);
    assert.match(handlers, /qaRoastGenerator\.generate/);
});
