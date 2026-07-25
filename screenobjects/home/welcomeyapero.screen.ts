import BaseScreen from '../commons/base.screen.js';
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import { $ } from '@wdio/globals';
import LocatorHome from '../../resources/locators/home/home.locator.json' with { type: 'json' };
import LocatorBalance from '../../resources/locators/backfunds/balance.locator.json' with { type: 'json' };
import LocatorLogin from '../../resources/locators/autenticacion/login/login.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.js';
import { removeDoubleQuotes, handlePopupIfVisible, validateElementWithRetries } from '../../support/utils/Utils.js';
import unlockScreen from '../autenticacion/unlock/unlock.screen.js';

class WelcomeYaperoScreen extends BaseScreen {

    public get btnClose() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorHome.homeIos.btnCloseScreenWelcome2,
            TypeLocator.ANDROID, LocatorHome.homeAndroid.btnCloseScreenWelcome);
        return $(locator);
    }

    public get btnCloseHelp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHome.homeIos.btnCloseHelpWelcome,
            TypeLocator.ID, LocatorHome.homeAndroid.btnCloseHelpWelcome);
        return $(locator);
    }

    public get btnMoreLater() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorHome.homeIos.btnMoreLater,
            TypeLocator.ID, LocatorHome.homeAndroid.btnMoreLater);
        return $(locator);
    }

    public get lblSeeBalance() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorBalance.balanceIos.btnMostrarSaldo,
            TypeLocator.ANDROID, LocatorBalance.balanceAndroid.btnMostrarSaldo);
        return $(locator);
    }

    public get btnIntentarloDespues() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLogin.loginIos.btnIntentarloDespues,
            TypeLocator.ID, LocatorLogin.loginAndroid.btnIntentarloDespues);
        return $(locator);
    }

    public get btnIniciarSesion() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLogin.loginIos.btnIniciarSesion,
            TypeLocator.ID, LocatorLogin.loginAndroid.btnIniciarSesion);
        return $(locator);
    }


    public async closeUbication() {
        await handlePopupIfVisible(() => this.btnMoreLater, 'Ubicacion');
    }

    public async closePromotion() {
        await handlePopupIfVisible(() => this.btnClose, 'Promoción');
    }

    public async closeHelpHome() {
        await handlePopupIfVisible(() => this.btnCloseHelp, 'Ayuda en Home');
    }

    public async clickIntentarloDespuesSiExiste() {
        await handlePopupIfVisible(() => this.btnIntentarloDespues, 'Intentarlo después');
    }

    public async clickIniciarSesionSiExiste() {
        await handlePopupIfVisible(() => this.btnIniciarSesion, 'Iniciar sesión');
    }

    public async showHome(maxRetries: number = 3, retryDelay: number = 2000) {
        const selector = LocatorFactory.getElement(TypeLocator.XPATH, LocatorHome.homeIos.btnScanQR,
            TypeLocator.XPATH, LocatorHome.homeAndroid.btnScanQR);

        const isReady = await validateElementWithRetries(() => $(selector), maxRetries, retryDelay);

        if (!isReady) {
            throw new Error("The 'Yapear' button was not found after several attempts.");
        }
    }
    public async validateHomeSeeBalance(ExpectedTitle: string) {
        await this.lblSeeBalance.waitForDisplayed();
        const realResponse: string = await this.lblSeeBalance.getText();
        await expect(realResponse).toEqual(removeDoubleQuotes(ExpectedTitle));
    }

    public async verificarSiIniciaLoginConPin(): Promise<boolean> {
        try {
            let locator;
            if (browser.isAndroid) {
                locator = LocatorHome.homeAndroid.txtEnterPin;
            } else if (browser.isIOS) {
                locator = LocatorHome.homeIos.txtEnterPin;
            } else {
                return false;
            }
            const exists = await this.uiHelper.waitForElementExist(locator, false, 5000);
            return exists;
        } catch (error) {
            return false;
        }
    }

    public async stabilizeHomeAfterPinLogin(password: string): Promise<void> {
        const unlockIfPinVisible = async (): Promise<boolean> => {
            const pinVisible = await this.verificarSiIniciaLoginConPin();
            if (!pinVisible) {
                return false;
            }

            await unlockScreen.enterPassword(password);
            return true;
        };

        await unlockIfPinVisible();

        if (browser.isIOS) {
            await browser.waitUntil(async () => {
                await this.clickIntentarloDespuesSiExiste();
                await this.closeUbication();
                await this.closePromotion();
                await this.closeHelpHome();

                if (await this.verificarSiIniciaLoginConPin()) {
                    return false;
                }

                try {
                    await this.showHome(1, 0);
                    return true;
                } catch {
                    return false;
                }
            }, {
                timeout: 30000,
                interval: 2000,
                timeoutMsg: 'The iOS home screen did not become stable after login.'
            });
            return;
        }

        await browser.waitUntil(async () => !(await this.verificarSiIniciaLoginConPin()), {
            timeout: 10000,
            interval: 1000,
            timeoutMsg: 'The unlock screen remained visible after entering the PIN.'
        });

        await this.clickIntentarloDespuesSiExiste();
        await this.closeUbication();
        await this.closePromotion();
        await this.closeHelpHome();

        await browser.waitUntil(async () => !(await this.verificarSiIniciaLoginConPin()), {
            timeout: 5000,
            interval: 1000,
            timeoutMsg: 'The unlock screen reappeared after the post-login popups were handled.'
        });

        await this.showHome();
    }


}

export default new WelcomeYaperoScreen();
