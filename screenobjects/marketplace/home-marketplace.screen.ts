import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import CategoriesLocator from '../../resources/locators/marketplace/marketplace-home.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

/**
 * sub page containing specific selectors and methods for a specific page
 */
class HomeMarketplaceScreen extends BaseScreen{


    public get btnMyOrdersBottomMenu(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.MarketPlaceHomeIos.btnMyOrdersBottomMenu,
            TypeLocator.XPATH, CategoriesLocator.MarketPlaceHomeAndroid.btnMyOrdersBottomMenu
        );
        return $(locator);
    }

    // abrir mis pedidos desde el menu inferior
    public async openMyOrdersBottomMenu(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.btnMyOrdersBottomMenu, true);
        this.btnMyOrdersBottomMenu.click();
    }
}

export default new HomeMarketplaceScreen();
