import { remote } from 'webdriverio';
import { AppiumDriverManager } from './appiumDriverManager';

export interface BrowserStackConfig {
    username:        string;
    accessKey:       string;
    platform:        'android' | 'ios';
    deviceName:      string;
    platformVersion: string;
    /** URL bs://... obtenida al subir el APK/IPA a BrowserStack, o vacía para usar package/bundleId */
    appUrl:          string;
    /** Android only */
    appPackage:      string;
    /** Android only */
    appActivity:     string;
    /** iOS only */
    bundleId:        string;
    projectName?:    string;
    buildName?:      string;
}

/**
 * BrowserStackDriverManager — extiende AppiumDriverManager y reemplaza init()
 * para conectar al hub de BrowserStack en vez de Appium local.
 *
 * No requiere startAppiumServer() — la conexión es directamente al hub en la nube.
 */
export class BrowserStackDriverManager extends AppiumDriverManager {

    private bsConfig: BrowserStackConfig | null = null;

    /** Conecta al hub de BrowserStack. No llamar a startAppiumServer() antes. */
    async init(bsConfig: BrowserStackConfig | any): Promise<void> {
        this.bsConfig = bsConfig as BrowserStackConfig;
        console.log('[BrowserStackDriverManager] Conectando a BS hub:', bsConfig.deviceName);

        const isIos = bsConfig.platform === 'ios';

        const capabilities: any = {
            platformName:                isIos ? 'iOS' : 'Android',
            'appium:deviceName':         bsConfig.deviceName,
            'appium:platformVersion':    bsConfig.platformVersion,
            'appium:automationName':     isIos ? 'XCUITest' : 'UiAutomator2',
            'appium:noReset':            true,
            'appium:newCommandTimeout':  300,
            'bstack:options': {
                userName:    bsConfig.username,
                accessKey:   bsConfig.accessKey,
                projectName: bsConfig.projectName || 'Appium Visual Recorder',
                buildName:   bsConfig.buildName   || 'recorder-' + new Date().toISOString().slice(0, 10),
                sessionName: 'recording-' + Date.now(),
                debug:       true,
            }
        };

        // App: si hay URL bs:// la usamos; si no, lanzamos por bundleId (iOS) o package/activity (Android)
        if (bsConfig.appUrl && bsConfig.appUrl.trim()) {
            capabilities['appium:app'] = bsConfig.appUrl.trim();
        } else if (isIos) {
            capabilities['appium:bundleId'] = bsConfig.bundleId;
        } else {
            capabilities['appium:appPackage']  = bsConfig.appPackage;
            capabilities['appium:appActivity'] = bsConfig.appActivity;
        }

        this.driver = await remote({
            protocol:               'https',
            hostname:               'hub-cloud.browserstack.com',
            port:                   443,
            path:                   '/wd/hub',
            capabilities,
            logLevel:               'error',
            connectionRetryCount:   3,
            connectionRetryTimeout: 90000,
        });

        console.log('[BrowserStackDriverManager] Conectado al hub de BrowserStack');
    }

    getBsConfig(): BrowserStackConfig | null { return this.bsConfig; }
}
