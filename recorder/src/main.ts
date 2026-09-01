import { app, BrowserWindow } from 'electron';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');

import path from 'path';
import { AppiumDriverManager, BrowserStackDriverManager, LocatorManager } from '../../core/mobile-session';
import { FeatureGenerator } from './featureGenerator';
import { projectPaths, FrameworkScanner, FrameworkQueryService, getWorkspaceAdapter } from '../../core/workspace';
import { FwkMobileGenerator, DeterministicGenerator } from '../../core/generation';
import { ReuseAnalyzer, CodeGraph } from '../../core/indexing';
import { OutputValidator, AutomationResponseValidator } from '../../core/validation';
import {
    GeneratedFileRegistry,
    AutomationRecordingStore,
    AutomationPackageBuilder,
    AutomationAgentLauncher,
    AutomationMemory,
    AutomationPatchWriter,
    CopilotCliAdapter,
    VisibleCopilotProvider,
    AgentOrchestrator,
} from '../../core/automation';
import { RecordingCoverageAnalyzer, RecordingPlatformUpdater } from '../../core/coverage';
import {
    embeddedInspectorAssetsAvailable,
    registerEmbeddedInspectorProtocol,
    registerEmbeddedInspectorScheme,
} from './embeddedInspectorWindow';
import { EmbeddedInspectorProxy } from './embeddedInspectorProxy';
import { RecorderRuntimeLifecycle, RecorderSessionOwnership } from './recorderLifecycle';
import { RecorderRuntimeState } from './ipc/runtimeState';
import { createSyncRecording } from './ipc/recordingSync';
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';
import { closeOwnedSession, registerSessionHandlers } from './ipc/sessionHandlers';
import { closeEmbeddedInspectorResources, registerInspectorHandlers } from './ipc/inspectorHandlers';
import { registerInteractionHandlers } from './ipc/interactionHandlers';
import { registerAutomationHandlers } from './ipc/automationHandlers';
import { registerGenerationHandlers } from './ipc/generationHandlers';

// ─── COMPOSICIÓN DE SERVICIOS ────────────────────────────────────────────────
//
// `main.ts` es el único lugar que crea servicios, arma el estado compartido y
// conecta los handlers IPC de cada familia (`recorder/src/ipc/*Handlers.ts`).
// Mantiene además la ventana, el ciclo de vida de la app y el registro del
// protocolo del Inspector embebido: nada de eso pertenece a una familia de
// handlers en particular, así que permanece aquí como el composition root.

registerEmbeddedInspectorScheme();

const workspaceAdapter = getWorkspaceAdapter();
workspaceAdapter.initialize();

const dm   = new AppiumDriverManager();
const bsDm = new BrowserStackDriverManager();
const reuseAnalyzer = new ReuseAnalyzer();
const frameworkScanner = new FrameworkScanner(reuseAnalyzer);
const fwkMobileGenerator = new FwkMobileGenerator();
const outputValidator = new OutputValidator();
const generatedFileRegistry = new GeneratedFileRegistry();
const automationRecordingStore = new AutomationRecordingStore();
const automationMemory = new AutomationMemory();
const automationPatchWriter = new AutomationPatchWriter();
const automationResponseValidator = new AutomationResponseValidator();
const automationPackageBuilder = new AutomationPackageBuilder(
    undefined,
    automationMemory,
    fwkMobileGenerator,
    automationResponseValidator
);
const automationAgentLauncher = new AutomationAgentLauncher();
const recordingCoverageAnalyzer = new RecordingCoverageAnalyzer();
const recordingPlatformUpdater = new RecordingPlatformUpdater();
const frameworkQueryService = new FrameworkQueryService(new CodeGraph());
const copilotCliAdapter = new CopilotCliAdapter();
const visibleCopilotProvider = new VisibleCopilotProvider(copilotCliAdapter, automationAgentLauncher);
const agentOrchestrator = new AgentOrchestrator(frameworkQueryService, visibleCopilotProvider);
const deterministicGenerator = new DeterministicGenerator();
const embeddedInspectorProxy = new EmbeddedInspectorProxy();
const sessionOwnership = new RecorderSessionOwnership();

// Debe coincidir con cucumber.json para que los escenarios generados se ejecuten.
const featureGen = new FeatureGenerator(
    projectPaths.features,
    path.join(projectPaths.locators, 'global.locator.json')
);

// Estado mutable compartido por todas las familias de handlers IPC. Antes de
// esta fase eran variables de módulo de `main.ts`; ahora viven en una única
// instancia inyectada por referencia (ver `recorder/src/ipc/runtimeState.ts`).
const state = new RecorderRuntimeState(
    dm,
    new LocatorManager(projectPaths.locators, 'global', 'android'),
);

const syncRecording = createSyncRecording(state, automationRecordingStore);

const recorderLifecycle = new RecorderRuntimeLifecycle([
    () => closeEmbeddedInspectorResources(state, embeddedInspectorProxy),
    () => closeOwnedSession(state, dm, automationRecordingStore, sessionOwnership),
]);

function quitAfterCleanup(): void {
    recorderLifecycle.cleanup()
        .then(() => app.quit())
        .catch(error => {
            console.error('[Main] Error cerrando recursos del recorder:', error.message);
            app.exit(1);
        });
}

function createWindow(): void {
    const window = new BrowserWindow({
        width: 1100,
        height: 860,
        minWidth: 960,
        minHeight: 700,
        title: 'Appium Visual Recorder',
        backgroundColor: '#1E1E2E',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')  // dist/recorder/src/preload.js ✓
        }
    });
    state.mainWindow = window;

    // El renderer React es compilado por Vite dentro de dist/renderer.
    window.loadFile(path.join(__dirname, '../../renderer/index.html'));

    window.on('closed', () => {
        state.mainWindow = null;
        quitAfterCleanup();
    });

    window.webContents.on('did-finish-load', () => {
        console.log('[Main] Renderer listo');
    });
}

app.whenReady().then(async () => {
    if (embeddedInspectorAssetsAvailable()) {
        await registerEmbeddedInspectorProtocol();
    } else if (!process.env.RECORDER_INSPECTOR) {
        console.warn('[Inspector] Assets embebidos ausentes; se usará el inspector legacy. Ejecuta npm run inspector:build.');
    }
    const cleanup = automationRecordingStore.pruneEmptyRecordings();
    if (cleanup.removed.length) {
        console.log(`[Main] Grabaciones vacías eliminadas: ${cleanup.removed.length}`);
    }
    console.log('[Main] Abriendo ventana...');
    createWindow();
    console.log('[Main] Ventana lista');
});

app.on('window-all-closed', quitAfterCleanup);

// ─── REGISTRO DE HANDLERS IPC POR FAMILIA ────────────────────────────────────

registerWorkspaceHandlers({
    state,
    frameworkScanner,
    reuseAnalyzer,
    workspaceAdapter,
    recordingCoverageAnalyzer,
    recordingPlatformUpdater,
    generatedFileRegistry,
});

registerSessionHandlers({
    state,
    dm,
    bsDm,
    automationRecordingStore,
    sessionOwnership,
    recorderLifecycle,
});

registerInspectorHandlers({
    state,
    embeddedInspectorProxy,
});

registerInteractionHandlers({
    state,
    syncRecording,
});

registerAutomationHandlers({
    state,
    automationRecordingStore,
    recordingCoverageAnalyzer,
    automationPackageBuilder,
    automationAgentLauncher,
    agentOrchestrator,
    deterministicGenerator,
    automationResponseValidator,
    automationMemory,
    automationPatchWriter,
    generatedFileRegistry,
    fwkMobileGenerator,
    syncRecording,
});

registerGenerationHandlers({
    state,
    featureGen,
    fwkMobileGenerator,
    outputValidator,
    generatedFileRegistry,
});
