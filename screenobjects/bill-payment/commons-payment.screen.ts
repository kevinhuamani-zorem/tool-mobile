import PaymentForServicesLocator from "@resources/locators/bill-payment/payment-for-services.locator.json" with { type: "json" };
import BaseScreen from "@screenobjects/commons/base.screen.ts";
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import { getTimeoutFromEnv, performScroll } from "@utils/Utils.ts";

const timeout: number = getTimeoutFromEnv() || 10000;

class CommonsPaymentScreen extends BaseScreen {
    public get btnHowMuchToPay() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnHowMuchToPay,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnHowMuchToPay,
        );
        return $(locator);
    }

    public get lblInsertMount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.lblInsertMount,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblInsertMount,
        );
        return $(locator);
    }

    public get lblChooseService() {
        return $(PaymentForServicesLocator.paymentForServicesAndroid.lblChooseService);
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

    public get btnMostrarMovimientos() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnMostrarMovimientos,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnMostrarMovimientos,
        );
        return $(locator);
    }

    public get btnSeeAll() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnSeeAll,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnSeeAll,
        );
        return $(locator);
    }

    public get btnSendByEmail() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnSendByEmail,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnSendByEmail,
        );
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnContinue,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnContinue,
        );
        return $(locator);
    }

    public get btnSendEmail() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnSendEmail,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnSendEmail,
        );
        return $(locator);
    }

    public get btnRecentPayment() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnRecentPayment,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnRecentPayment,
        );
        return $(locator);
    }

    private getCompanyServiceSelector(service: string) {
        return $(
            this.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnCompanyServiceType,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnCompanyServiceType,
                service,
            ),
        );
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

    /**
     * Enters a numeric code via the iOS native keyboard.
     *
     * The amount field opens an alphabetic keyboard by default on iOS.
     * Taps the "more" button (~more) to switch to the numeric keyboard
     * before typing each digit individually.
     *
     * @param code - Numeric code string to enter digit by digit
     */
    public async enterCodeViaKeyboard(code: string): Promise<void> {
        await driver.pause(1000);
        const btnMore = $("~more");
        await btnMore.waitForDisplayed({ timeout });
        await btnMore.click();
        await driver.pause(500);
        const digits = code.split("");
        for (const digit of digits) {
            await browser.keys([digit]);
            await driver.pause(150);
        }
        await driver.pause(500);
    }

    public buildLocator(
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

    private getAmountOptionSelector(option: string) {
        return $(
            this.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnModalityOption,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnModalityOption,
                option,
            ),
        );
    }

    public get btnReceipt() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnReceipt,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnReceipt,
        );
        return $(locator);
    }

    private getAmountOptionTotal(option: string) {
        return $(
            this.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnModalityTotal,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnModalityOption,
                option,
            ),
        );
    }

    public async selectModality(modality: string): Promise<void> {
        await this.btnHowMuchToPay.waitForDisplayed({ timeout });
        await this.btnHowMuchToPay.click();
        if (modality == "Monto total") {
            const modalityBtnOtroMonto = this.getAmountOptionTotal(modality);
            await modalityBtnOtroMonto.waitForDisplayed({ timeout });
            await modalityBtnOtroMonto.click();
        } else {
            const modalityBtn = this.getAmountOptionSelector(modality);
            await modalityBtn.waitForDisplayed({ timeout });
            await modalityBtn.click();
        }
    }

    public async selectService(serviceName?: string): Promise<void> {
        if (serviceName) {
            if (await this.lblChooseService.isDisplayed()) {
                const serviceBtn = this.getCompanyServiceSelector(serviceName || "");
                await serviceBtn.waitForDisplayed({ timeout });
                await serviceBtn.click();
            }
        }
    }

    public async clearSearch(charCount: number): Promise<void> {
        for (let i = 0; i < charCount; i++) {
            await browser.keys(["Backspace"]);
            await driver.pause(100);
        }
        await driver.pause(500);
    }

    // Simple flow for dollar payments: enter code, type amount via keyboard, and continue (no receipt/modality)
    public async enterCodeAmountAndPay(amount: string): Promise<void> {
        await driver.pause(500);
        if (await this.lblInsertMount.isDisplayed()) {
            await this.lblInsertMount.waitForDisplayed({ timeout });
            const digits = amount.split("");
            for (const digit of digits) {
                await browser.keys([digit]);
                await driver.pause(150);
            }
        } else {
            await browser.pause(2000);
            await this.btnReceipt.waitForDisplayed({ timeout });
            await this.btnReceipt.click();
        }

        await driver.pause(500);
        await this.btnPayService.waitForDisplayed({ timeout });
        await this.btnPayService.click();
    }

    // Simple flow for dollar payments: enter code, type amount via keyboard, and continue (no receipt/modality)
    public async enterCodeAmountAndPayDollar(amount: string): Promise<void> {
        await driver.pause(500);
        if (await this.lblInsertMount.isDisplayed()) {
            await this.lblInsertMount.waitForDisplayed({ timeout });
            const digits = amount.split("");
            for (const digit of digits) {
                await browser.keys([digit]);
                await driver.pause(150);
            }
        } else {
            await browser.pause(2000);
            await this.btnReceipt.waitForDisplayed({ timeout });
            await this.btnReceipt.click();
        }

        await driver.pause(500);
        await this.btnContinue.waitForDisplayed({ timeout });
        await this.btnContinue.click();
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

    public async toLeaveAnAftertaste(): Promise<void> {
        await this.btnGoHome.waitForDisplayed({ timeout });
        await this.btnGoHome.click();

        await browser.waitUntil(
            async () => {
                const isDisplayed = await this.btnMostrarMovimientos.isDisplayed();
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

        await driver.pause(500);

        await this.scrollDown(2);
        await this.btnSeeAll.waitForDisplayed({ timeout });
        await this.btnSeeAll.click();
        await this.btnRecentPayment.waitForDisplayed({ timeout });

        await this.btnSendByEmail.waitForDisplayed({ timeout });
        await this.btnSendByEmail.click();

        await this.btnSendEmail.waitForDisplayed({ timeout });
        await this.btnSendEmail.click();

    }
}


export default new CommonsPaymentScreen();