import BaseScreen from '../../commons/base.screen.js';
import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import { $ } from '@wdio/globals';
import LocatorLogin from '../../../resources/locators/autenticacion/login/login.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

class EnterYourPasswordScreen extends BaseScreen {

    public btnTypedNumber(number: string) {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnTypeNumber,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.btnTypeNumber).replace('{number}', number);
        return $(locator);
    }

    public async enterPassword(password: string) {
        for (let i = 0; i < password.length; i++) {
            const digit = password.charAt(i);
            await this.btnTypedNumber(digit).click();
        }
    }
}

export default new EnterYourPasswordScreen();
