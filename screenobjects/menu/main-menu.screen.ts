import LocatorFactory from '../../support/utils/LocatorFactory.js';
import BaseScreen from '../commons/base.screen.js';
import { $ } from '@wdio/globals';
import LocatorMenu from '../../resources/locators/menu/main-menu.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.js';

class MainMenuScreen extends BaseScreen {

    public get btnSeeMore() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorMenu.menuIos.btnSeeMore,
            TypeLocator.ANDROID, LocatorMenu.menuAndroid.btnSeeMore);
        return $(locator);
    }

    public get btnNavegationMenu() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorMenu.menuIos.btnNavigationMenu,
            TypeLocator.ID, LocatorMenu.menuAndroid.btnNavigationMenu);
        return $(locator);
    }

    public get btnSettings() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorMenu.menuIos.settings,
            TypeLocator.ANDROID, LocatorMenu.menuAndroid.settings);
        return $(locator);
    }
    public get btnBackSettings() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorMenu.menuIos.btnBackSettings,
            TypeLocator.ANDROID, LocatorMenu.menuAndroid.btnBackSettings);
        return $(locator);
    }

    public async seeMoreOptions() {
        const locator = this.btnSeeMore;
        const isDisplayed = await locator.waitForDisplayed({ timeout: 5000 });
        if (isDisplayed) {
            await locator.click();
        } else {
            console.log('El botón no está disponible..');
        }

    }
    public async navegationMenu() {
        await this.btnNavegationMenu.click();
    }
    public async pressSettings() {
        await this.btnSettings.click();
    }

    public async pressOptionsSettings(options: string) {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorMenu.menuIos.optionSettings.replace('{options}', options),
            TypeLocator.XPATH, LocatorMenu.menuAndroid.optionSettings.replace('{options}', options));
        try {
            const elemento = await this.uiHelper.waitForElement(locator);

            if (elemento) {
                await elemento.click();
                console.log(`Se hizo clic en la opción de configuración: ${options}`);
            } else {
                console.log(`El elemento no está presente o no es visible: ${options}`);
            }
        } catch (error) {
            console.error(`No se pudo hacer clic en la opción de configuración: ${options}`, error);
            throw error;
        }
    }
}

export default new MainMenuScreen();