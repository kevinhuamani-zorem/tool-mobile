import fs from 'fs';
import https from 'https';
import path from 'path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
    AppiumDriverManager,
    BrowserStackDriverManager,
    BrowserStackConfig,
    LocatorManager,
    MobileStepExecutor,
} from '../../../core/mobile-session';
import { AutomationRecordingStore } from '../../../core/automation';
import { projectPaths } from '../../../core/workspace';
import { MobileInspector } from '../mobileInspector';
import { RecorderRuntimeLifecycle, RecorderSessionOwnership } from '../recorderLifecycle';
import { RecorderRuntimeState } from './runtimeState';

const BS_CONFIG_PATH      = path.join(projectPaths.toolConfig, 'bs_config.json');
const SESSION_CONFIG_PATH = path.join(projectPaths.toolConfig, 'session_config.json');

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

/**
 * Deja la sesión propia (local o BrowserStack) y todo el estado que depende
 * de ella en el mismo estado que tenía antes de conectar. Es una tarea de
 * limpieza de ciclo de vida — la registra `main.ts` en `RecorderRuntimeLifecycle`
 * junto a la limpieza del Inspector embebido — por eso también reinicia el
 * recording activo y los candidatos pendientes del Inspector en vez de dejar
 * esa responsabilidad repartida entre módulos.
 */
export async function closeOwnedSession(
    state: RecorderRuntimeState,
    dm: AppiumDriverManager,
    automationRecordingStore: AutomationRecordingStore,
    sessionOwnership: RecorderSessionOwnership,
): Promise<void> {
    state.sessionActive = false;
    state.inspector = null;
    state.executor = null;
    state.activeDm = dm;
    automationRecordingStore.reset();
    state.activeAutomationPackage = '';
    state.automationPreview = null;
    state.pendingInspectorCandidates = null;
    state.inspectorValidationGeneration++;
    await sessionOwnership.close();
}

/**
 * Dependencias de sesión local y BrowserStack: dispositivos, credenciales,
 * arranque/cierre de sesión. Es el único dueño de `sessionActive`,
 * `activeDm`, `inspector`, `executor` y `locatorManager` en el sentido de que
 * solo estos handlers los asignan; el resto de familias únicamente los leen.
 */
export interface SessionHandlersContext {
    state: RecorderRuntimeState;
    dm: AppiumDriverManager;
    bsDm: BrowserStackDriverManager;
    automationRecordingStore: AutomationRecordingStore;
    sessionOwnership: RecorderSessionOwnership;
    recorderLifecycle: RecorderRuntimeLifecycle;
}

export function registerSessionHandlers(context: SessionHandlersContext): void {
    const { state, dm, bsDm, automationRecordingStore, sessionOwnership, recorderLifecycle } = context;

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
        const selection = await dialog.showOpenDialog(state.mainWindow as BrowserWindow, {
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
            state.activeDm = dm;
            // La sesion local ya no asume Android: el simulador iOS usa XCUITest y
            // sus propios bloques de locators.
            state.recordingPlatform = config.platform === 'ios' ? 'ios' : 'android';
            state.activeSquad = config.squad || 'payment';
            state.activeEnvironment = config.environment || '';
            await sessionOwnership.acquire(dm, async () => {
                await dm.startAppiumServer();
                await dm.init({ ...config, platform: state.recordingPlatform });
            });
            state.locatorManager = new LocatorManager(projectPaths.locators, 'global', state.recordingPlatform);
            state.inspector  = new MobileInspector(state.activeDm);
            state.executor   = new MobileStepExecutor(state.activeDm, state.locatorManager);
            state.sessionActive = true;
            state.recordedSteps = [];
            automationRecordingStore.start({
                squad: state.activeSquad,
                platform: state.recordingPlatform,
                environment: state.activeEnvironment,
            });
            const screenshot = await state.inspector.captureScreenshot();
            // Persistir configuración para test.sh / steps.ts
            saveSessionConfig({
                type:            'local',
                platform:        state.recordingPlatform,
                squad:           state.activeSquad,
                environment:     state.activeEnvironment,
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
        const sel = await dialog.showOpenDialog(state.mainWindow as BrowserWindow, {
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
            state.activeDm = bsDm;
            state.recordingPlatform = config.platform === 'ios' ? 'ios' : 'android';
            state.activeSquad = (config as BrowserStackConfig & { squad?: string }).squad || 'payment';
            state.activeEnvironment = (config as BrowserStackConfig & { environment?: string }).environment || '';
            await sessionOwnership.acquire(bsDm, () => bsDm.init(config));
            state.locatorManager = new LocatorManager(projectPaths.locators, 'global', config.platform === 'ios' ? 'ios' : 'android');
            state.inspector  = new MobileInspector(state.activeDm);
            state.executor   = new MobileStepExecutor(state.activeDm, state.locatorManager);
            state.sessionActive = true;
            state.recordedSteps = [];
            automationRecordingStore.start({
                squad: state.activeSquad,
                platform: state.recordingPlatform,
                environment: state.activeEnvironment,
            });
            const screenshot = await state.inspector.captureScreenshot();
            // Persistir configuración para test.sh / steps.ts
            saveSessionConfig({
                type:            'browserstack',
                platform:        config.platform || 'android',
                squad:           state.activeSquad,
                environment:     state.activeEnvironment,
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

    ipcMain.handle('close-session', async () => {
        await recorderLifecycle.cleanup();
        return { success: true };
    });
}
