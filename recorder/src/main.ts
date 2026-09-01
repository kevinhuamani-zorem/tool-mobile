import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import fs from 'fs';
import https from 'https';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');

import path from 'path';
import { AppiumDriverManager } from '../../core/appiumDriverManager';
import { BrowserStackDriverManager, BrowserStackConfig } from '../../core/browserStackDriverManager';
import { MobileInspector } from './mobileInspector';
import { MobileStepExecutor } from '../../core/mobileStepExecutor';
import { LocatorManager } from '../../core/locatorManager';
import { FeatureGenerator } from './featureGenerator';
import { RecordedStep, SelectorCandidate } from '../../core/models';
import { projectPaths } from '../../core/projectPaths';
import { FrameworkScanner } from '../../core/frameworkScanner';
import { FwkMobileGenerator, GenerationRequest, MobilePlatform, GeneratedPreview } from '../../core/fwkMobileGenerator';
import { withGeneratedResponseMetadata } from '../../core/generatedFileMetadata';
import { ReuseAnalyzer } from '../../core/reuseAnalyzer';
import { OutputValidator } from '../../core/outputValidator';
import { GeneratedFileRegistry } from '../../core/generatedFileRegistry';
import crypto from 'crypto';
import { getWorkspaceAdapter } from '../../core/workspaceAdapter';
import {
    AutomationRecordingStore,
    prepareRecordedStep,
} from '../../core/automationRecordingStore';
import { AutomationPackageBuilder } from '../../core/automationPackageBuilder';
import type { PackagedAutomationScenario } from '../../core/automationScenarioPackage';
import { AutomationAgentLauncher } from '../../core/automationAgentLauncher';
import { RecordingCoverageAnalyzer } from '../../core/recordingCoverageAnalyzer';
import { RecordingPlatformUpdater } from '../../core/recordingPlatformUpdater';
import { AutomationResponseValidator } from '../../core/automationResponseValidator';
import { AutomationMemory } from '../../core/automationMemory';
import { frameworkLocator, indexDeclaredStrategies, roundTrip } from '../../core/locatorStrategy';
import {
    AutomationPatchWriter,
    featureAdditions,
    locatorAdditions,
    screenAdditions,
    stepsAdditions,
} from '../../core/automationPatchWriter';
import {
    AutomationAgentResponse,
    AutomationScenario,
    DEFAULT_AGENT_EXECUTION_MODE,
    GenerationPlan,
    AgentExecutionMode,
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    GapResolution,
} from '../../core/automationContracts';
import {
    EmbeddedInspectorElementUsed,
    EmbeddedInspectorHandshake,
    recorderSelectorFromInspector,
} from './embeddedInspectorProtocol';
import {
    createEmbeddedInspectorWindow,
    embeddedInspectorAssetsAvailable,
    focusEmbeddedInspectorWindow,
    registerEmbeddedInspectorProtocol,
    registerEmbeddedInspectorScheme,
    resolveInspectorMode,
    returnToRecorderAfterElementUse,
} from './embeddedInspectorWindow';
import { EmbeddedInspectorProxy } from './embeddedInspectorProxy';
import { RecorderRuntimeLifecycle, RecorderSessionOwnership } from './recorderLifecycle';
import { independentlyVerifySelectorCandidates } from '../../core/verifiedSelectorCandidates';
import { AgentRunStore } from '../../core/agentRunStore';
import { FrameworkQueryService } from '../../core/frameworkQueryService';
import { CopilotCliAdapter } from '../../core/copilotCliAdapter';
import { VisibleCopilotProvider } from '../../core/visibleCopilotProvider';
import { AgentOrchestrator } from '../../core/agentOrchestrator';
import { resolveAgentExecutionMode } from '../../core/agentRuntimeGuards';
import { DeterministicGenerator } from '../../core/deterministicGenerator';
import {
    normalizeAgentResponseEnglishIdentifiers,
} from '../../core/agentResponseEnglishNormalizer';
import {
    enforceAgentResponsePlatformTags,
} from '../../core/agentResponsePlatformTagEnforcer';
import {
    normalizeJsonUnicode,
    readJsonUtf8,
    writeJsonUtf8,
    writeUtf8FileAtomic,
} from '../../core/utf8Text';
import {
    AutomationApplicationReceipt,
    createAutomationApplicationReceipt,
    planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles,
} from '../../core/automationApplicationReceipt';
import {
    restoreUpdateBaselinesForCorrection,
    rollbackCorrectionBaselines,
} from '../../core/automationCorrectionBaseline';

registerEmbeddedInspectorScheme();

let mainWindow: BrowserWindow | null = null;
let embeddedInspectorWindow: BrowserWindow | null = null;
let embeddedInspectorHandshake: EmbeddedInspectorHandshake | null = null;
const embeddedInspectorProxy = new EmbeddedInspectorProxy();

const workspaceAdapter = getWorkspaceAdapter();
workspaceAdapter.initialize();

const dm             = new AppiumDriverManager();
const bsDm           = new BrowserStackDriverManager();
const frameworkScanner = new FrameworkScanner();
const fwkMobileGenerator = new FwkMobileGenerator();
const reuseAnalyzer = new ReuseAnalyzer();
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
const frameworkQueryService = new FrameworkQueryService();
const copilotCliAdapter = new CopilotCliAdapter();
const visibleCopilotProvider = new VisibleCopilotProvider(copilotCliAdapter, automationAgentLauncher);
const agentOrchestrator = new AgentOrchestrator(frameworkQueryService, visibleCopilotProvider);
const deterministicGenerator = new DeterministicGenerator();
const approvedPreviews = new Map<string, string>();
let locatorManager   = new LocatorManager(projectPaths.locators, 'global', 'android');
// Debe coincidir con cucumber.json para que los escenarios generados se ejecuten.
const featureGen     = new FeatureGenerator(
    projectPaths.features,
    path.join(projectPaths.locators, 'global.locator.json')
);

// Apunta al manager activo (local o BrowserStack)
let activeDm: AppiumDriverManager = dm;

let inspector:     MobileInspector    | null = null;
let executor:      MobileStepExecutor | null = null;
let recordedSteps: RecordedStep[]     = [];
let sessionActive  = false;
let recordingPlatform: MobilePlatform = 'android';
let activeSquad = 'payment';
let activeEnvironment = '';
let activeAutomationPackage = '';
let automationPreview: {
    token: string;
    scenario: AutomationScenario;
    plan: GenerationPlan;
    response: AutomationAgentResponse;
} | null = null;
let pendingInspectorCandidates: {
    token: string;
    selector: string;
    candidates: SelectorCandidate[];
} | null = null;
let inspectorValidationGeneration = 0;
const sessionOwnership = new RecorderSessionOwnership();

interface QaDecisionOption {
    optionId: string;
    title: string;
    reason: string;
    decision: 'reuse' | 'create';
    symbol?: string;
    candidate?: { file: string; module: string; name: string };
}

interface QaDecisionPrompt {
    gapId: string;
    title: string;
    description: string;
    requiredOutput: string;
    options: QaDecisionOption[];
}

type ProductStage =
    | 'ANALYZING'
    | 'RESOLVING_CONTEXT'
    | 'RESOLVING_DECISIONS'
    | 'WAITING_FOR_QA'
    | 'GENERATING'
    | 'VALIDATING'
    | 'READY_FOR_REVIEW'
    | 'APPLYING'
    | 'COMPLETED'
    | 'FAILED';

function emitAutomationProgress(
    stage: ProductStage,
    message: string,
    completed: number,
    total: number,
    meta?: Record<string, unknown>,
): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('automation-progress', {
        stage,
        message,
        completed,
        total,
        ...(meta || {}),
    });
}

function qaDecisionPromptsFromPlan(plan: GenerationPlan, packageDirectory: string): QaDecisionPrompt[] {
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const unresolved = fs.existsSync(unresolvedFile)
        ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf-8')) as { gaps?: Array<any> }
        : { gaps: [] };
    const gaps = (unresolved.gaps || []).filter(gap =>
        gap && typeof gap.id === 'string' && (gap.blocking || gap.status === 'blocked-qa' || gap.type === 'qa-decision')
    );
    return gaps.map(gap => {
        const resolution = plan.resolutions.find(entry => entry.gapId === gap.id);
        const candidates = (resolution?.reuseCandidates || []).map((candidate: any) => ({
            optionId: `reuse:${candidate.module}.${candidate.name}`,
            title: `Reutilizar ${candidate.module}.${candidate.name}`,
            reason: `Componente existente en ${candidate.file}`,
            decision: 'reuse' as const,
            symbol: `${candidate.module}.${candidate.name}`,
            candidate: {
                file: candidate.file,
                module: candidate.module,
                name: candidate.name,
            },
        }));
        return {
            gapId: gap.id,
            title: gap.intent || gap.description || 'Decisión pendiente',
            description: gap.description || 'Se requiere confirmación para continuar.',
            requiredOutput: gap.requiredOutput || '',
            options: [
                ...candidates,
                {
                    optionId: 'create:new',
                    title: 'Crear componente nuevo',
                    reason: 'No reutilizar un candidato existente para este caso.',
                    decision: 'create',
                },
            ],
        } satisfies QaDecisionPrompt;
    });
}

function mergedResolutionsWithQa(
    plan: GenerationPlan,
    qaResolutions: GapResolution[],
    packageDirectory: string,
): GapResolution[] {
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const unresolved = fs.existsSync(unresolvedFile)
        ? JSON.parse(fs.readFileSync(unresolvedFile, 'utf-8')) as { gaps?: Array<any> }
        : { gaps: [] };
    const byGap = new Map<string, GapResolution>(qaResolutions.map(item => [item.gapId, item]));
    const fromDeterministic = plan.resolutions
        .filter(item => item.gapId && item.resolution !== 'unresolved')
        .map(item => ({
            gapId: item.gapId!,
            decision: item.resolution === 'builtin' ? 'resolved' : item.resolution,
            reason: item.reason,
        } as GapResolution));
    for (const item of fromDeterministic) {
        if (!byGap.has(item.gapId)) byGap.set(item.gapId, item);
    }
    for (const gapId of plan.unresolvedGapIds || []) {
        if (byGap.has(gapId)) continue;
        const gap = (unresolved.gaps || []).find((entry: any) => entry?.id === gapId);
        byGap.set(gapId, {
            gapId,
            decision: 'unresolved',
            reason: gap?.requiredOutput || 'Gap abierto sin resolución explícita.',
        });
    }
    return [...byGap.values()];
}

async function closeEmbeddedInspectorResources(): Promise<void> {
    const window = embeddedInspectorWindow;
    embeddedInspectorWindow = null;
    embeddedInspectorHandshake = null;
    if (window && !window.isDestroyed()) window.destroy();
    await embeddedInspectorProxy.stop();
}

async function closeOwnedSession(): Promise<void> {
    sessionActive = false;
    inspector = null;
    executor = null;
    activeDm = dm;
    automationRecordingStore.reset();
    activeAutomationPackage = '';
    automationPreview = null;
    pendingInspectorCandidates = null;
    inspectorValidationGeneration++;
    await sessionOwnership.close();
}

async function validateEmbeddedInspectorElementUse(
    elementUsed: EmbeddedInspectorElementUsed,
): Promise<void> {
    const generation = ++inspectorValidationGeneration;
    pendingInspectorCandidates = null;
    try {
        if (!sessionActive) throw new Error('La sesión Appium ya no está activa');
        if (!elementUsed.elementId) {
            throw new Error('Inspector no entregó la identidad WebDriver del elemento seleccionado');
        }
        const metadata = activeDm.getSessionMetadata();
        const validation = await independentlyVerifySelectorCandidates({
            candidates: elementUsed.candidates,
            selectedElementId: elementUsed.elementId,
            platform: metadata.platform,
            recorderSelector: recorderSelectorFromInspector,
            findElementIds: selector => activeDm.findElementIds(selector),
        });
        if (generation !== inspectorValidationGeneration) return;
        if (activeDm.getSessionMetadata().sessionId !== metadata.sessionId) {
            throw new Error('La sesión Appium cambió durante la validación de candidatos');
        }
        const selectorCandidateToken = crypto.randomUUID();
        pendingInspectorCandidates = {
            token: selectorCandidateToken,
            selector: validation.primarySelector,
            candidates: validation.candidates,
        };
        mainWindow?.webContents.send('embedded-inspector-element-used', {
            selector: validation.primarySelector,
            strategy: elementUsed.strategy,
            tag: elementUsed.tag,
            validationWarnings: validation.warnings,
            selectorCandidateToken,
        });
        returnToRecorderAfterElementUse(embeddedInspectorWindow, mainWindow);
    } catch (error) {
        if (generation !== inspectorValidationGeneration) return;
        pendingInspectorCandidates = null;
        mainWindow?.webContents.send(
            'embedded-inspector-error',
            error instanceof Error ? error.message : 'No se pudo validar el selector del Inspector',
        );
    }
}

const recorderLifecycle = new RecorderRuntimeLifecycle([
    closeEmbeddedInspectorResources,
    closeOwnedSession,
]);

function quitAfterCleanup(): void {
    recorderLifecycle.cleanup()
        .then(() => app.quit())
        .catch(error => {
            console.error('[Main] Error cerrando recursos del recorder:', error.message);
            app.exit(1);
        });
}

function syncRecording(): void {
    if (!sessionActive) return;
    automationRecordingStore.replaceActions(recordedSteps, {
        squad: activeSquad,
        platform: recordingPlatform,
        environment: activeEnvironment,
    });
}

const BS_CONFIG_PATH      = path.join(projectPaths.toolConfig, 'bs_config.json');
const SESSION_CONFIG_PATH = path.join(projectPaths.toolConfig, 'session_config.json');
const GENERATION_ENABLED  = process.env.RECORDER_ENABLE_GENERATION === 'true';

/** Persiste la configuración de la sesión activa para que test.sh y steps.ts la usen */
function saveSessionConfig(config: Record<string, any>): void {
    try {
        fs.mkdirSync(projectPaths.toolConfig, { recursive: true });
        fs.writeFileSync(SESSION_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        console.log('[Main] session_config.json guardado:', config.type, config.platform || 'android');
    } catch (e: any) {
        console.warn('[Main] No se pudo guardar session_config:', e.message);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
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

    // El renderer React es compilado por Vite dentro de dist/renderer.
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
        quitAfterCleanup();
    });

    mainWindow.webContents.on('did-finish-load', () => {
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

// ─── IPC HANDLERS — LOCAL ────────────────────────────────────────────────────

ipcMain.handle('scan-framework', async () => {
    try {
        return { success: true, catalog: frameworkScanner.scan() };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('analyze-step-reuse', async (_, texts: string[], squad?: string) => {
    try {
        reuseAnalyzer.refresh();
        return {
            success: true,
            steps: reuseAnalyzer.analyzeSteps(texts, squad || activeSquad),
            screenMethods: reuseAnalyzer.getScreenMethods(squad || activeSquad)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('analyze-step-impact', async (_, texts: string[], squad?: string) => {
    try {
        reuseAnalyzer.refresh();
        return {
            success: true,
            steps: reuseAnalyzer.analyzeStepImpact(texts, squad || activeSquad)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-workspace-info', async () => workspaceAdapter.describe());

ipcMain.handle('get-squad-catalog', async (_, squad?: string, platform?: MobilePlatform, featureScope?: string) => {
    try {
        const selectedSquad = squad || activeSquad;
        const selectedPlatform = platform === 'ios' ? 'ios' : 'android';
        return {
            success: true,
            catalog: reuseAnalyzer.getCatalog(selectedSquad, selectedPlatform, featureScope)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-existing-scenarios', async (_, squad?: string) => {
    try {
        return {
            success: true,
            scenarios: recordingCoverageAnalyzer.listRecordings(
                squad || activeSquad,
                activeEnvironment
            )
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-scenario-coverage', async (_, scenarioId: string, squad?: string) => {
    try {
        return {
            success: true,
            coverage: recordingCoverageAnalyzer.analyze(
                squad || activeSquad,
                scenarioId,
                activeEnvironment
            ),
            platform: recordingPlatform
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('assign-locator-value', async (_, request: {
    recordingId?: string;
    file: string;
    name: string;
    selector: string;
    platform?: MobilePlatform;
    androidBlock?: string;
    iosBlock?: string;
}) => {
    try {
        if (!sessionActive) throw new Error('Sin sesion activa');
        const platform: MobilePlatform = recordingPlatform;
        if (request.platform && request.platform !== platform) {
            throw new Error(`La sesion activa es ${platform}; no se puede escribir en ${request.platform}`);
        }
        const name = String(request.name || '').trim();
        const executableSelector = String(request.selector || '').trim();
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(`Nombre de locator invalido: ${name}`);
        }
        if (!executableSelector) throw new Error('El selector no puede estar vacio');
        if (request.recordingId) {
            const updated = recordingPlatformUpdater.update({
                recordingId: request.recordingId,
                squad: activeSquad,
                file: request.file,
                name,
                selector: executableSelector,
                platform,
                androidBlock: request.androidBlock,
                iosBlock: request.iosBlock,
            });
            for (const relative of updated.updatedFiles) {
                generatedFileRegistry.registerUpdatedFile(
                    path.resolve(projectPaths.frameworkRoot, relative),
                    activeSquad
                );
            }
            const coverage = recordingCoverageAnalyzer.analyze(
                activeSquad,
                request.recordingId,
                activeEnvironment
            );
            const activeKey = platform === 'ios' ? 'iosSelector' : 'androidSelector';
            const complete = coverage.locators.every(locator => Boolean(locator[activeKey]));
            if (complete) {
                const platformFiles = recordingPlatformUpdater.markComplete(
                    request.recordingId,
                    activeSquad,
                    platform
                );
                for (const relative of platformFiles) {
                    generatedFileRegistry.registerUpdatedFile(
                        path.resolve(projectPaths.frameworkRoot, relative),
                        activeSquad
                    );
                }
            }
            return {
                success: true,
                ...updated,
                coverageComplete: complete,
                catalog: reuseAnalyzer.getCatalog(activeSquad, platform),
            };
        }
        // El valor que va al JSON sale del mismo traductor que usa el
        // generador. Recortar prefijos a mano guardaba `id=com.yape.qa:id/btn`
        // como `com.yape.qa:id/btn`, que el getter volvia a componer como
        // accesibilidad y no encontraba nada.
        const check = roundTrip(executableSelector, platform);
        if (!check.ok) throw new Error(check.reason);
        const selector = check.value;

        const relativeFile = String(request.file || '').replace(/\\/g, '/');
        if (!relativeFile.startsWith('resources/locators/') || !relativeFile.endsWith('.json')) {
            throw new Error('El archivo no pertenece a resources/locators');
        }
        const file = path.resolve(projectPaths.frameworkRoot, relativeFile);
        const locatorRoot = path.resolve(projectPaths.locators) + path.sep;
        if (!file.startsWith(locatorRoot) || !fs.existsSync(file)) {
            throw new Error(`No existe el archivo de locators: ${relativeFile}`);
        }

        const document = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, any>;
        const requestedBlock = platform === 'android' ? request.androidBlock : request.iosBlock;
        let blockName = requestedBlock && document[requestedBlock] &&
            typeof document[requestedBlock] === 'object' &&
            requestedBlock.toLowerCase().endsWith(platform)
            ? requestedBlock
            : Object.keys(document).find(block => block.toLowerCase().endsWith(platform));

        if (!blockName) {
            const counterpart = platform === 'android' ? request.iosBlock : request.androidBlock;
            if (counterpart) {
                blockName = counterpart.replace(
                    /(android|ios)$/i,
                    platform === 'android' ? 'Android' : 'Ios'
                );
            } else {
                const moduleName = path.basename(file).replace(/\.locator\.json$/i, '');
                const camel = moduleName.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
                blockName = `${camel}${platform === 'android' ? 'Android' : 'Ios'}`;
            }
            document[blockName] = {};
        }
        if (!document[blockName] || typeof document[blockName] !== 'object' || Array.isArray(document[blockName])) {
            throw new Error(`El bloque ${blockName} no es valido`);
        }

        // El getter del Screen Object ya declara una estrategia para esta clave.
        // Escribir un valor de otra estrategia deja las dos capas en desacuerdo
        // y el locator no resuelve, asi que se rechaza en vez de sobrescribir.
        const locatorModule = relativeFile
            .replace(/^resources\/locators\//, '')
            .replace(/\.locator\.json$/, '');
        const declared = indexDeclaredStrategies().get(`${locatorModule}#${name}`)?.[platform];
        if (declared && declared !== check.type) {
            throw new Error(
                `El getter de "${name}" declara TypeLocator.${declared} para ${platform}, ` +
                `pero este selector es TypeLocator.${check.type}. ` +
                'Captura el elemento con esa estrategia o actualiza el getter primero.'
            );
        }

        const previous = typeof document[blockName][name] === 'string'
            ? document[blockName][name]
            : '';
        document[blockName][name] = selector;
        writeUtf8FileAtomic(file, JSON.stringify(normalizeJsonUnicode(document), null, 4) + '\n');
        generatedFileRegistry.registerUpdatedFile(file, activeSquad);

        return {
            success: true,
            platform,
            block: blockName,
            previous,
            selector,
            catalog: reuseAnalyzer.getCatalog(activeSquad, platform)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-devices', async () => {
    const devices = await AppiumDriverManager.getConnectedDevices();
    const android = await Promise.all(devices.map(async d => {
        const info = await AppiumDriverManager.getDeviceInfo(d.udid);
        return { ...d, ...info, platform: 'android' as const };
    }));
    // Los simuladores conviven con los dispositivos Android en la misma lista;
    // `platform` decide las capacidades y los campos que pide la UI.
    const simulators = (await AppiumDriverManager.getIosSimulators()).map(simulator => ({
        udid: simulator.udid,
        status: simulator.booted ? 'booted' : 'shutdown',
        model: simulator.name,
        version: simulator.version,
        platform: 'ios' as const,
    }));
    return { devices: [...android, ...simulators] };
});

ipcMain.handle('select-local-app', async (_, requestedPlatform: string) => {
    const platform = requestedPlatform === 'ios' ? 'ios' : 'android';
    const allowedExtensions = platform === 'ios'
        ? new Set(['.app', '.ipa'])
        : new Set(['.apk', '.aab', '.xapk']);
    const selection = await dialog.showOpenDialog(mainWindow!, {
        title: platform === 'ios'
            ? 'Seleccionar aplicación iOS (.app o .ipa)'
            : 'Seleccionar aplicación Android',
        filters: platform === 'ios'
            ? [{ name: 'Aplicaciones iOS', extensions: ['app', 'ipa'] }]
            : [{ name: 'Aplicaciones Android', extensions: ['apk', 'aab', 'xapk'] }],
        properties: ['openFile'],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
        return { success: false, canceled: true };
    }

    const appPath = path.resolve(selection.filePaths[0]);
    const extension = path.extname(appPath).toLowerCase();
    if (!allowedExtensions.has(extension) || !fs.existsSync(appPath)) {
        return { success: false, error: `Aplicación ${platform} no válida` };
    }
    return {
        success: true,
        path: appPath,
        filename: path.basename(appPath),
        extension,
        simulatorWarning: platform === 'ios' && extension === '.ipa',
    };
});

ipcMain.handle('get-foreground-app', async (_, udid: string) => {
    return await AppiumDriverManager.getForegroundApp(udid);
});

ipcMain.handle('start-session', async (_, config: any) => {
    try {
        activeDm = dm;
        // La sesion local ya no asume Android: el simulador iOS usa XCUITest y
        // sus propios bloques de locators.
        recordingPlatform = config.platform === 'ios' ? 'ios' : 'android';
        activeSquad = config.squad || 'payment';
        activeEnvironment = config.environment || '';
        await sessionOwnership.acquire(dm, async () => {
            await dm.startAppiumServer();
            await dm.init({ ...config, platform: recordingPlatform });
        });
        locatorManager = new LocatorManager(projectPaths.locators, 'global', recordingPlatform);
        inspector  = new MobileInspector(activeDm);
        executor   = new MobileStepExecutor(activeDm, locatorManager);
        sessionActive = true;
        recordedSteps = [];
        automationRecordingStore.start({
            squad: activeSquad,
            platform: recordingPlatform,
            environment: activeEnvironment,
        });
        const screenshot = await inspector.captureScreenshot();
        // Persistir configuración para test.sh / steps.ts
        saveSessionConfig({
            type:            'local',
            platform:        recordingPlatform,
            squad:           activeSquad,
            environment:     activeEnvironment,
            deviceName:      config.deviceName,
            udid:            config.udid,
            platformVersion: config.platformVersion,
            appPackage:      config.appPackage,
            appActivity:     config.appActivity,
            ...(config.bundleId ? { bundleId: config.bundleId } : {}),
            ...(config.appPath ? { appPath: config.appPath } : {}),
        });
        return { success: true, screenshot };
    } catch (e: any) {
        console.error('[Main] Error:', e.message);
        return { success: false, error: e.message };
    }
});

// ─── IPC HANDLERS — BROWSERSTACK ─────────────────────────────────────────────

/** Carga credenciales guardadas en resources/bs_config.json */
ipcMain.handle('bs-load-credentials', async () => {
    try {
        if (!fs.existsSync(BS_CONFIG_PATH)) return { success: true, username: '', accessKey: '' };
        const data = JSON.parse(fs.readFileSync(BS_CONFIG_PATH, 'utf-8'));
        return { success: true, username: data.username || '', accessKey: data.accessKey || '' };
    } catch {
        return { success: true, username: '', accessKey: '' };
    }
});

/** Guarda credenciales en resources/bs_config.json */
ipcMain.handle('bs-save-credentials', async (_, username: string, accessKey: string) => {
    try {
        fs.mkdirSync(projectPaths.toolConfig, { recursive: true });
        fs.writeFileSync(BS_CONFIG_PATH, JSON.stringify({ username, accessKey }, null, 2), 'utf-8');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

/** Lista dispositivos disponibles en la cuenta de BrowserStack, filtrados por plataforma */
ipcMain.handle('bs-get-devices', async (_, username: string, accessKey: string, platform: string = 'android') => {
    return new Promise((resolve) => {
        if (!username || !accessKey) {
            resolve({ success: false, error: 'Ingresa usuario y access key' });
            return;
        }
        console.log('[BS] Consultando dispositivos para usuario:', username);
        const auth    = Buffer.from(`${username}:${accessKey}`).toString('base64');
        const options = {
            hostname: 'api-cloud.browserstack.com',
            port:     443,
            path:     '/app-automate/devices.json',
            method:   'GET',
            headers:  {
                'Authorization': `Basic ${auth}`,
                'Content-Type':  'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[BS] Status HTTP:', res.statusCode);
                console.log('[BS] Respuesta (primeros 300 chars):', data.slice(0, 300));
                if (res.statusCode === 401) {
                    resolve({ success: false, error: 'Credenciales incorrectas (401) — verifica usuario y access key' });
                    return;
                }
                if (res.statusCode !== 200) {
                    resolve({ success: false, error: `Error HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    if (!Array.isArray(parsed)) {
                        console.log('[BS] Respuesta dispositivos no es array:', parsed);
                        resolve({ success: false, error: parsed?.message || 'Respuesta inesperada de BrowserStack' });
                        return;
                    }
                    console.log('[BS] Total dispositivos recibidos:', parsed.length);
                    const filtered = parsed.filter((d: any) => d.os?.toLowerCase() === platform);
                    console.log(`[BS] Dispositivos ${platform}:`, filtered.length);
                    if (filtered.length === 0 && parsed.length > 0) {
                        const osValues = [...new Set(parsed.map((d: any) => d.os))];
                        console.log('[BS] Valores de "os" encontrados:', osValues);
                    }
                    resolve({ success: true, devices: filtered, total: parsed.length });
                } catch (e: any) {
                    console.error('[BS] Error parseando JSON:', e.message, '— raw:', data.slice(0, 200));
                    resolve({ success: false, error: 'Error al parsear respuesta: ' + e.message });
                }
            });
        });
        req.on('error', (e: any) => {
            console.error('[BS] Error de red:', e.message);
            resolve({ success: false, error: 'Error de red: ' + e.message });
        });
        req.end();
    });
});

/** Lista las apps subidas recientemente a BrowserStack (últimos 30 días), filtradas por plataforma */
ipcMain.handle('bs-get-apps', async (_, username: string, accessKey: string, platform: string = 'android') => {
    return new Promise((resolve) => {
        if (!username || !accessKey) {
            resolve({ success: false, error: 'Ingresa usuario y access key' });
            return;
        }
        console.log('[BS] Consultando apps subidas...');
        const auth    = Buffer.from(`${username}:${accessKey}`).toString('base64');
        const options = {
            hostname: 'api-cloud.browserstack.com',
            port:     443,
            path:     '/app-automate/recent_apps?limit=20',
            method:   'GET',
            headers:  { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[BS] Apps status:', res.statusCode);
                if (res.statusCode === 401) {
                    resolve({ success: false, error: 'Credenciales incorrectas (401)' });
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    console.log('[BS] Tipo de respuesta:', Array.isArray(parsed) ? 'array' : typeof parsed);

                    // BS devuelve {} con "message" cuando no hay apps, o [] cuando hay
                    if (!Array.isArray(parsed)) {
                        const msg = parsed?.message || 'Sin apps subidas en los últimos 30 días';
                        console.log('[BS] Respuesta no es array:', msg);
                        resolve({ success: true, apps: [], message: msg });
                        return;
                    }
                    // Filtrar por plataforma
                    const filtered = platform === 'ios'
                        ? parsed.filter((a: any) => a.app_name?.match(/\.ipa$/i))
                        : parsed.filter((a: any) => a.app_name?.match(/\.(apk|aab|xapk)$/i));
                    console.log(`[BS] Apps ${platform} encontradas:`, filtered.length, '/ total:', parsed.length);
                    resolve({ success: true, apps: filtered });
                } catch (e: any) {
                    console.error('[BS] Raw response:', data.slice(0, 300));
                    resolve({ success: false, error: 'Error al parsear respuesta: ' + e.message });
                }
            });
        });
        req.on('error', (e: any) => resolve({ success: false, error: 'Error de red: ' + e.message }));
        req.end();
    });
});

/**
 * Abre el diálogo de selección de archivo y sube el APK a BrowserStack.
 * Devuelve el app_url (bs://...) al completar.
 */
ipcMain.handle('bs-upload-app', async (_, username: string, accessKey: string, customId: string, platform: string = 'android') => {
    // 1. Abrir diálogo de selección — filtro único que incluye todas las extensiones
    const isIos = platform === 'ios';
    const sel = await dialog.showOpenDialog(mainWindow!, {
        title: isIos
            ? 'Seleccionar IPA para subir a BrowserStack'
            : 'Seleccionar APK para subir a BrowserStack',
        filters: isIos
            ? [
                { name: 'iOS Apps (.ipa)', extensions: ['ipa'] },
                { name: 'Todos los archivos', extensions: ['*'] }
              ]
            : [
                { name: 'Android Apps (.apk / .aab)', extensions: ['apk', 'aab', 'xapk'] },
                { name: 'Todos los archivos', extensions: ['*'] }
              ],
        properties: ['openFile']
    });

    if (sel.canceled || sel.filePaths.length === 0) {
        return { success: false, canceled: true };
    }

    const filePath = sel.filePaths[0];
    const filename = path.basename(filePath);

    return new Promise((resolve) => {
        try {
            const fileContent = fs.readFileSync(filePath);
            const fileSizeMB  = (fileContent.length / 1024 / 1024).toFixed(1);
            console.log(`[BS] Subiendo ${filename} (${fileSizeMB} MB)...`);

            const boundary = '----BSBoundary' + Date.now().toString(16);
            const auth     = Buffer.from(`${username}:${accessKey}`).toString('base64');

            // Construir cuerpo multipart
            const parts: Buffer[] = [];

            if (customId && customId.trim()) {
                const id = customId.trim().replace(/[^A-Za-z0-9._-]/g, '_');
                parts.push(Buffer.from(
                    `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="custom_id"\r\n\r\n` +
                    `${id}\r\n`
                ));
            }

            parts.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
                `Content-Type: application/octet-stream\r\n\r\n`
            ));
            parts.push(fileContent);
            parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

            const body = Buffer.concat(parts);

            const options = {
                hostname: 'api-cloud.browserstack.com',
                port:     443,
                path:     '/app-automate/upload',
                method:   'POST',
                headers:  {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type':  `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log('[BS] Upload status:', res.statusCode, data.slice(0, 200));
                    try {
                        const r = JSON.parse(data);
                        if (r.app_url) {
                            resolve({ success: true, appUrl: r.app_url, customId: r.custom_id, filename, sizeMB: fileSizeMB });
                        } else {
                            resolve({ success: false, error: r.error || data.slice(0, 200) });
                        }
                    } catch (e: any) {
                        resolve({ success: false, error: 'Error parseando respuesta: ' + e.message });
                    }
                });
            });

            req.on('error', (e: any) => {
                console.error('[BS] Upload error:', e.message);
                resolve({ success: false, error: e.message });
            });
            req.write(body);
            req.end();
        } catch (e: any) {
            resolve({ success: false, error: e.message });
        }
    });
});

/** Inicia una sesión conectada a BrowserStack (sin Appium local) */
ipcMain.handle('bs-start-session', async (_, config: BrowserStackConfig) => {
    try {
        activeDm = bsDm;
        recordingPlatform = config.platform === 'ios' ? 'ios' : 'android';
        activeSquad = (config as BrowserStackConfig & { squad?: string }).squad || 'payment';
        activeEnvironment = (config as BrowserStackConfig & { environment?: string }).environment || '';
        await sessionOwnership.acquire(bsDm, () => bsDm.init(config));
        locatorManager = new LocatorManager(projectPaths.locators, 'global', config.platform === 'ios' ? 'ios' : 'android');
        inspector  = new MobileInspector(activeDm);
        executor   = new MobileStepExecutor(activeDm, locatorManager);
        sessionActive = true;
        recordedSteps = [];
        automationRecordingStore.start({
            squad: activeSquad,
            platform: recordingPlatform,
            environment: activeEnvironment,
        });
        const screenshot = await inspector.captureScreenshot();
        // Persistir configuración para test.sh / steps.ts
        saveSessionConfig({
            type:            'browserstack',
            platform:        config.platform || 'android',
            squad:           activeSquad,
            environment:     activeEnvironment,
            username:        config.username,
            accessKey:       config.accessKey,
            deviceName:      config.deviceName,
            platformVersion: config.platformVersion,
            appUrl:          config.appUrl          || '',
            appPackage:      config.appPackage      || '',
            appActivity:     config.appActivity     || '',
            bundleId:        config.bundleId        || '',
            projectName:     config.projectName     || 'Appium Visual Recorder',
        });
        return { success: true, screenshot };
    } catch (e: any) {
        console.error('[Main] BS Error:', e.message);
        return { success: false, error: e.message };
    }
});

// ─── IPC HANDLERS — COMUNES ───────────────────────────────────────────────────

ipcMain.on('embedded-inspector-message', (event, data: unknown) => {
    if (!embeddedInspectorWindow || event.sender !== embeddedInspectorWindow.webContents) return;
    try {
        embeddedInspectorHandshake?.handle(data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Mensaje inválido del Inspector';
        mainWindow?.webContents.send('embedded-inspector-error', message);
    }
});

ipcMain.handle('open-inspector', async () => {
    if (!sessionActive) return { success: false, error: 'Sin sesión activa' };

    let resolution;
    try {
        resolution = resolveInspectorMode(
            process.env.RECORDER_INSPECTOR,
            embeddedInspectorAssetsAvailable(),
        );
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Configuración de Inspector inválida',
        };
    }

    const metadata = activeDm.getSessionMetadata();
    if (resolution.mode === 'legacy' || metadata.provider === 'browserstack') {
        return {
            success: true,
            mode: 'legacy',
            warning: resolution.warning || (
                metadata.provider === 'browserstack'
                    ? 'El protocolo embebido no transporta credenciales de BrowserStack; se mantiene el inspector legacy.'
                    : undefined
            ),
        };
    }

    if (focusEmbeddedInspectorWindow(embeddedInspectorWindow)) {
        return { success: true, mode: 'embedded', focused: true };
    }

    let inspectorServerUrl: string;
    try {
        inspectorServerUrl = await embeddedInspectorProxy.start(metadata.serverUrl, metadata.sessionId);
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo iniciar el proxy seguro del Inspector',
        };
    }

    embeddedInspectorWindow = createEmbeddedInspectorWindow();
    embeddedInspectorHandshake = new EmbeddedInspectorHandshake(
        { ...metadata, serverUrl: inspectorServerUrl },
        message => embeddedInspectorWindow?.webContents.send(
            'embedded-inspector-connect',
            message,
        ),
        () => mainWindow?.webContents.send('embedded-inspector-connected'),
        elementUsed => {
            void validateEmbeddedInspectorElementUse(elementUsed);
        },
        error => mainWindow?.webContents.send(
            'embedded-inspector-error',
            `${error.code}: ${error.message}`,
        ),
    );
    embeddedInspectorWindow.on('closed', () => {
        embeddedInspectorWindow = null;
        embeddedInspectorHandshake = null;
        embeddedInspectorProxy.stop().catch(error => {
            console.warn('[Inspector] No se pudo cerrar el proxy:', error.message);
        });
    });
    return { success: true, mode: 'embedded', focused: false };
});

ipcMain.handle('get-screenshot', async () => {
    if (!inspector) return { success: false, error: 'Sin sesion' };
    try {
        const screenshot = await inspector.captureScreenshot();
        return { success: true, screenshot };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('tap-at', async (_, x: number, y: number) => {
    if (!sessionActive || !inspector) {
        return { success: false, error: 'Sin sesion activa' };
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { success: false, error: 'Coordenadas invalidas' };
    }
    try {
        await activeDm.tapAt(x, y);
        // Da tiempo a que termine una transición breve antes de actualizar la vista.
        await new Promise(resolve => setTimeout(resolve, 350));
        const screenshot = await inspector.captureScreenshot();
        return { success: true, screenshot };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('swipe-from-to', async (
    _,
    startX: number,
    startY: number,
    endX: number,
    endY: number
) => {
    if (!sessionActive || !inspector) {
        return { success: false, error: 'Sin sesion activa' };
    }
    if (![startX, startY, endX, endY].every(Number.isFinite)) {
        return { success: false, error: 'Coordenadas invalidas' };
    }
    try {
        await activeDm.swipeFromTo(startX, startY, endX, endY);
        await new Promise(resolve => setTimeout(resolve, 350));
        const screenshot = await inspector.captureScreenshot();
        return { success: true, screenshot };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('activate-inspector', async () => {
    if (!inspector) return { success: false, error: 'Sin sesion activa' };
    await inspector.activate();
    const result = await inspector.waitForSelection(30);
    await inspector.bringPanelToFront(mainWindow);
    if (result && result.candidates.length > 0) {
        const screenshot = await inspector.captureScreenshot().catch(() => undefined);
        return {
            success:    true,
            candidates: result.candidates,   // SelectorCandidate[]
            suggested:  result.suggested,    // nombre de variable sugerido
            tag:        result.tag,
            // compatibilidad: el P1 como xpath para código que aún use result.xpath
            xpath:      result.candidates[0].selector,
            screenshot,
        };
    }
    return { success: false, error: 'Cancelado o timeout' };
});

/**
 * Verificar el selector grabado no basta: WebdriverIO acepta formas que el
 * framework no sabe componer, y el fallo aparecia recien al correr wdio. Aqui
 * se prueban las dos cosas contra el dispositivo que ya esta delante — el
 * selector tal como se grabo y el que saldra de `TypeLocator.<tipo> + valor` —
 * para que el QA vea el problema en el momento de capturarlo.
 */
ipcMain.handle('verify-selector', async (_, selector: string) => {
    if (!inspector) return { success: false, summary: 'Sin sesion activa' };
    const platform: MobilePlatform = recordingPlatform === 'ios' ? 'ios' : 'android';
    let check: ReturnType<typeof roundTrip> | undefined;
    try {
        check = roundTrip(selector, platform);
    } catch {
        check = undefined;
    }

    try {
        const el         = await activeDm.findElement(selector);
        await el.waitForDisplayed({ timeout: 5000 });
        const text       = await el.getText().catch(() => '');
        const tag        = await el.getTagName().catch(() => '');
        const screenshot = await inspector.captureScreenshot().catch(() => undefined);
        const base       = `✓ Encontrado: <${tag}>${text ? ` "${text}"` : ''}`;

        if (!check) {
            return { success: true, summary: base, screenshot };
        }
        if (!check.ok) {
            return {
                success: false,
                locatorType: check.type,
                locatorValue: check.value,
                summary: `${base}\n✗ Pero el framework no lo reconstruye: ${check.reason}`,
                screenshot,
            };
        }
        // El selector compuesto es el que ejecutara el caso generado.
        if (check.composed && check.composed !== selector) {
            try {
                const composedEl = await activeDm.findElement(check.composed);
                await composedEl.waitForDisplayed({ timeout: 5000 });
            } catch {
                return {
                    success: false,
                    locatorType: check.type,
                    locatorValue: check.value,
                    summary: `${base}\n✗ Pero TypeLocator.${check.type} + valor produce `
                        + `"${check.composed}", que no encuentra el elemento.`,
                    screenshot,
                };
            }
        }
        return {
            success: true,
            locatorType: check.type,
            locatorValue: check.value,
            summary: `${base}\n✓ TypeLocator.${check.type} reconstruye el selector.`,
            screenshot,
        };
    } catch {
        return { success: false, summary: `✗ No encontrado: ${selector}` };
    }
});

ipcMain.handle('execute-step', async (_, stepData: RecordedStep & { selectorCandidateToken?: string }) => {
    if (!executor) return { success: false, message: 'Sin sesion activa' };
    const executableStep = stepData as RecordedStep;
    let preparedStep: RecordedStep;
    let persistedStep: RecordedStep;
    try {
        preparedStep = prepareRecordedStep(
            executableStep,
            recordedSteps.length + 1,
            recordingPlatform,
            false,
        );
        const selectorCandidateToken = typeof stepData.selectorCandidateToken === 'string'
            ? stepData.selectorCandidateToken
            : '';
        const trustedCandidates =
            preparedStep.selectorVerified === true
            && pendingInspectorCandidates
            && selectorCandidateToken === pendingInspectorCandidates.token
            && preparedStep.selector === pendingInspectorCandidates.selector
                ? pendingInspectorCandidates.candidates
                : undefined;
        const _untrustedCandidates = preparedStep.selectorVerified === true && Boolean(trustedCandidates)
            ? trustedCandidates
            : undefined;
        persistedStep = prepareRecordedStep(
            {
                ...preparedStep,
                elementIntent: preparedStep.elementIntent
                    || preparedStep.description
                    || preparedStep.variableName,
                selectorVerified: preparedStep.selectorVerified === true,
                selectorCandidates: _untrustedCandidates,
            },
            recordedSteps.length + 1,
            recordingPlatform,
        );
        pendingInspectorCandidates = null;
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'El step no superó la validación previa',
            totalSteps: recordedSteps.length,
        };
    }
    const result = await executor.execute(preparedStep);
    if (result.success) {
        recordedSteps.push(persistedStep);
        try {
            syncRecording();
        } catch (error) {
            recordedSteps.pop();
            return {
                success: false,
                message:
                    'La acción se ejecutó, pero no pudo persistirse y se revirtió del recording: '
                    + (error instanceof Error ? error.message : String(error)),
                totalSteps: recordedSteps.length,
            };
        }
        if (preparedStep.variableName && preparedStep.selector) {
            if (!locatorManager.exists(preparedStep.variableName)) {
                locatorManager.add(preparedStep.variableName, preparedStep.selector, false);
            }
        }
        const screenshot = await inspector?.captureScreenshot().catch(() => undefined);
        return { ...result, totalSteps: recordedSteps.length, screenshot };
    }
    return { ...result, totalSteps: recordedSteps.length };
});

ipcMain.handle('delete-step', async (_, index: number) => {
    if (index >= 0 && index < recordedSteps.length) recordedSteps.splice(index, 1);
    syncRecording();
    return { success: true, totalSteps: recordedSteps.length };
});

ipcMain.handle('clear-steps', async () => {
    recordedSteps = [];
    syncRecording();
    return { success: true };
});

ipcMain.handle('preview-gherkin', async (_, featureName: string, scenarioName: string) => {
    return { success: true, preview: featureGen.preview(featureName, scenarioName, recordedSteps) };
});

function prepareGenerationRequest(
    request: Omit<GenerationRequest, 'platform'>
): GenerationRequest {
    // El análisis de impacto se confirma explícitamente en el paso Gherkin del
    // renderer. Preview y Generar respetan esa decisión y no vuelven a cambiar
    // silenciosamente un step nuevo por uno reutilizado.
    return { ...request, platform: recordingPlatform };
}

ipcMain.handle('preview-fwk-files', async (_, request: Omit<GenerationRequest, 'platform'>) => {
    try {
        const prepared = prepareGenerationRequest(request);
        const preview = fwkMobileGenerator.preview(prepared, recordedSteps);
        const validation = outputValidator.validate(preview, prepared.platform);
        const managed = generatedFileRegistry.assess(preview, prepared.squad);
        validation.conflicts = managed.conflicts;
        validation.valid = validation.errors.length === 0 && validation.conflicts.length === 0;
        const fingerprint = generationFingerprint(prepared, recordedSteps);
        const previewToken = crypto.randomUUID();
        approvedPreviews.clear();
        approvedPreviews.set(previewToken, fingerprint);
        return {
            success: true,
            preview,
            validation,
            previewToken,
            managedUpdates: managed.writable.size
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

function generationFingerprint(request: GenerationRequest, steps: RecordedStep[]): string {
    return crypto.createHash('sha256')
        .update(JSON.stringify({ request, steps }))
        .digest('hex');
}

ipcMain.handle('generate-fwk-files', async (
    _,
    request: Omit<GenerationRequest, 'platform'>,
    previewToken: string,
    reviewedContents?: Record<string, string>
) => {
    try {
        const prepared = prepareGenerationRequest(request);
        const expectedFingerprint = approvedPreviews.get(previewToken);
        const actualFingerprint = generationFingerprint(prepared, recordedSteps);
        if (!previewToken || !expectedFingerprint || expectedFingerprint !== actualFingerprint) {
            throw new Error('La grabación cambió. Ejecuta Preview nuevamente antes de generar.');
        }
        let preview = fwkMobileGenerator.preview(prepared, recordedSteps);
        if (reviewedContents) {
            preview = fwkMobileGenerator.withReviewedContents(preview, reviewedContents);
        }
        const validation = outputValidator.validate(preview, prepared.platform);
        const managed = generatedFileRegistry.assess(preview, prepared.squad);
        validation.conflicts = managed.conflicts;
        validation.valid = validation.errors.length === 0 && validation.conflicts.length === 0;
        if (!validation.valid) {
            const details = [...validation.errors, ...validation.conflicts].join(', ');
            throw new Error(`La salida no superó la validación: ${details}`);
        }
        const generated = fwkMobileGenerator.generate(
            prepared,
            recordedSteps,
            managed.writable,
            reviewedContents
        );
        const manifest = generatedFileRegistry.register(generated, prepared.squad);
        approvedPreviews.delete(previewToken);
        return {
            success: true,
            generated,
            validation,
            managedFiles: Object.keys(manifest.files)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('generate-files', async (_, featureName: string, scenarioName: string) => {
    if (!GENERATION_ENABLED) {
        return {
            success: false,
            error: 'La generación está bloqueada hasta implementar la salida compatible con fwk-mobile-test.'
        };
    }
    if (recordedSteps.length === 0) return { success: false, error: 'No hay steps grabados' };
    const filePath     = featureGen.generate(featureName, scenarioName, recordedSteps);
    const locatorsPath = locatorManager.getFilePath();
    return { success: true, featurePath: filePath, locatorsPath };
});

/**
 * [visual-recorder] Continuar una grabacion existente.
 *
 * Es la otra mitad de "Completar una grabacion": la que ya existia solo asigna
 * locators de la plataforma que falta, y para eso necesita un plan. Esta carga
 * las acciones ya grabadas de vuelta al recorder para que el QA siga grabando
 * encima — el caso tipico es una grabacion sin Then, que el builder rechaza y
 * que por tanto nunca va a tener plan.
 *
 * Reengancha la carpeta original, asi los pasos nuevos caen en la misma
 * grabacion en vez de crear una segunda a medias.
 */
ipcMain.handle('resume-recording', async (_, input: {
    recordingId: string;
    squad?: string;
}) => {
    try {
        if (!sessionActive) throw new Error('Conecta el dispositivo antes de continuar la grabación');
        const squad = input.squad || activeSquad;
        const directory = recordingCoverageAnalyzer.findRecordingDirectory(
            squad,
            input.recordingId,
            activeEnvironment
        );
        const resumed = automationRecordingStore.resume(directory);
        if (resumed.manifest.platform !== recordingPlatform) {
            throw new Error(
                `La grabación es de ${resumed.manifest.platform.toUpperCase()} y la sesión actual es ` +
                `${recordingPlatform.toUpperCase()}: conecta un dispositivo ${resumed.manifest.platform.toUpperCase()} ` +
                'para seguir grabando pasos, o usa la opción de completar locators.'
            );
        }
        activeSquad = squad;
        recordedSteps = resumed.actions.map(step => ({ ...step }));
        activeAutomationPackage = '';
        automationPreview = null;
        // Deja el manifest consistente con lo que acabamos de cargar: si el
        // proceso muere aqui, la grabacion sigue siendo la misma, no una vacia.
        syncRecording();
        return {
            success: true,
            steps: recordedSteps,
            recordingId: resumed.manifest.recordingId,
            scenario: resumed.scenario,
            hasAssertion: recordedSteps.some(step => /^VERIFICAR_/.test(String(step.action))),
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('prepare-automation-package', async (_, input: {
    request: Omit<GenerationRequest, 'platform'>;
    objective: string;
    acceptanceCriteria: string;
}) => {
    try {
        emitAutomationProgress('ANALYZING', 'Analizando grabación', 1, 6);
        if (!recordedSteps.length) throw new Error('No hay acciones grabadas');
        if (!input.objective?.trim()) throw new Error('Describe el objetivo funcional del caso');
        if (!input.acceptanceCriteria?.trim()) throw new Error('Define el resultado esperado');
        const request = prepareGenerationRequest(input.request);
        const { scenario, directory } = automationRecordingStore.buildScenario({
            request,
            actions: recordedSteps,
            objective: input.objective,
            acceptanceCriteria: input.acceptanceCriteria,
            environment: activeEnvironment,
        });
        const result = automationPackageBuilder.prepare(scenario, directory);
        emitAutomationProgress('RESOLVING_CONTEXT', 'Preparando estructura de automatización', 2, 6);
        activeAutomationPackage = result.packageDirectory;
        automationPreview = null;
        const handoff = automationAgentLauncher.describe(
            projectPaths.automationAgent,
            result.packageDirectory
        );
        emitAutomationProgress(
            result.agentRequired ? 'RESOLVING_DECISIONS' : 'GENERATING',
            result.agentRequired ? 'Resolviendo decisiones pendientes' : 'Generando automatización',
            result.agentRequired ? 3 : 4,
            6,
        );
        return { success: true, result, handoff };
    } catch (e: any) {
        emitAutomationProgress('FAILED', 'No pudimos analizar la grabación', 0, 6, { error: e.message });
        return { success: false, error: e.message };
    }
});

ipcMain.handle('prepare-automation-regeneration', async (_, input: {
    recordingId: string;
    squad?: string;
    refinement: string;
    cleanPackage?: boolean;
}) => {
    try {
        const squad = input.squad || activeSquad;
        const directory = recordingCoverageAnalyzer.findRecordingDirectory(
            squad,
            input.recordingId,
            activeEnvironment
        );
        const info = recordingCoverageAnalyzer.getRecordingInfo(
            squad,
            input.recordingId,
            activeEnvironment
        );
        const mode = info.canRegenerate && !input.cleanPackage
            ? 'refinement'
            : 'reprocess';
        const result = mode === 'refinement'
            ? automationPackageBuilder.prepareRegeneration(directory, input.refinement)
            : automationPackageBuilder.prepareRecordedScenario(directory, Boolean(input.cleanPackage));
        activeAutomationPackage = result.packageDirectory;
        automationPreview = null;
        const handoff = automationAgentLauncher.describe(
            projectPaths.automationAgent,
            result.packageDirectory
        );
        return { success: true, result, handoff, mode };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('launch-automation-agent', async (_, input?: {
    mode?: string;
    autorun?: boolean;
}) => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        emitAutomationProgress('RESOLVING_DECISIONS', 'Resolviendo decisiones pendientes', 3, 6);
        const mode: AgentExecutionMode = resolveAgentExecutionMode(
            input?.mode || process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE
        );
        if (mode === 'manual') {
            new AgentRunStore(activeAutomationPackage).markAgentStarted();
            const launch = input?.autorun
                ? automationAgentLauncher.openTerminalWithPrompt(
                    projectPaths.automationAgent,
                    activeAutomationPackage
                )
                : automationAgentLauncher.openTerminal(
                    projectPaths.automationAgent,
                    activeAutomationPackage
                );
            return {
                success: true,
                mode,
                automatic: false,
                launch,
            };
        }
        const run = await agentOrchestrator.run(activeAutomationPackage, mode);
        if (run.success) {
            emitAutomationProgress('GENERATING', 'Generando automatización', 4, 6);
            const imported = await importAutomationResponseFromPackage(activeAutomationPackage);
            if (imported.success) {
                emitAutomationProgress('READY_FOR_REVIEW', 'Listo para revisión', 6, 6);
            }
            return {
                success: imported.success,
                mode,
                automatic: true,
                run,
                ...(imported.success
                    ? { imported }
                    : {
                        error: imported.error,
                        validation: imported.validation,
                        repairAvailable: imported.repairAvailable,
                        draft: imported.draft,
                    }),
            };
        }
        if (run.fallback) {
            const handoff = automationAgentLauncher.describe(
                projectPaths.automationAgent,
                activeAutomationPackage
            );
            emitAutomationProgress(
                'FAILED',
                'No pudimos completar la resolución automática',
                0,
                6,
                { error: run.error || run.errorCode || 'Proveedor no disponible' }
            );
            return {
                success: false,
                mode,
                automatic: true,
                fallbackSuggested: true,
                fallbackReason: run.errorCode,
                handoff,
                error: run.error || 'La ejecución automática no está disponible en este momento.',
            };
        }
        return {
            success: false,
            mode,
            automatic: true,
            error: run.error || run.errorCode || 'La ejecución automática falló',
            run,
        };
    } catch (e: any) {
        emitAutomationProgress('FAILED', 'No pudimos resolver decisiones automáticamente', 0, 6, {
            error: e.message,
        });
        if (activeAutomationPackage) {
            const run = new AgentRunStore(activeAutomationPackage);
            run.markAgentFinished();
            run.mark('agent-launch-failed');
        }
        return { success: false, error: e.message };
    }
});

async function importAutomationResponseFromPackage(
    packageDirectory: string,
    options: {
        reviewedContents?: Record<string, string>;
        trackRepair?: boolean;
    } = {},
): Promise<Record<string, any>> {
    const runStore = new AgentRunStore(packageDirectory);
    runStore.markAgentFinished();
    runStore.markRepairFinished();
    const read = <T>(name: string): T => readJsonUtf8<T>(path.join(packageDirectory, name));
    const packagedScenario = read<PackagedAutomationScenario>('scenario.json');
    const recordingScenarioFile = path.resolve(packageDirectory, '..', '..', 'scenario.json');
    if (!fs.existsSync(recordingScenarioFile)) {
        throw new Error('No se encontró la grabación original para validar scenario.json');
    }
    const recordingScenario = readJsonUtf8<AutomationScenario>(recordingScenarioFile);
    const trustedPackagedScenario = automationPackageBuilder.requireTrustedScenarioPackage(
        recordingScenario,
        packagedScenario,
        packageDirectory,
    );
    const scenario = trustedPackagedScenario;
    const effectivePlanFile = path.join(packageDirectory, 'effective-generation-plan.json');
    let plan = fs.existsSync(effectivePlanFile)
        ? readJsonUtf8<GenerationPlan>(effectivePlanFile)
        : read<GenerationPlan>('generation-plan.json');
    const receiptFile = path.join(packageDirectory, 'application-receipt.json');
    const applicationReceipt = fs.existsSync(receiptFile)
        ? readJsonUtf8<AutomationApplicationReceipt>(receiptFile)
        : undefined;
    if (applicationReceipt) {
        requireUnchangedAppliedFiles(
            projectPaths.frameworkRoot,
            applicationReceipt,
            scenario.recordingId,
            plan.planId,
        );
        // Un update ya aplicado dejó de coincidir con el baseHash original del
        // plan. Para una corrección legítima, su nueva base es exactamente el
        // afterHash persistido y verificado en el recibo de aplicación.
        plan = planAgainstApplicationReceipt(plan, applicationReceipt);
    }
    const responsePath = path.join(packageDirectory, 'agent-response.json');
    if (!fs.existsSync(responsePath)) {
        throw new Error(
            'Aún no existe agent-response.json en el paquete. ' +
            'Si abriste ejecución manual, completa el proveedor y luego usa "Importar resultado manual".'
        );
    }
    let response = withGeneratedResponseMetadata(
        readJsonUtf8<AutomationAgentResponse>(responsePath),
        scenario.createdAt
    );
    if (options.reviewedContents) {
        response = {
            ...response,
            files: response.files.map(file => ({
                ...file,
                content: options.reviewedContents?.[
                    path.join(projectPaths.frameworkRoot, file.path)
                ] ?? file.content,
            })),
        };
    }
    response = normalizeJsonUnicode(response);
    const normalized = normalizeAgentResponseEnglishIdentifiers(response);
    response = withGeneratedResponseMetadata(normalized.response, scenario.createdAt);
    const tagged = enforceAgentResponsePlatformTags(response, scenario.platform);
    response = withGeneratedResponseMetadata(tagged.response, scenario.createdAt);
    runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
    writeJsonUtf8(path.join(packageDirectory, 'agent-response.json'), response);
    const statusFile = path.join(packageDirectory, 'status.json');
    const status = fs.existsSync(statusFile) ? read<any>('status.json') : {};
    const repairAttempts = Number(status.repairAttempts || 0);
    const responseHash = crypto.createHash('sha256')
        .update(JSON.stringify(response))
        .digest('hex');
    const previousInvalidHash = typeof status.lastInvalidResponseHash === 'string'
        ? status.lastInvalidResponseHash
        : '';
    const validatorStarted = process.hrtime.bigint();
    emitAutomationProgress('VALIDATING', 'Validando resultado', 5, 6);
    const validation = automationResponseValidator.validate(scenario, plan, response, repairAttempts);
    if (Object.keys(normalized.renamed).length > 0 || normalized.skipped.length > 0) {
        validation.warnings.push(
            `Normalización de identificadores ES→EN aplicada: ${Object.keys(normalized.renamed).length}; ` +
            `omitida: ${normalized.skipped.length}.`
        );
    }
    if (tagged.added.length > 0) {
        validation.warnings.push(
            `Tags de plataforma autoagregados en Feature: ${tagged.added.map(platform => `@${platform}`).join(', ')}.`
        );
    }
    runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
    writeJsonUtf8(path.join(packageDirectory, 'validation.json'), validation);
    const draftPreview = Array.isArray(response.files) &&
        response.files.some(file =>
            file?.layer === 'feature' &&
            typeof file.path === 'string' &&
            typeof file.content === 'string'
        ) &&
        response.files.every(file =>
            file &&
            typeof file.path === 'string' &&
            typeof file.content === 'string'
        )
        ? automationResponseValidator.toPreview(response)
        : null;
    const draftPayload = draftPreview
        ? { draft: { preview: draftPreview, validation } }
        : {};
    if (!validation.valid) {
        if (options.trackRepair === false) {
            return {
                success: false,
                validation,
                repairAvailable: true,
                error: validation.errors.map(item => item.message).join(' | '),
                ...draftPayload,
            };
        }
        const existingAutomation = validation.errors.find(item => item.code === 'existing-automation');
        if (existingAutomation) {
            writeJsonUtf8(statusFile, {
                ...status,
                state: 'existing-automation',
                updatedAt: new Date().toISOString(),
            });
            runStore.mark('existing-automation', true);
            return {
                success: false,
                validation,
                repairAvailable: false,
                error: existingAutomation.message,
                ...draftPayload,
            };
        }
        const isRepairSubmission = Boolean(previousInvalidHash);
        const changedByRepair = isRepairSubmission && previousInvalidHash !== responseHash;
        if (isRepairSubmission && !changedByRepair) {
            writeJsonUtf8(statusFile, {
                ...status,
                state: 'repair-no-change',
                lastInvalidResponseHash: responseHash,
                unchangedRepairOutputs: Number(status.unchangedRepairOutputs || 0) + 1,
                updatedAt: new Date().toISOString(),
            });
            runStore.setRepairAttempts(repairAttempts);
            runStore.mark('repair-output-unchanged', true);
            return {
                success: false,
                validation,
                repairAvailable: false,
                error: 'El agente terminó sin modificar agent-response.json. La reparación no fue consumida; corrige el archivo y usa Reimportar corrección.',
                ...draftPayload,
            };
        }
        const effectiveRepairAttempts = repairAttempts + (changedByRepair ? 1 : 0);
        if (effectiveRepairAttempts >= plan.budgets.maxRepairAttempts && isRepairSubmission) {
            writeJsonUtf8(statusFile, {
                ...status,
                state: 'repair-exhausted',
                repairAttempts: effectiveRepairAttempts,
                lastInvalidResponseHash: responseHash,
                updatedAt: new Date().toISOString(),
            });
            runStore.setRepairAttempts(effectiveRepairAttempts);
            runStore.mark('repair-exhausted', true);
            return {
                success: false,
                validation,
                error: 'Se agotó la única reparación permitida: ' + validation.errors.map(item => item.message).join(' | '),
                ...draftPayload,
            };
        }
        writeJsonUtf8(
            path.join(packageDirectory, 'repair-context.json'),
            validation.repairContext,
        );
        writeJsonUtf8(statusFile, {
            ...status,
            state: 'targeted-repair',
            repairAttempts: effectiveRepairAttempts,
            lastInvalidResponseHash: responseHash,
            unchangedRepairOutputs: 0,
            updatedAt: new Date().toISOString(),
        });
        runStore.setRepairAttempts(effectiveRepairAttempts);
        runStore.markRepairStarted();
        return {
            success: false,
            validation,
            repairAvailable: true,
            error: validation.errors.map(item => item.message).join(' | '),
            ...draftPayload,
        };
    }
    const preview = automationResponseValidator.toPreview(response);
    const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
    const token = crypto.randomUUID();
    automationPreview = { token, scenario, plan, response };
    runStore.mark('ready-for-review');
    emitAutomationProgress('READY_FOR_REVIEW', 'Validación completa', 6, 6);
    return { success: true, preview, validation, previewToken: token, conflicts: managed.conflicts };
}

ipcMain.handle('import-automation-response', async () => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        return await importAutomationResponseFromPackage(activeAutomationPackage);
    } catch (e: any) {
        if (activeAutomationPackage) new AgentRunStore(activeAutomationPackage).mark('import-failed', true);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('revalidate-automation-response', async (
    _,
    reviewedContents: Record<string, string>,
) => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        if (!reviewedContents || typeof reviewedContents !== 'object' || Array.isArray(reviewedContents)) {
            throw new Error('No se recibieron archivos revisados para validar.');
        }
        return await importAutomationResponseFromPackage(activeAutomationPackage, {
            reviewedContents,
            trackRepair: false,
        });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-automation-qa-decisions', async () => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        const plan = JSON.parse(
            fs.readFileSync(path.join(activeAutomationPackage, 'generation-plan.json'), 'utf-8')
        ) as GenerationPlan;
        const decisions = qaDecisionPromptsFromPlan(plan, activeAutomationPackage);
        if (decisions.length) {
            emitAutomationProgress('WAITING_FOR_QA', 'Se requiere confirmación de QA', 3, 6);
        }
        return {
            success: true,
            required: decisions.length > 0,
            recordingId: plan.recordingId,
            planId: plan.planId,
            decisions,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('resolve-automation-qa-decisions', async (_, input: {
    decisions: Array<{ gapId: string; optionId: string }>;
}) => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        emitAutomationProgress('RESOLVING_DECISIONS', 'Aplicando decisiones de QA', 3, 6);
        const plan = JSON.parse(
            fs.readFileSync(path.join(activeAutomationPackage, 'generation-plan.json'), 'utf-8')
        ) as GenerationPlan;
        const prompts = qaDecisionPromptsFromPlan(plan, activeAutomationPackage);
        if (!prompts.length) throw new Error('No hay decisiones QA pendientes.');
        const selectedByGap = new Map<string, string>();
        for (const entry of input?.decisions || []) {
            if (!entry?.gapId || !entry?.optionId) continue;
            if (selectedByGap.has(entry.gapId)) {
                throw new Error(`La decisión para ${entry.gapId} está duplicada.`);
            }
            selectedByGap.set(entry.gapId, entry.optionId);
        }
        const qaResolutions: GapResolution[] = [];
        for (const prompt of prompts) {
            const optionId = selectedByGap.get(prompt.gapId);
            if (!optionId) throw new Error(`Falta confirmar una decisión de QA.`);
            const option = prompt.options.find(entry => entry.optionId === optionId);
            if (!option) throw new Error('La decisión seleccionada no es válida para este gap.');
            qaResolutions.push({
                gapId: prompt.gapId,
                decision: option.decision,
                reason: `${option.reason} (confirmado por QA)`,
                ...(option.symbol ? { symbol: option.symbol } : {}),
                ...(option.candidate ? { evidence: [option.candidate.file] } : {}),
            });
            const target = plan.resolutions.find(resolution => resolution.gapId === prompt.gapId);
            if (target && option.decision === 'reuse' && option.candidate) {
                target.resolution = 'reuse';
                target.locatorName = option.candidate.name;
                target.source = {
                    file: option.candidate.file,
                    module: option.candidate.module,
                    scope: target.source?.scope || 'squad',
                };
                target.reason = `${target.reason} QA confirmó reutilización ${option.candidate.module}.${option.candidate.name}.`;
            }
            if (target && option.decision === 'create') {
                target.resolution = 'create';
                target.reason = `${target.reason} QA confirmó crear componente nuevo.`;
            }
        }
        writeJsonUtf8(path.join(activeAutomationPackage, 'generation-plan.json'), plan);
        const finalResolutions = mergedResolutionsWithQa(plan, qaResolutions, activeAutomationPackage);
        writeJsonUtf8(
            path.join(activeAutomationPackage, 'gap-resolutions.json'),
            {
                schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
                recordingId: plan.recordingId,
                planId: plan.planId,
                resolutions: finalResolutions,
            },
        );
        const response = deterministicGenerator.generate(activeAutomationPackage, finalResolutions);
        emitAutomationProgress('GENERATING', 'Generando automatización', 4, 6);
        writeJsonUtf8(path.join(activeAutomationPackage, 'agent-response.json'), response);
        const imported = await importAutomationResponseFromPackage(activeAutomationPackage);
        if (imported.success) emitAutomationProgress('READY_FOR_REVIEW', 'Listo para revisión', 6, 6);
        return {
            success: imported.success,
            ...(imported.success ? { imported } : { error: imported.error, validation: imported.validation }),
        };
    } catch (e: any) {
        emitAutomationProgress('FAILED', 'No pudimos aplicar la decisión de QA', 0, 6, { error: e.message });
        return { success: false, error: e.message };
    }
});

/**
 * Convierte las capas planificadas como `update` en un patch aditivo.
 *
 * El contenido propuesto (por el resolver o por el agente) trae el archivo
 * completo; aquí se compara contra el que está en disco y solo se insertan los
 * símbolos nuevos, con su comentario de trazabilidad. Devuelve además las rutas
 * absolutas ya atendidas para que la escritura de archivos completos las omita.
 */
function applyAdditiveUpdates(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse,
    updates: Map<string, string>
): { outcomes: ReturnType<AutomationPatchWriter['apply']>; absolute: Set<string> } {
    const absolute = new Set<string>();
    const contentOf = (layer: string) => response.files.find(file => file.layer === layer)?.content;
    const read = (relative: string) => fs.readFileSync(path.join(projectPaths.frameworkRoot, relative), 'utf-8');
    const createdAt = new Date().toISOString();
    const input: any = { recordingId: scenario.recordingId, createdAt };

    // Rellenos de claves existentes. El valor NUNCA sale de la respuesta: se
    // copia del selector que el QA verifico en esa accion de la grabacion, asi
    // que por esta via no puede entrar un selector inventado.
    const completionsByFile = new Map<
        string,
        { name: string; platform: 'android' | 'ios'; block: string; value: string }[]
    >();
    for (const completion of response.completions || []) {
        const targets = plan.resolutions
            .find(resolution => resolution.sequence === completion.sequence)
            ?.completionTargets?.filter(candidate =>
                candidate.file === completion.file
                && candidate.name === completion.name
                && candidate.platform === completion.platform
                && candidate.block.toLowerCase().endsWith(completion.platform)
            ) || [];
        const target = targets.length === 1 ? targets[0] : undefined;
        if (!target) {
            throw new Error(`Completion no autorizado para ${completion.file}#${completion.name}.`);
        }
        const action = scenario.actions.find(step => step.sequence === completion.sequence);
        const value = action?.locatorValue
            || (action?.selector ? frameworkLocator(action.selector, completion.platform).value : '');
        if (!value) {
            throw new Error(`La acción ${completion.sequence} no contiene un locator primario aplicable.`);
        }
        const bucket = completionsByFile.get(completion.file) || [];
        bucket.push({
            name: completion.name,
            platform: completion.platform,
            block: target.block,
            value,
        });
        completionsByFile.set(completion.file, bucket);
    }

    const locatorsPath = updates.get('locators');
    const locatorsProposed = contentOf('locators');
    if (locatorsPath && locatorsProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, locatorsPath))) {
        input.locators = {
            file: locatorsPath,
            additions: locatorAdditions(read(locatorsPath), locatorsProposed),
            completions: completionsByFile.get(locatorsPath) || [],
        };
        completionsByFile.delete(locatorsPath);
    }
    const screenPath = updates.get('screen');
    const screenProposed = contentOf('screen');
    if (screenPath && screenProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, screenPath))) {
        input.screen = { file: screenPath, ...screenAdditions(read(screenPath), screenProposed) };
    }
    const stepsPath = updates.get('steps');
    const stepsProposed = contentOf('steps');
    if (stepsPath && stepsProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, stepsPath))) {
        const { definitions, imports } = stepsAdditions(read(stepsPath), stepsProposed);
        input.steps = { file: stepsPath, definitions, screenImport: imports[0] };
    }
    const featurePath = updates.get('feature');
    const featureProposed = contentOf('feature');
    if (featurePath && featureProposed && fs.existsSync(path.join(projectPaths.frameworkRoot, featurePath))) {
        const scenarioBlock = featureAdditions(read(featurePath), featureProposed);
        if (scenarioBlock) input.feature = { file: featurePath, scenario: scenarioBlock };
    }

    const outcomes = automationPatchWriter.apply(input, projectPaths.frameworkRoot);
    // Un relleno puede caer en un modulo que este caso no escribe —el clasico es
    // grabar en Android sobre un modulo que se hizo grabando en iOS—, asi que va
    // en su propia pasada sobre ese archivo.
    for (const [file, completions] of completionsByFile) {
        if (!fs.existsSync(path.join(projectPaths.frameworkRoot, file))) {
            throw new Error(`No existe el archivo externo autorizado para completion: ${file}`);
        }
        outcomes.push(...automationPatchWriter.apply(
            { recordingId: scenario.recordingId, createdAt, locators: { file, additions: [], completions } },
            projectPaths.frameworkRoot
        ));
    }
    for (const outcome of outcomes) absolute.add(path.join(projectPaths.frameworkRoot, outcome.file));
    return { outcomes, absolute };
}

ipcMain.handle('generate-automation-response', async (
    _,
    previewToken: string,
    reviewedContents?: Record<string, string>
) => {
    let runStore: AgentRunStore | undefined;
    let correctionBackups = new Map<string, string>();
    try {
        if (!automationPreview || automationPreview.token !== previewToken) {
            throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
        }
        emitAutomationProgress('APPLYING', 'Aplicando automatización', 1, 2);
        const { scenario, plan } = automationPreview;
        runStore = new AgentRunStore(activeAutomationPackage);
        const response: AutomationAgentResponse = normalizeJsonUnicode({
            ...automationPreview.response,
            files: automationPreview.response.files.map(file => ({
                ...file,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
            })),
        });
        const validatorStarted = process.hrtime.bigint();
        const validation = automationResponseValidator.validate(scenario, plan, response);
        runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        if (!validation.valid) throw new Error(validation.errors.map(item => item.message).join(' | '));
        const preview = automationResponseValidator.toPreview(response);
        const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
        if (managed.conflicts.length) {
            throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        }
        const receiptFile = path.join(activeAutomationPackage, 'application-receipt.json');
        if (fs.existsSync(receiptFile)) {
            const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
            requireUnchangedAppliedFiles(
                projectPaths.frameworkRoot,
                receipt,
                scenario.recordingId,
                plan.planId,
            );
            correctionBackups = restoreUpdateBaselinesForCorrection(
                activeAutomationPackage,
                projectPaths.frameworkRoot,
                plan,
            );
        }
        // Los `update` se amplían con un patch aditivo en vez de reescribirse: el
        // archivo puede ser ajeno y solo debe recibir los símbolos nuevos.
        const updates = new Map(plan.files
            .filter(file => file.operation === 'update')
            .map(file => [file.layer, file.path]));
        const patched = applyAdditiveUpdates(scenario, plan, response, updates);
        const createOnly: GeneratedPreview = {
            ...preview,
            files: preview.files.filter(file => !patched.absolute.has(file)),
        };
        const generated = fwkMobileGenerator.writePreview(
            createOnly,
            new Set([...managed.writable].filter(file => !patched.absolute.has(file)))
        );
        generatedFileRegistry.register(generated, scenario.squad, plan.files);
        for (const outcome of patched.outcomes) {
            if (!outcome.added.length) continue;
            generatedFileRegistry.registerPatch(
                path.join(projectPaths.frameworkRoot, outcome.file),
                scenario.squad,
                scenario.recordingId,
                outcome.added
            );
        }
        const memoryEntry = automationMemory.promote(scenario, plan, response, validation);
        writeJsonUtf8(path.join(activeAutomationPackage, 'agent-response.json'), response);
        writeJsonUtf8(path.join(activeAutomationPackage, 'validation.json'), validation);
        const applicationReceipt = createAutomationApplicationReceipt(
            projectPaths.frameworkRoot,
            scenario,
            plan,
            response,
        );
        writeJsonUtf8(
            path.join(activeAutomationPackage, 'application-receipt.json'),
            applicationReceipt,
        );
        const statusFile = path.join(activeAutomationPackage, 'status.json');
        let status: Record<string, any> = {};
        try { status = readJsonUtf8<Record<string, any>>(statusFile); } catch { status = {}; }
        writeJsonUtf8(statusFile, {
            ...status,
            recordingId: scenario.recordingId,
            planId: plan.planId,
            state: 'generated',
            generatedAt: new Date().toISOString(),
            memoryVersion: memoryEntry.version,
        });
        automationPreview = null;
        runStore.mark('generated', true);
        emitAutomationProgress('COMPLETED', 'Automatización aplicada correctamente', 2, 2);
        return { success: true, generated, validation, memoryVersion: memoryEntry.version, patched: patched.outcomes };
    } catch (e: any) {
        if (correctionBackups.size) rollbackCorrectionBaselines(correctionBackups);
        emitAutomationProgress('FAILED', 'No pudimos aplicar la automatización', 0, 2, {
            error: e.message,
        });
        runStore?.mark('generation-failed', true);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-automation-memory-stats', async () => ({
    success: true,
    stats: automationMemory.stats(),
}));

ipcMain.handle('get-steps', async () => ({ steps: recordedSteps }));

ipcMain.handle('close-session', async () => {
    await recorderLifecycle.cleanup();
    return { success: true };
});

ipcMain.handle('get-page-source', async () => {
    try {
        const xml = await activeDm.getPageSource();
        return { success: true, xml };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('find-element-at', async (_, x: number, y: number) => {
    try {
        const xml = await activeDm.getPageSource();
        return { success: true, xml };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

// ─── LINKED STEPS (TypeScript) ───────────────────────────────────────────────

/** Convierte un RecordedStep en una línea de código TypeScript usando PageFactory */
function stepToCode(s: any): string {
    const loc = s.variableName
        ? `'${s.variableName}'`
        : s.selector ? `'${s.selector}'` : "''";
    const val = (s.value || '').replace(/'/g, "\\'");

    switch (s.action) {
        case 'CLICK':               return `    await PageFactory.base.click(${loc});`;
        case 'ESCRIBIR':            return `    await PageFactory.base.type(${loc}, '${val}');`;
        case 'LIMPIAR':             return `    await PageFactory.base.clear(${loc});`;
        case 'SCROLL_DOWN':         return `    await PageFactory.base.scrollDown();`;
        case 'SCROLL_UP':           return `    await PageFactory.base.scrollUp();`;
        case 'SCROLL_HASTA':        return `    await PageFactory.base.scrollTo(${loc});`;
        case 'SWIPE':               return `    await PageFactory.base.swipe('${val}');`;
        case 'PRESION_LARGA':       return `    await PageFactory.base.longPress(${loc});`;
        case 'VOLVER':              return `    await PageFactory.base.back();`;
        case 'ESPERAR':             return `    await PageFactory.base.wait(${val || 1});`;
        case 'SCREENSHOT':          return `    await PageFactory.base.screenshot();`;
        case 'VERIFICAR_TEXTO':     return `    await PageFactory.base.verifyText(${loc}, '${val}');`;
        case 'VERIFICAR_EXISTE':    return `    await PageFactory.base.verifyExists(${loc});`;
        case 'VERIFICAR_NO_EXISTE': return `    await PageFactory.base.verifyNotExists(${loc});`;
        case 'ABRIR_APP':           return `    // ABRIR_APP: '${val}' — gestionar en Before hook`;
        default:                    return `    // TODO: ${s.action} ${loc}`;
    }
}

ipcMain.handle('generate-linked-files', async (_, featureName: string, scenarioName: string, stepRows: { keyword: string; text: string }[], linked: Record<string, any[]>) => {
    try {
        if (!GENERATION_ENABLED) {
            return {
                success: false,
                error: 'La generación está bloqueada hasta implementar la salida compatible con fwk-mobile-test.'
            };
        }
        // Debe coincidir con cucumber.json para que los escenarios generados se ejecuten.
        const featuresDir = projectPaths.features;
        const stepsDir    = projectPaths.stepDefinitions;
        fs.mkdirSync(featuresDir, { recursive: true });
        fs.mkdirSync(stepsDir,    { recursive: true });

        // ── .feature ──────────────────────────────────────────────────────────
        const fileName = featureName.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
        const featurePath = `${featuresDir}/${fileName}.feature`;
        const date = new Date().toLocaleString('es-PE');
        const featureLines = [
            `# Generado por Appium Visual Recorder`,
            `# Fecha: ${date}`,
            `# locator-module: global`,
            `# Locators: ${path.join(projectPaths.locators, 'global.locator.json')}`,
            '',
            `Feature: ${featureName}`,
            '',
            `  Scenario: ${scenarioName}`,
            ...stepRows.map(r => `    ${r.keyword} ${r.text}`),
            ''
        ];
        fs.writeFileSync(featurePath, featureLines.join('\n'), 'utf-8');

        // ── linked-steps.ts ───────────────────────────────────────────────────
        const linkedStepsPath = `${stepsDir}/linked-steps.ts`;

        // Leer steps existentes para hacer merge (no sobreescribir steps previos)
        let existingBlocks: string[] = [];
        if (fs.existsSync(linkedStepsPath)) {
            const current = fs.readFileSync(linkedStepsPath, 'utf-8');
            // Extraer bloques Given existentes
            const blockRegex = /Given\(['"`](.+?)['"`],[\s\S]*?\}\);/g;
            let m;
            while ((m = blockRegex.exec(current)) !== null) {
                existingBlocks.push(m[0]);
            }
        }

        // Construir nuevos bloques desde linked
        const existingTexts = new Set(existingBlocks.map(b => {
            const m = b.match(/Given\(['"`](.+?)['"`]/);
            return m ? m[1] : '';
        }));

        const newBlocks: string[] = [];
        for (const [stepText, steps] of Object.entries(linked)) {
            if (existingTexts.has(stepText)) continue; // no duplicar
            const lines = steps
                .filter((s: any) => s.action !== 'ABRIR_APP')
                .map((s: any) => stepToCode(s));
            if (lines.length === 0) continue;
            newBlocks.push(
                `Given('${stepText}', async () => {\n` +
                lines.join('\n') +
                '\n});'
            );
        }

        const allBlocks = [...existingBlocks, ...newBlocks];

        const tsContent = [
            `// Generado por Appium Visual Recorder — ${date}`,
            `import { Given } from '@cucumber/cucumber';`,
            `import { PageFactory } from '../pageFactory';`,
            '',
            ...allBlocks.map(b => b + '\n'),
        ].join('\n');

        fs.writeFileSync(linkedStepsPath, tsContent, 'utf-8');

        return { success: true, featurePath, linkedStepsPath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});
