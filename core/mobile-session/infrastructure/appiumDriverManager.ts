import { remote, Browser } from 'webdriverio';
import { DeviceConfig } from '../../automation/contracts';
import { exec, execFile } from 'child_process';
import * as path from 'path';
import { parseSimulators, SimulatorDevice } from '../domain/iosSimulators';
import { resolveAndroidTooling } from './androidTooling';

export type AppiumSessionState = 'idle' | 'connecting' | 'active' | 'closing';
export type AppiumSessionProvider = 'local' | 'browserstack';

export interface AppiumSessionMetadata {
    serverUrl: string;
    sessionId: string;
    capabilities: Record<string, unknown>;
    platform: 'android' | 'ios';
    provider: AppiumSessionProvider;
    state: AppiumSessionState;
}

const SENSITIVE_CAPABILITY_KEYS = new Set([
    'accesskey',
    'access-key',
    'password',
    'token',
    'username',
    'user',
]);

function sanitizedCapabilities(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => {
            if (SENSITIVE_CAPABILITY_KEYS.has(key.toLowerCase())) return [];
            if (Array.isArray(item)) return [[key, [...item]]];
            if (typeof item === 'object' && item !== null) {
                return [[key, sanitizedCapabilities(item as Record<string, unknown>)]];
            }
            return [[key, item]];
        }),
    );
}

export class AppiumDriverManager {
    protected driver: Browser | null = null;
    protected config: DeviceConfig | null = null;
    protected sessionState: AppiumSessionState = 'idle';
    protected sessionProvider: AppiumSessionProvider = 'local';
    protected serverUrl: string;

    constructor(protected serverPort = 4723) {
        this.serverUrl = `http://127.0.0.1:${serverPort}`;
    }

    /** El servidor integrado puede relanzarse en otro puerto libre. */
    useServerPort(port: number): void {
        this.serverPort = port;
        this.serverUrl = `http://127.0.0.1:${port}`;
    }

    async startAppiumServer(): Promise<void> {
        console.log(`[AppiumDriverManager] Verificando servidor Appium en ${this.serverPort}...`);
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                exec(`curl -s http://127.0.0.1:${this.serverPort}/status`, (err, stdout) => {
                    if (!err && stdout.includes('ready')) {
                        console.log('[AppiumDriverManager] Servidor Appium listo');
                        resolve();
                    } else if (attempts < 10) {
                        attempts++;
                        setTimeout(check, 1000);
                    } else {
                        reject(new Error(`Appium no responde en puerto ${this.serverPort}. Reinicia el recorder.`));
                    }
                });
            };
            check();
        });
    }

    async init(config: DeviceConfig): Promise<void> {
        this.config = config;
        this.sessionState = 'connecting';
        this.sessionProvider = 'local';
        this.serverUrl = `http://127.0.0.1:${this.serverPort}`;
        console.log('[AppiumDriverManager] Conectando:', config.deviceName, `(${config.platform || 'android'})`);

        const capabilities: any = config.platform === 'ios'
            ? this.iosCapabilities(config)
            : this.androidCapabilities(config);

        try {
            this.driver = await remote({
                protocol:               'http',
                hostname:               '127.0.0.1',
                port:                   this.serverPort,
                path:                   '/',
                capabilities,
                logLevel:               'error',
                connectionRetryCount:   3,
                connectionRetryTimeout: 60000,
            });
            this.sessionState = 'active';
        } catch (error) {
            this.sessionState = 'idle';
            throw error;
        }

        console.log('[AppiumDriverManager] Conectado');
    }

    /**
     * Simulador iOS. No lleva firma de WebDriverAgent: Appium la compila y la
     * instala en el simulador sin provisioning, que es la razon por la que el
     * soporte local arranca por simulador y no por dispositivo fisico.
     */
    private iosCapabilities(config: DeviceConfig): Record<string, unknown> {
        const capabilities: Record<string, unknown> = {
            platformName:               'iOS',
            'appium:deviceName':        config.deviceName,
            'appium:udid':              config.udid,
            'appium:platformVersion':   config.platformVersion,
            'appium:automationName':    'XCUITest',
            'appium:noReset':           true,
            'appium:newCommandTimeout': 300,
            'appium:wdaLaunchTimeout':  120000,
            'appium:wdaConnectionTimeout': 120000,
        };
        if (config.appPath) capabilities['appium:app'] = path.resolve(config.appPath);
        else if (config.bundleId) capabilities['appium:bundleId'] = config.bundleId;
        return capabilities;
    }

    private androidCapabilities(config: DeviceConfig): Record<string, unknown> {
        const capabilities: any = {
            platformName:                              'Android',
            'appium:deviceName':                       config.deviceName,
            'appium:udid':                             config.udid,
            'appium:platformVersion':                  config.platformVersion,
            'appium:automationName':                   'UiAutomator2',
            'appium:noReset':                          true,
            'appium:newCommandTimeout':                300,
            'appium:autoGrantPermissions':             true,
            'appium:uiautomator2ServerInstallTimeout': 60000,
            'appium:uiautomator2ServerLaunchTimeout':  60000,
            'appium:ignoreHiddenApiPolicyError':       true,
        };

        if (config.appPath) {
            capabilities['appium:app'] = path.resolve(config.appPath);
        } else {
            capabilities['appium:appPackage']  = config.appPackage;
            capabilities['appium:appActivity'] = config.appActivity;
        }
        return capabilities;
    }

    getDriver(): Browser {
        if (!this.driver) throw new Error('Driver no iniciado');
        return this.driver;
    }

    getConfig(): DeviceConfig | null { return this.config; }

    getSessionMetadata(): AppiumSessionMetadata {
        if (!this.driver || this.sessionState !== 'active') {
            throw new Error('No hay una sesión Appium activa');
        }
        const capabilities = this.driver.capabilities as Record<string, unknown>;
        const platformName = String(
            capabilities.platformName ||
            capabilities.platform ||
            this.config?.platform ||
            '',
        ).toLowerCase();
        return {
            serverUrl: this.serverUrl,
            sessionId: this.driver.sessionId,
            capabilities: sanitizedCapabilities(capabilities),
            platform: platformName.includes('ios') ? 'ios' : 'android',
            provider: this.sessionProvider,
            state: this.sessionState,
        };
    }

    async getPageSource(retries = 3): Promise<string> {
        for (let i = 0; i < retries; i++) {
            try {
                return await this.getDriver().getPageSource();
            } catch (e: any) {
                console.warn(`[AppiumDriverManager] getPageSource (${i+1}/${retries})`);
                if (i < retries - 1) await new Promise(r => setTimeout(r, 1500));
            }
        }
        throw new Error('getPageSource fallo');
    }

    private selectorForDriver(selector: string): string {
        const trimmedSelector = selector.trim();
        if (
            trimmedSelector.startsWith('new UiSelector(') ||
            trimmedSelector.startsWith('new UiScrollable(')
        ) {
            return `android=${trimmedSelector}`;
        }
        if (trimmedSelector.startsWith('id=')) {
            const resourceId = trimmedSelector.slice(3);
            if (!resourceId.includes('/') && !resourceId.includes(':')) {
                return `//*[@resource-id="${resourceId}"]`;
            }
            return trimmedSelector;
        }
        if (trimmedSelector.startsWith('class=')) {
            return `class name=${trimmedSelector.slice(6)}`;
        }
        if (trimmedSelector.startsWith('android=')) {
            return trimmedSelector;
        }
        if (trimmedSelector.startsWith('iosPredicate=')) {
            return `-ios predicate string:${trimmedSelector.slice(13)}`;
        }
        if (trimmedSelector.startsWith('iosClassChain=')) {
            return `-ios class chain:${trimmedSelector.slice(14)}`;
        }
        return trimmedSelector;
    }

    async findElement(selector: string) {
        return await this.getDriver().$(this.selectorForDriver(selector));
    }

    /** Devuelve todas las identidades W3C para comprobar unicidad y mismo elemento. */
    async findElementIds(selector: string): Promise<string[]> {
        const elements = await this.getDriver().$$(this.selectorForDriver(selector));
        const ids = await elements.map(element => String(element.elementId || ''));
        return ids.filter(Boolean);
    }

    async executeScript(script: string, ...args: any[]): Promise<any> {
        return await this.getDriver().execute(script, ...args);
    }

    async takeScreenshot(): Promise<string> {
        return await this.getDriver().takeScreenshot();
    }

    async tapAt(x: number, y: number): Promise<void> {
        const tapX = Math.max(0, Math.round(x));
        const tapY = Math.max(0, Math.round(y));
        const driver = this.getDriver();
        const capabilities = driver.capabilities as Record<string, any>;
        const platformName = String(
            capabilities.platformName ||
            capabilities.platform ||
            capabilities['appium:platformName'] ||
            ''
        ).toLowerCase();

        // BrowserStack/XCUITest puede no publicar el endpoint W3C /actions.
        // Los gestos móviles se transportan por executeScript y funcionan tanto
        // en el hub remoto como en un servidor Appium local.
        if (platformName.includes('ios')) {
            await driver.execute('mobile: tap', { x: tapX, y: tapY });
            return;
        }

        // Android usa el protocolo W3C estándar. BrowserStack expone distintas
        // versiones de UiAutomator2 y algunas no incluyen mobile: clickGesture.
        await driver.performActions([{
            type: 'pointer',
            id: 'manual-touch',
            parameters: { pointerType: 'touch' },
            actions: [
                { type: 'pointerMove', duration: 0, x: tapX, y: tapY },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 80 },
                { type: 'pointerUp', button: 0 },
            ],
        }]);
        // Algunos proveedores ejecutan el tap pero no implementan DELETE /actions.
        await driver.releaseActions().catch(() => undefined);
    }

    async swipeFromTo(startX: number, startY: number, endX: number, endY: number): Promise<void> {
        const fromX = Math.max(0, Math.round(startX));
        const fromY = Math.max(0, Math.round(startY));
        const toX = Math.max(0, Math.round(endX));
        const toY = Math.max(0, Math.round(endY));
        const driver = this.getDriver();
        const capabilities = driver.capabilities as Record<string, any>;
        const platformName = String(
            capabilities.platformName ||
            capabilities.platform ||
            capabilities['appium:platformName'] ||
            ''
        ).toLowerCase();

        if (platformName.includes('ios')) {
            await driver.execute('mobile: dragFromToForDuration', {
                fromX,
                fromY,
                toX,
                toY,
                duration: 0.35,
            });
            return;
        }
        if (platformName.includes('android')) {
            await driver.execute('mobile: dragGesture', {
                startX: fromX,
                startY: fromY,
                endX: toX,
                endY: toY,
                speed: 1800,
            });
            return;
        }

        await driver.performActions([{
            type: 'pointer',
            id: 'manual-drag',
            parameters: { pointerType: 'touch' },
            actions: [
                { type: 'pointerMove', duration: 0, x: fromX, y: fromY },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 100 },
                { type: 'pointerMove', duration: 350, x: toX, y: toY },
                { type: 'pointerUp', button: 0 },
            ],
        }]);
        await driver.releaseActions().catch(() => undefined);
    }

    async getCurrentActivity(): Promise<string> {
        try { return await this.getDriver().getCurrentActivity(); }
        catch { return ''; }
    }

    async quit(): Promise<void> {
        if (this.driver) {
            this.sessionState = 'closing';
            try { await this.driver.deleteSession(); } catch (_) {}
            this.driver = null;
        }
        this.sessionState = 'idle';
        console.log('[AppiumDriverManager] Sesion cerrada');
    }

    isActive(): boolean { return this.driver !== null; }

    /**
     * Simuladores iOS disponibles. Si no hay `xcrun` —cualquier maquina que no
     * sea macOS— devuelve vacio en vez de fallar: la conexion Android tiene que
     * seguir funcionando igual.
     */
    static async getIosSimulators(): Promise<SimulatorDevice[]> {
        return new Promise((resolve) => {
            exec('xcrun simctl list devices available --json', { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
                if (err) { resolve([]); return; }
                resolve(parseSimulators(stdout));
            });
        });
    }

    static async getConnectedDevices(): Promise<Array<{udid: string, status: string}>> {
        const tooling = resolveAndroidTooling();
        return new Promise((resolve, reject) => {
            execFile(tooling.adb, ['devices'], { env: tooling.environment }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(
                        `No se pudo ejecutar ADB (${tooling.adb}): ${String(stderr || err.message).trim()}`
                    ));
                    return;
                }
                const devices = stdout.split('\n').slice(1)
                    .filter(l => l.trim() && l.includes('\t'))
                    .map(l => {
                        const [udid, status] = l.trim().split('\t');
                        return { udid: udid.trim(), status: status.trim() };
                    })
                    .filter(d => d.status === 'device');
                resolve(devices);
            });
        });
    }

    static async getDeviceInfo(udid: string): Promise<{model: string, version: string}> {
        const tooling = resolveAndroidTooling();
        const readProperty = (property: string) => new Promise<string>(resolve => {
            execFile(
                tooling.adb,
                ['-s', udid, 'shell', 'getprop', property],
                { env: tooling.environment },
                (_error, stdout) => resolve(stdout.trim()),
            );
        });
        const [model, version] = await Promise.all([
            readProperty('ro.product.model'),
            readProperty('ro.build.version.release'),
        ]);
        return { model, version };
    }

    static async getForegroundApp(udid: string): Promise<{package: string, activity: string}> {
        const tooling = resolveAndroidTooling();
        return new Promise((resolve) => {
            execFile(
                tooling.adb,
                ['-s', udid, 'shell', 'dumpsys', 'activity', 'activities'],
                { env: tooling.environment, maxBuffer: 8 * 1024 * 1024 },
                (_, stdout) => {
                    const match = stdout.match(/([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
                    if (match) resolve({ package: match[1], activity: match[2] });
                    else resolve({ package: '', activity: '' });
                }
            );
        });
    }
}
