import path from 'node:path';
import { join } from 'node:path';
import { config as baseConfig } from './wdio.shared.conf.ts';

export const config: WebdriverIO.Config = {
    ...baseConfig,
   
    capabilities: [{
        platformName: 'Android',
        'appium:deviceName': '',
        'appium:platformVersion': '',
        'appium:autoGrantPermissions' : true,
        'appium:automationName': 'UiAutomator2',
        'appium:noReset': false,
        'appium:chromedriverExecutable': path.join(
            process.cwd(),
            'node_modules',
            '.bin',
            'chromedriver'
        ),
        'appium:app': join(
            process.cwd(),
            'resources',
            'apps',
            'android',
            process.env.APP_ANDROID_NAME || 'app-qa-release.apk',
        )
    }],
};