import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $, expect } from '@wdio/globals';
import LocatorMovements from "../../resources/locators/payment/movements.locator.json" with { type: "json" };
import LocatorHome from '../../resources/locators/home/home.locator.json' with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import { ConstantsPayment } from '../../support/utils/payment.js';

class movementScreen extends BaseScreen {

    public async showMovements() {
  try {
    const selector = LocatorFactory.getElement(
      TypeLocator.CLASSCHAIN,
      LocatorHome.homeIos.showmovements,
      TypeLocator.ANDROID,
      LocatorHome.homeAndroid.showmovements
    );
    const element = await $(selector);

    await element.waitForDisplayed({ timeout: 5000 });
    await element.click();
    console.log("Click en 'Mostrar movimientos' ejecutado");
  } catch (error) {
    console.error("Error al hacer click en 'Mostrar movimientos':", error);
    throw error;
  }
}

   public async ShowAll() {
  try {
    const selector = LocatorFactory.getElement(
      TypeLocator.CLASSCHAIN,
      LocatorHome.homeIos.seeall,
      TypeLocator.ANDROID,
      LocatorHome.homeAndroid.seeall
    );
    const element = await $(selector);

    await element.waitForDisplayed({ timeout: 5000 });
    await element.click();
    console.log("Click en 'Ver todos' ejecutado");
  } catch (error) {
    console.error("Error al hacer click en 'Ver todos':", error);
    throw error;
  }
}


 public async validateMovementsScreen() {
       try{
        const movementsToText = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorMovements.movementsIos.titleMovements,
            TypeLocator.ANDROID,
            LocatorMovements.movementsAndroid.titleMovements
        );

        const titleMovementsSelect = await $(movementsToText);
        await titleMovementsSelect.waitForDisplayed({ timeout: 5000 });  
        //const titleMovementsSelect = await this.uiHelper.waitForElement(movementsToText,1000);
        console.log('Se visualiza la pantalla Movimientos');
        await expect(titleMovementsSelect).toBeDisplayed();
        await expect(titleMovementsSelect).toHaveText(
            ConstantsPayment.TEXT_MOVEMENTS
        );
     }catch (error){
        console.error("Error no se visualiza la pantalla Movimientos", error);
        throw error;
        }
    }

  public get btnenviarcorreo() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorMovements.movementsIos.btnsendemail,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnsendemail);
            return $(selector);
    }

    public async enviarcorreo() {
        await browser.pause(2000);
         console.log('Se selecciona el boton enviar correo');
        await this.btnenviarcorreo.click();
    }

    public async inputTxtemail(correo: string){
        await browser.pause(1000);
        const inputEmailLocator = LocatorFactory.getElement(
            TypeLocator.CLASSNAME,
            LocatorMovements.movementsIos.txtemail,
            TypeLocator.CLASSNAME,
            LocatorMovements.movementsAndroid.txtemail
        );

        const inputemail = $(inputEmailLocator)
        await inputemail.waitForDisplayed({ timeout: 5000 });
        await inputemail.clearValue(); // Borra el valor anterior
        await inputemail.setValue(correo);
    }

    public get btnenviar() {
        const selector = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorMovements.movementsIos.btnsend,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnsend);
            return $(selector);
    }

    public async enviar() {
        await this.btnenviar.click();
    }

    public async validateSendEmailScreen() {
        await browser.pause(2000);
        const sendEmailToText = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorMovements.movementsIos.sendemailmessage,
            TypeLocator.ID,
            LocatorMovements.movementsAndroid.sendemailmessage
        );
        const titlesendEmail = await this.uiHelper.waitForElement(
            sendEmailToText,
            2000
        );
        await expect(titlesendEmail).toBeDisplayed();
        await expect(titlesendEmail).toHaveText(
            ConstantsPayment.TEXT_SENDEMAIL
        );
    }

     public get btnentendido() {
        const selector = LocatorFactory.getElement(TypeLocator.ID, LocatorMovements.movementsIos.btnentendido,
            TypeLocator.CLASSCHAIN, LocatorMovements.movementsAndroid.btnentendido);
            return $(selector);
    }

    public async entendido() {
        await this.btnentendido.click();
    }

    public get btnfiltermovent() {
        const selector = LocatorFactory.getElement(TypeLocator.ID, LocatorMovements.movementsIos.btnfilter,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnfilter);
            return $(selector);
    }

     public async filtermovement() {
        await this.btnfiltermovent.click();
    }

    public async filterday(filtro_dia: string) {

      let selector;

      switch (filtro_dia.toLowerCase()) {    
        case "solo hoy":      
        selector = LocatorFactory.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btntoday,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btntoday);      
          break;

        case "ultimos 7 dias":      
        selector = LocatorFactory.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn7days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn7days);      
          break;

        case "ultimos 15 dias":      
        selector = LocatorFactory.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn15days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn15days);      
          break;

        case "ultimos 30 dias":     
        selector = LocatorFactory.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn30days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn30days);     
          break;

        case "ultimos 90 dias":      
        selector = LocatorFactory.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn90days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn90days);      
          break;
        
        default:      
        throw new Error(`Filtro no reconocido: ${filtro_dia}`);
    }
    const filtroElement = await $(selector);  
    await filtroElement.waitForDisplayed({ timeout: 5000 });  
    await filtroElement.click();  
    console.log(`Filtro aplicado: ${filtro_dia}`);
  }
}

export default new movementScreen();