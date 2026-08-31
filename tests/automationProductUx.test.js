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
});

test('controller corre pipeline automático con y sin resolución semántica', () => {
    assert.match(controller, /const PRODUCT_STAGES = \[/);
    assert.match(controller, /async function runAutomationPipeline\(\)/);
    assert.match(controller, /if \(!prepare\.result\.responseAvailable\)/);
    assert.match(controller, /const launched = await api\.launchAutomationAgent\(\{ mode: 'automatic' \}\);/);
    assert.match(controller, /else if \(launched\.fallbackSuggested\) \{/);
    assert.doesNotMatch(controller, /mode: 'manual'/);
    assert.doesNotMatch(controller, /Abrir terminal manual/);
    assert.match(controller, /await api\.getAutomationQaDecisions\(\);/);
    assert.match(controller, /btnConfirmQaDecision\?\.addEventListener\('click', async \(\) => \{/);
    assert.match(controller, /await api\.resolveAutomationQaDecisions\(\{ decisions \}\);/);
    assert.match(controller, /api\.onAutomationProgress\?\.\(progress => \{/);
    assert.match(controller, /function updateAutomationProgress\(/);
    assert.doesNotMatch(controller, /automationProgressTrack/);
    assert.match(controller, /is-running/);
    assert.match(controller, /is-complete/);
    assert.match(controller, /function setCorrectionReimportVisible\(/);
    assert.match(controller, /btnReimportAutomationCorrection\?\.addEventListener\('click'/);
    assert.match(controller, /Reimportando la corrección del agente/);
    assert.match(controller, /const imported = await importAutomationResponse\(true\);/);
    assert.match(controller, /updateProductStage\('READY_FOR_REVIEW'/);
    assert.match(controller, /setWizardPage\(4\);/);
    assert.match(controller, /wizardPage = Math\.max\(1, Math\.min\(4, page\)\)/);
    assert.match(controller, /await runAutomationPipeline\(\);/);
});

test('main usa Copilot visible y deja que el pipeline importe la respuesta validada', () => {
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
    assert.match(main, /new VisibleCopilotProvider\(copilotCliAdapter, automationAgentLauncher\)/);
    assert.doesNotMatch(main, /openExecutionMonitor\(activeAutomationPackage\)/);
    assert.match(controller, /const launched = await api\.launchAutomationAgent\(\{ mode: 'automatic' \}\);/);
    assert.match(controller, /const imported = await importAutomationResponse\(true\);/);
    assert.match(controller, /setWizardPage\(4\);/);
});
