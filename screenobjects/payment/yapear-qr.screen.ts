import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import LocatorHome from "../../resources/locators/home/home.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";



class YapearScreenQr extends BaseScreen {
    
    public get btnEscanearQr() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorHome.homeIos.btnQrHome,
            TypeLocator.ANDROID, LocatorHome.homeAndroid.btnQrHome);
            return $(selector);
    }

    public async yapearQr() {
        await this.btnEscanearQr.click();
    }

}

export default new YapearScreenQr();