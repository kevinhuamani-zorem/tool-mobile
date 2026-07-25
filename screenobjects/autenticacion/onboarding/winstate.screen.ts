import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';

class WinStateScreen extends BaseScreen {
    public get btnGoHome() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.btnGoHome,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.btnGoHome);
        return $(locator);
    }

    async gotHomeYape(): Promise<void> {

        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.btnGoHome,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.btnGoHome);

        const existeElemento = await this.uiHelper.waitForElementExist(locator, false);

        try {

            if (existeElemento)

                await this.btnGoHome.click();

        } catch (error) {
            console.error('Error al hacer click para ir al home:', error);
        }
    }

}

export default new WinStateScreen();
