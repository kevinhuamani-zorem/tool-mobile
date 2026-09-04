import { app, BrowserWindow, dialog } from 'electron';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');

import path from 'path';
import {
    AppiumDriverManager,
    BrowserStackDriverManager,
    EmbeddedAppiumServer,
    LocatorManager,
    applyAndroidToolEnvironment,
} from '../../core/mobile-session';
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
    AutomationApplier,
    CopilotCliAdapter,
    VisibleCopilotProvider,
    AgentOrchestrator,
    LayeredGenerationOrchestrator,
    CopilotQaRoastGenerator,
} from '../../core/automation';
import { readJsonUtf8 } from '../../core/shared';
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
import { bootstrapWorkspace } from './workspaceBootstrap';

// ─── COMPOSICIÓN DE SERVICIOS ────────────────────────────────────────────────
//
// `main.ts` es el único lugar que crea servicios, arma el estado compartido y
// conecta los handlers IPC de cada familia (`recorder/src/ipc/*Handlers.ts`).
// Mantiene además la ventana, el ciclo de vida de la app y el registro del
// protocolo del Inspector embebido: nada de eso pertenece a una familia de
// handlers en particular, así que permanece aquí como el composition root.

registerEmbeddedInspectorScheme();

let activeRecorderLifecycle: RecorderRuntimeLifecycle | null = null;

function quitAfterCleanup(): void {
    if (!activeRecorderLifecycle) {
        app.quit();
        return;
    }
    activeRecorderLifecycle.cleanup()
        .then(() => app.quit())
        .catch(error => {
            console.error('[Main] Error cerrando recursos del recorder:', error.message);
            app.exit(1);
        });
}

function createWindow(state: RecorderRuntimeState): void {
    const window = new BrowserWindow({
        width: 1100,
        height: 860,
        minWidth: 960,
        minHeight: 700,
        title: 'Appium Recorder',
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
    applyAndroidToolEnvironment();
    const frameworkRoot = await bootstrapWorkspace();
    if (!frameworkRoot) {
        app.quit();
        return;
    }
    console.log(`[Main] Workspace: ${frameworkRoot}`);

    const workspaceAdapter = getWorkspaceAdapter();
    workspaceAdapter.initialize();
    const appiumServer = new EmbeddedAppiumServer();
    const appiumPort = await appiumServer.start();
    const dm = new AppiumDriverManager(appiumPort);
    const bsDm = new BrowserStackDriverManager();
    const reuseAnalyzer = new ReuseAnalyzer();
    const frameworkScanner = new FrameworkScanner(reuseAnalyzer);
    const fwkMobileGenerator = new FwkMobileGenerator();
    const outputValidator = new OutputValidator();
    const generatedFileRegistry = new GeneratedFileRegistry();
    const automationRecordingStore = new AutomationRecordingStore();
    const automationMemory = new AutomationMemory();
    const automationPatchWriter = new AutomationPatchWriter();
    const automationApplier = new AutomationApplier(automationPatchWriter, fwkMobileGenerator, generatedFileRegistry);
    const automationResponseValidator = new AutomationResponseValidator();
    const automationPackageBuilder = new AutomationPackageBuilder(
        undefined,
        automationMemory,
        fwkMobileGenerator,
        automationResponseValidator,
    );
    const automationAgentLauncher = new AutomationAgentLauncher();
    const recordingCoverageAnalyzer = new RecordingCoverageAnalyzer();
    const recordingPlatformUpdater = new RecordingPlatformUpdater();
    const frameworkQueryService = new FrameworkQueryService(new CodeGraph());
    const copilotCliAdapter = new CopilotCliAdapter();
    const visibleCopilotProvider = new VisibleCopilotProvider(copilotCliAdapter, automationAgentLauncher);
    const qaRoastGenerator = new CopilotQaRoastGenerator(copilotCliAdapter);
    const deterministicGenerator = new DeterministicGenerator();
    const agentOrchestrator = new AgentOrchestrator(
        frameworkQueryService,
        visibleCopilotProvider,
        undefined,
        deterministicGenerator,
        (scenario, plan, response, attempt) =>
            automationResponseValidator.validate(scenario, plan, response, attempt),
    );
    const layeredGenerationOrchestrator = new LayeredGenerationOrchestrator(
        copilotCliAdapter,
        copilotCliAdapter,
        (packageDirectory, response) => automationResponseValidator.validate(
            readJsonUtf8(path.join(packageDirectory, 'scenario.json')),
            readJsonUtf8(path.join(packageDirectory, 'generation-plan.json')),
            response,
        ),
    );
    const embeddedInspectorProxy = new EmbeddedInspectorProxy();
    const sessionOwnership = new RecorderSessionOwnership();
    const featureGen = new FeatureGenerator(
        projectPaths.features,
        path.join(projectPaths.locators, 'global.locator.json'),
    );
    const state = new RecorderRuntimeState(
        dm,
        new LocatorManager(projectPaths.locators, 'global', 'android'),
    );
    const syncRecording = createSyncRecording(state, automationRecordingStore);
    const recorderLifecycle = new RecorderRuntimeLifecycle([
        () => closeEmbeddedInspectorResources(state, embeddedInspectorProxy),
        () => closeOwnedSession(state, dm, automationRecordingStore, sessionOwnership),
    ], [
        // Solo al cerrar la app: cerrar una sesion para elegir otro caso deja
        // el servidor Appium integrado vivo.
        () => appiumServer.stop(),
    ]);
    activeRecorderLifecycle = recorderLifecycle;

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
        appiumServer,
    });
    registerInspectorHandlers({ state, embeddedInspectorProxy });
    registerInteractionHandlers({ state, syncRecording });
    registerAutomationHandlers({
        state,
        automationRecordingStore,
        recordingCoverageAnalyzer,
        automationPackageBuilder,
        automationAgentLauncher,
        agentOrchestrator,
        layeredGenerationOrchestrator,
        qaRoastGenerator,
        deterministicGenerator,
        automationResponseValidator,
        automationMemory,
        automationPatchWriter,
        automationApplier,
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
    createWindow(state);
    console.log('[Main] Ventana lista');
}).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Main] No se pudo iniciar el recorder:', message);
    dialog.showErrorBox('No se pudo iniciar Appium Recorder', message);
    app.exit(1);
});

app.on('window-all-closed', quitAfterCleanup);
