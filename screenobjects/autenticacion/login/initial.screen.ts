import { $ } from "@wdio/globals";
import LocatorLogin from "@resources/locators/autenticacion/login/login.locator.json" with { type: "json" };
import { TypeLocator } from "@utils/Enums.js";
import LocatorFactory from "@utils/LocatorFactory.js";
import BaseScreen from "@screenobjects/commons/base.screen.js";

class InitialScreen extends BaseScreen {
    public get btnCreateAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorLogin.loginIos.btnCrearCuenta,
            TypeLocator.ID,
            LocatorLogin.loginAndroid.btnCrearCuenta,
        );
        return $(locator);
    }

    public get btnAlreadyHaveAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.btnTengoCuenta,
            TypeLocator.ANDROID,
            LocatorLogin.loginAndroid.btnTengoCuenta,
        );
        return $(locator);
    }

    public get btnNotHaveAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.btnCrearCuenta,
            TypeLocator.ANDROID,
            LocatorLogin.loginAndroid.btnCrearCuenta,
        );
        return $(locator);
    }

    public get btnDontAllowNotifications() {
        return $(LocatorLogin.loginIos.btnDontAllow);
    }

    private async dismissIosNotificationPromptIfVisible() {
        if (!browser.isIOS) {
            return;
        }

        const denyNotificationsButton = this.btnDontAllowNotifications;
        const isDisplayed = await denyNotificationsButton
            .waitForDisplayed({ timeout: 5000 })
            .catch(() => false);

        if (isDisplayed) {
            await denyNotificationsButton.click();
            await denyNotificationsButton.waitForDisplayed({ timeout: 5000, reverse: true }).catch(() => false);
        }
    }

    public async alreadyHaveAccount() {
        await this.dismissIosNotificationPromptIfVisible();
        await this.btnAlreadyHaveAccount.waitForDisplayed({ timeout: 30000 });
        await this.btnAlreadyHaveAccount.click();
    }

    public async notHaveAccount() {
        await this.btnNotHaveAccount.click();
    }

    public async waitForAlreadyHaveAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorLogin.loginIos.btnTengoCuenta,
            TypeLocator.ANDROID,
            LocatorLogin.loginAndroid.btnTengoCuenta,
        );
        const element = $(locator);
        await element.waitForDisplayed({ timeout: 10000 });
    }
}

export default new InitialScreen();
