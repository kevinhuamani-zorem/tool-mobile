import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import LocatorYapearImageqr from "../../resources/locators/payment/yapear-imagen-qr.locator.json" with { type: "json" };
import LocatorHome from "../../resources/locators/home/home.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import { ConstantsPayment } from '../../support/utils/payment.js';



class YepearSelectImageQr extends BaseScreen {
    
    public get btnyapearqr() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearImageqr.yapearIos.btnYapearqr,
            TypeLocator.ANDROID, LocatorYapearImageqr.yapearAndroid.btnYapearqr);
            return $(selector);
    }
    public async yapearImageQr() {
        await this.btnyapearqr.click();
    }

}

export default new YepearSelectImageQr();