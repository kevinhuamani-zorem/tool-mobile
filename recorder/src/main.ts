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
import { RecordedStep } from '../../core/models';
import { projectPaths } from '../../core/projectPaths';
import { FrameworkScanner } from '../../core/frameworkScanner';
import { FwkMobileGenerator, GenerationRequest, MobilePlatform } from '../../core/fwkMobileGenerator';
import { ReuseAnalyzer } from '../../core/reuseAnalyzer';
import { OutputValidator } from '../../core/outputValidator';
import { GeneratedFileRegistry } from '../../core/generatedFileRegistry';
import crypto from 'crypto';
import { getWorkspaceAdapter } from '../../core/workspaceAdapter';
import { NeutralGenerator } from '../../core/neutralGenerator';
import { AutomationRecordingStore } from '../../core/automationRecordingStore';
import { AutomationPackageBuilder } from '../../core/automationPackageBuilder';
import { AutomationAgentLauncher } from '../../core/automationAgentLauncher';
import { RecordingCoverageAnalyzer } from '../../core/recordingCoverageAnalyzer';
import { RecordingPlatformUpdater } from '../../core/recordingPlatformUpdater';
import { AutomationResponseValidator } from '../../core/automationResponseValidator';
import { AutomationMemory } from '../../core/automationMemory';
import { AutomationAgentResponse, AutomationScenario, GenerationPlan } from '../../core/automationContracts';

let mainWindow: BrowserWindow | null = null;

const workspaceAdapter = getWorkspaceAdapter();
workspaceAdapter.initialize();

const dm             = new AppiumDriverManager();
const bsDm           = new BrowserStackDriverManager();
const frameworkScanner = new FrameworkScanner();
const fwkMobileGenerator = new FwkMobileGenerator();
const neutralGenerator = new NeutralGenerator();
const reuseAnalyzer = new ReuseAnalyzer();
const outputValidator = new OutputValidator();
const generatedFileRegistry = new GeneratedFileRegistry();
const automationRecordingStore = new AutomationRecordingStore();
const automationMemory = new AutomationMemory();
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

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Main] Renderer listo');
    });
}

app.whenReady().then(() => {
    console.log('[Main] Abriendo ventana...');
    createWindow();
    console.log('[Main] Ventana lista');
});

app.on('window-all-closed', async () => {
    if (sessionActive) await activeDm.quit();
    app.quit();
});

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

ipcMain.handle('get-squad-catalog', async (_, squad?: string, platform?: MobilePlatform) => {
    try {
        const selectedSquad = squad || activeSquad;
        const selectedPlatform = platform === 'ios' ? 'ios' : 'android';
        return {
            success: true,
            catalog: reuseAnalyzer.getCatalog(selectedSquad, selectedPlatform)
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
                recordingPlatformUpdater.markComplete(request.recordingId, activeSquad, platform);
            }
            return {
                success: true,
                ...updated,
                coverageComplete: complete,
                catalog: reuseAnalyzer.getCatalog(activeSquad, platform),
            };
        }
        const selector = executableSelector
            .replace(/^android=/, '')
            .replace(/^iosPredicate=/, '')
            .replace(/^iosClassChain=/, '')
            .replace(/^id=/, '')
            .replace(/^class=/, '')
            .replace(/^~/, '');

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

        const previous = typeof document[blockName][name] === 'string'
            ? document[blockName][name]
            : '';
        document[blockName][name] = selector;
        const temporary = `${file}.recorder-${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(document, null, 4) + '\n', {
            encoding: 'utf-8',
            flag: 'wx'
        });
        fs.renameSync(temporary, file);
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
    const enriched = await Promise.all(devices.map(async d => {
        const info = await AppiumDriverManager.getDeviceInfo(d.udid);
        return { ...d, ...info };
    }));
    return { devices: enriched };
});

ipcMain.handle('get-foreground-app', async (_, udid: string) => {
    return await AppiumDriverManager.getForegroundApp(udid);
});

ipcMain.handle('start-session', async (_, config: any) => {
    try {
        activeDm = dm;
        recordingPlatform = 'android';
        activeSquad = config.squad || 'payment';
        activeEnvironment = config.environment || '';
        await dm.startAppiumServer();
        await dm.init(config);
        locatorManager = new LocatorManager(projectPaths.locators, 'global', 'android');
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
            platform:        'android',
            squad:           activeSquad,
            environment:     activeEnvironment,
            deviceName:      config.deviceName,
            udid:            config.udid,
            platformVersion: config.platformVersion,
            appPackage:      config.appPackage,
            appActivity:     config.appActivity,
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
        await bsDm.init(config);
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

ipcMain.handle('verify-selector', async (_, selector: string) => {
    if (!inspector) return { success: false, summary: 'Sin sesion activa' };
    try {
        const el         = await activeDm.findElement(selector);
        await el.waitForDisplayed({ timeout: 5000 });
        const text       = await el.getText().catch(() => '');
        const tag        = await el.getTagName().catch(() => '');
        const screenshot = await inspector.captureScreenshot().catch(() => undefined);
        return { success: true, summary: `✓ Encontrado: <${tag}>${text ? ` "${text}"` : ''}`, screenshot };
    } catch {
        return { success: false, summary: `✗ No encontrado: ${selector}` };
    }
});

ipcMain.handle('execute-step', async (_, stepData: RecordedStep) => {
    if (!executor) return { success: false, message: 'Sin sesion activa' };
    if (stepData.variableName && stepData.selector) {
        if (!locatorManager.exists(stepData.variableName)) {
            locatorManager.add(stepData.variableName, stepData.selector, false);
        }
    }
    const result = await executor.execute(stepData);
    if (result.success) {
        recordedSteps.push({
            ...stepData,
            elementIntent: stepData.elementIntent || stepData.description || stepData.variableName,
            selectorVerified: Boolean(stepData.selector),
            platform: recordingPlatform,
        });
        syncRecording();
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

function validateNeutralPreview(preview: ReturnType<NeutralGenerator['preview']>) {
    const errors: string[] = [];
    if (!/^Feature:\s+\S+/m.test(preview.featureContent)) {
        errors.push('Feature neutral sin nombre');
    }
    if (!/Scenario(?: Outline)?:\s+\[TC-\d+\]/.test(preview.featureContent)) {
        errors.push('Scenario neutral sin identificador TC válido');
    }
    try {
        JSON.parse(preview.locatorContent || '');
    } catch (error: any) {
        errors.push(`Recording JSON inválido: ${error.message}`);
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings: ['Exportación neutral: no se generan capas específicas del framework'],
        conflicts: preview.files.filter(file => fs.existsSync(file))
    };
}

ipcMain.handle('preview-fwk-files', async (_, request: Omit<GenerationRequest, 'platform'>) => {
    try {
        const prepared = prepareGenerationRequest(request);
        const preview = projectPaths.mode === 'neutral'
            ? neutralGenerator.preview(prepared, recordedSteps)
            : fwkMobileGenerator.preview(prepared, recordedSteps);
        const validation = projectPaths.mode === 'neutral'
            ? validateNeutralPreview(preview)
            : outputValidator.validate(preview);
        const managed = projectPaths.mode === 'neutral'
            ? { conflicts: validation.conflicts, writable: new Set<string>() }
            : generatedFileRegistry.assess(preview, prepared.squad);
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
        let preview = projectPaths.mode === 'neutral'
            ? neutralGenerator.preview(prepared, recordedSteps)
            : fwkMobileGenerator.preview(prepared, recordedSteps);
        if (reviewedContents) {
            preview = projectPaths.mode === 'neutral'
                ? neutralGenerator.withReviewedContents(preview, reviewedContents)
                : fwkMobileGenerator.withReviewedContents(preview, reviewedContents);
        }
        const validation = projectPaths.mode === 'neutral'
            ? validateNeutralPreview(preview)
            : outputValidator.validate(preview);
        const managed = projectPaths.mode === 'neutral'
            ? { conflicts: validation.conflicts, writable: new Set<string>() }
            : generatedFileRegistry.assess(preview, prepared.squad);
        validation.conflicts = managed.conflicts;
        validation.valid = validation.errors.length === 0 && validation.conflicts.length === 0;
        if (!validation.valid) {
            const details = [...validation.errors, ...validation.conflicts].join(', ');
            throw new Error(`La salida no superó la validación: ${details}`);
        }
        const generated = projectPaths.mode === 'neutral'
            ? neutralGenerator.generate(prepared, recordedSteps, reviewedContents)
            : fwkMobileGenerator.generate(
                prepared,
                recordedSteps,
                managed.writable,
                reviewedContents
            );
        const manifest = projectPaths.mode === 'neutral'
            ? { files: {} }
            : generatedFileRegistry.register(generated, prepared.squad);
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

ipcMain.handle('prepare-automation-package', async (_, input: {
    request: Omit<GenerationRequest, 'platform'>;
    objective: string;
    acceptanceCriteria: string;
}) => {
    try {
        if (projectPaths.mode === 'neutral') {
            throw new Error('El agente de cuatro capas requiere modo fwk-mobile o standalone');
        }
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
        activeAutomationPackage = result.packageDirectory;
        automationPreview = null;
        const handoff = automationAgentLauncher.describe(
            projectPaths.automationAgent,
            result.packageDirectory
        );
        return { success: true, result, handoff };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('launch-automation-agent', async () => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        return {
            success: true,
            launch: automationAgentLauncher.openTerminal(
                projectPaths.automationAgent,
                activeAutomationPackage
            ),
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('import-automation-response', async () => {
    try {
        if (!activeAutomationPackage) throw new Error('Primero prepara el paquete');
        const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(activeAutomationPackage, name), 'utf-8')) as T;
        const scenario = read<AutomationScenario>('scenario.json');
        const plan = read<GenerationPlan>('generation-plan.json');
        const response = read<AutomationAgentResponse>('agent-response.json');
        const statusFile = path.join(activeAutomationPackage, 'status.json');
        const status = fs.existsSync(statusFile) ? read<any>('status.json') : {};
        const repairAttempts = Number(status.repairAttempts || 0);
        const validation = automationResponseValidator.validate(scenario, plan, response, repairAttempts);
        fs.writeFileSync(
            path.join(activeAutomationPackage, 'validation.json'),
            JSON.stringify(validation, null, 2) + '\n'
        );
        if (!validation.valid) {
            if (repairAttempts >= plan.budgets.maxRepairAttempts) {
                return { success: false, validation, error: 'Se agotó la única reparación permitida: ' + validation.errors.map(item => item.message).join(' | ') };
            }
            fs.writeFileSync(
                path.join(activeAutomationPackage, 'repair-context.json'),
                JSON.stringify(validation.repairContext, null, 2) + '\n'
            );
            fs.writeFileSync(statusFile, JSON.stringify({
                ...status,
                state: 'targeted-repair',
                repairAttempts: repairAttempts + 1,
                updatedAt: new Date().toISOString(),
            }, null, 2) + '\n');
            return {
                success: false,
                validation,
                repairAvailable: true,
                error: validation.errors.map(item => item.message).join(' | '),
            };
        }
        const preview = automationResponseValidator.toPreview(response);
        const managed = generatedFileRegistry.assess(preview, scenario.squad);
        const token = crypto.randomUUID();
        automationPreview = { token, scenario, plan, response };
        return { success: true, preview, validation, previewToken: token, conflicts: managed.conflicts };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('generate-automation-response', async (
    _,
    previewToken: string,
    reviewedContents?: Record<string, string>
) => {
    try {
        if (!automationPreview || automationPreview.token !== previewToken) {
            throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
        }
        const { scenario, plan } = automationPreview;
        const response: AutomationAgentResponse = {
            ...automationPreview.response,
            files: automationPreview.response.files.map(file => ({
                ...file,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
            })),
        };
        const validation = automationResponseValidator.validate(scenario, plan, response);
        if (!validation.valid) throw new Error(validation.errors.map(item => item.message).join(' | '));
        const preview = automationResponseValidator.toPreview(response);
        const managed = generatedFileRegistry.assess(preview, scenario.squad);
        if (managed.conflicts.length) {
            throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        }
        const generated = fwkMobileGenerator.writePreview(preview, managed.writable);
        generatedFileRegistry.register(generated, scenario.squad);
        const memoryEntry = automationMemory.promote(scenario, plan, response, validation);
        fs.writeFileSync(path.join(activeAutomationPackage, 'agent-response.json'), JSON.stringify(response, null, 2) + '\n');
        automationPreview = null;
        return { success: true, generated, validation, memoryVersion: memoryEntry.version };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-automation-memory-stats', async () => ({
    success: true,
    stats: automationMemory.stats(),
}));

ipcMain.handle('get-steps', async () => ({ steps: recordedSteps }));

ipcMain.handle('close-session', async () => {
    if (sessionActive) {
        await activeDm.quit();
        sessionActive = false;
        inspector     = null;
        executor      = null;
        activeDm      = dm; // reset al default
        automationRecordingStore.reset();
        activeAutomationPackage = '';
        automationPreview = null;
    }
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
