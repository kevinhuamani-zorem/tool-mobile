import PaymentForServicesLocator from "@resources/locators/bill-payment/payment-for-services.locator.json" with { type: "json" };
import CommonsPaymentScreen from "@screenobjects/bill-payment/commons-payment.screen.ts";
import BaseScreen from "@screenobjects/commons/base.screen.ts";
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import { getTimeoutFromEnv } from "@utils/Utils.ts";
import { Constants } from "@utils/constants.ts";

const timeout: number = getTimeoutFromEnv() || 10000;

const DEFAULT_SERVICE_TYPE = "Cuenta Financiera";
const DEFAULT_AMOUNT = "100";

class PaymentModalitiesScreen extends BaseScreen {
    public get btnPayServices() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.btnPayServices,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnPayServices,
        );
        return $(locator);
    }

    public get btnViewAll() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.btnViewAll,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnViewAll,
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

    private getCompanySelector(company: string) {
        return $(
            CommonsPaymentScreen.buildLocator(
                PaymentForServicesLocator.paymentForServicesIos
                    .lblCompanyResult,
                PaymentForServicesLocator.paymentForServicesAndroid
                    .lblCompanyResult,
                company,
            ),
        );
    }

    public get txtCompanyCode() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtCompanyCode,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.txtCompanyCode,
        );
        return $(locator);
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

    public get lblYapeoHigh() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.lblYapeoHigh,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnReceipt,
        );
        return $(locator);
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

    private getOtherAmountSelector() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtOtherAmount,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.txtOtherAmount,
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

    public get btnPayService() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnPayService,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnPayService,
        );
        return $(locator);
    }

    public get btnClearSearch() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnClearSearch,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnClearSearch,
        );
        return $(locator);
    }

    public get btnProfile() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.btnProfile,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnProfile,
        );
        return $(locator);
    }

    public get lblMenuTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            PaymentForServicesLocator.paymentForServicesIos.lblMenuTitle,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.lblMenuTitle,
        );
        return $(locator);
    }

    public get btnConfirmation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnConfirmation,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnConfirmation,
        );
        return $(locator);
    }

    public get txtOtherAmountOTP() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.txtOtherAmountOTP,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .txtOtherAmountOTP,
        );
        return $(locator);
    }

    public get btnSaveChanges() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnSaveChanges,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnSaveChanges,
        );
        return $(locator);
    }

    public get btnIrAlHome() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnIrAlHome,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnIrAlHome,
        );
        return $(locator);
    }

    public get btnLetsGetStarted() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnLetsGetStarted,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid
                .btnLetsGetStarted,
        );
        return $(locator);
    }

    public get btnChooseLater() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesIos.btnChooseLater,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnChooseLater,
        );
        return $(locator);
    }

    public async navigateToPaymentServices(): Promise<void> {
        // Dismiss any invisible system alerts (location, notifications) that block interaction on BrowserStack iOS
        await this.gestureHelper.dismissSystemAlertsIfPresent();

        // Wait for home to fully load (especially on BrowserStack iOS)
        // Extended timeout for cloud execution environments
        const extendedTimeout = Constants.TIMEOUT_POR_DEFECTO * 1.5; // 30 seconds

        // Try "Ver todo" first as it's more stable than individual service buttons
        try {
            await this.btnViewAll.waitForExist({ timeout: extendedTimeout });
            await this.btnViewAll.waitForDisplayed({
                timeout: extendedTimeout,
            });
            await this.btnViewAll.click();
            await this.btnPayServices.waitForDisplayed({
                timeout: extendedTimeout,
            });
            await this.btnPayServices.click();
            await driver.pause(2000);
            if (this.isIOS) {
                if (await this.btnLetsGetStarted.isDisplayed()) {
                    await this.btnLetsGetStarted.click();
                    await this.btnChooseLater.waitForDisplayed({ timeout });
                    await this.btnChooseLater.click();
                }
            }
        } catch (error: unknown) {
            // Fallback: try direct button
            const message =
                error instanceof Error ? error.message : String(error);
            console.warn(
                `[navigateToPaymentServices] Fallback triggered: ${message}`,
            );

            // Try dismissing alerts again before fallback
            await this.gestureHelper.dismissSystemAlertsIfPresent();

            await this.uiHelper.waitForElementExistByLocator(
                this.btnPayServices,
                true,
                extendedTimeout,
            );
            await this.btnPayServices.click();
        }
    }

    /**
     * Types a single character on the iOS keyboard.
     * If the character is numeric, switches to the numeric keyboard, taps the key,
     * then switches back to the alphabetic keyboard.
     * Spaces are handled via the "space" key name.
     */
    private async typeIosKeyboardChar(char: string): Promise<void> {
        const isDigit = /\d/.test(char);

        if (isDigit) {
            const btnNumbers = $('//XCUIElementTypeKey[@name="more"]');
            await btnNumbers.waitForDisplayed({ timeout: 3000 });
            await btnNumbers.click();
            await driver.pause(200);

            const numKey = $(`//XCUIElementTypeKey[@name="${char}"]`);
            await numKey.waitForDisplayed({ timeout: 3000 });
            await numKey.click();
            await driver.pause(100);

            const btnAlpha = $('//XCUIElementTypeKey[@name="more"]');
            await btnAlpha.waitForDisplayed({ timeout: 3000 });
            await btnAlpha.click();
            await driver.pause(200);
        } else {
            const keyName = char === " " ? "space" : char;
            const key = $(
                `//XCUIElementTypeKey[@name="${keyName}" or @name="${keyName.toUpperCase()}"]`,
            );
            await key.waitForDisplayed({ timeout: 3000 });
            await key.click();
            await driver.pause(100);
        }
    }

    /**
     * Searches for a company in the bill payment search field.
     *
     * Uses different strategies per platform due to Appium limitations:
     * - Android: tap by coordinates (GestureHelper) to avoid stale locator after
     *   placeholder disappears, then types char-by-char via browser.keys()
     * - iOS: taps each XCUIElementTypeKey individually since mobile:type and
     *   addValue are unreliable on XCUITest search fields. Numeric characters
     *   automatically switch to the numeric keyboard and back.
     *
     * Diacritics are stripped before typing to ensure keyboard compatibility.
     *
     * @param company - Company name to search (e.g. "Movistar")
     */
    public async searchCompany(company: string): Promise<void> {
        const extendedTimeout = Constants.TIMEOUT_POR_DEFECTO * 1.5;
        await this.lblSearchCompany.waitForDisplayed({
            timeout: extendedTimeout,
        });

        if (this.isIOS) {
            await this.gestureHelper.dismissSystemAlertsIfPresent();
        }

        const normalized = company
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        if (this.isAndroid) {
            const searchBar = this.txtSearchCompany;
            await searchBar.waitForDisplayed({ timeout });

            const location = await searchBar.getLocation();
            const size = await searchBar.getSize();
            await this.gestureHelper.touch(
                Math.round(location.x + size.width / 2),
                Math.round(location.y + size.height / 2),
            );

            for (const char of normalized.split("")) {
                await browser.keys([char]);
                await browser.pause(150);
            }
            await browser.pause(2000);
        } else {
            const searchBar = this.txtSearchCompany;
            await searchBar.waitForDisplayed({ timeout });
            await searchBar.click();
            await driver.pause(500);

            for (const char of normalized.toLowerCase().split("")) {
                await this.typeIosKeyboardChar(char);
            }

            await driver.pause(2000);
        }

        const companyResult = this.getCompanySelector(company);
        await companyResult.waitForDisplayed({ timeout });
        await companyResult.click();
    }

    public async searchKeyword(keyword: string): Promise<void> {
        const extendedTimeout = Constants.TIMEOUT_POR_DEFECTO * 1.5;
        await this.lblSearchCompany.waitForDisplayed({
            timeout: extendedTimeout,
        });

        if (this.isIOS) {
            await this.gestureHelper.dismissSystemAlertsIfPresent();
        }

        const normalized = keyword
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        if (this.isAndroid) {
            const searchBar = this.txtSearchCompany;
            await searchBar.waitForDisplayed({ timeout });

            const location = await searchBar.getLocation();
            const size = await searchBar.getSize();
            await this.gestureHelper.touch(
                Math.round(location.x + size.width / 2),
                Math.round(location.y + size.height / 2),
            );

            for (const char of normalized.split("")) {
                await browser.keys([char]);
                await browser.pause(150);
            }
        } else {
            const searchBar = this.txtSearchCompany;
            await searchBar.waitForDisplayed({ timeout });
            await searchBar.click();
            await driver.pause(500);

            for (const char of normalized.toLowerCase().split("")) {
                await this.typeIosKeyboardChar(char);
            }
        }
        await driver.pause(2000);
    }

    public async enterKeyword(keyword: string): Promise<void> {
        const normalized = keyword
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        if (this.isAndroid) {
            for (const char of normalized.split("")) {
                await browser.keys([char]);
                await browser.pause(150);
            }
        } else {
            for (const char of normalized.toLowerCase().split("")) {
                await this.typeIosKeyboardChar(char);
            }
        }
        await driver.pause(2000);
    }

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
    }

    private async enterAmountInField(amount: string): Promise<void> {
        if (this.isIOS) {
            await driver.pause(500);
            const digits = amount.split("");
            for (const digit of digits) {
                await browser.keys([digit]);
                await driver.pause(100);
            }
            await driver.pause(500);
        } else {
            await this.txtAmount.setValue(amount);
        }
    }

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
        const otherAmount = this.getOtherAmountSelector();
        const isOtherVisible = await otherAmount.isDisplayed();
        if (isOtherVisible) {
            await this.txtAmount.waitForDisplayed({ timeout });
            await this.enterAmountInField(DEFAULT_AMOUNT);
        }
        await this.btnPayService.waitForDisplayed({ timeout });
        await this.btnPayService.click();
        const validateCodeLocator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            PaymentForServicesLocator.paymentForServicesIos.btnValidateCode,
            TypeLocator.XPATH,
            PaymentForServicesLocator.paymentForServicesAndroid.btnValidateCode,
        );
        const elementExists = await this.uiHelper.waitForElement(
            validateCodeLocator,
            Constants.TIMEOUT_LONG,
        );
        if (elementExists) {
            const btnValidateCode = $(validateCodeLocator);
            await btnValidateCode.click();
        }
    }

    public async confirmDollarPayment(): Promise<void> { 
        await this.btnPayServices.waitForDisplayed({ timeout });
        await this.btnPayServices.click();
    }
}

export default new PaymentModalitiesScreen();
