import LocatorFactory from 'support/utils/LocatorFactory.ts';
import BaseScreen from '../commons/base.screen.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import marketplacePurchaseSummary from '../../resources/locators/marketplace/marketplace-purchase-summary.locator.json' with {type: 'json'};
import { ConstantsMarketplace } from 'support/utils/constants-marketplace.ts';
import { clickConfirmPayment, clickPayButton } from 'support/utils/Utils.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

class PaymentDetailScreen extends BaseScreen{

    public get titlePurchaseSummary(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.titlePaymentSummary,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.titlePaymentSummary
        );
        return $(locator);
    }

    public get titlePedidoSummary(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.titlePedido,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.titlePedido
        );
        return $(locator);
    }

    public get selectPaymentYape(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.rdoYape,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.rdoYape
        );
        return $(locator);
    }

    public get selectPaymentTarjeta(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.rdoCreditCard,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.rdoCreditCard
        );
        return $(locator);
    }

    public get btnPay(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.btnPay,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.btnPay
        );
        return $(locator);
    }

    public get btnConfirmPayment(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.btnConfirmPay,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.btnConfirmPay
        );
        return $(locator);
    }

    public get termsAndConditions(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.termsAndConditions,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.termsAndConditions
        );
        return $(locator);
    }

    public get closeTermsAndConditions(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.closeTermsAndConditions,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.closeTermsAndConditions
        );
        return $(locator);
    }

    public get scrollableElement(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, marketplacePurchaseSummary.menuIos.scrollableElement,
            TypeLocator.ANDROID, marketplacePurchaseSummary.menuAndroid.scrollableElement
        );
        return $(locator);
    }

    public async validatePurchaseSummaryTitle(){
        await this.titlePurchaseSummary.waitForDisplayed({ timeout });

        const actualText = await this.titlePurchaseSummary.getText();
        const expectedText = ConstantsMarketplace.TITLE_PURCHASE_SUMMARY;
        await expect(actualText).toBe(expectedText);
    }

    public async validateOrderTitle(){
        await this.titlePedidoSummary.waitForDisplayed({ timeout });
        const actualText = await this.titlePedidoSummary.getText();
        const expectedText = ConstantsMarketplace.TITLE_PEDIDO_SUMMARY;
        await expect(actualText).toBe(expectedText);
    }

    public async validatePaymentTypes(){
        await this.selectPaymentTarjeta.waitForDisplayed({ timeout });
        await this.selectPaymentYape.waitForDisplayed({ timeout });
    }

    public async selectPayment(paymentType: string) {

        if (paymentType === 'Yape') {
            await this.selectPaymentYape.waitForDisplayed({ timeout });
            const isSelected = await this.selectPaymentYape.isSelected();
            if (!isSelected) {
                await this.selectPaymentYape.click();
            }
        } else if (paymentType === 'Tarjeta') {
            await this.selectPaymentTarjeta.waitForDisplayed({ timeout });
            const isSelected = await this.selectPaymentTarjeta.isSelected();
            if (!isSelected) {
                await this.selectPaymentTarjeta.click();
            }
        }
    }

    public async goToPay(){
        if (driver.isIOS){
            if (await this.btnPay.isDisplayed() || await this.btnPay.isExisting()) {
                await this.btnPay.click();
            } else {
                await driver.execute('mobile: tap', { x:210, y:810 });
            }
            await this.btnConfirmPayment.waitForDisplayed({ timeout });
            if (await this.btnConfirmPayment.isDisplayed()) {
                await this.btnConfirmPayment.click();
            }
        } else {
            await clickPayButton();
            await clickConfirmPayment();
        }
    }

    public async scrolltopaymentbutton(){
        try {
            await this.btnPay.scrollIntoView(
                {
                    scrollableElement: (this.scrollableElement)
                });
        } catch (error) {
            const name = (error as Error).name;
            if (name == 'stale element reference'){
                console.log ('Stale reference since locator is no longer identifiable caught exepction and proceeded with purchase');
            } else {
                throw (error);
            }

        }
    }

    public async clickOnPayButtonIfNotFound(){
        try {
            await this.btnPay.waitForExist({ timeout:1000 });
            await this.btnPay.click();
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes('still not existing after') ) {
                // click en la mitad de la pantalla en ancho.
                const width = ((await browser.getWindowSize()).width/2);
                // padding de 120 pixeles, 156 pixeles es el tamaño del boton.
                const height = ((await browser.getWindowSize()).height*0.93);
                browser.tap({ x: width, y: height });
                console.log ('PayButton Locator was not found, used tap to continue purchase');
            } else {
                throw (error);
            }
        }

    }

    public async selectConfirmYourPurchase(){
        try {
            await this.btnConfirmPayment.waitForExist({ timeout:1000 });
            await this.btnConfirmPayment.click();
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes('still not existing after') ) {
                // click en la mitad de la pantalla en ancho.
                const width = ((await browser.getWindowSize()).width/2);
                const height = ((await browser.getWindowSize()).height*0.56);
                browser.tap({ x: width, y: height });
                console.log ('Purchase Confirmation button was not found, used tap to continue purchase');
            } else {
                throw (error);
            }
        }
    }

    
    public async acceptTermsAndConditions() {
        
      try {
        await this.termsAndConditions.waitForDisplayed({ timeout: timeout });
        await this.termsAndConditions.click();
        console.log('✅ Terms successfully marked');
    } catch (error) {
        console.log('ℹ️ Switch not found - already marked or not present');
    }

}

}

export default new PaymentDetailScreen();