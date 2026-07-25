import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import LocatorYapeoDollars from '../../resources/locators/tipo-de-cambio/yapeo-dollars.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.ts';
import { ConstantsExchangeRate } from '../../support/utils/constants-tipo-de-cambio.ts';

// WIP: selectores iOS pendientes de mapeo
class YapeoDollarsScreen extends BaseScreen {

    public get btnYapearDollars() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnYapearDollars,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnYapearDollars);
    }

    public get txtMessage() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtMessage,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtMessage);
    }

    public get btnConfirmDollarTransfer() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnConfirmDollarTransfer,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnConfirmDollarTransfer);
    }

    public get txtWeAreWorking() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.txtWeAreWorking,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtWeAreWorking);
    }

    public get btnUnderstood() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.btnUnderstood,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnUnderstood);
    }
    public get btnClose() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnClose,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnClose);
    }

    public get btnContacts() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.btnContacts,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnContacts);
    }

    public get txtDuplicate() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtDuplicate,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtDuplicate);
    }

    public get txtGoToDollars() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.txtGoToDollars,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtGoToDollars);
    }

    public get txtTransactionAmountUSD() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtTransactionAmountUSD,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtTransactionAmountUSD);
    }

    public get txtMovementTransactionAmountUSD() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtMovementTransactionAmountUSD,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtMovementTransactionAmountUSD);
    }

    public get btnYapeoHighConfirmation() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnYapeoHighConfirmation,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnYapeoHighConfirmation);
    }

    public get btnContinueChangeDollars() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.btnContinueChangeDollars,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnContinueChangeDollars);
    }

    public get lblTitleListContactsScreen() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.lblTitleListContacts,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.lblTitleListContacts);
    }

    public get txtSearchContact() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtSearchContact,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtSearchContact);
    }

    public get lblFoundContact() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsIOS.lblFoundContact,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.lblFoundContact);
    }

    public get txtAmountDollar() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtAmountDollar,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtAmountDollar);
    }

    public get txtValidationCodeError() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtValidationCodeError,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtValidationCodeError);
    }

    public get txtRetryMessage() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtRetryMessage,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtRetryMessage);
    }

    public get txtInputOtp() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtInputOtp,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtInputOtp);
    }

    public get btnRetry() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnRetry,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnRetry);
    }

    public get txtErrorContactNotInYapeDollars() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtErrorContactNotInYapeDollars,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtErrorContactNotInYapeDollars);
    }
    
    public get txtInviteToCreateDollarsAccount() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.txtInviteToCreateDollarsAccount,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.txtInviteToCreateDollarsAccount);
    }

    public get btnGoToHome() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorYapeoDollars.yapeoDollarsIOS.btnGoToHome,
            TypeLocator.XPATH, LocatorYapeoDollars.yapeoDollarsAndroid.btnGoToHome);
    }
    
    public async enterYapearDollars() {
        await this.uiHelper.interactWithElement(this.btnYapearDollars, 'click');
    }

    public async touchYapeoDollar(x: number, y: number) {
        await this.gestureHelper.touch(x, y);
    }

    public async enterMessage(message: string) {
        await this.uiHelper.interactWithElement(this.txtMessage, 'setValue', message);
    }

    public async confirmDollarTransfer() {
        await this.uiHelper.interactWithElement(this.btnConfirmDollarTransfer, 'click');
    }

    public async showErrorMessageForWinstate() {
        await this.uiHelper.checkErrorMessageAndClickIfMatched(this.txtWeAreWorking, ConstantsExchangeRate.ERROR_TEXT, this.btnUnderstood);
    }

    public async close() {
        await this.uiHelper.interactWithElement(this.btnClose, 'click');
    }

    public async allowContactsPermission() {
        if (driver.isAndroid) {
            await this.uiHelper.waitForDisplayedAndClick(this.btnContacts);
        } else {
            await this.acceptAlertIfPresent();
        }
    }

    public async acceptAlertIfPresent(): Promise<void> {
        if (driver.isIOS) {
            try {
                await driver.acceptAlert();
                console.log('iOS alert accepted');
            } catch (e) {
                // No alert present, continue without error
                console.log('No iOS alert present');
            }
        }
    }

    public async duplicateValue() {
        await this.uiHelper.waitForDisplayedAndClick(this.txtDuplicate);
    }

    public async goToDollars() {
        await this.uiHelper.interactWithElement(this.txtGoToDollars, 'click');
    }

    public async transactionAmountUSD(): Promise<string> {
        const winstateDollars = await this.uiHelper.getElementText(this.txtTransactionAmountUSD);
        return winstateDollars;
    }

    public async movementAmountUSD(): Promise<string> {
        const movementDollars = await this.uiHelper.getElementText(this.txtMovementTransactionAmountUSD);
        return movementDollars;
    }

    public async confirmYapeoHigh() {
        await this.uiHelper.interactWithElement(this.btnYapeoHighConfirmation, 'click');
    }

    public async continue() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnContinueChangeDollars);
    }

    public async handleContactScreenIfNotDisplayed() {
        if (driver.isIOS) {
            if (!await this.uiHelper.waitForElementExist(this.lblTitleListContactsScreen, false, 1000)) {
                await this.touchYapeoDollar(190, 775);
            }
        }
    }

    public async searchAndSelectContact(phone: string) {
        await this.uiHelper.interactWithElement(this.txtSearchContact, 'setValue', phone);
        await this.uiHelper.interactWithElement(this.lblFoundContact, 'click');
    }

    public async enterAmountDollar(amount: string) {
        await this.uiHelper.interactWithElement(this.txtAmountDollar, 'setValue', amount);
    }

    public async isDuplicateModalPresent(): Promise<boolean> {
        try {
            return await this.uiHelper.waitForElementExist(this.txtDuplicate, false, 2000);
        } catch (error) {
            console.log('Duplicate transaction modal not found');
            return false;
        }
    }

    public async handleDuplicateModalIfPresent(): Promise<void> {
        if (await this.isDuplicateModalPresent()) {
            await this.duplicateValue();
        }
    }

    public async validationCodeError(): Promise<void> {
        await this.uiHelper.waitForElement(this.txtValidationCodeError);
        const message = await $(this.txtValidationCodeError).getText();
        await expect(message).toEqual(ConstantsExchangeRate.VALIDATION_CODE_ERROR);
    }
 
    public async retryMessage(): Promise<void> {
        await this.uiHelper.waitForElement(this.txtRetryMessage);
        const textError = await $(this.txtRetryMessage).getText();
        await expect(textError).toEqual(ConstantsExchangeRate.RETRY_MESSAGE);
    }

    public async enterSequentialOtp(): Promise<void> {
        await this.uiHelper.fillSequentialOtp(this.txtInputOtp);
    }
    
    public async tryAgain() {
        await this.uiHelper.interactWithElement(this.btnRetry, 'click');
    }

    public async getErrorContactNotInYapeDollars(): Promise<void> {
        await this.uiHelper.waitForElement(this.txtErrorContactNotInYapeDollars);
        const message = await $(this.txtErrorContactNotInYapeDollars).getText();
        await expect(message).toEqual(ConstantsExchangeRate.ERROR_CONTACT_NOT_IN_YAPE_DOLLARS);
    }

    public async getInviteToCreateDollarsAccount(): Promise<void> {
        await this.uiHelper.waitForElement(this.txtInviteToCreateDollarsAccount);
        const message = await $(this.txtInviteToCreateDollarsAccount).getText();
        await expect(message).toEqual(ConstantsExchangeRate.INVITE_TO_CREATE_DOLLARS_ACCOUNT);
    }

    public async homeScreen(): Promise<void> {
        await this.uiHelper.waitForElement(this.btnGoToHome);
        await this.uiHelper.interactWithElement(this.btnGoToHome, 'click');
    }
}

export default new YapeoDollarsScreen();
