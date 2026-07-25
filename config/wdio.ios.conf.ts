//import path from 'node:path';
import { join } from 'node:path';
import { config as baseConfig } from './wdio.shared.conf.ts';


export const config: WebdriverIO.Config = {
    ...baseConfig,
    
   
    capabilities: [{
         platformName: 'iOS',
        'appium:deviceName': '', 
        'appium:platformVersion': '',
        'appium:udid': '',
        'appium:automationName': 'XCUITest',
        'appium:nativeWebScreenshot': true,
        'appium:autoDismissAlerts':true,
        'appium:noReset':true,
        'appium:app': join(
            process.cwd(),
            'resources',
            'apps',
            'ios',
            process.env.APP_IOS_NAME || 'Yape.app' || 'app-qa-release.ipa',
        )
    }],
    

   

};