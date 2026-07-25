import LocatorFactory from '@support/utils/LocatorFactory.js';
import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';
import LocatorLogin from '@resources/locators/autenticacion/login/login.locator.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.js';
import { Constants } from '@support/utils/constants.js';

class UninstallAppsScreen extends BaseScreen {
    public get btnContinuarSinDesinstalar() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnContinuarSinDesinstalar,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.btnContinuarSinDesinstalar
        );
        return $(locator);
    }

    public get btnContinuarBajoRiesgo() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnContinuarBajoRiesgo,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.btnContinuarBajoRiesgo
        );
        return $(locator);
    }

    public async dismissUninstallAppsIfPresent(): Promise<void> {
        const btnSinDesinstalarLocator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnContinuarSinDesinstalar,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.btnContinuarSinDesinstalar
        );

        const elementExists = await this.uiHelper.waitForElement(btnSinDesinstalarLocator, Constants.TIMEOUT_LONG);

        if (elementExists) {
            console.log('Uninstall apps screen detected — dismissing...');
            await this.btnContinuarSinDesinstalar.click();

            const btnBajoRiesgoLocator = LocatorFactory.getElement(
                TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnContinuarBajoRiesgo,
                TypeLocator.XPATH, LocatorLogin.loginAndroid.btnContinuarBajoRiesgo
            );

            const secondButtonExists = await this.uiHelper.waitForElement(btnBajoRiesgoLocator, Constants.TIMEOUT_LONG);
            if (!secondButtonExists) {
                throw new Error(`El botón 'Continuar bajo mi propio riesgo' no se encontró después de ${Constants.TIMEOUT_LONG}ms.`);
            }

            await this.btnContinuarBajoRiesgo.click();
            console.log('Uninstall apps screen dismissed successfully.');
        } else {
            console.log('Uninstall apps screen not present — skipping.');
        }
    }
}

export default new UninstallAppsScreen();
