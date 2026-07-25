import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import HomeLocator from '../../resources/locators/home/home.locator.json' with { type: 'json' };
import LocatorFactory from "../../support/utils/LocatorFactory.ts";
import {TypeLocator} from "../../support/utils/Enums.ts";
import CdaHomeLocator from '../../resources/locators/autoatencion/cdahome.locator.json' with { type: 'json' };
import AutoAtencionUtil  from "../../support/utils/autoatencion-util.ts";

class HomeScreen extends BaseScreen{


    public get lblLastMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaHomeLocator.Ios.lblLastMov,
            TypeLocator.XPATH, CdaHomeLocator.Android.lblLastMov);
    }

    public get btnViewAllMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaHomeLocator.Ios.btnViewAllMov,
            TypeLocator.XPATH, CdaHomeLocator.Android.btnViewAllMov);
    }

    public get lblHelpOtherMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaHomeLocator.Ios.lblHelpOtherMov,
            TypeLocator.XPATH, CdaHomeLocator.Android.lblHelpOtherMov);
    }



    public async getCantEleUltMov(){
        try {
        const elementos = await $$(this.lblLastMov);
            if  (elementos) {
                console.log("Cantidad de elementos " + elementos.length);
                return elementos.length;
            }else {
                console.log(`El elemento ${elementos} no se visualiza en la aplicación`)
                return 0;
            }
        }catch (error) {
            console.error(`Error: ${error}`);
        }
    }

    public async  selUltimoMovimiento(){
        const element = this.btnViewAllMov;
        await AutoAtencionUtil.waitElementToAction(element,"click");
    }

    public async  selAyudaConMovimiento(){
        console.log("Seleccionar Ayuda con un movimiento");
        const element = this.lblHelpOtherMov;
        await AutoAtencionUtil.waitElementToAction(element,"click");
        console.log("Termino Seleccionar Ayuda con un movimiento");
    }


}

export default new HomeScreen();
