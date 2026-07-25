import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import LocatorOpenBankAccount from '../../resources/locators/tipo-de-cambio/open-bank-account.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.ts';
import redis from '../../support/utils/redis.helper.js';
import { validateElementWithRetries } from 'support/utils/Utils.ts';

// WIP: iOS selectors pending mapping
class OpenBankAccountScreen extends BaseScreen {

    public get btnCreateDollarAccount() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnCreateDollarAccount,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnCreateDollarAccount);
    }

    public get btnIDontHave() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnIDontHave,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnIDontHave);
    }

    public get inputOccupation() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.inputOccupation,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.inputOccupation);
    }

    public get selectEmploymentStatus() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.selectEmploymentStatus,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.selectEmploymentStatus);
    }

    public get inputWorkplace() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.inputWorkplace,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.inputWorkplace);
    }

    public get btnContinue() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnContinue,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnContinue);
    }

    public get btnContinueWorkingPlace() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnContinueWorkingPlace,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnContinueWorkingPlace);
    }

    public get btnContinueRegion() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnContinueRegion,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnContinueRegion);
    }

    public get selectRegion() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.selectRegion,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.selectRegion);
    }

    public get selectProvince() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.selectProvince,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.selectProvince);
    }

    public get checkboxes() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.checkboxes,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.checkboxes);
    }

    public get btnOpenAccount() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnOpenAccount,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnOpenAccount);
    }

    public get inputOtpCode() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.inputOtpCode,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.inputOtpCode);
    }

    public get btnRegisterDollarAccountOtp() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.btnRegisterDollarAccountOtp,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.btnRegisterDollarAccountOtp);
    }

    public get titleDollarAccountCreated() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.titleDollarAccountCreated,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.titleDollarAccountCreated);
    }

    public async getRadioButtonOption(option: string) {
        const selectOptionAndroid = `//android.widget.RadioButton[@content-desc='${option}']`;
        const selectOptionIos = `${option}`;

        return LocatorFactory.getElement(
            TypeLocator.ID,
            selectOptionIos,
            TypeLocator.XPATH,
            selectOptionAndroid
        );
    }

    public async createDollarAccount() {
        await this.uiHelper.interactWithElement(this.btnCreateDollarAccount, 'click');
    }

    public async iDontHave() {
        await this.uiHelper.interactWithElement(this.btnIDontHave, 'click');
    }

    public async fillOccupation(occupation: string) {
        await this.uiHelper.interactWithElement(this.inputOccupation, 'setValue', occupation);
    }

    public async clickEmploymentStatus() {
        await this.uiHelper.interactWithElement(this.selectEmploymentStatus, 'click');
    }

    public async clickEmploymentStatusOption(option: string) {
        const element = await this.getRadioButtonOption(option);
        await this.uiHelper.interactWithElement(element, 'click');
    }

    public async fillWorkplace(workplace: string) {
        await this.uiHelper.interactWithElement(this.inputWorkplace, 'setValue', workplace);
    }

    public async continue() {
        await this.uiHelper.interactWithElement(this.btnContinue, 'click');
    }

    public async continueWorkingPlace() {
        await this.uiHelper.interactWithElement(this.btnContinueWorkingPlace, 'click');
    }

    public async continueRegion() {
        await this.uiHelper.interactWithElement(this.btnContinueRegion, 'click');
    }

    public async clickRegionSelect() {
        await this.uiHelper.interactWithElement(this.selectRegion, 'click');
    }

    public async clickRegionOption(option: string) {
        const element = await this.getRadioButtonOption(option);
        await this.uiHelper.interactWithElement(element, 'click');
    }

    public async clickProvinceSelect() {
        await this.uiHelper.interactWithElement(this.selectProvince, 'click');
    }

    public async clickProvinceOption(option: string) {
        const element = await this.getRadioButtonOption(option);
        await this.uiHelper.interactWithElement(element, 'click');
    }

    public async clickCheckboxes() {
        const checkboxElements = await $$(this.checkboxes);
        try {
            for (const checkbox of checkboxElements) {
                if (await checkbox.isExisting()) {
                    await checkbox.click();
                }
            }
        } catch (error) {
            console.error('Error clicking on the checkboxes:', error);
        }
    }

    public async continueChangeDollars() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnContinue);
    }

    public async openDollarAccount() {
        await this.uiHelper.interactWithElement(this.btnOpenAccount, 'click');
    }

    public async tapDismissArea(x: number, y: number){
        await this.gestureHelper.touch(x, y);
    }

    public async registerDollarAccountOtp() {
        await this.uiHelper.waitForElementToBeEnabled(this.btnRegisterDollarAccountOtp);
        await this.uiHelper.interactWithElement(this.btnRegisterDollarAccountOtp, 'click');
    }

    public async fillOtpToOpenAccount() {
        const phone = await redis.readDataRedis('USER_DATA_MAP', 'currentPhone', 1);
        const otp = await redis.readDataRedis('yapeappotp_OPENUSDACCOUNT', phone, 1);
        await this.uiHelper.interactWithElement(this.inputOtpCode, 'setValue', otp);
    }

    public async showDollarAccountCreated(maxRetries: number = 3, retryDelay: number = 2000) {
        const selector = LocatorFactory.getElement(TypeLocator.ID, LocatorOpenBankAccount.openBankAccountIOS.titleDollarAccountCreated,
            TypeLocator.XPATH, LocatorOpenBankAccount.openBankAccountAndroid.titleDollarAccountCreated);

        const isReady = await validateElementWithRetries(() => $(selector), maxRetries, retryDelay);

        if (isReady) {
            console.log("The \'New account Yape dollars\' title is visible and enabled.'");
        } else {
            throw new Error("The \'New account Yape dollars\' title was not found after several attempts.");
        }
    }
}
export default new OpenBankAccountScreen();
