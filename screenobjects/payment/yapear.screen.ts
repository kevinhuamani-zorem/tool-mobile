import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import LocatorHome from "../../resources/locators/home/home.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";




class YapearScreen extends BaseScreen {
    
    public get btnYapear() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorHome.homeIos.btnYapearHome,
            TypeLocator.XPATH, LocatorHome.homeAndroid.btnYapearHome);
            return $(selector);
    }

    public async yapear() {
        await this.btnYapear.click();
    }

}

export default new YapearScreen();