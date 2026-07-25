import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $ } from '@wdio/globals';
import LocatorOtp from "../../resources/locators/payment/yapear-otp.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import { Constants } from '../../support/utils/constants.js';
import { ConstantsPayment } from '../../support/utils/payment.js';

class yapearOTPScreen extends BaseScreen {

    public async validateConfirmaYapeoAltoScreen() {
        await browser.pause(1000);
        const yapeoaltoToText = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorOtp.yapearIos.txttitleYapeoAlto,
            TypeLocator.ANDROID,
            LocatorOtp.yapearAndroid.txttitleYapeoAlto
        );
        const titleyapeoalto = await this.uiHelper.waitForElement(
            yapeoaltoToText,
            2000
        );
        await expect(titleyapeoalto).toBeDisplayed();
        await expect(titleyapeoalto).toHaveText(
            ConstantsPayment.TEXT_CONFIRMAR_TU_YAPEO_ALTO
        );
    }


    public async pressButtonValideCode(){
             
    try {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOtp.yapearIos.btnValidateCode,
            TypeLocator.ANDROID, LocatorOtp.yapearAndroid.btnValidateCode);

        const existeElemento = await this.uiHelper.waitForElement(locator, Constants.TIMEOUT_LONG);
                if (!existeElemento) {
                    console.log('elemento no encontrado en confirmacion OTP');
                    return;
                }

                console.log('Antes de validar si esta habilitado el elemento');
                const element =  $(locator);
                const isEnabled = await element.isEnabled();
    
                if (isEnabled) {
                    console.log('El boton validar codigo está visible y habilitado');
                    (await $(locator)).click();
                } else {
                    console.log('El boton validar codigo no está visible o no está habilitado');
                }
            } catch (error) {
                console.error('Error al realizar el yapeo', error);
            }        


        
    } 

}
export default new yapearOTPScreen();