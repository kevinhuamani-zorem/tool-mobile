import PaymentForServicesLocator from "@resources/locators/bill-payment/payment-for-services.locator.json" with { type: "json" };
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import { getTimeoutFromEnv } from "@utils/Utils.ts";
import CommonsPaymentScreen from "@screenobjects/bill-payment/commons-payment.screen.ts";
import BaseScreen from "@screenobjects/commons/base.screen.ts";

const timeout: number = getTimeoutFromEnv() || 10000;
const DEFAULT_SERVICE_TYPE = "Cuenta Financiera";

class PaymentPersonalityScreen extends BaseScreen {
    public get txtCompanyCode() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtCompanyCode,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.txtCompanyCode,
        );
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.btnContinue,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnContinue,
        );
        return $(locator);
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

    public get btnPayService() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnPayService,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnPayService,
        );
        return $(locator);
    }

    public get btnHowMuchToPay() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnHowMuchToPay,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnHowMuchToPay,
        );
        return $(locator);
    }

    public get lblSearchCode() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.lblSearchCode,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblSearchCode,
        );
        return $(locator);
    }

    public get txtAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtAmount,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.txtAmount,
        );
        return $(locator);
    }

    private getOtherAmountSelector() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtOtherAmount,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.txtOtherAmount,
        );
        return $(locator);
    }

    private getAmountOptionSelector(option: string) {
        return $(
            CommonsPaymentScreen.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnModalityOption,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnModalityOption,
                option,
            ),
        );
    }

    private getAmountOptionTotal(option: string) {
        return $(
            CommonsPaymentScreen.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnModalityTotal,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnModalityOption,
                option,
            ),
        );
    }

    private getCompanyServiceSelector(service: string) {
        return $(
            CommonsPaymentScreen.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .btnCompanyServiceType,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .btnCompanyServiceType,
                service,
            ),
        );
    }

    // Dynamic selectors
    private getCompanyReceiptLabel(company: string) {
        return $(
            CommonsPaymentScreen.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos.lblDynamicText,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .lblDynamicText,
                company,
            ),
        );
    }

    public get lblSearchReceipt() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.lblSearchReceipt,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .lblSearchReceipt,
        );
        return $(locator);
    }



    // Enter code and tap continue (without receipt selection)
    public async enterCodeAndContinue(code: string): Promise<void> {
        await browser.pause(2000);
        if (this.isIOS) {
            const isSearchCodeVisible = await this.lblSearchCode.isDisplayed();
            if (isSearchCodeVisible) {
                await CommonsPaymentScreen.enterCodeViaKeyboard(code);
            }
        } else {
            const isCodeVisible = await this.txtCompanyCode.isDisplayed();
            if (isCodeVisible) {
                await this.txtCompanyCode.setValue(code);
            } else {
                const serviceBtn =
                    this.getCompanyServiceSelector(DEFAULT_SERVICE_TYPE);
                await serviceBtn.waitForDisplayed({ timeout });
                await serviceBtn.click();
                await this.txtCompanyCode.waitForDisplayed({ timeout });
                await this.txtCompanyCode.setValue(code);
            }
        }

        await this.btnContinue.waitForDisplayed({ timeout });
        await this.btnContinue.click();
    }

    // Tap a button by its text
    public async tapButtonByText(text: string): Promise<void> {
        const primaryLocator = CommonsPaymentScreen.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos.btnDynamicByDesc,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnDynamicByDesc,
            text,
        );
        const fallbackLocator = CommonsPaymentScreen.buildLocator(
            PaymentForServicesLocator.paymentForServicesIos.lblDynamicText,
            PaymentForServicesLocator.paymentForServicesAndroid.lblDynamicText,
            text,
        );
        const primaryBtn = $(primaryLocator);
        const isVisible = await primaryBtn.isDisplayed().catch(() => false);
        const btn = isVisible ? primaryBtn : $(fallbackLocator);
        await btn.waitForDisplayed({ timeout });
        await btn.click();
    }

    // Enter client code and continue (simple — no service type fallback)
    public async enterClientCodeAndContinue(code: string): Promise<void> {
        await browser.pause(2000);
        if (this.isIOS) {
            const isSearchCodeVisible = await this.lblSearchCode.isDisplayed();
            if (isSearchCodeVisible) {
                await CommonsPaymentScreen.enterCodeViaKeyboard(code);
            }
        } else {
            await this.txtCompanyCode.waitForDisplayed({ timeout });
            await this.txtCompanyCode.setValue(code);
        }

        await this.btnContinue.waitForDisplayed({ timeout });
        await this.btnContinue.click();
    }

    // Shared: enter code with service type fallback + tap continue
    private async enterCodeAndTapContinue(
        code: string,
        serviceType: string = DEFAULT_SERVICE_TYPE,
    ): Promise<void> {
        await driver.pause(1000);
        const isCodeVisible = await this.lblSearchReceipt.isDisplayed();
        if (isCodeVisible) {
            if (this.isIOS) {
                await CommonsPaymentScreen.enterCodeViaKeyboard(code);
            } else {
                await this.txtCompanyCode.setValue(code);
            }
        } else {
            const serviceBtn = this.getCompanyServiceSelector(serviceType);
            await serviceBtn.waitForDisplayed({ timeout });
            await serviceBtn.click();
            await this.txtCompanyCode.waitForDisplayed({ timeout });
            if (this.isIOS) {
                await CommonsPaymentScreen.enterCodeViaKeyboard(code);
            } else {
                await this.txtCompanyCode.setValue(code);
            }
        }
        await this.btnContinue.waitForDisplayed({ timeout });
        await this.btnContinue.click();
        await driver.pause(2000);
    }

    // Select receipt and tap Yapear Servicio (simple flow)
    public async selectReceiptAndTapPay(): Promise<void> {
        await browser.pause(2000);
        await this.btnReceipt.waitForDisplayed({ timeout });
        await this.btnReceipt.click();
        await this.btnPayService.waitForDisplayed({ timeout });
        await this.btnPayService.click();
    }

    // Shared: select tap Yapear Servicio

    public async tapPayService(): Promise<void> {
        await this.btnPayService.waitForDisplayed({ timeout });
        await this.btnPayService.click();
        await browser.pause(2000);
    }

    // Select receipt and pay (full flow)
    public async selectReceiptAndPay(
        code: string,
        company: string,
        modality: string,
        serviceType?: string,
    ): Promise<void> {
        const companyLabel = this.getCompanyReceiptLabel(company);
        await companyLabel.waitForDisplayed({ timeout });

        await this.enterCodeAndTapContinue(code, serviceType);

        await this.btnReceipt.waitForDisplayed({ timeout });
        await this.btnReceipt.click();

        await CommonsPaymentScreen.selectModality(modality);

        if (modality == "Otro monto") {
            await this.txtAmount.waitForDisplayed({ timeout });
            await this.txtAmount.click();
            const digits = "100".split("");
            for (const digit of digits) {
                await browser.keys([digit]);
                await driver.pause(150);
            }
            await driver.pause(500);
        }

        await this.btnPayService.waitForDisplayed({ timeout });
        await this.btnPayService.click();
    }


    // Select receipt and pay (full flow)
    public async selectReceiptAndPayWithoutYapear(
        code: string,
        company: string,
        modality: string,
        amount: string,
        serviceType?: string,
    ): Promise<void> {
        const companyLabel = this.getCompanyReceiptLabel(company);
        await companyLabel.waitForDisplayed({ timeout });

        await this.enterCodeAndTapContinue(code, serviceType);

        await this.btnReceipt.waitForDisplayed({ timeout });
        await this.btnReceipt.click();

        await CommonsPaymentScreen.selectModality(modality);

        const keywords: string[] = amount.split(",").map((k) => k.trim());

        if (modality === "Otro monto") {
            if (keywords.length > 1) {
                if (this.isIOS) {
                    await this.txtAmount.waitForDisplayed({ timeout });
                    await this.txtAmount.click();

                    for (let i = 1; i < keywords.length; i++) {
                        await CommonsPaymentScreen.clearSearch(keywords[i - 1].length);
                        await driver.pause(2000);
                        const digits = (keywords[i] || "100").split("");
                        for (const digit of digits) {
                            await browser.keys([digit]);
                            await driver.pause(150);
                        }
                    }
                    await driver.pause(500);
                } else {
                    const otherAmount = this.getOtherAmountSelector();
                    const isOtherVisible = await otherAmount.isDisplayed();
                    if (isOtherVisible) {
                        for (let i = 1; i < keywords.length; i++) {
                            await this.txtAmount.waitForDisplayed({ timeout });
                            await this.txtAmount.setValue(keywords[i] || "100");
                        }
                    }
                }
            }
        }
    }
}

export default new PaymentPersonalityScreen();
