import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import LocatorYapearSelectqr from "../../resources/locators/payment/yapear-selectqr.locator.json" with { type: "json" };
import LocatorHome from "../../resources/locators/home/home.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";



class YepearSelectQr extends BaseScreen {
    
    public get btnSelectqr() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearSelectqr.yapearIos.btnSelectqr,
            TypeLocator.ANDROID, LocatorYapearSelectqr.yapearAndroid.btnSelectqr);
            return $(selector);
    }

    public async yapearSelectQr() {
        await this.btnSelectqr.click();
    }

}

export default new YepearSelectQr();