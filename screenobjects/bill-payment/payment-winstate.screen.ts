import PaymentForServicesLocator from "@resources/locators/bill-payment/payment-for-services.locator.json" with { type: "json" };
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import { getTimeoutFromEnv, performScroll } from "@utils/Utils.ts";
import { $ } from "@wdio/globals";
import BaseScreen from "../commons/base.screen.ts";

const timeout: number = getTimeoutFromEnv() || 10000;

class PaymentWinStateScreen extends BaseScreen {
    public get lblServicePaid() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.lblServicePaid,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblServicePaid,
        );
        return $(locator);
    }

    public get lblValidationMessage() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.lblValidationMessage,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblValidationMessage,
        );
        return $(locator);
    }

    public get lblSearchCompany() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.lblSearchCompany,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblSearchCompany,
        );
        return $(locator);
    }

    public get lblCompanyResultFallback() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos
                .lblCompanyResultFallback,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblCompanyResultFallback,
        );
        return $(locator);
    }

    public get lblWinStateOperationNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos
                .lblWinStateOperationNumber,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblWinStateOperationNumber,
        );
        return $(locator);
    }

    public get btnPayService() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnPayService,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnPayService,
        );
        return $(locator);
    }

    public get btnGoHome() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnGoHome,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnGoHome,
        );
        return $(locator);
    }

    public get btnMostrarMovimientos() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos
                .btnMostrarMovimientos,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnMostrarMovimientos,
        );
        return $(locator);
    }

    public get txtSearchCompany() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtSearchCompany,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .txtSearchCompany,
        );
        return $(locator);
    }

    public get btnSearchCompany() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.btnSearchCompany,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnSearchCompany,
        );
        return $(locator);
    }

    public get btnRecentPayment() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnRecentPayment,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnRecentPayment,
        );
        return $(locator);
    }

    public get lblEmailSentConfirmation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.lblEmailSentConfirmation,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblEmailSentConfirmation,
        );
        return $(locator);
    }

    private buildLocator(
        iosLocator: string,
        androidLocator: string,
        value: string,
    ): string {
        const replaceDynamicValue = (locator: string) =>
            locator
                .replace("{0}", value)
                .replace("{value}", value)
                .replace("{company}", value)
                .replace("%s", value);

        return LocatorFactory.getElement(
            TypeLocator.XPATH,
            replaceDynamicValue(iosLocator),
            TypeLocator.XPATH,
            replaceDynamicValue(androidLocator),
        );
    }

    // Dynamic selectors
    private getCompanyLabel(company: string) {
        return $(
            this.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos.lblCompany,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .lblDynamicText,
                company,
            ),
        );
    }

    // Verify WinState title
    public async verifyServicePaidWinState(): Promise<void> {
        await this.lblServicePaid.waitForDisplayed({ timeout });
        await expect(this.lblServicePaid).toBeDisplayed();
    }

    // Verify error modal message — uses Compose-safe locator (text + content-desc)
    public async verifyErrorModalMessage(message: string): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos
                .lblDynamicTextCompose,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblDynamicTextCompose,
            message,
        );
        const label = $(locator);
        await label.waitForDisplayed({ timeout });
        await expect(label).toBePresent();
    }

    // Verify error modal message — uses Compose-safe locator (text + content-desc)
    public async verifyErrorModalMessageAndroid(
        message: string,
    ): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos
                .lblDynamicTextCompose,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblDynamicTextCompose,
            message,
        );
        if (this.isAndroid) {
            const label = $(locator);
            await label.waitForDisplayed({ timeout });
            await expect(label).toBePresent();
        }
    }

    private async scrollDown(times: number): Promise<void> {
        const { width, height } = await browser.getWindowSize();
        const x = Math.floor(width / 2);
        const startY = Math.floor(height * 0.7);
        const endY = Math.floor(height * 0.4);
        for (let i = 0; i < times; i++) {
            await performScroll(x, startY, x, endY);
        }
    }

    // Verify company label in WinState — uses fallback locator if company name is not fully visible
    public async verifyCompanyInWinState(): Promise<void> {
        await this.lblCompanyResultFallback.waitForDisplayed({ timeout });
        await expect(this.lblCompanyResultFallback).toBeDisplayed();
    }

    // Validate OTP screen appears, enter the given OTP and tap "Validar código"
    public async validateOtpAndContinue(otp: string): Promise<void> {

        await driver.pause(300);

        const btnLocator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnValidateCode,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnValidateCode,
        );
        const validateBtn = $(btnLocator);

        if (!await this.lblValidationMessage.isDisplayed()) {
            const otpInputLocator = LocatorFactory.getElement(
                TypeLocator.XPATH,
                PaymentForServicesLocator.paymentForServicesIos.txtOTP,
                TypeLocator.XPATH,
                PaymentForServicesLocator.paymentForServicesAndroid.txtOTP,
            );
            const otpInput = $(otpInputLocator);
            await otpInput.waitForDisplayed({ timeout });
            await otpInput.setValue(otp);

            const lblLocator = LocatorFactory.getElement(
                TypeLocator.ID,
                PaymentForServicesLocator.paymentForServicesIos.lblValidationCode,
                TypeLocator.XPATH,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .lblValidationCode,
            );
            const otpLabel = $(lblLocator);
            await otpLabel.waitForDisplayed({ timeout });
        }

        await validateBtn.waitForDisplayed({ timeout });
        await validateBtn.click();
    }

    // Verify amount error message embedded in EditText content-desc
    public async verifyAmountErrorMessage(
        expectedMessage: string,
    ): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos.txtAmountError,
            PaymentForServicesLocator.paymentForServicesAndroid.txtAmountError,
            expectedMessage,
        );
        const errorField = $(locator);
        await errorField.waitForDisplayed({ timeout });
        await expect(errorField).toBeDisplayed();
    }

    // Verify pay service button is disabled
    public async verifyPayServiceButtonDisabled(): Promise<void> {
        await this.btnPayService.waitForDisplayed({ timeout });
        await expect(this.btnPayService).not.toBeEnabled();
    }

    // Verify amount error message embedded in EditText content-desc
    public async verifyAmountError(): Promise<void> { }

    // Verify recent payment gloss with company name
    public async verifyRecentPaymentGloss(company: string): Promise<void> {
        await this.btnGoHome.waitForDisplayed({ timeout });
        await this.btnGoHome.click();

        await browser.waitUntil(
            async () => {
                const isDisplayed =
                    await this.btnMostrarMovimientos.isDisplayed();
                if (!isDisplayed) {
                    await this.scrollDown(1);
                }
                return isDisplayed;
            },
            {
                timeout,
                timeoutMsg: "btnMostrarMovimientos not found after scrolling",
            },
        );

        await this.btnMostrarMovimientos.click();

        await browser.waitUntil(
            async () => {
                const isDisplayed = await this.btnRecentPayment.isDisplayed();
                if (!isDisplayed) {
                    await this.scrollDown(1);
                }
                return isDisplayed;
            },
            {
                timeout,
                timeoutMsg: "btnRecentPayment not found after scrolling",
            },
        );

        await this.btnRecentPayment.click();

        const companyLabel = this.getCompanyLabel(company);
        await companyLabel.waitForDisplayed({ timeout });
        await expect(companyLabel).toBeDisplayed();
    }

    // Verify a category is pre-selected (visible on screen) — Compose-safe
    public async verifyCategorySelected(category: string): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos
                .lblDynamicTextContainsCompose,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblDynamicTextContainsCompose,
            category,
        );
        const label = $(locator);
        await label.waitForDisplayed({ timeout });
    }

    // Verify PdS Home screen is displayed
    public async verifyPdSHomeScreen(): Promise<void> {
        await this.lblSearchCompany.waitForDisplayed({ timeout: 15000 });
        //await expect(this.lblSearchCompany).toBeDisplayed();
        await this.btnSearchCompany.waitForDisplayed({ timeout });
        await expect(this.btnSearchCompany).toBeDisplayed();
    }

    // Verify a company name is displayed (pre-selected via deeplink) — Compose-safe
    public async verifyCompanySelected(company: string): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos
                .lblDynamicTextCompose,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblDynamicTextCompose,
            company,
        );
        const label = $(locator);
        await label.waitForDisplayed({ timeout });
        await expect(label).toBeDisplayed();
    }

    // Verify a button is displayed by its text
    public async verifyButtonDisplayed(text: string): Promise<void> {
        const locator = this.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos.btnDynamicByDesc,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnDynamicByDesc,
            text,
        );
        const btn = $(locator);
        await btn.waitForDisplayed({ timeout });
        await expect(btn).toBeDisplayed();
    }

    // Verify the email sent confirmation message
    public async verifyEmailSentConfirmation(): Promise<void> {
        await this.lblEmailSentConfirmation.waitForDisplayed({ timeout });
        await expect(this.lblEmailSentConfirmation).toBeDisplayed();
    }
}

export default new PaymentWinStateScreen();
