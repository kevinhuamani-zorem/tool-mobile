import RechargeLocator from "@locators/recharge/recharge.locator.json" with { type: "json" };
import BaseScreen from "@screenobjects/commons/base.screen.ts";
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import {
    getTimeoutFromEnv,
    handlePopupIfVisibleWithTimeOut,
} from "@utils/Utils.ts";

const timeout: number = getTimeoutFromEnv() || 10000;

class RechargeScreen extends BaseScreen {
    public get btnRechargePhone() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnRechargePhone,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnRechargePhone,
        );
        return $(locator);
    }

    public get btnViewAll() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnViewAll,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnViewAll,
        );
        return $(locator);
    }

    public get btnMyNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnMyNumber,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnMyNumber,
        );
        return $(locator);
    }

    public get btnOtherPerson() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnOtherPerson,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnOtherPerson,
        );
        return $(locator);
    }

    public get btnNewNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnNewNumber,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnNewNumber,
        );
        return $(locator);
    }

    public get txtPhoneInput() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.txtPhoneInput,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.txtPhoneInput,
        );
        return $(locator);
    }

    public get btnAccessYourContacts() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnAccessYourContacts,
            TypeLocator.ID,
            RechargeLocator.rechargeAndroid.btnAccessYourContacts,
        );
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnContinue,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnContinue,
        );
        return $(locator);
    }

    public get txtAmountInput() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.txtAmountInput,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.txtAmountInput,
        );
        return $(locator);
    }

    public get btnRecharge() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnRecharge,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnRecharge,
        );
        return $(locator);
    }

    public get lblMinimumRecharge() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.lblMinimumRecharge,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblMinimumRecharge,
        );
        return $(locator);
    }

    public get lblMaximumRecharge() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.lblMaximumRecharge,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblMaximumRecharge,
        );
        return $(locator);
    }

    private getAmountSelector(amount: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.btnSuggestedAmount.replace(
                "{0}",
                amount,
            ),
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnSuggestedAmount.replace(
                "{0}",
                amount,
            ),
        );
        return $(locator);
    }

    private async selectMyNumber(): Promise<void> {
        await this.btnMyNumber.waitForDisplayed({ timeout });
        await this.btnMyNumber.click();
    }

    private generatePeruvianPhoneNumber(): string {
        const digits = Array.from({ length: 8 }, () =>
            Math.floor(Math.random() * 10),
        );
        return `9${digits.join("")}`;
    }

    private async resolveIosContactsPermissionPopup(): Promise<void> {
        const handled = await handlePopupIfVisibleWithTimeOut(
            () => this.btnAccessYourContacts,
            "iOS contacts permission",
            3000,
        );

        if (handled) {
            return;
        }

        const nativePermissionButtons = [
            RechargeLocator.rechargeIos.btnContactsPermissionDeny,
            RechargeLocator.rechargeIos.btnContactsPermissionAllowOnce,
            RechargeLocator.rechargeIos.btnContactsPermissionAllowWhileUsing,
        ];

        for (const selector of nativePermissionButtons) {
            const button = $(selector);
            const isDisplayed = await button.isDisplayed().catch(() => false);
            if (isDisplayed) {
                await button.click();
                return;
            }
        }
    }

    private async selectOtherPerson(): Promise<void> {
        const phone = this.generatePeruvianPhoneNumber();
        await this.btnOtherPerson.waitForDisplayed({ timeout });
        await this.btnOtherPerson.click();

        if (this.isIOS) {
            await this.resolveIosContactsPermissionPopup();
        }
        await this.btnNewNumber.waitForDisplayed({ timeout });
        await this.btnNewNumber.click();
        await this.txtPhoneInput.waitForDisplayed({ timeout });
        await this.txtPhoneInput.setValue(phone);
        await this.btnContinue.waitForDisplayed({ timeout });
        await this.btnContinue.click();
    }

    private readonly rechargeStrategies: Record<string, () => Promise<void>> = {
        "mi numero": () => this.selectMyNumber(),
        "otra persona": () => this.selectOtherPerson(),
    };

    private getOperatorSelector(company: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.btnOperator.replace("{0}", company),
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnOperator.replace("{0}", company),
        );
        return $(locator);
    }

    /**
     * Enters the recharge amount using platform-specific input strategies.
     *
     * - iOS: taps each digit key directly on the native keyboard via locator
     *   (setValue is unreliable on numeric keyboards in XCUITest)
     * - Android: uses setValue which works reliably on UiAutomator2
     *
     * @param amount - Amount to enter as string (e.g. "10")
     */
    private async enterAmountByKeyboard(amount: string): Promise<void> {
        await this.txtAmountInput.waitForDisplayed({ timeout });
        if (this.isIOS) {
            for (const digit of amount.split("")) {
                const key = $(
                    RechargeLocator.rechargeIos.btnKeyboard.replace(
                        "{0}",
                        digit,
                    ),
                );
                await key.waitForDisplayed({ timeout });
                await key.click();
            }
        } else {
            await this.txtAmountInput.setValue(amount);
        }
    }

    private async tapIosDeleteKeyIfVisible(): Promise<boolean> {
        const key = $(RechargeLocator.rechargeIos.btnKeyboardDelete);
        const isVisible = await key
            .waitForDisplayed({ timeout: 2000 })
            .then(() => true)
            .catch(() => false);

        if (!isVisible) {
            return false;
        }

        await key.click();
        return true;
    }

    private async enterAmountByKeyboardReplacingValue(
        amount: string,
    ): Promise<void> {
        if (this.isIOS) {
            // Dynamic iOS amount field: match any balance text containing "Soles a recargar".
            const iosSpecificElement = $(
                RechargeLocator.rechargeIos.txtAmountInputFallback,
            );
            await iosSpecificElement.waitForDisplayed({ timeout });
            await iosSpecificElement.click();

            // Ensure exactly two digits are cleared
            for (let i = 0; i < 2; i++) {
                const deleted = await this.tapIosDeleteKeyIfVisible();
                if (!deleted) {
                    break;
                }
            }

            for (const digit of amount.split("")) {
                const key = $(
                    RechargeLocator.rechargeIos.btnKeyboard.replace(
                        "{0}",
                        digit,
                    ),
                );
                await key.waitForDisplayed({ timeout });
                await key.click();
            }
            return;
        }

        await this.txtAmountInput.setValue(amount);
    }

    private async selectOperatorAndRecharge(
        company: string,
        amount: string,
    ): Promise<void> {
        const operatorBtn = this.getOperatorSelector(company);
        await operatorBtn.waitForDisplayed({ timeout });
        await operatorBtn.click();
        await this.enterAmountByKeyboard(amount);
        await this.btnRecharge.waitForDisplayed({ timeout });
        await this.btnRecharge.click();
    }

    /**
     * Navigates to the recharge section and selects the recipient type.
     *
     * First checks if the recharge button is directly visible on home.
     * If not, falls back to opening "Ver todo" first.
     * Then applies the recipient strategy ("mi numero" or "otra persona")
     * using the Strategy Pattern via rechargeStrategies map.
     *
     * @param option - Recipient option: "mi numero" | "otra persona" (default: "mi numero")
     * @throws Error if the option is not registered in rechargeStrategies
     */
    public async navigateToRechargeSection(
        option: string = "mi numero",
    ): Promise<void> {
        const isRechargeVisible = await this.btnRechargePhone
            .isDisplayed()
            .catch(() => false);

        if (isRechargeVisible) {
            await this.btnRechargePhone.click();
        } else {
            await this.btnViewAll.waitForDisplayed({ timeout });
            await this.btnViewAll.click();
            await this.btnRechargePhone.waitForDisplayed({ timeout });
            await this.btnRechargePhone.click();
        }

        const strategy = this.rechargeStrategies[option];
        if (!strategy)
            throw new Error(
                `Invalid recharge option: "${option}". Allowed: ${Object.keys(this.rechargeStrategies).join(", ")}`,
            );
        await strategy();
    }

    public async newRechargeFromWinState(option: string): Promise<void> {
        const strategy = this.rechargeStrategies[option];
        if (!strategy)
            throw new Error(
                `Invalid recharge option: "${option}". Allowed: ${Object.keys(this.rechargeStrategies).join(", ")}`,
            );
        await strategy();
    }

    public async rechargeMyNumber(
        company: string,
        amount: string,
    ): Promise<void> {
        await this.selectOperatorAndRecharge(company, amount);
    }

    public async rechargeMyNumberFromOptions(
        company: string,
        amount: string,
    ): Promise<void> {
        await this.btnMyNumber.waitForDisplayed({ timeout });
        await this.btnMyNumber.click();
        await this.selectOperatorAndRecharge(company, amount);
    }

    public async rechargeOtherNumberFromOptions(
        company: string,
        amount: string,
    ): Promise<void> {
        await this.selectOperatorAndRecharge(company, amount);
    }

    public async rechargeSuggestedAmount(
        company: string,
        amount: string,
    ): Promise<void> {
        const operatorBtn = this.getOperatorSelector(company);
        await operatorBtn.waitForDisplayed({ timeout });
        await operatorBtn.click();

        const amountBtn = this.getAmountSelector(amount);
        await amountBtn.waitForDisplayed({ timeout });
        await amountBtn.click();

        await this.btnRecharge.waitForDisplayed({ timeout });
        await this.btnRecharge.click();
    }

    public async typeAmountAndNavigate(
        amount: string,
        company: string = "Bitel",
    ): Promise<void> {
        await this.navigateToRechargeSection("mi numero");

        const operatorBtn = this.getOperatorSelector(company);
        await operatorBtn.waitForDisplayed({ timeout });
        await operatorBtn.click();
        await this.enterAmountByKeyboard(amount);
    }

    public async verifyRechargeButtonEnabled(): Promise<void> {
        await this.btnRecharge.waitForDisplayed({ timeout });
        await expect(this.btnRecharge).toBeEnabled();
    }

    public async verifyMinimumRechargeError(): Promise<void> {
        await this.enterAmountByKeyboardReplacingValue("2");
        await this.lblMinimumRecharge.waitForDisplayed({ timeout });
        await expect(this.lblMinimumRecharge).toBeDisplayed();
    }

    public async verifyMaximumRechargeError(): Promise<void> {
        await this.enterAmountByKeyboardReplacingValue("60");
        await this.lblMaximumRecharge.waitForDisplayed({ timeout });
        await expect(this.lblMaximumRecharge).toBeDisplayed();
    }
}

export default new RechargeScreen();
