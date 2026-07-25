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
import { projectPaths, validateFrameworkRoot } from '../../core/projectPaths';
import { FrameworkScanner } from '../../core/frameworkScanner';
import { FwkMobileGenerator, GenerationRequest, MobilePlatform } from '../../core/fwkMobileGenerator';
import { ReuseAnalyzer } from '../../core/reuseAnalyzer';
import { OutputValidator } from '../../core/outputValidator';
import crypto from 'crypto';

let mainWindow: BrowserWindow | null = null;

validateFrameworkRoot();

const dm             = new AppiumDriverManager();
const bsDm           = new BrowserStackDriverManager();
const frameworkScanner = new FrameworkScanner();
const fwkMobileGenerator = new FwkMobileGenerator();
const reuseAnalyzer = new ReuseAnalyzer();
const outputValidator = new OutputValidator();
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

    // __dirname = dist/recorder/src/ → subir tres niveles hasta la raíz del proyecto
    mainWindow.loadFile(path.join(__dirname, '../../../recorder/renderer/index.html'));

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
        recordedSteps.push(stepData);
        const screenshot = await inspector?.captureScreenshot().catch(() => undefined);
        return { ...result, totalSteps: recordedSteps.length, screenshot };
    }
    return { ...result, totalSteps: recordedSteps.length };
});

ipcMain.handle('delete-step', async (_, index: number) => {
    if (index >= 0 && index < recordedSteps.length) recordedSteps.splice(index, 1);
    return { success: true, totalSteps: recordedSteps.length };
});

ipcMain.handle('clear-steps', async () => {
    recordedSteps = [];
    return { success: true };
});

ipcMain.handle('preview-gherkin', async (_, featureName: string, scenarioName: string) => {
    return { success: true, preview: featureGen.preview(featureName, scenarioName, recordedSteps) };
});

function prepareGenerationRequest(
    request: Omit<GenerationRequest, 'platform'>
): GenerationRequest {
    const prepared: GenerationRequest = { ...request, platform: recordingPlatform };
    if (prepared.scenarioRows?.length) {
        reuseAnalyzer.refresh();
        const reuse = reuseAnalyzer.analyzeSteps(prepared.scenarioRows.map(row => row.text));
        prepared.scenarioRows = prepared.scenarioRows.map((row, index) => ({
            ...row,
            status: reuse[index].status
        }));
    }
    return prepared;
}

ipcMain.handle('preview-fwk-files', async (_, request: Omit<GenerationRequest, 'platform'>) => {
    try {
        const prepared = prepareGenerationRequest(request);
        const preview = fwkMobileGenerator.preview(
            prepared,
            recordedSteps
        );
        const validation = outputValidator.validate(preview);
        const fingerprint = generationFingerprint(prepared, recordedSteps);
        const previewToken = crypto.randomUUID();
        approvedPreviews.clear();
        approvedPreviews.set(previewToken, fingerprint);
        return { success: true, preview, validation, previewToken };
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
    previewToken: string
) => {
    try {
        const prepared = prepareGenerationRequest(request);
        const expectedFingerprint = approvedPreviews.get(previewToken);
        const actualFingerprint = generationFingerprint(prepared, recordedSteps);
        if (!previewToken || !expectedFingerprint || expectedFingerprint !== actualFingerprint) {
            throw new Error('La grabación cambió. Ejecuta Preview nuevamente antes de generar.');
        }
        const preview = fwkMobileGenerator.preview(prepared, recordedSteps);
        const validation = outputValidator.validate(preview);
        if (!validation.valid) {
            const details = [...validation.errors, ...validation.conflicts].join(', ');
            throw new Error(`La salida no superó la validación: ${details}`);
        }
        const generated = fwkMobileGenerator.generate(
            prepared,
            recordedSteps
        );
        approvedPreviews.delete(previewToken);
        return { success: true, generated, validation };
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

ipcMain.handle('get-steps', async () => ({ steps: recordedSteps }));

ipcMain.handle('close-session', async () => {
    if (sessionActive) {
        await activeDm.quit();
        sessionActive = false;
        inspector     = null;
        executor      = null;
        activeDm      = dm; // reset al default
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
