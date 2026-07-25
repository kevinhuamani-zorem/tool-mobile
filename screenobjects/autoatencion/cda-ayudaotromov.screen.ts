import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from "../../support/utils/LocatorFactory.ts";
import {TypeLocator} from "../../support/utils/Enums.ts";
import Cdaayudaotromov from '../../resources/locators/autoatencion/cdaayudaotromov.locator.json' with { type: 'json' };
import AutoAtencionUtil  from "../../support/utils/autoatencion-util.ts";

class AyudaOtroMovimiento extends BaseScreen{


    public get lblNameScreen() {
        return  LocatorFactory.getElement(TypeLocator.XPATH, Cdaayudaotromov.Ios.lblNameScreen,
            TypeLocator.XPATH, Cdaayudaotromov.Android.lblNameScreen);
    }

    public get btnBack() {
        return  LocatorFactory.getElement(TypeLocator.XPATH, Cdaayudaotromov.Ios.btnBack,
            TypeLocator.XPATH, Cdaayudaotromov.Android.btnBack);
    }
   

    public async validatePantallaAyudaMovimiento() {
        const selector = this.lblNameScreen;
        console.log(`Pantalla a buscar:  ${selector}`);
        const element = $(selector);
        await expect(element).toBeDisplayed(); 
    }

    public async pressBack() {
        const element = this.btnBack;
        await AutoAtencionUtil.waitElementToAction(element,"click")
    }


}

export default new AyudaOtroMovimiento();
