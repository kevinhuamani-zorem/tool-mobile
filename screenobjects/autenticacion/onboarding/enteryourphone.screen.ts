import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';

class EnterYourPhoneScreen extends BaseScreen {
    public get txtPhone() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtEmail,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.txtPhone);
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnContinuar,
            TypeLocator.ID, LocatorOnboarding.onboardingAndroid.btnContinuar);
        return $(locator);
    }

    // Método para registrar celular
    async registerPhone(cellphone: string): Promise<void> {
        try {
            await this.txtPhone.setValue(cellphone);

            await this.btnContinue.click();

        } catch (error) {
            console.error('Error en el login:', error);
        }
    }
}

export default new EnterYourPhoneScreen();
