import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import {$, browser, expect} from '@wdio/globals';
import LocatorWinstateYapearFlow from "../../resources/locators/payment/yapear-winstate.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import { ConstantsPayment } from '../../support/utils/payment.js';
import AutoatencionUtils from "../../support/utils/autoatencion-util.ts";

class yapearWinstateScreen extends BaseScreen {


    public get lblHourYape() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorWinstateYapearFlow.winstateYapeasteIOs.lblHourYape,
            TypeLocator.XPATH, LocatorWinstateYapearFlow.winstateYapeasteAndroid.lblHourYape);
    }

    public get lblMountYape() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorWinstateYapearFlow.winstateYapeasteIOs.lblMountYape,
            TypeLocator.XPATH, LocatorWinstateYapearFlow.winstateYapeasteAndroid.lblMountYape);
    }

    public async validateWinStateScreen(){

        const yapeasteToText=LocatorFactory.getElement(
                     TypeLocator.PREDICATESTRING,
                    LocatorWinstateYapearFlow.winstateYapeasteIOs.yapeasteWinstate,
                     TypeLocator.ANDROID,
                     LocatorWinstateYapearFlow.winstateYapeasteAndroid.yapeasteWinstate)

        try{
            const titleContactSelect = await this.uiHelper.waitForElement(
                yapeasteToText,
            15000
        );
        await expect(titleContactSelect).toBeDisplayed();
        await expect(titleContactSelect).toHaveText(
            ConstantsPayment.TEXT_YAPEASTE_WINSTATE
        );
        } catch(error){
            console.error("Error al ejecutar la validacion de Winstate", error);
        }

        }

        public get ButtonClose() {
            const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorWinstateYapearFlow.winstateYapeasteIOs.closeButton,
                                                    TypeLocator.ANDROID, LocatorWinstateYapearFlow.winstateYapeasteAndroid.closeButton);
            return $(locator);
        }

        public async pressButtonClose(){
            await browser.pause(2000);
            await this.ButtonClose.click();
            await browser.pause(4000);
        }


        public async getDataWinState(){

            let datosYape: Array<string> = [];
            await  browser.pause(2000);
            const elementHour = this.lblHourYape;
            const elementMount = this.lblMountYape;
            datosYape.push(await  AutoatencionUtils.existeElementoGetAttribute(elementHour ?? "", "text") ?? "");
            datosYape.push(await  AutoatencionUtils.existeElementoGetAttribute(elementMount ?? "", "text") ?? "");

            return datosYape;
        }

}
    export default new yapearWinstateScreen();
