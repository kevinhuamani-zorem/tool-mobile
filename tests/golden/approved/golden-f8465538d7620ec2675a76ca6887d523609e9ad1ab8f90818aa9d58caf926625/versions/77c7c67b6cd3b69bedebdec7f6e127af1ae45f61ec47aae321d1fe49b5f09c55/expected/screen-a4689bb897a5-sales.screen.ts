import LocatorProvider from '@common/locators/locator-provider.js';
import BaseScreen from "../commons/base.screen.js";
import { $, expect } from '@wdio/globals';
import LocatorSales from "../../resources/locators/payment/showsales.locator.json" with { type: "json" };
import { TypeLocator } from '@common/enums/locator-type.enum.js';
import { ConstantsPayment } from "../../support/utils/payment.js";

class salesScreen extends BaseScreen {

    public get btnshowSales() {
  
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.btnshowsales,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.btnshowsales);
            return $(selector);
}

public async showSales() {
        await this.btnshowSales.click();
    }

public async validateSelectSalescreen() {
        const ventasToText = LocatorProvider.getElement(
            TypeLocator.ID,
            LocatorSales.salesiOS.titleVentas,
            TypeLocator.ANDROID,
            LocatorSales.salesAndroid.titleVentas
        );
        const titlesales = await this.uiHelper.waitForElement(
            ventasToText,
            5000
        );
        await expect(titlesales).toBeDisplayed();
        await expect(titlesales).toHaveText(
            ConstantsPayment.TEXT_VENTAS
        );
    }

    public get btnshowfilters() {
  
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.btnfiltros,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.btnfiltros);
            return $(selector);
}

    public async showfilters() {
        await this.btnshowfilters.click();
    }


    public async filterday(filtro_dia: string) {

      let selector;

      switch (filtro_dia.toLowerCase()) {    
        case "Hoy":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btntoday,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btntoday);      
          break;

        case "Ultimos 7 dias":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btn7days,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btn7days);      
          break;

        case "Ultimos 15 dias":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btn15days,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btn15days);      
          break;

        case "Ultimos 30 dias":     
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btn30days,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btn30days);     
          break;

        case "Ultimos 90 dias":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btn90days,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btn90days);      
          break;
        
        default:      
        throw new Error(`Filtro no reconocido: ${filtro_dia}`);
    }
    const filtroElement = await $(selector);  
    await filtroElement.waitForDisplayed({ timeout: 2000 });  
    await filtroElement.click();  
    console.log(`Filtro aplicado: ${filtro_dia}`);
  }


  public async status_sale(estado_venta: string) {

      let selector;

      switch (estado_venta.toLowerCase()) {    
        case "todos":      
        selector = LocatorProvider.getElement(        
          TypeLocator.CLASSCHAIN,        
          LocatorSales.salesiOS.btnall,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnall);      
          break;

        case "exitosa":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnsuccessful,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnsuccessful);      
          break;

        case "rechazada":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnrejected,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnrejected);      
          break;

        case "devuelta":     
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnreturned,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnreturned);     
          break;
        
        default:      
        throw new Error(`Filtro no reconocido: ${estado_venta}`);
    }
    const filtroElement = await $(selector);  
    await filtroElement.waitForDisplayed({ timeout: 2000 });  
    await filtroElement.click();  
    console.log(`Filtro aplicado: ${estado_venta}`);
  }


  public async means_payment(medio_cobro: string) {

      let selector;

      switch (medio_cobro.toLowerCase()) {    
        case "todos":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnallpayment,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnallpayment);      
          break;

        case "nro de celular":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btncellnumber,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btncellnumber);      
          break;

        case "QR":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnqr,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnqr);      
          break;

        case "yapelink":     
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnyapelink,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnyapelink);     
          break;

        case "yapePOS":      
        selector = LocatorProvider.getElement(        
          TypeLocator.ID,        
          LocatorSales.salesiOS.btnyapePOS,        
          TypeLocator.ANDROID,        
          LocatorSales.salesAndroid.btnyapePOS);      
          break;
        
        default:      
        throw new Error(`Filtro no reconocido: ${medio_cobro}`);
    }
    const filtroElement = await $(selector);  
    await filtroElement.waitForDisplayed({ timeout: 2000 });  
    await filtroElement.click();  
    console.log(`Filtro aplicado: ${medio_cobro}`);
  }

public get btnshowfilterssales() {
  
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.btnfiltrar,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.btnfiltrar);
            return $(selector);
}

public async showfilterssales() {
        await this.btnshowfilterssales.click();
    }


public get btnreport() {
  
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.btnreport,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.btnreport);
            return $(selector);
}

public async report() {
        await this.btnreport.click();
    }


public async inputTxtemail(correo: string){
        await browser.pause(1000);
        const inputEmailLocator = LocatorProvider.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorSales.salesiOS.txtemail,
            TypeLocator.ANDROID,
            LocatorSales.salesAndroid.txtemail
        );

        const inputemail = $(inputEmailLocator)
        await inputemail.waitForDisplayed({ timeout: 2000 });
        await inputemail.clearValue(); // Borra el valor anterior
        await inputemail.setValue(correo);
    }

public get btnsendreport() {
  
        const selector = LocatorProvider.getElement(TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.btnsendreport,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.btnsendreport);
            return $(selector);
}

    public get salesButton() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorSales.salesiOS.salesButton,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.salesButton
        );
        return $(locator);
    }

public async sendreport() {
        await this.btnsendreport.click();
    }


public async validateSendEmailScreen() {
        await browser.pause(2000);
        const sendEmailToText = LocatorProvider.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorSales.salesiOS.sendemailmessage,
            TypeLocator.ID,
            LocatorSales.salesAndroid.sendemailmessage
        );
        const titlesendEmail = await this.uiHelper.waitForElement(
            sendEmailToText,
            2000
        );
        await expect(titlesendEmail).toBeDisplayed();
        await expect(titlesendEmail).toHaveText(
            ConstantsPayment.TEXT_SENDEMAIL_BUSINESS
        );
    }

  public async selectFiltersOptions() {
    const sel15dias = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btn15days,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btn15days
    );
    const btn15 = await $(sel15dias);
    await btn15.waitForDisplayed({ timeout: 3000 });
    await btn15.click();

    const selExitosa = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btnsuccessful,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btnsuccessful
    );
    const btnExitosa = await $(selExitosa);
    await btnExitosa.waitForDisplayed({ timeout: 3000 });
    await btnExitosa.click();

    const selQR = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btnqr,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btnqr
    );
    const btnQR = await $(selQR);
    await btnQR.waitForDisplayed({ timeout: 3000 });
    await btnQR.click();
  }

  public async validateAppliedFilters() {
    const chip15Locator = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btn15days,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btn15days
    );
    const chipExitosaLocator = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btnsuccessful,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btnsuccessful
    );
    const chipQRLocator = LocatorProvider.getElement(
      TypeLocator.ID, LocatorSales.salesiOS.btnqr,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.btnqr
    );
    const chip15 = await this.uiHelper.waitForElement(chip15Locator, 5000);
    const chipExitosa = await this.uiHelper.waitForElement(chipExitosaLocator, 3000);
    const chipQR = await this.uiHelper.waitForElement(chipQRLocator, 3000);
    await expect(chip15).toBeDisplayed();
    await expect(chipExitosa).toBeDisplayed();
    await expect(chipQR).toBeDisplayed();
  }

  public async validateSendSalesReportScreen() {
    const titleEnviarReporteLocator = LocatorProvider.getElement(
      TypeLocator.CLASSCHAIN, LocatorSales.salesiOS.titlesendreport,
      TypeLocator.ANDROID, LocatorSales.salesAndroid.titlesendreport
    );
    const titleEnviarReporte = await this.uiHelper.waitForElement(titleEnviarReporteLocator, 5000);
    await expect(titleEnviarReporte).toBeDisplayed();
    await expect(titleEnviarReporte).toHaveText(ConstantsPayment.TEXT_TITLE_ENVIAR_REPORTE);

    await expect(this.btnsendreport).toBeDisplayed();
  }

  public async validateReportSentScreen() {
    const msgReporteEnviadoLocator = LocatorProvider.getElement(
      TypeLocator.ID,
      LocatorSales.salesiOS.msgreportsend,
      TypeLocator.ANDROID,
      LocatorSales.salesAndroid.msgreportsend
    );
    const msgReportSend = await this.uiHelper.waitForElement(msgReporteEnviadoLocator, 5000);
    await expect(msgReportSend).toBeDisplayed();
    const expectedText = browser.isAndroid
      ? ConstantsPayment.TEXT_SENDEMAIL_BUSINESS_ANDROID
      : ConstantsPayment.TEXT_SENDEMAIL_BUSINESS;
    await expect(msgReportSend).toHaveText(expectedText);
  }

  public async clickUnderstood() {
    const selector = LocatorProvider.getElement(
      TypeLocator.ID,
      LocatorSales.salesiOS.btnunderstood,
      TypeLocator.ANDROID,
      LocatorSales.salesAndroid.btnunderstood
    );
    const btnEntendido = await $(selector);
    await btnEntendido.waitForDisplayed({ timeout: 3000 });
    await btnEntendido.click();
  }

    public async userAccessSales(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.salesButton, true);
        await this.salesButton.click();
    }

    public get noSalesMessage() {
        const locator = LocatorProvider.getElement(
            TypeLocator.XPATH, LocatorSales.salesiOS.noSalesMessage,
            TypeLocator.ANDROID, LocatorSales.salesAndroid.noSalesMessage
        );
        return $(locator);
    }

    public async validateNoSalesMessage(): Promise<void> {
        await expect(this.noSalesMessage).toBeDisplayed();
        await expect(this.noSalesMessage).toHaveText('Aún no hay ninguna venta.');
    }
}

export default new salesScreen();