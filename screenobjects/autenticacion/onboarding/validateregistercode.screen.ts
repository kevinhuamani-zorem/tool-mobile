import BaseScreen from '../../commons/base.screen.js';
import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import redis from '../../../support/utils/redis.helper.js';
import { $ } from '@wdio/globals';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';
import { Constants } from '../../../support/utils/constants.js';

class ValidateRegisterCodeScreen extends BaseScreen {
    public get txtOtp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtIngresarOtp,
            TypeLocator.ANDROID, LocatorOnboarding.onboardingAndroid.txtIngresarOtp);
        return $(locator);
    }

    public get btnCodeValidate() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnValidarCodigoPhone,
            TypeLocator.ID, LocatorOnboarding.onboardingAndroid.btnValidarCodigoPhone);
        return $(locator);
    }

    async validateOtp(phone: string): Promise<void> {
        await browser.pause(3000);
        const btnCodeValidateLocator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnValidarCodigoPhone,
            TypeLocator.ID, LocatorOnboarding.onboardingAndroid.btnValidarCodigoPhone);

        const existeElemento = await this.uiHelper.waitForElement(btnCodeValidateLocator);
        const otp = existeElemento ? await redis.readDataRedis(Constants.REDIS_OTP_ONBOARDING_MAPNAME, phone, 1) : '';

        await this.txtOtp.setValue(otp);
        await this.btnCodeValidate.click();
    }
}

export default new ValidateRegisterCodeScreen();
