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
const automationHandlers = fs.readFileSync(
    path.join(root, 'recorder/src/ipc/automationHandlers.ts'),
    'utf8',
);

test('wizard expone flujo de producto en 4 pasos y oculta agente del happy path', () => {
    assert.match(modal, /\['1', 'Evidencia'\]/);
    assert.match(modal, /\['2', 'Análisis'\]/);
    assert.match(modal, /\['3', 'Generación'\]/);
    assert.match(modal, /\['4', 'Revisión'\]/);
    assert.doesNotMatch(modal, /\['3', 'Agente'\]/);
    assert.doesNotMatch(modal, /PASO 5/);
    assert.match(modal, /Paso 1 de 4/);
});

test('generación automática muestra progreso visual y oculta controles técnicos', () => {
    assert.match(modal, /id="btnRunAutomationPipeline"/);
    assert.match(modal, /Iniciar generación automática/);
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
    assert.match(modal, /data-product-stage="ANALYZING"/);
    assert.match(modal, /data-product-stage="VALIDATING"/);
    assert.match(modal, /data-product-stage="READY_FOR_REVIEW"/);
    assert.doesNotMatch(modal, /Opciones avanzadas \/ diagnóstico/);
    assert.doesNotMatch(modal, /id="btnPrepareAutomation"/);
    assert.doesNotMatch(modal, /id="btnLaunchAutomation"/);
    assert.doesNotMatch(modal, /id="btnImportAutomation"/);
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
    assert.match(review, /const launched = await api\.launchAutomationAgent\(\{ mode: 'automatic' \}\);/);
    assert.match(review, /else if \(launched\.fallbackSuggested\) \{/);
    assert.match(review, /api\.launchAutomationAgent\(\{ mode: 'manual', autorun: true \}\)/);
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
    assert.match(review, /setWizardPage\(4\);/);
    assert.match(review, /wizardPage = Math\.max\(1, Math\.min\(4, page\)\)/);
    assert.match(review, /await runAutomationPipeline\(\);/);
});

test('reimportar y revalidar rematerializan gap-resolutions cuando cambió', () => {
    assert.match(automationHandlers, /function rematerializeGapResolutions\(/);
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
    assert.match(review, /correcciones manuales no tienen límite/);
    assert.match(
        automationHandlers,
        /manualCorrection[\s\S]*?trackRepair: false[\s\S]*?manualCorrection: true/,
    );
    assert.match(automationHandlers, /status\.manualCorrectionAttempts/);
});

test('main usa Copilot visible y deja que el pipeline importe la respuesta validada', () => {
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
    assert.match(main, /new VisibleCopilotProvider\(copilotCliAdapter, automationAgentLauncher\)/);
    assert.doesNotMatch(main, /openExecutionMonitor\(activeAutomationPackage\)/);
    assert.match(review, /const launched = await api\.launchAutomationAgent\(\{ mode: 'automatic' \}\);/);
    assert.match(review, /const imported = await importAutomationResponse\(true\);/);
    assert.match(review, /setWizardPage\(4\);/);
});

test('un error propiedad del planner libera el flujo y muestra el borrador para revalidar', () => {
    assert.match(automationHandlers, /PLANNER_REGENERATION_REQUIRED/);
    assert.match(automationHandlers, /trackRepair: false/);
    assert.match(review, /code === 'PLANNER_REGENERATION_REQUIRED'/);
    assert.match(review, /generation\.showPreviewDocuments\(launched\.draft, false, false\)/);
    assert.match(review, /El plan necesita regenerarse o revisarse/);
});

test('una revisión funcional bloqueante explica el problema y devuelve al QA a la grabación', () => {
    assert.match(review, /QA_TEST_DESIGN_REQUIRED/);
    assert.match(review, /showTestDesignReview/);
    assert.match(review, /La grabación no demuestra el resultado esperado/);
    assert.match(review, /Volver y corregir la grabación/);
    assert.match(review, /Agrega las validaciones funcionales indicadas/);
});
