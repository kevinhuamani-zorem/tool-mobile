import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import LocatorYapearSelectqr from "../../resources/locators/payment/yapear-selectqr.locator.json" with { type: "json" };
import LocatorYapearSelectImageQr from "../../resources/locators/payment/yapear-select-imagen-qr.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";



class YepearSelectImageQr extends BaseScreen {
    
    public get validateSelectQrScreen() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearSelectImageQr.yapearIos.imageSelect,
            TypeLocator.ANDROID, LocatorYapearSelectImageQr.yapearAndroid.imageSelect);
            return $(selector);
    }

    public async selectImageQr() {
        await this.validateSelectQrScreen.click();
    }

}

export default new YepearSelectImageQr();