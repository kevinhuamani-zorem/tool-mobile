import { $ } from '@wdio/globals';
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@utils/LocatorFactory.ts';
import { TypeLocator } from '@utils/Enums.ts';
import { getTimeoutFromEnv } from '@utils/Utils.ts';
import TappOnboardingLocator from '@locators/interoperabilidad/tapp-onboarding.locator.json' with { type: 'json' };

const timeout: number = getTimeoutFromEnv();

class TappOnboardingScreen extends BaseScreen {

    public get txtTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtTitle,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtTitle
        );
        return $(locator);
    }

    public get tagBcrBadge() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.tagBcrBadge,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.tagBcrBadge
        );
        return $(locator);
    }

    public get cardFeatures() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.cardFeatures,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.cardFeatures
        );
        return $(locator);
    }

    public get txtTermsAndConditions() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtTermsAndConditions,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtTermsAndConditions
        );
        return $(locator);
    }

    public get btnStart() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnStart,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnStart
        );
        return $(locator);
    }

    public get txtVerificationMessage() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtVerificationMessage,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtVerificationMessage
        );
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnContinue,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnContinue
        );
        return $(locator);
    }

    public get txtSimTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtSimTitle,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtSimTitle
        );
        return $(locator);
    }

    public get txtSmsSending() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtSmsSending,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtSmsSending
        );
        return $(locator);  
    }

    public get txtSmsCharges() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtSmsCharges,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtSmsCharges
        );
        return $(locator);  
    }

    public get btnSendSms() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnSendSms,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnSendSms
        );
        return $(locator);  
    }

    public get txtVerificationInProgress() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtVerificationInProgress,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtVerificationInProgress
        );
        return $(locator);  
    }

    public get btnSmsSending() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnSmsSending,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnSmsSending
        );
        return $(locator);  
    }

    public get txtTappConfirmation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtTappConfirmation,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtTappConfirmation
        );
        return $(locator);  
    }

    public get txtTappIdInfo() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtTappIdInfo,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtTappIdInfo
        );
        return $(locator);  
    }

    public get btnAddAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnAddAccount,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnAddAccount
        );
        return $(locator);  
    }

    public get txtBankSelectionTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtBankSelectionTitle,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtBankSelectionTitle
        );
        return $(locator);
    }

    public get searchBankField() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.searchBankField,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.searchBankField
        );
        return $(locator);
    }

    public get txtMostPopular() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtMostPopular,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtMostPopular
        );
        return $(locator);
    }

    public get txtAllBanks() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtAllBanks,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtAllBanks
        );
        return $(locator);
    }

    public get txtBcrProtection() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtBcrProtection,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtBcrProtection
        );
        return $(locator);
    }

    public get btnSelectedBank() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnSelectedBank,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnSelectedBank
        );
        return $(locator);
    }

    public get txtAccountSelectionTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtAccountSelectionTitle,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtAccountSelectionTitle
        );
        return $(locator);
    }

    public get txtAccountSelectionMessage() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtAccountSelectionMessage,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtAccountSelectionMessage
        );
        return $(locator);
    }

    public get btnAccountSelectionContinue() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnAccountSelectionContinue,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnAccountSelectionContinue
        );
        return $(locator);
    }

    public get btnChooseAnotherBank() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnChooseAnotherBank,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnChooseAnotherBank
        );
        return $(locator);
    }

    public get txtPrimarySavingsAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtPrimarySavingsAccount,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtPrimarySavingsAccount
        );
        return $(locator);
    }

    public get txtCardDataIntro() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtCardDataIntro,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtCardDataIntro
        );
        return $(locator);
    }

    public get txtLast6Digits() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtLast6Digits,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtLast6Digits
        );
        return $(locator);
    }

    public get txtExpirationDate() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtExpirationDate,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtExpirationDate
        );
        return $(locator);
    }

    public get txtCardPin4Digits() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.txtCardPin4Digits,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.txtCardPin4Digits
        );
        return $(locator);
    }

    public get btnEnterCardData() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnEnterCardData,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnEnterCardData
        );
        return $(locator);
    }

    public get btnBack() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingIos.btnBack,
            TypeLocator.XPATH, TappOnboardingLocator.tappOnboardingAndroid.btnBack
        );
        return $(locator);
    }

    public async clickStart() {
        await this.btnStart.click();
    }

    public async clickContinue() {
        await this.btnContinue.click();
    }

    public async validateIntroScreenIsDisplayed(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtTitle, timeout, 'The onboarding title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.tagBcrBadge, timeout, 'The BCR badge was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.cardFeatures, timeout, 'The features card was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtTermsAndConditions, timeout, 'The terms and conditions text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnStart, timeout, 'The start button was not displayed');
    }

    public async validateVerificationModalIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtVerificationMessage, timeout, 'The verification message was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnContinue, timeout, 'The continue button was not displayed');
    }

    public async validateSimSelectionScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtSimTitle, timeout, 'The SIM selection title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnContinue, timeout, 'The continue button was not displayed');
    }

    public async clickContinueOnSimSelection() {
        await this.btnContinue.click();
    }

    public async validateSmsSendingScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtSmsSending, timeout, 'The SMS sending text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtSmsCharges, timeout, 'The SMS charges text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnSendSms, timeout, 'The send SMS button was not displayed');
    }

    public async clickSendSms() {
        await this.btnSendSms.click();
    }

    public async validateDataVerificationScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtVerificationInProgress, timeout, 'The verification in progress text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnSmsSending, timeout, 'The SMS sending text was not displayed');
    }

    public async validateTappIdCreationConfirmation() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtTappConfirmation, timeout, 'The Tapp confirmation text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtTappIdInfo, timeout, 'The Tapp ID info text was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnAddAccount, timeout, 'The add account button was not displayed');
    }

    public async clickAddAccount() {
        await this.btnAddAccount.click();
    }

    public async validateBankSelectionScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtBankSelectionTitle, timeout, 'The bank selection title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.searchBankField, timeout, 'The bank search field was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtMostPopular, timeout, 'The most popular section title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtAllBanks, timeout, 'The all banks section title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtBcrProtection, timeout, 'The BCR protection footer text was not displayed');
    }

    public async clickSelectBank() {
        await this.btnSelectedBank.click();
    }

    public async validateAccountSelectionScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtAccountSelectionTitle, timeout, 'The account selection title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtAccountSelectionMessage, timeout, 'The account selection message was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnAccountSelectionContinue, timeout, 'The account selection continue button was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnChooseAnotherBank, timeout, 'The choose another bank button was not displayed');
    }

    public async selectAccount() {
        await this.txtPrimarySavingsAccount.click();
        await this.btnAccountSelectionContinue.click();
    }

    public async validateCardDataScreenIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtCardDataIntro, timeout, `[TAPP Card Data Screen] The card data intro text was not displayed within ${timeout}ms`);
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtLast6Digits, timeout, `[TAPP Card Data Screen] The last 6 digits text was not displayed within ${timeout}ms`);
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtExpirationDate, timeout, `[TAPP Card Data Screen] The expiration date text was not displayed within ${timeout}ms`);
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtCardPin4Digits, timeout, `[TAPP Card Data Screen] The 4-digit card pin text was not displayed within ${timeout}ms`);
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnEnterCardData, timeout, `[TAPP Card Data Screen] The enter card data button was not displayed within ${timeout}ms`);
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnBack, timeout, `[TAPP Card Data Screen] The back button was not displayed within ${timeout}ms`);
    }

    public async clickEnterCardData(): Promise<void> {
        await this.btnEnterCardData.click();
    }
}

export default new TappOnboardingScreen();
