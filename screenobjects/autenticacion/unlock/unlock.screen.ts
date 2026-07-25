import BaseScreen from '../../commons/base.screen.ts';
import LocatorFactory from "../../../support/utils/LocatorFactory.ts";
import { Constants } from "../../../support/utils/constants.ts";
import { $ } from '@wdio/globals';
import LocatorUnlock from "../../../resources/locators/autenticacion/unlock/unlock.locator.json" with { type: 'json' };
import { TypeLocator } from "../../../support/utils/Enums.ts";

class UnlockScreen extends BaseScreen {

    public btnTypedNumber(number: string) {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorUnlock.unlockIos.btnTypeNumber.replace('{number}', number),
            TypeLocator.ANDROID, LocatorUnlock.unlockAndroid.btnTypeNumber.replace(Constants.DOLLAR_SYMBOL, number));
        return $(locator);
    }

    public iconLoading() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorUnlock.unlockIos.iconoProgressBar,
            TypeLocator.ANDROID, LocatorUnlock.unlockAndroid.iconoProgressBar);
        return $(locator);
    }

    public async enterPassword(password: string) {
        for (let i = 0; i < password.length; i++) {
            const digit = password.charAt(i);
            await this.btnTypedNumber(digit).click();
        }
    }

    public async finishedLoading() {
        await this.iconLoading().waitForDisplayed({ reverse: true });
    }

    public get descQrUnlock () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, LocatorUnlock.unlockIos.desQrUnlock,
            TypeLocator.ANDROID, LocatorUnlock.unlockAndroid.desQrUnlock);
        return $(locator);
    }

    public get txtEnterYourPassword () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, LocatorUnlock.unlockIos.txtEnterYourPassword,
            TypeLocator.ANDROID, LocatorUnlock.unlockAndroid.txtEnterYourPassword);
        return $(locator);
    }

    public get btnForgotPassword () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, LocatorUnlock.unlockIos.btnForgotPassword,
            TypeLocator.ANDROID, LocatorUnlock.unlockAndroid.btnForgotPassword);
        return $(locator);
    }
}

export default new UnlockScreen();