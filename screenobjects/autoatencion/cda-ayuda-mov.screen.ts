import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from "../../support/utils/LocatorFactory.ts";
import {TypeLocator} from "../../support/utils/Enums.ts";
import CdaAyudaMov from '../../resources/locators/autoatencion/cdaayudamov.locator.json' with { type: 'json' };
import AutoAtencionUtil  from "../../support/utils/autoatencion-util.ts";
import LocatorAyudaMovimiento from 'resources/locators/autoatencion/cdaayudamov.locator.json' with { type: "json" };



class AyudaMovimiento extends BaseScreen{


    public get lblNotYapeo() {
        return  LocatorFactory.getElement(TypeLocator.XPATH, CdaAyudaMov.Ios.lblNotYapeo,
            TypeLocator.XPATH, CdaAyudaMov.Android.lblNotYapeo);
    }
    public get lblNameScreen() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaAyudaMov.Ios.lblNameScreen,
            TypeLocator.XPATH, CdaAyudaMov.Android.lblNameScreen);
    }

    public get lblHourMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaAyudaMov.Ios.lblHourMov,
            TypeLocator.XPATH, CdaAyudaMov.Android.lblHourMov);
    }


    public get lblMountMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaAyudaMov.Ios.lblMountMov,
            TypeLocator.XPATH, CdaAyudaMov.Android.lblMountMov);
    }

    public get btnRechargeMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaAyudaMov.Ios.btnRechargeMov,
            TypeLocator.XPATH, CdaAyudaMov.Android.btnRechargeMov);
    }


    public lblTypeMov(movimiento: string) {
        return LocatorFactory.getElement(TypeLocator.XPATH, CdaAyudaMov.Ios.lblTypeMov.replace("Tipo_Movimiento",movimiento),
            TypeLocator.XPATH, CdaAyudaMov.Android.lblTypeMov.replace("Tipo_Movimiento",movimiento));
    }

    public get btnHelpOtheMov() {
        return  LocatorFactory.getElement(TypeLocator.CLASSCHAIN, CdaAyudaMov.Ios.btnHelpOtheMov,
            TypeLocator.XPATH, CdaAyudaMov.Android.btnHelpOtheMov);
    }

    public async getMessageNotYapeo(){
        const element = this.lblNotYapeo;
        try {
            const existeElemento = await this.uiHelper.waitForElement(element);
            if (existeElemento) {
                console.log(`Mensaje mostrado ` + await $(element).getAttribute("text"))
                return await $(element).getAttribute("text");
            } else {
                console.log(`El elemento ${element} no se visualiza en la aplicación`)
                return "";
            }
        } catch (error) {
            console.error(`Error : ${error}`);
        }
    }

    public async getDatesLastMov(){
        const element = this.lblHourMov;
        let datosUltimoMov: Array<string> = [];
        try {
            const existeElemento = await this.uiHelper.waitForElement(element);
            if (existeElemento) {
                const hora = await this.lblHourMov;
                const monto = await this.lblMountMov;
                datosUltimoMov.push(await $(hora).getAttribute("text"));
                datosUltimoMov.push(await $(monto).getAttribute("text"));
                return datosUltimoMov;
            } else {
                console.log(`El elemento ${element} no se visualiza en la aplicación o no existe yapeos recientes`)
                return null;
            }
        } catch (error) {
            console.error(`Error : ${error}`);
        }
    }

    public async  selUpdateMovement(){
        const element = this.btnRechargeMov;
        await AutoAtencionUtil.waitElementToAction(element,"click")
    }

    public async selectMovement(movimiento: string){
        console.log(`El movimiento a buscar es:  ${movimiento}`)
        const element = this.lblTypeMov(movimiento);
        console.log(`El movimiento a buscar es ${element}`)
        await $(element).click();
    }


    public async selectHelpOtherMovement() {
        const element = this.btnHelpOtheMov;
        await AutoAtencionUtil.waitElementToAction(element,"click")
    }


    public async validateScreenMovement() {
        const selector = this.lblNameScreen;
        console.log(`Pantalla a buscar:  ${selector}`);
        const element = $(selector);
        await expect(element).toBeDisplayed(); 
    }

    public async validateScreenHelpMovement() {
        const selector = this.lblNameScreen;

    }

}

export default new AyudaMovimiento();
