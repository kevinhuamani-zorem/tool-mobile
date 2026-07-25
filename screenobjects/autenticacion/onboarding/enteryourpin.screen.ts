import BaseScreen from '../../commons/base.screen.js';
import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import { $ } from '@wdio/globals';
import LocatorLogin from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

class EnterYourPin4Screen extends BaseScreen {

    public btnPin4(number: string) {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorLogin.onboardingIos.btnPin4,
            TypeLocator.XPATH, LocatorLogin.onboardingAndroid.btnPin4).replace('{number}', number);
        return $(locator);
    }

    public async enterPin4(password: string) {
        for (let i = 0; i < password.length; i++) {
            const digit = password.charAt(i);
            await this.btnPin4(digit).click();
        }
    }

}

export default new EnterYourPin4Screen();
