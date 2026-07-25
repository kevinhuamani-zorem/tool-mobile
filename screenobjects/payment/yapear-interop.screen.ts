
import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $, expect } from '@wdio/globals';
import LocatorYapear from "../../resources/locators/payment/yapear.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import LocatorYapearInterop from "../../resources/locators/payment/yapear-interop.locator.json" with { type: "json" };
import { ConstantsPayment } from '../../support/utils/payment.js';

class YapearInteropScreen extends BaseScreen {

private async waitForElementLocal(
    element: ReturnType<typeof $>,
    timeout = 5000
): Promise<ReturnType<typeof $>> {
    await element.waitForDisplayed({ timeout });
    return element;
}

    public async selectEntity(entidad: string){
    await browser.pause(2000);
    const Entitybtn = LocatorFactory.getElement(
        TypeLocator.ID,
        LocatorYapearInterop.yapearInteropIos.btninterop.replace("{entidad}", entidad),
        TypeLocator.ANDROID,
        LocatorYapearInterop.yapearInteropAndroid.btninterop.replace("{entidad}", entidad)
    );

    const existeElemento = await this.uiHelper.waitForElement(Entitybtn, 4000);

    if(existeElemento){
    const EntityButton = $(Entitybtn);
    await EntityButton.click();
    }
}

public async validateDataInteropScreen() {
        await browser.pause(1000);

        const selectorTitle = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorYapearInterop.yapearInteropIos.titleYapearInterop,
            TypeLocator.ANDROID,
            LocatorYapearInterop.yapearInteropAndroid.titleYapearInterop
        );

        const titleElement = $(selectorTitle);

        const titleDataInterop = await this.waitForElementLocal(titleElement,9000);

        console.log('Se valida que se encuentra en la pantalla de validar datos Interoperables');

        await expect(titleDataInterop).toBeDisplayed();
        await expect(titleDataInterop).toHaveText(
            ConstantsPayment.TEXT_YAPEAR_INTEROP
        );

        const selectorBtnConfirm = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorYapearInterop.yapearInteropIos.btnConfirmarYapeo,
                                                TypeLocator.ANDROID, LocatorYapearInterop.yapearInteropAndroid.btnConfirmarYapeo);

        const btnConfirmYapeo= $(selectorBtnConfirm);
        const existeElemento = await this.waitForElementLocal(btnConfirmYapeo, 5000);

        if(existeElemento){
        console.log('Boton Confirmar Yapeo visible');
        await btnConfirmYapeo.click();
        }

    }




}
    export default new YapearInteropScreen();
