import BaseScreen from '../../commons/base.screen.js';
import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import redis from '../../../support/utils/redis.helper.js';
import { $ } from '@wdio/globals';
import LocatorLogin from '../../../resources/locators/autenticacion/login/login.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';
import { Constants } from '../../../support/utils/constants.js';

class ValidationCodeScreen extends BaseScreen {
    public get txtOtp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorLogin.loginIos.txtIngresarOtp,
            TypeLocator.ANDROID, LocatorLogin.loginAndroid.txtIngresarOtp);
        return $(locator);
    }

    public get btnCodeValidate() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnValidarCodigoPhone,
            TypeLocator.ID, LocatorLogin.loginAndroid.btnValidarCodigoPhone);
        return $(locator);
    }

    async validateOtp(phone: string): Promise<void> {
        await browser.pause(3000);
        const btnCodeValidateLocator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnValidarCodigoPhone,
            TypeLocator.ID, LocatorLogin.loginAndroid.btnValidarCodigoPhone);

        const elementExists = await this.uiHelper.waitForElement(btnCodeValidateLocator);
        const otp = elementExists ? await redis.readDataRedis(Constants.REDIS_OTP_LOGIN_MAPNAME, phone, 1) : '';

        await this.keyboardHelper.submitOtp(this.txtOtp, otp, this.btnCodeValidate);
    }
}

export default new ValidationCodeScreen();
