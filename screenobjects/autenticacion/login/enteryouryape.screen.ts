import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorLogin from '../../../resources/locators/autenticacion/login/login.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';

import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';


class EnterYourYapeScreen extends BaseScreen {
    public get txtEmail() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLogin.loginIos.txtEmail,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.txtEmail);
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorLogin.loginIos.btnContinuar,
            TypeLocator.ID, LocatorLogin.loginAndroid.btnContinuar);
        return $(locator);
    }

    public get lnkHelpCenter(){
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorLogin.loginIos.lnkHelpCenter,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.lnkHelpCenter);
            return $(locator);
    }

     public get lblYapeAccountTitle(){
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorLogin.loginIos.lblYapeAccountTitle,
            TypeLocator.XPATH, LocatorLogin.loginAndroid.lblYapeAccountTitle);
            return $(locator);
    }

    // Método para iniciar sesión con un correo electrónico
    async loginAccount(email: string): Promise<void> {
        try {
            await this.txtEmail.setValue(email);

            await this.btnContinue.click();

        } catch (error) {
            console.error('Error en el login:', error);
        }
    }

    async clickGoToTheHelpcenter() {
        await this.lnkHelpCenter.click();
    }

    async verifyYapeAccountTitle() {
        await this.uiHelper.waitForElementExistByLocator(this.lblYapeAccountTitle, true);
    }

}

export default new EnterYourYapeScreen();
