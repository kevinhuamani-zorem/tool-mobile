import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';

class SelectAccountTypeScreen extends BaseScreen {
    public get txtBcpOption() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtBcpOption,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.txtBcpOption);
        return $(locator);
    }

    async selectOption(): Promise<void> {

        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtBcpOption,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.txtBcpOption);

        const existeElemento = await this.uiHelper.waitForElementExist(locator, false);

        try {

            if (existeElemento)

                await this.txtBcpOption.click();

        } catch (error) {
            console.error('Error al seleccionar tipo de cuenta:', error);
        }
    }
}

export default new SelectAccountTypeScreen();
