import LocatorProvider from '@common/locators/locator-provider.js';
import BaseScreen from "../commons/base.screen.js";
import { $, expect } from '@wdio/globals';
import LocatorMovements from "../../resources/locators/payment/movements.locator.json" with { type: "json" };
import LocatorHome from '../../resources/locators/home/home.locator.json' with { type: "json" };
import { TypeLocator } from '@common/enums/locator-type.enum.js';
import { ConstantsPayment } from '../../support/utils/payment.js';

class movementScreen extends BaseScreen {

    public async showMovements() {
  try {
    const selector = LocatorProvider.getElement(
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
    const selector = LocatorProvider.getElement(
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
        const movementsToText = LocatorProvider.getElement(
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
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorMovements.movementsIos.btnsendemail,
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
        const inputEmailLocator = LocatorProvider.getElement(
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
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorMovements.movementsIos.btnsend,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnsend);
            return $(selector);
    }

    public async enviar() {
        await this.btnenviar.click();
    }

    public async validateSendEmailScreen() {
        await browser.pause(2000);
        const sendEmailToText = LocatorProvider.getElement(
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
        const selector = LocatorProvider.getElement(TypeLocator.ID, LocatorMovements.movementsIos.btnentendido,
            TypeLocator.CLASSCHAIN, LocatorMovements.movementsAndroid.btnentendido);
            return $(selector);
    }

    public async entendido() {
        await this.btnentendido.click();
    }

    public get btnfiltermovent() {
        const selector = LocatorProvider.getElement(TypeLocator.ID, LocatorMovements.movementsIos.btnfilter,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnfilter);
            return $(selector);
    }

    public get movementsButton() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorMovements.movementsIos.movementsButton,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.movementsButton
        );
        return $(locator);
    }

    public get seeAllMovements() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorMovements.movementsIos.seeAllMovements,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.seeAllMovements
        );
        return $(locator);
    }

    public get sendReportEmailMovements() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorMovements.movementsIos.sendReportEmailMovements,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.sendReportEmailMovements
        );
        return $(locator);
    }

    public get btnsend() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorMovements.movementsIos.btnsend,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.btnsend
        );
        return $(locator);
    }

    public get veValidateEmailSentMessage() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorMovements.movementsIos.veValidateEmailSentMessage,
            TypeLocator.ANDROID, LocatorMovements.movementsAndroid.veValidateEmailSentMessage
        );
        return $(locator);
    }

     public async filtermovement() {
        await this.btnfiltermovent.click();
    }

    public async filterday(filtro_dia: string) {

      let selector;

      switch (filtro_dia.toLowerCase()) {    
        case "solo hoy":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btntoday,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btntoday);      
          break;

        case "ultimos 7 dias":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn7days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn7days);      
          break;

        case "ultimos 15 dias":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn15days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn15days);      
          break;

        case "ultimos 30 dias":     
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorMovements.movementsIos.btn30days,        
          TypeLocator.ANDROID,        
          LocatorMovements.movementsAndroid.btn30days);     
          break;

        case "ultimos 90 dias":      
        selector = LocatorProvider.getElement(        
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

    public async userSelectSendReportEmailDefectoCliente(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.sendReportEmailMovements, true);
        await this.sendReportEmailMovements.click();
        await this.uiHelper.waitForElementExistByLocator(this.btnsend, true);
        await this.btnsend.click();
    }

    public async confirmationSendEmail(): Promise<boolean> {
        return await this.uiHelper.waitForElementExistByLocator(this.veValidateEmailSentMessage, true);
    }

    public async viewAllMovements(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.movementsButton, true);
        await this.movementsButton.click();
        await this.gestureHelper.verticalScrollingToEnd();
        await this.gestureHelper.verticalScrollingToEnd();
        await this.uiHelper.waitForElementExistByLocator(this.seeAllMovements, true);
        await this.seeAllMovements.click();
    }
}

export default new movementScreen();