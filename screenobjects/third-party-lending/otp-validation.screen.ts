import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@support/utils/LocatorFactory.ts';
import LocatorOtpValidation from '@resources/locators/third-party-lending/otp-validation.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.ts';
import {
    PAUSES,
    TIMEOUTS,
    waitForMultipleElements,
} from '@support/utils/tplending-utils.ts';

class LendingOtpValidationScreen extends BaseScreen {

    public get btnLendingGetCredit() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.btnLendingGetCredit,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.btnLendingGetCredit);
    }

    public get txtYapeCodeTitle() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.txtYapeCodeTitle,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.txtYapeCodeTitle);
    }

    public get txtYapeCodeMessage() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.txtYapeCodeMessage,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.txtYapeCodeMessage);
    }

    public get txtYapeCodeValidation() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.txtYapeCodeValidation,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.txtYapeCodeValidation);
    }

    public get txtYapeTimeCode() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.txtYapeTimeCode,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.txtYapeTimeCode);
    }

    public get btnYapeNewCode() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.btnYapeNewCode,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.btnYapeNewCode);
    }

    public get btnTPLendingDisbursement()  {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.btnTPLendingDisbursement,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.btnTPLendingDisbursement);
    }

    public get btnTPLendingCloseSheet() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorOtpValidation.otpValidationIos.btnTPLendingCloseSheet,
                                        TypeLocator.XPATH, LocatorOtpValidation.otpValidationAndroid.btnTPLendingCloseSheet);
    }

    public async clickGetLoanCredit(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnLendingGetCredit, 'click');
    }

    public async clickResendOtp(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnYapeNewCode, 'click');
    }

    public async clickCloseSheet(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingCloseSheet, 'click');
    }

    private async sendPushNotification(): Promise<void> {
        try {
            await this.clickGetLoanCredit();
            
            await waitForMultipleElements([
                this.txtYapeCodeTitle,
                this.txtYapeCodeMessage,
                this.txtYapeCodeValidation,
                this.txtYapeTimeCode,
            ]);

            const resendButton = await $(this.btnYapeNewCode as unknown as string);
            await resendButton.waitForDisplayed({ timeout: TIMEOUTS.LONG });

            await this.clickResendOtp();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('Error in the push notification:', error);
            throw error;
        }
    }

    public async getOtpValidation(): Promise<void> {
        try {
            await this.sendPushNotification();
            
            await driver.pause(PAUSES.LONG);
            await this.clickCloseSheet();
        } catch (error) {
            console.error('Element was not found in the application', error);
            throw error;
        }
    }

}
export default new LendingOtpValidationScreen();
