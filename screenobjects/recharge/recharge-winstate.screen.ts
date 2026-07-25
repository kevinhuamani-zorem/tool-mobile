import RechargeLocator from "@locators/recharge/recharge.locator.json" with { type: "json" };
import BaseScreen from "@screenobjects/commons/base.screen.ts";
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import { getTimeoutFromEnv, performScroll } from "@utils/Utils.ts";

const timeout: number = getTimeoutFromEnv() || 10000;

class RechargeWinStateScreen extends BaseScreen {
    public get lblWinStateTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.lblWinStateTitle,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblWinStateTitle,
        );
        return $(locator);
    }

    private getWinStateOperator(company: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.lblWinStateOperator.replace(
                "{0}",
                company,
            ),
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblWinStateOperator.replace(
                "{0}",
                company,
            ),
        );
        return $(locator);
    }

    private getWinStateOperatorFallback() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.lblWinStateOperatorFallback,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblWinStateOperatorFallback,
        );
        return $(locator);
    }

    public get lblWinStateOperationNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.lblWinStateOperationNumber,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblWinStateOperationNumber,
        );
        return $(locator);
    }

    public get btnGoHome() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnGoHome,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnGoHome,
        );
        return $(locator);
    }

    public get btnShowMovements() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnShowMovements,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnShowMovements,
        );
        return $(locator);
    }

    public get btnSeeAll() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnSeeAll,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnSeeAll,
        );
        return $(locator);
    }

    public get btnMovementTwo() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.btnMovementTwo,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnMovementTwo,
        );
        return $(locator);
    }

    public get lblWinStateMyNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.lblWinStateMyNumber,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblWinStateMyNumber,
        );
        return $(locator);
    }

    public get btnShare() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnShare,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnShare,
        );
        return $(locator);
    }

    public get lblShareConfirmation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            RechargeLocator.rechargeIos.lblShareConfirmation,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.lblShareConfirmation,
        );
        return $(locator);
    }

    public get btnNewRecharge() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            RechargeLocator.rechargeIos.btnNewRecharge,
            TypeLocator.XPATH,
            RechargeLocator.rechargeAndroid.btnNewRecharge,
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

    private async scrollDown(): Promise<void> {
        const { width, height } = await browser.getWindowSize();
        const x = Math.floor(width / 2);
        const startY = Math.floor(height * 0.7);
        const endY = Math.floor(height * 0.4);
        await performScroll(x, startY, x, endY);
    }

    private async scrollUntilVisible(
        element: ChainablePromiseElement,
        errorMsg: string,
    ): Promise<void> {
        await browser.waitUntil(
            async () => {
                const isDisplayed = await element.isDisplayed();
                if (!isDisplayed) {
                    await this.scrollDown();
                }
                return isDisplayed;
            },
            { timeout, timeoutMsg: errorMsg },
        );
    }

    public async verifyWinStateRecharge(): Promise<void> {
        await this.lblWinStateTitle.waitForDisplayed({ timeout });
        await expect(this.lblWinStateTitle).toBeDisplayed();
    }

    public async verifyWinStateAttributes(company: string): Promise<void> {
        const operatorLabel = this.getWinStateOperator(company);
        const fallbackOperatorLabel = this.getWinStateOperatorFallback();

        try {
            await operatorLabel.waitForDisplayed({ timeout });
            await expect(operatorLabel).toBeDisplayed();
        } catch {
            await fallbackOperatorLabel.waitForDisplayed({ timeout });
            await expect(fallbackOperatorLabel).toBeDisplayed();
            const fallbackOperatorText = (await fallbackOperatorLabel.getText())
                .replace(/\s+/g, " ")
                .trim();
            const expectedCompany = company.replace(/\s+/g, " ").trim();
            await expect(fallbackOperatorText).toContain(expectedCompany);
        }
        await this.lblWinStateOperationNumber.waitForDisplayed({ timeout });
        await expect(this.lblWinStateOperationNumber).toBeDisplayed();
    }

    public async verifyWinStateInMovements(): Promise<void> {
        await this.btnGoHome.waitForDisplayed({ timeout });
        await this.btnGoHome.click();
        await this.scrollUntilVisible(
            this.btnShowMovements,
            "btnShowMovements not found after scrolling",
        );
        await this.btnShowMovements.click();
        await this.scrollUntilVisible(
            this.btnSeeAll,
            "btnSeeAll not found after scrolling",
        );
        await this.btnMovementTwo.waitForDisplayed({ timeout });
        await this.btnMovementTwo.click();
        await this.lblWinStateMyNumber.waitForDisplayed({ timeout });
        await expect(this.lblWinStateMyNumber).toBeDisplayed();
        await this.btnGoHome.waitForDisplayed({ timeout });
        await this.btnGoHome.click();
    }

    public async verifyWinStateInSeeAll(): Promise<void> {
        await this.scrollDown();

        // Try to find btnSeeAll first
        const isSeeAllVisible = await this.btnSeeAll
            .isDisplayed()
            .catch(() => false);

        if (!isSeeAllVisible) {
            // If not visible, navigate through "Mostrar movimientos" → "Ver todo"
            await this.scrollUntilVisible(
                this.btnShowMovements,
                "btnShowMovements not found after scrolling",
            );
            await this.btnShowMovements.click();
        }

        // Now scroll until "Ver todo" is visible and click
        await this.scrollUntilVisible(
            this.btnSeeAll,
            "btnSeeAll not found after scrolling",
        );
        await this.btnSeeAll.click();

        // Verify we're in the movements list
        await this.btnMovementTwo.waitForDisplayed({ timeout });
        await this.btnMovementTwo.click();
        await this.lblWinStateMyNumber.waitForDisplayed({ timeout });
        await expect(this.lblWinStateMyNumber).toBeDisplayed();
    }

    public async verifyShareRecharge(): Promise<void> {
        await this.btnShare.waitForDisplayed({ timeout });
        await this.btnShare.click();

        if (driver.isAndroid) {
            await this.lblShareConfirmation.waitForDisplayed({ timeout });
            await expect(this.lblShareConfirmation).toBeDisplayed();
        }
    }

    public async startNewRechargeFromWinState(): Promise<void> {
        await this.btnNewRecharge.waitForDisplayed({ timeout });
        await this.btnNewRecharge.click();

        await this.btnMyNumber.waitForDisplayed({ timeout });
        await expect(this.btnMyNumber).toBeDisplayed();
        await expect(this.btnOtherPerson).toBeDisplayed();
    }
}

export default new RechargeWinStateScreen();
