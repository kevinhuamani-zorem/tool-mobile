import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@support/utils/LocatorFactory.ts';
import LocatorLendingHome from '@resources/locators/third-party-lending/home-multi-lending.json' with { type: 'json' };
import LocatorLendingSimulate from '@resources/locators/third-party-lending/simulate-amount.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.ts';
import {
    TIMEOUTS,
    PAUSES,
    waitForElementToDisplay,
    waitForMultipleElements
} from '@support/utils/tplending-utils.ts';

class LendingSimulateScreen extends BaseScreen {

    public get btnTPLendingMibancoSimulate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnTPLendingMibancoSimulate,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnTPLendingMibancoSimulate);
    }

    public get txtTPLendingAmountNeeded() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingAmountNeeded,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingAmountNeeded);
    }

    public get btnTPLendingSimulateAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.btnTPLendingSimulateAmount,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.btnTPLendingSimulateAmount);
    }

    public get txtTPLendingMoneyCurrency() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.inputTPLendingMoneyAmount,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingMoneyCurrency);
    }

    public get inputTPLendingMoneyAmount()  {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.inputTPLendingMoneyAmount,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.inputTPLendingMoneyAmount);
    }

    public get txtTPLendingAmountAllowed() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingAmountAllowed,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingAmountAllowed);
    }

    public get txtTPLendingWrongAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingWrongAmount,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingWrongAmount);
    }

    public get btnTPLendingSimulateClose() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.btnTPLendingSimulateClose,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.btnTPLendingSimulateClose);
    }

    public get txtTPLendingAbandonTitle() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingAbandonTitle,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingAbandonTitle);
    }

    public get txtTPLendingFirstOption() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingFirstOption,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingFirstOption);
    }

    public get txtTPLendingSecondOption() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingSecondOption,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingSecondOption);
    }

    public get txtTPLendingThirdOption() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingThirdOption,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingThirdOption);
    }

    public get txtTPLendingFourthOption() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.txtTPLendingFourthOption,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.txtTPLendingFourthOption);
    }

    public get btnTPLendingSendMetric() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountIos.btnTPLendingSendMetric,
                                        TypeLocator.XPATH, LocatorLendingSimulate.simulateAmountAndroid.btnTPLendingSendMetric);
    }

    public async clickSimulateCredit(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingMibancoSimulate, 'click');
    }

    public async clickSimulateClose(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingSimulateClose, 'click');
    }

    public async clickSimulateMetric(): Promise<void> {
        await this.uiHelper.interactWithElement(this.txtTPLendingFirstOption, 'click');
    }

    public async clickSimulateSendMetric(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingSendMetric, 'click');
    }

    public async clickSimulateAmountButton(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnTPLendingSimulateAmount, 'click');
    }

    public async verifyAmountAllowedMessage() {
        await waitForElementToDisplay(this.txtTPLendingAmountAllowed, TIMEOUTS.DEFAULT);
    }

    public async verifyAmountErrorMessage() {
        await waitForElementToDisplay(this.txtTPLendingWrongAmount, TIMEOUTS.DEFAULT);
    }

    private async verifySimulateAmountFields(): Promise<void> {
        const elementsToValidate = [
            this.txtTPLendingAmountNeeded,
            this.btnTPLendingSimulateAmount,
            this.txtTPLendingAmountAllowed,
            this.btnTPLendingSimulateClose
        ];
        
        if (browser.isAndroid) {
            elementsToValidate.push(this.txtTPLendingMoneyCurrency);
        }
        
        await waitForMultipleElements(elementsToValidate, TIMEOUTS.DEFAULT);
    }

    public async verifySimulateAmount(): Promise<void> {
        try {
            await this.clickSimulateCredit();
            await driver.pause(PAUSES.LONG);
            await this.verifySimulateAmountFields();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('No amount is available now', error);
            return;
        }
    }

    private async setLoanAmount(amount: string): Promise<void> {
        const el = await $(this.inputTPLendingMoneyAmount as unknown as string);
        await el.waitForDisplayed({ timeout: TIMEOUTS.SHORT });
        await el.click();
        try { await el.clearValue(); } catch {}
        try { await el.setValue(amount); } catch { await el.addValue(amount); }
    }

    public async lendingLoanAmount(amount: string): Promise<void> {
        await this.setLoanAmount(amount);
    }

    private async verifyAbandonOptions(): Promise<void> {
        await waitForMultipleElements([
            this.txtTPLendingFirstOption,
            this.txtTPLendingSecondOption,
            this.txtTPLendingThirdOption,
            this.txtTPLendingFourthOption
        ], TIMEOUTS.DEFAULT);
    }

    public async verifySimulateAbandon(): Promise<void> {
        try {
            await this.clickSimulateClose();
            await driver.pause(PAUSES.LONG);
            await this.verifyAbandonOptions();
            await this.clickSimulateMetric();
            await driver.pause(PAUSES.LONG);
            if (browser.isAndroid) {
                await this.clickSimulateSendMetric();
            }
        } catch (error) {
            console.error('An error is present to try abandon the option', error);
            return;
        }
    }
}
export default new LendingSimulateScreen();
