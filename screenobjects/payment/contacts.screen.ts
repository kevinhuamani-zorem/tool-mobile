import LocatorFactory from "../../support/utils/LocatorFactory.js";
import BaseScreen from "../commons/base.screen.js";
import { $, expect, browser } from '@wdio/globals';
import LocatorContac from "../../resources/locators/payment/yapear-contact.locator.json" with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.js";
import { ConstantsPayment } from "../../support/utils/payment.js";

class ConctactScreen extends BaseScreen {


    public async validateSelectContactScreen() {
        await browser.pause(4000);
        const yapearToText = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorContac.yapearIos.titleYapear,
            TypeLocator.ANDROID,
            LocatorContac.yapearAndroid.titleYapear
        );
        const titleContactSelect = await this.uiHelper.waitForElement(
            yapearToText,
            4000
        );
        await expect(titleContactSelect).toBeDisplayed();
        await expect(titleContactSelect).toHaveText(
            ConstantsPayment.TEXT_YAPEAR
        );
    }

    
    public async  inputNumberToYapear(cellphone: string) {
        const inputCellphone = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorContac.yapearIos.inputNumberToYapear,
            TypeLocator.ANDROID,
            LocatorContac.yapearAndroid.inputNumberToYapear)

        const buttonselectNumber=LocatorFactory.getElement(   
            TypeLocator.CLASSCHAIN,
            LocatorContac.yapearIos.btnselectNumber.replace("{cellphone}", cellphone),
            TypeLocator.ANDROID,
            LocatorContac.yapearAndroid.btnselectNumber
        );

        const inputAmount = $(inputCellphone);
        await inputAmount.setValue(cellphone);
        const btnselectNumber = $(buttonselectNumber);
        await btnselectNumber.click();
        await browser.pause(2000);
    }

    public get btnDismissContacts() {
        const selector = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, LocatorContac.yapearIos.btnCloseContact,
            TypeLocator.ANDROID, LocatorContac.yapearAndroid.btnCloseContact);
        return $(selector);
    }

    public async dismissContactsIfVisible() {
        const isDisplayed = await this.btnDismissContacts.waitForDisplayed({ timeout: 5000 }).catch(() => false);
        if (isDisplayed) {
            await this.btnDismissContacts.click();
        }
    }

    public async  inputNewNumberToYapear(cellphone: string) {
        const inputCellphone = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorContac.yapearIos.inputNumberToYapear,
            TypeLocator.ANDROID,
            LocatorContac.yapearAndroid.inputNumberToYapear);

        const inputAmount = $(inputCellphone);
        await inputAmount.waitForDisplayed();
        await inputAmount.setValue(cellphone);
        await browser.pause(1500);

        const spacedCellphone = cellphone.split('').join(' ');
        const btnSelectNumber = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorContac.yapearIos.btnselectNewNumber.replace("{cellphone}", cellphone),
            TypeLocator.ANDROID,
            LocatorContac.yapearAndroid.btnselectNewNumber.replace("{cellphone}", spacedCellphone)
        );
        const contactItem = $(btnSelectNumber);
        await contactItem.waitForDisplayed({ timeout: 8000 });
        await contactItem.click();
    }
 
}

export default new ConctactScreen();