
import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import LocatorYapearAmount from "../../resources/locators/payment/yapear-amount.locator.json" with { type: "json" };


class YapearMountScreen extends BaseScreen {

    public async inputYapearAmount(amount: string){
        await browser.pause(1000);
        const inputYapearAmountLocator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorYapearAmount.yapearIos.amount,
            TypeLocator.ANDROID,
            LocatorYapearAmount.yapearAndroid.amount
        );

        const inputYapearAmount = $(inputYapearAmountLocator)
        await inputYapearAmount.setValue(amount);
    }

    public async inputYapearcomment(comment: string){
        await browser.pause(1000);
        const inputYapearcommentLocator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorYapearAmount.yapearIos.comment,
            TypeLocator.ANDROID,
            LocatorYapearAmount.yapearAndroid.comment
        );

        const inputcomment = $(inputYapearcommentLocator)
        await inputcomment.setValue(comment);
    }

    public get btnYapear() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearAmount.yapearIos.btnyapear,
                                                TypeLocator.XPATH, LocatorYapearAmount.yapearAndroid.btnyapear);
        return $(locator);
    }

    public get btnOtrosBancos() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearAmount.yapearIos.btnotrosbancos,
                                                TypeLocator.ANDROID, LocatorYapearAmount.yapearAndroid.btnotrosbancos);
        return $(locator);
    }

    public async pressButtonYapear(){

        console.log('Antes, validar si boton yapear está habilitado');
            if ( await this.btnYapear.isEnabled ()) {
                console.log('Boton yapear habilitado y visible');
                await this.btnYapear.click();
                await browser.pause(1000);
            } else {
                console.log("El usuario destino no se encuentra afiliado a yape");
            }
    } 

     public async pressButtonOtrosBancos(){

        console.log('Antes, validar si boton Otros bancos está habilitado');
             await this.btnOtrosBancos.isEnabled ()
                console.log('Boton Otros bancos habilitado y visible');
                await this.btnOtrosBancos.click();
                await browser.pause(3000);
           
    }

    public async validateTransactionLimitsEnterprise() {
        const locator = LocatorFactory.getElement(
            TypeLocator.PREDICATESTRING,
            LocatorYapearAmount.yapearIos.lblTransactionLimitsEnterprise,
            TypeLocator.ANDROID,
            LocatorYapearAmount.yapearAndroid.lblTransactionLimitsEnterprise
        );
        const lblLimits = $(locator);
        await lblLimits.waitForDisplayed({ timeout: 3000 });
        const clean = (s: string) => s
            .normalize('NFC')
            .replace(/[\u00A0\u202F\u2007\u2060\uFEFF]/g, ' ')
            .replace(/[\u200B\u200C\u200D\u00AD]/g, '');
        const raw = browser.isIOS
            ? (await lblLimits.getAttribute('label') ?? await lblLimits.getText())
            : await lblLimits.getText();
        const text = clean(raw);
        expect(text).toContain(clean('Límite por yapeo S/ 500'));
        expect(text).toContain(clean('límite total por día S/ 3,000'));
    }

}
    export default new YapearMountScreen();
