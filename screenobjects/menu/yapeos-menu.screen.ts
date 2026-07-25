import LocatorFactory from '../../support/utils/LocatorFactory.js';
import BaseScreen from '../commons/base.screen.js';
import { $ } from '@wdio/globals';
import LocatorMenu from '../../resources/locators/menu/yapeos-menu.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.js';

class MainSubMenuScreen extends BaseScreen {

    public async optionsMenuYape(options: string) {
        await browser.pause(1000);
        const isModalOpen = await this.checkIfModalIsOpen();
        const funcionalityYapeLocator = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorMenu.menuIos.funcionalityYape.replace('{options}', options),
            TypeLocator.XPATH,
            LocatorMenu.menuAndroid.funcionalityYape.replace('{options}', options)
        );
        if (isModalOpen) {
            const modalButton = $(funcionalityYapeLocator);
            await modalButton.click();
            return;
        }
        const homeButton = await $(funcionalityYapeLocator);
        await homeButton.click();
    }
    private async checkIfModalIsOpen(): Promise<boolean> {
        try {
            const modalLocator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorMenu.menuIos.modalYape
                , TypeLocator.ANDROID, LocatorMenu.menuAndroid.modalYape);
            const modal = await $(modalLocator);
            return await modal.isDisplayed();
        } catch (error) {
            return false;
        }
    }

    public async checkProductDoesNotVisible(options: string){
        let product: boolean = true;

        const funcionality = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorMenu.menuIos.funcionalityYape.replace('{options}', options),
            TypeLocator.XPATH,
            LocatorMenu.menuAndroid.funcionalityYape.replace('{options}', options)
        );

        product = await $(funcionality).isDisplayed();
        await expect(product).toBe(false);
    }
}

export default new MainSubMenuScreen();