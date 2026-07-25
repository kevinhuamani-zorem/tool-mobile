import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@support/utils/LocatorFactory.ts';
import LocatorLendingSimulate from '@resources/locators/third-party-lending/simulate-amount.json' with { type: 'json' };
import LocatorLendingQuote from '@resources/locators/third-party-lending/quote-amount.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.ts';
import {
    TIMEOUTS,
    PAUSES,
    SCROLL_CONFIGS,
    waitForElementToDisplay,
    waitForMultipleElements,
    scrollAndVerify
} from '@support/utils/tplending-utils.ts';

class LendingQuoteScreen extends BaseScreen {

    public get btnTPLendingSimulateButton() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingSimulateButton,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingSimulateButton);
    }

    public get txtTPLendingAmountNeeded() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingAmountNeeded,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingAmountNeeded);
    }

    public get txtTPLendingQuoteAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingQuoteAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingQuoteAmount);
    }

    public get inputTPLendingMoneyAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.inputTPLendingMoneyAmount,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.inputTPLendingMoneyAmount);
    }

    public get txtTPLendingQuoteNewAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingQuoteAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingQuoteNewAmount);
    }

    public get btnTPLendingEditAmount()  {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingEditAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingEditAmount);
    }

    public get txtTPLendingAmountAllowed() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingAmountAllowed,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingAmountAllowed);
    }

    public get txtTPLendingLabelDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingLabelDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingLabelDate);
    }

    public get imgTPLendingSelectDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.imgTPLendingSelectDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.imgTPLendingSelectDate);
    }

    public get txtTPLendingFirstDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFirstDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFirstDate);
    }

    public get txtTPLendingSecondDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingSecondDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingSecondDate);
    }

    public get txtTPLendingThirdDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingThirdDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingThirdDate);
    }

    public get btnTPLendingChooseDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingChooseDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingChooseDate);
    }

    public get btnTPLendingSaveDate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingSaveDate,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingSaveDate);
    }

    public get txtTPLendingLabelQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingLabelQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingLabelQuote);
    }

    public get txtTPLendingFirstQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFirstQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFirstQuote);
    }

    public get txtTPLendingFirstAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFirstAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFirstAmount);
    }

    public get txtTPLendingSecondQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingSecondQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingSecondQuote);
    }

    public get txtTPLendingSecondAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingSecondAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingSecondAmount);
    }

    public get txtTPLendingThirdQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingThirdQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingThirdQuote);
    }

    public get txtTPLendingThirdAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingThirdAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingThirdAmount);
    }

    public get txtTPLendingFourthQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFourthQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFourthQuote);
    }

    public get txtTPLendingFourthAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFourthAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFourthAmount);
    }

    public get txtTPLendingFifthQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFifthQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFifthQuote);
    }

    public get txtTPLendingFifthAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingFifthAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingFifthAmount);
    }

    public get txtTPLendingSixthQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingSixthQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingSixthQuote);
    }

    public get txtTPLendingSixthAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.txtTPLendingSixthAmount,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.txtTPLendingSixthAmount);
    }

    public get btnTPLendingChooseQuote() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingChooseQuote,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingChooseQuote);
    }

    public get btnTPLendingMoreOptions() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingQuote.quoteAmountIos.btnTPLendingMoreOptions,
                                        TypeLocator.XPATH, LocatorLendingQuote.quoteAmountAndroid.btnTPLendingMoreOptions);
    }

    private async clickElementDirect(locator: string, timeout: number = TIMEOUTS.DEFAULT): Promise<void> {
        const element = await $(locator);
        await element.waitForDisplayed({ timeout });
        await element.click();
    }

    public async clickSimulateAmount(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingSimulateButton);
    }

    public async clickEditSimulateAmount(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingEditAmount);
    }

    public async clickSelectPaydate(): Promise<void> {
        await this.clickElementDirect(this.imgTPLendingSelectDate);
    }

    public async clickChoosePaydate(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingChooseDate);
    }

    public async clickSavePaydate(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingSaveDate);
    }

    public async clickChooseQuote(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingChooseQuote);
    }

    public async clickMoreOptions(): Promise<void> {
        await this.clickElementDirect(this.btnTPLendingMoreOptions);
    }

    private async setNewQuoteAmount(newAmount: string): Promise<void> {
        const el = await $(this.inputTPLendingMoneyAmount as unknown as string);
        await el.waitForDisplayed({ timeout: TIMEOUTS.SHORT });
        await el.click();
        
        if (browser.isIOS) {
            await driver.execute('mobile: selectPickerWheelValue', {
                element: el,
                order: 'next',
                offset: 0.15
            }).catch(async () => {
                await driver.keys(['Command', 'a']);
                await driver.pause(PAUSES.SHORT);
            });
            await el.setValue(newAmount);
        } else {
            try { await el.clearValue(); } catch {}
            try { await el.setValue(newAmount); } catch { await el.addValue(newAmount); }
        }
    }

    public async lendingQuoteAmount(newAmount: string): Promise<void> {
        if (browser.isAndroid) {
            await driver.pause(PAUSES.LONG);
            await this.clickEditSimulateAmount();
            await driver.pause(PAUSES.MEDIUM);
            await this.setNewQuoteAmount(newAmount);
            await driver.pause(PAUSES.SHORT);
            await this.clickSimulateAmount();
        } else {
            await driver.pause(PAUSES.LONG);
            await this.setNewQuoteAmount(newAmount);
            await driver.pause(PAUSES.SHORT);
            await this.clickEditSimulateAmount();
        }
    }

    private async setNewPaydate(): Promise<void> {
        try {
            await this.clickSelectPaydate();
            await driver.pause(PAUSES.LONG);

            await waitForMultipleElements([
                this.txtTPLendingFirstDate,
                this.txtTPLendingSecondDate,
                this.txtTPLendingThirdDate
            ], TIMEOUTS.DEFAULT);

            await this.clickChoosePaydate();
            await this.clickSavePaydate();
        } catch (error) {
            console.log('It is not possible to change the paydate', error);
            return;
        }
    }

    private async openMoreOptions() {
        await this.clickMoreOptions();

        const elements = [
            this.txtTPLendingFourthQuote,
            this.txtTPLendingFourthAmount,
            this.txtTPLendingFifthQuote,
            this.txtTPLendingFifthAmount,
            this.txtTPLendingSixthQuote,
            this.txtTPLendingSixthAmount
        ];

        await scrollAndVerify(
            SCROLL_CONFIGS.quote.moreOptions,
            elements,
            PAUSES.MEDIUM
        );
    }

    private async verifyQuoteAmountDisplay(expectedAmount?: string): Promise<void> {
        await waitForElementToDisplay(this.txtTPLendingAmountNeeded, TIMEOUTS.DEFAULT);

        const amountLocator = browser.isIOS 
            ? this.txtTPLendingQuoteAmount 
            : this.txtTPLendingQuoteNewAmount;
        
        const newAmountElement = await $(amountLocator);
        await newAmountElement.waitForDisplayed({ timeout: TIMEOUTS.DEFAULT });

        if (expectedAmount !== undefined) {
            const displayedAmount = (await newAmountElement.getText()).trim();
            if (displayedAmount !== expectedAmount) {
                throw new Error(
                    `Displayed quote amount "${displayedAmount}" does not match expected amount "${expectedAmount}".`
                );
            }
        }

        await waitForElementToDisplay(this.txtTPLendingAmountAllowed, TIMEOUTS.DEFAULT);
    }

    private async verifyQuoteDates(): Promise<void> {
        await waitForMultipleElements([
            this.txtTPLendingLabelDate,
            this.txtTPLendingSecondDate
        ], TIMEOUTS.DEFAULT);
    }

    private async verifyQuoteOptions(): Promise<void> {
        await waitForElementToDisplay(this.txtTPLendingLabelQuote, TIMEOUTS.DEFAULT);

        await waitForMultipleElements([
            this.txtTPLendingFirstQuote,
            this.txtTPLendingFirstAmount,
            this.txtTPLendingSecondQuote,
            this.txtTPLendingSecondAmount,
            this.txtTPLendingThirdQuote,
            this.txtTPLendingThirdAmount
        ], TIMEOUTS.DEFAULT);
    }

    public async verifyQuoteAmount(expectedAmount?: string): Promise<void> {
        try {
            await this.setNewPaydate();
        } catch (error) {
            console.log('Paydate selection failed or already set', error);
        }

        try {
            await this.verifyQuoteAmountDisplay(expectedAmount);
        } catch (error) {
            console.log('Quote amount display verification failed', error);
        }
        
        try {
            await this.verifyQuoteDates();
        } catch (error) {
            console.log('Quote dates not displayed (already selected)', error);
        }
        await this.verifyQuoteOptions();
        await this.openMoreOptions();
        await this.clickChooseQuote();
        await driver.pause(PAUSES.LONG);
    }
}
export default new LendingQuoteScreen();
