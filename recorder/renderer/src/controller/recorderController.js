// [visual-recorder] Composition root del renderer. Construye el estado
// compartido, instancia cada feature bajo `../features/<nombre>/` con sus
// dependencias explícitas y monta sus listeners exactamente una vez. Ver
// docs/ARCHITECTURE.md — sección "Renderer" — para el mapa completo de
// responsabilidades por feature.
//
// El renderer solo consume `window.api`; nunca importa módulos de `core/` ni
// APIs de Node/Electron (ver ADR-0001, paso 9).

import { createConfigurationFeature } from '../features/configuration/configurationFeature.js';
import { createInspectorFeature } from '../features/inspector/inspectorFeature.js';
import { createRecordingFeature } from '../features/recording/recordingFeature.js';
import { createPlatformCompletionFeature } from '../features/platform-completion/platformCompletionFeature.js';
import { createGenerationFeature } from '../features/generation/generationFeature.js';
import { createReviewFeature } from '../features/review/reviewFeature.js';

let activeFeatures = null;

/**
 * Crea el contexto compartido del renderer: estado de sesión, captura de
 * selector y generación que más de una feature necesita leer/escribir por
 * referencia. Cada campo tiene un único dueño documentado en el módulo que lo
 * muta primero; el resto solo lo consulta.
 */
function createSharedState() {
    const state = {
        // configuration
        activeWorkspace: { mode: 'fwk-mobile', label: 'fwk-mobile-test', root: '', integrated: true },
        frameworkCatalog: null,
        sessionPlatform: 'android',
        sessionReady: Promise.resolve(),
        resetSessionReady() {
            state.sessionReady = new Promise(resolve => { state._markSessionReady = resolve; });
        },
        markSessionReady() {
            state._markSessionReady?.();
        },
        // inspector / captura de selector (compartido con recording y platform-completion)
        verifiedSelector: '',
        selectorCandidateToken: '',
        deviceW: 1080,
        deviceH: 2340,
        // platform-completion
        squadCatalog: { stepDefinitions: [], screenMethods: [], locators: [], features: [] },
        currentAssignment: null,
        selectedCatalogLocator: null,
        activeScenarioCoverage: null,
        recordingScenarioCatalog: [],
        advanceAssignmentAfterSave: false,
        workflowMode: 'new',
        // generation
        previewDocuments: [],
        lastPreviewToken: '',
        activePreviewDocumentIndex: -1,
        linkedScenarioData: null,
        // review
        automationWorkflow: false,
        invalidAutomationDraft: null,
    };
    return state;
}

export async function initializeRecorder() {
    const api = window.api;
    const state = createSharedState();

    const lblStatus = document.getElementById('lblStatus');
    const lblConfigSt = document.getElementById('lblConfigStatus');
    const lblLocatorCatalog = document.getElementById('lblLocatorCatalog');
    const screenConfig = document.getElementById('screenConfig');
    const screenRecorder = document.getElementById('screenRecorder');
    const btnInspect = document.getElementById('btnInspect');
    const btnInteract = document.getElementById('btnInteract');
    const btnXmlInspector = document.getElementById('btnXmlInspector');
    const btnExecute = document.getElementById('btnExecute');
    const btnRefreshScr = document.getElementById('btnRefreshScreen');
    const txtFeature = document.getElementById('txtFeature');
    const txtScenario = document.getElementById('txtScenario');
    const txtFeatureFile = document.getElementById('txtFeatureFile');
    const txtLocatorModule = document.getElementById('txtLocatorModule');
    const txtCaseId = document.getElementById('txtCaseId');
    const txtFeatureTag = document.getElementById('txtFeatureTag');
    const txtDataName = document.getElementById('txtDataName');
    const cmbPathType = document.getElementById('cmbPathType');
    const txtAutomationObjective = document.getElementById('txtAutomationObjective');
    const txtAutomationAcceptance = document.getElementById('txtAutomationAcceptance');

    function setStatus(msg, color) {
        if (!lblStatus) return;
        lblStatus.textContent = msg;
        lblStatus.style.color = color || '#888AAA';
    }

    function setConfigStatus(msg, type) {
        if (!lblConfigSt) return;
        lblConfigSt.textContent = msg;
        lblConfigSt.className = 'config-status' + (type ? ' ' + type : '');
    }

    function setRecorderConnecting(connecting) {
        [btnInspect, btnInteract, btnXmlInspector, btnExecute, btnRefreshScr]
            .filter(Boolean)
            .forEach(button => { button.disabled = connecting; });
    }

    /** Rellena la metadata de un caso retomado (Completar grabación → seguir grabando). */
    function applyResumedScenarioMetadata(scenario) {
        const request = scenario?.request;
        if (request) {
            if (request.featureName) txtFeature.value = request.featureName;
            if (request.scenarioName) txtScenario.value = request.scenarioName;
            if (request.fileName) txtFeatureFile.value = request.fileName;
            if (request.locatorModule) txtLocatorModule.value = request.locatorModule;
            if (request.caseId) txtCaseId.value = request.caseId;
            if (request.tag) txtFeatureTag.value = request.tag;
            if (request.dataName) txtDataName.value = request.dataName;
            if (request.pathType &&
                [...cmbPathType.options].some(option => option.value === request.pathType)) {
                cmbPathType.value = request.pathType;
            }
        }
        if (scenario?.objective) txtAutomationObjective.value = scenario.objective;
        if (scenario?.acceptanceCriteria) txtAutomationAcceptance.value = scenario.acceptanceCriteria;
    }

    // ─── Composición: cada feature declara sus dependencias explícitas. Las
    // referencias circulares entre features hermanas (inspector ↔
    // platform-completion, generation ↔ review) se resuelven asignando la
    // variable `let` correspondiente antes de que el callback se invoque. ───
    let platformCompletion;
    let review;

    const recording = createRecordingFeature({
        api,
        state,
        setStatus,
        invalidatePreview: () => generation.invalidatePreview(),
        renderSelectedLocatorCoverage: () => platformCompletion.renderSelectedLocatorCoverage(),
        clearSelectorCandidateBackups: () => inspector.clearSelectorCapture(),
        clearSelectorChips: () => inspector.clearSelectorCapture(),
        updateFinalAction: () => platformCompletion.updateFinalAction(),
    });

    const inspector = createInspectorFeature({
        api,
        state,
        setStatus,
        updateDeviceScreen: base64 => recording.updateDeviceScreen(base64),
        renderAssignmentTarget: () => platformCompletion.renderAssignmentTarget(),
        updateAssignmentButton: () => platformCompletion.updateAssignmentButton(),
        renderSelectedLocatorCoverage: () => platformCompletion.renderSelectedLocatorCoverage(),
    });

    const configuration = createConfigurationFeature({
        api,
        state,
        setStatus,
        setConfigStatus,
        updateDeviceScreen: base64 => recording.updateDeviceScreen(base64),
        exitInspectorMode: () => inspector.exitInspectorMode(),
        exitInteractionMode: () => inspector.exitInteractionMode(),
        loadExistingScenarios: () => platformCompletion.loadExistingScenarios(),
        showSessionOnboarding: () => platformCompletion.showSessionOnboarding(),
        onSquadCatalogUpdated: error => {
            if (error && lblLocatorCatalog) lblLocatorCatalog.textContent = '✗ ' + error;
            else platformCompletion.renderLocatorCatalog();
        },
        onFeatureScopeOrSquadChanged: () => platformCompletion.resetForSquadChange(),
        setRecorderConnecting,
    });

    platformCompletion = createPlatformCompletionFeature({
        api,
        state,
        setStatus,
        getSquad: () => document.getElementById('cmbFrameworkSquad').value || 'payment',
        setVerify: (msg, type) => inspector.setVerify(msg, type),
        openAppiumInspector: () => inspector.openAppiumInspector(),
        clearSelectorCapture: () => inspector.clearSelectorCapture(),
        invalidatePreview: () => generation.invalidatePreview(),
        renderSteps: steps => recording.renderSteps(steps),
        applyResumedScenarioMetadata,
        startRegeneratedAutomationWorkflow: result => review.startRegeneratedAutomationWorkflow(result),
        onVerificationScreenshot: base64 => recording.updateDeviceScreen(base64),
    });

    const generation = createGenerationFeature({
        api,
        state,
        setStatus,
        reloadSquadCatalogAfterGenerate: async () => {
            await configuration.loadSquadCatalog(state.sessionPlatform);
            platformCompletion.renderLocatorCatalog();
        },
        isAutomationWorkflow: () => review.isAutomationWorkflow(),
        hasInvalidAutomationDraft: () => review.hasInvalidAutomationDraft(),
        revalidateReviewedAutomation: () => review.revalidateReviewedAutomation(),
        importAutomationResponse: preserveReviewed => review.importAutomationResponse(preserveReviewed),
    });

    review = createReviewFeature({
        api,
        state,
        setStatus,
        generation,
        stepSummary: step => recording.stepSummary(step),
    });

    const features = [configuration, inspector, recording, platformCompletion, generation, review];
    features.forEach(feature => feature.mount());
    activeFeatures = features;

    // ─── INIT ────────────────────────────────────────────────────────────────
    screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
    screenRecorder.style.cssText = 'display:none !important';
    await Promise.all([
        configuration.loadFrameworkCatalog(),
        configuration.loadDevices(),
        configuration.loadBsCredentials(),
    ]);
}

/**
 * Desmonta los listeners registrados por `initializeRecorder`. Debe llamarse
 * en la limpieza del `useEffect` de `App.tsx` para que un remount (por
 * ejemplo, React StrictMode en desarrollo) no acumule listeners duplicados.
 * Es seguro invocarla sin una inicialización previa.
 */
export function disposeRecorder() {
    if (!activeFeatures) return;
    activeFeatures.forEach(feature => feature.unmount());
    activeFeatures = null;
}
