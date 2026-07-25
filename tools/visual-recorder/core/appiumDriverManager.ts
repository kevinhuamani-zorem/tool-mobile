import { remote, Browser } from 'webdriverio';
import { DeviceConfig } from './models';
import { exec } from 'child_process';
import * as path from 'path';

export class AppiumDriverManager {
    protected driver: Browser | null = null;
    protected config: DeviceConfig | null = null;

    async startAppiumServer(): Promise<void> {
        console.log('[AppiumDriverManager] Verificando servidor Appium en 4723...');
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                exec('curl -s http://127.0.0.1:4723/status', (err, stdout) => {
                    if (!err && stdout.includes('ready')) {
                        console.log('[AppiumDriverManager] Servidor Appium listo');
                        resolve();
                    } else if (attempts < 10) {
                        attempts++;
                        setTimeout(check, 1000);
                    } else {
                        reject(new Error('Appium no responde en puerto 4723. Ejecuta ./run.sh'));
                    }
                });
            };
            check();
        });
    }

    async init(config: DeviceConfig): Promise<void> {
        this.config = config;
        console.log('[AppiumDriverManager] Conectando:', config.deviceName);

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

        this.driver = await remote({
            protocol:               'http',
            hostname:               '127.0.0.1',
            port:                   4723,
            path:                   '/',
            capabilities,
            logLevel:               'error',
            connectionRetryCount:   3,
            connectionRetryTimeout: 60000,
        });

        console.log('[AppiumDriverManager] Conectado');
    }

    getDriver(): Browser {
        if (!this.driver) throw new Error('Driver no iniciado');
        return this.driver;
    }

    getConfig(): DeviceConfig | null { return this.config; }

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

    async findElement(selector: string) {
        const driver = this.getDriver();
        if (selector.startsWith('id=')) {
            return await driver.$(`id:${selector.slice(3)}`);
        }
        if (selector.startsWith('class=')) {
            return await driver.$(`class name:${selector.slice(6)}`);
        }
        if (selector.startsWith('android=')) {
            return await driver.$(`android=${selector.slice(8)}`);
        }
        if (selector.startsWith('iosPredicate=')) {
            return await driver.$(`-ios predicate string:${selector.slice(13)}`);
        }
        if (selector.startsWith('iosClassChain=')) {
            return await driver.$(`-ios class chain:${selector.slice(14)}`);
        }
        if (selector.startsWith('//') || selector.startsWith('(')) {
            return await driver.$(`xpath:${selector}`);
        }
        if (selector.startsWith('~')) {
            return await driver.$(`accessibility id:${selector.slice(1)}`);
        }
        return await driver.$(`xpath:${selector}`);
    }

    async executeScript(script: string, ...args: any[]): Promise<any> {
        return await this.getDriver().execute(script, ...args);
    }

    async takeScreenshot(): Promise<string> {
        return await this.getDriver().takeScreenshot();
    }

    async getCurrentActivity(): Promise<string> {
        try { return await this.getDriver().getCurrentActivity(); }
        catch { return ''; }
    }

    async quit(): Promise<void> {
        if (this.driver) {
            try { await this.driver.deleteSession(); } catch (_) {}
            this.driver = null;
        }
        console.log('[AppiumDriverManager] Sesion cerrada');
    }

    isActive(): boolean { return this.driver !== null; }

    static async getConnectedDevices(): Promise<Array<{udid: string, status: string}>> {
        return new Promise((resolve) => {
            exec('adb devices', (err, stdout) => {
                if (err) { resolve([]); return; }
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
        return new Promise((resolve) => {
            exec(`adb -s ${udid} shell getprop ro.product.model`, (_, model) => {
                exec(`adb -s ${udid} shell getprop ro.build.version.release`, (__, version) => {
                    resolve({ model: model.trim(), version: version.trim() });
                });
            });
        });
    }

    static async getForegroundApp(udid: string): Promise<{package: string, activity: string}> {
        return new Promise((resolve) => {
            exec(
                `adb -s ${udid} shell dumpsys activity activities | grep mResumedActivity`,
                (_, stdout) => {
                    const match = stdout.match(/([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
                    if (match) resolve({ package: match[1], activity: match[2] });
                    else resolve({ package: '', activity: '' });
                }
            );
        });
    }
}
