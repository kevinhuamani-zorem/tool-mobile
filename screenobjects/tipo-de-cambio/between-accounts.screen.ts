import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@utils/LocatorFactory.ts';
import LocatorBetweenAccounts from '@locators/tipo-de-cambio/between-accounts.locator.json' with { type: 'json'};
import { TypeLocator } from '@utils/Enums.ts';
import { ConstantsExchangeRate } from '@utils/constants-tipo-de-cambio.ts';
import { validateElementWithRetries } from '@support/utils/Utils.ts';

const ShortcutLocators = {
    HOME_CHANGE_DOLLARS: 'btnHomeChangeDollars',
    VIEW_ALL: 'btnViewAll',
    CHANGE_DOLLARS_ALT: 'btnChangeDollarsAlt',
} as const;

type ShortcutLocatorKey = typeof ShortcutLocators[keyof typeof ShortcutLocators];

// WIP: selectores iOS pendientes de mapeo
class BetweenAccountsScreen extends BaseScreen {
    private formatToTwoDecimals(value: number): string {
        return value.toFixed(2);
    }

    public get btnHomeChangeDollars() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnHomeChangeDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnHomeChangeDollars);
    }

    public get btnChangeDollarsAlt() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnChangeDollarsAlt,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnChangeDollarsAlt);
    }

    public get btnHomeTdcChangeDollars() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnHomeTdcChangeDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnHomeTdcChangeDollars);
    }

    public get btnContinue() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnContinue,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnContinue);
    }

    public get txtIfYouChange() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtIfYouChange,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtIfYouChange);
    }

    public get txtYouWillReceive() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtYouWillReceive,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtYouWillReceive);
    }

    public get tabDollar() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.tabDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.tabDollars);
    }

    public get btnConfirmTransferBetweenAccounts() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnConfirmTransferBetweenAccounts,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnConfirmTransferBetweenAccounts);
    }

    public get btnLater() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnLater,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnLater);
    }

    public get btnSkip() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnSkip,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnSkip);
    }

    public get btnTryLater() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnTryLater,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnTryLater);
    }

    public get txtWeAreWorking() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtWeAreWorking,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtWeAreWorking);
    }

    public get btnGoHome() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnGoHome,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnGoHome);
    }

    public get btnUnderstood() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnUnderstood,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnUnderstood);
    }

    public get btnViewAll() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnViewAll,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnViewAll);
    }

    public get btnViewMore(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnViewMore,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnViewMore);
    }

    public get btnContinueChangeDollars() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnContinueChangeDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnContinueChangeDollars);
    }

    public get txtDuplicate() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtDuplicate,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtDuplicate);
    }

    public get btnClose() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnClose,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnClose);
    }

    public get inputSearchShortcut() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.inputSearchShortcut,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.inputSearchShortcut);
    }

    public get txtTitleExchangeRateHome() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtTitleExchangeRateHome,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtTitleExchangeRateHome);
    }

    public get btnDollarFound(){
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnDollarFound,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnDollarFound);
    }

    public get btnDeleteText() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnDelete,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.btnDelete);
    }

    public get btnAmountReady() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.btnReady,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.btnReady);
    }

    public get txtReceiveAmount() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtReceiveAmount,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtReceiveAmount);
    }

    public get txtExchangeAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtExchangeAmount,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtExchangeAmount);
    }

    public get txtGoToDollars() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtGoToDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtGoToDollars);
    }

    public get txtMovementsHomeExchangeRateDollars() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtMovementsHomeExchangeRateDollars,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtMovementsHomeExchangeRateDollars);
    }

    public get txtMovementsHomeExchangeRateSoles() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtMovementsHomeExchangeRateSoles,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtMovementsHomeExchangeRateSoles);
    }

    public get tabSoles() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.tabSoles,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.tabSoles);
    }

    public get txtTitleReceivedMoney() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtTitleReceivedMoney,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.txtTitleReceivedMoney);
    }

    public get txtExchangeRateSimulator() {
        return LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtExchangeRateSimulator,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.txtExchangeRateSimulator);
    }
    
    public get txtCardBlockedError() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtCardBlockedError,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtCardBlockedError);
    }

    public get txtCardBlockedErrorMessage() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtCardBlockedErrorMessage,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtCardBlockedErrorMessage);
    }

    public get btnYapear() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.btnYapear,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.btnYapear);
    }

    public get txtDollarBalanceErrorTitle() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtDollarBalanceErrorTitle,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtDollarBalanceErrorTitle);
    }

    public get txtDollarBalanceErrorMessage() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtDollarBalanceErrorMessage,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtDollarBalanceErrorMessage);
    }

    public get txtGoHomeTdc() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsIOS.txtGoHomeTdc,
            TypeLocator.XPATH, LocatorBetweenAccounts.betweenAccountsAndroid.txtGoHomeTdc);
    }

    public async enterChangeDollars() {
        await this.uiHelper.interactWithElement(this.btnHomeChangeDollars, 'click');
    }

    public async enterChangeDollarsAlt() {
        await this.uiHelper.interactWithElement(this.btnChangeDollarsAlt, 'click');
    }

    public async enterHomeChangeDollars() {
        await this.uiHelper.interactWithElement(this.btnHomeTdcChangeDollars, 'click');
    }

    public async continueChangeDollars() {
        await this.uiHelper.interactWithElement(this.btnContinue, 'click');
    }

    public async reloadExchangeRate() {
        this.gestureHelper.reloaded();
    }

    private async setAmountField(operation: string, amount: string): Promise<void> {
        try {
            switch (operation) {
            case ConstantsExchangeRate.I_WANT_SOLES_IF_YOU_EXCHANGE:
            case ConstantsExchangeRate.I_WANT_DOLLARS_IF_YOU_EXCHANGE:
                if (driver.isIOS) {
                    await this.clearIfYouChangeInput();
                }
                await this.uiHelper.interactWithElement(this.txtIfYouChange, 'setValue', amount);
                if (driver.isIOS){
                    await this.uiHelper.interactWithElement(this.btnAmountReady, 'click');
                }
                break;
            case ConstantsExchangeRate.I_WANT_SOLES_YOU_WILL_RECEIVE:
            case ConstantsExchangeRate.I_WANT_DOLLARS_YOU_WILL_RECEIVE:
                if (driver.isIOS) {
                    await this.clearYouWillReceiveInput();
                }
                await this.uiHelper.interactWithElement(this.txtYouWillReceive, 'setValue', amount);
                if (driver.isIOS){
                    await this.uiHelper.interactWithElement(this.btnAmountReady, 'click');
                }
                break;
            default:
                console.log('No exchange rate found');
            }
        } catch (error) {
            console.error(`Error setting the amount for the transaction "${operation}":`, error);
        }
    }

    public async dollarAmount(tab: string, operation: string, amount: string): Promise<void> {
        try {
            switch (tab) {
            case ConstantsExchangeRate.I_WANT_SOLES:
                await this.setAmountField(operation, amount);
                break;
            case ConstantsExchangeRate.I_WANT_DOLLARS:
                await this.uiHelper.interactWithElement(this.tabDollar, 'click');
                await this.setAmountField(operation, amount);
                break;
            default:
                console.log('ERROR: tab not recognized');
            }
        } catch (error) {
            console.error(`Error in dollarAmount with tab "${tab}" and operation "${operation}":`, error);
        }
    }

    public async waitBtnLater() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnLater);
    }

    public async waitBtnSkip() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnSkip);
    }

    public async waitBtnTryLater() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnTryLater);
    }

    public async validateMessageError() {
        await this.uiHelper.checkErrorMessageAndClickIfMatched(this.txtWeAreWorking, ConstantsExchangeRate.ERROR_TEXT, this.btnGoHome);
    }

    public async showErrorMessageForWinstate() {
        await this.uiHelper.checkErrorMessageAndClickIfMatched(this.txtWeAreWorking, ConstantsExchangeRate.ERROR_TEXT, this.btnUnderstood);
    }

    public async confirmTransferBetweenAccounts() {
        await this.uiHelper.interactWithElement(this.btnConfirmTransferBetweenAccounts, 'click');
    }

    public async viewAll(){
        await this.uiHelper.interactWithElement(this.btnViewAll, 'click');
    }

    public async viewMore(){
        await this.uiHelper.interactWithElement(this.btnViewMore, 'click');
    }

    public async continue() {
        await this.uiHelper.waitForDisplayedAndClick(this.btnContinueChangeDollars);
    }

    public async duplicateValue() {
        await this.uiHelper.waitForDisplayedAndClick(this.txtDuplicate);
    }

    public async close() {
        await this.uiHelper.interactWithElement(this.btnClose, 'click');
    }

    private async checkIfShortcutIsDisplayed(
        locatorProperty: ShortcutLocatorKey,
        errorMessage: string,
        notSupportedMessage: string
    ): Promise<boolean> {
        try {
            const locator = browser.isAndroid
                ? LocatorBetweenAccounts.betweenAccountsAndroid[locatorProperty]
                : browser.isIOS
                ? LocatorBetweenAccounts.betweenAccountsIOS[locatorProperty]
                : null;

            if (!locator) {
                console.log(notSupportedMessage);
                return false;
            }
            return await this.uiHelper.waitForElementExist(locator, false, 5000);
        } catch (error) {
            console.error(errorMessage, error);
            return false;
        }
    }
    public async checkIfExchangeRateStartsWithShortcut(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            ShortcutLocators.HOME_CHANGE_DOLLARS,
            'Error verifying the element to select dollars shortcut:',
            'Exchange rate shortcut check not supported on this platform'
        );
    }
    public async checkIfViewAllShortcutIsDisplayed(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            ShortcutLocators.VIEW_ALL,
            'Error verifying the element to select view all:',
            'View all button check not supported on this platform'
        );
    }

    public async checkIfChangeDollarsAltShortcutIsDisplayed(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            ShortcutLocators.CHANGE_DOLLARS_ALT,
            'Error verifying the element to select dollars alt shortcut:',
            'Exchange rate alt shortcut check not supported on this platform'
        );
    }

    public async touchCoordinates(x: number, y: number){
        await this.gestureHelper.touch(x, y);
    }

    public async enterWordToSearch(word: string) {
        await this.uiHelper.interactWithElement(this.inputSearchShortcut, 'setValue', word);
    }

    public async showExchangeRateHome(maxRetries: number = 3, retryDelay: number = 2000) {
        const selector = LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtTitleExchangeRateHome,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.txtTitleExchangeRateHome);

        const isReady = await validateElementWithRetries(() => $(selector), maxRetries, retryDelay);

        if (isReady) {
            console.log('The \'Yape dólares\' title is visible and enabled.');
        } else {
            throw new Error('The \'Yape dólares\' title was not found after several attempts.');
        }

    }

    public async clickDollarFound(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnDollarFound, 'click');
    }

    public async clickDeleteBtn(): Promise<void> {
        await this.uiHelper.interactWithElement(this.btnDeleteText, 'click');
    }

    private async clearInputField(inputElement: ChainablePromiseElement): Promise<void> {
        await inputElement.click();
        const text = await inputElement.getText();
        const deleteCount = text.length || ConstantsExchangeRate.DEFAULT_DELETE_COUNT;

        for (let i = 0; i < deleteCount; i++) {
            await this.uiHelper.interactWithElement(this.btnDeleteText, 'click');
        }
    }

    public async clearIfYouChangeInput(): Promise<void> {
        await this.clearInputField($(this.txtIfYouChange));
    }

    public async clearYouWillReceiveInput(): Promise<void> {
        await this.clearInputField($(this.txtYouWillReceive));
    }

    public async receiveAmount(): Promise<string> {
        const winstateReceiveAmount = await this.uiHelper.getElementText(this.txtReceiveAmount);
        return winstateReceiveAmount;
    }

    public async exchangeAmount(): Promise<string> {
        const winstateExchangeAmount = await this.uiHelper.getElementText(this.txtExchangeAmount);
        return winstateExchangeAmount;
    }

    public async goToDollars() {
        await this.uiHelper.interactWithElement(this.txtGoToDollars, 'click');
    }

    public async movementsHomeExchangeRateDollars(): Promise<string> {
        return await this.uiHelper.getElementText(this.txtMovementsHomeExchangeRateDollars);
    }

    public async movementsHomeExchangeRateSoles(): Promise<string> {
        return await this.uiHelper.getElementText(this.txtMovementsHomeExchangeRateSoles);
    }

    public async solesTabMovements() {
        await this.uiHelper.interactWithElement(this.tabSoles, 'click');
    }

    public async currency(): Promise<string> {
        const currency = await this.uiHelper.getElementText(this.txtExchangeAmount, 'USD');
        return currency.split(' ')[0];
    }

    public async validationAmounts(
        currency: string,
        winstateExchangeAmount: string,
        winstateReceiveAmount: string,
        movementsInDollars: string,
        movementsInSoles: string
    ): Promise<void> {
        const comparisons = currency === ConstantsExchangeRate.CURRENCY_USD
            ? [
                { current: winstateExchangeAmount, expected: movementsInDollars, description: 'Exchange USD' },
                { current: winstateReceiveAmount, expected: movementsInSoles, description: 'Receive PEN' }
            ]
            : [
                { current: winstateExchangeAmount, expected: movementsInSoles, description: 'Exchange PEN' },
                { current: winstateReceiveAmount, expected: movementsInDollars, description: 'Receive USD' }
            ];
        for (const { current, expected, description } of comparisons) {
            if (driver.isIOS) {
                expect(this.formatToTwoDecimals(parseFloat(current))).toEqual(this.formatToTwoDecimals(parseFloat(expected)));
            } else {
                expect(current).toEqual(expected);
            }
            console.log(`Successful validation: ${description}`);
        }
    }

    public async showExchangeRateWinstate(maxRetries: number = 2, retryDelay: number = 2000) {
        const selector = LocatorFactory.getElement(TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsIOS.txtTitleReceivedMoney,
            TypeLocator.ID, LocatorBetweenAccounts.betweenAccountsAndroid.txtTitleReceivedMoney);

        const isReady = await validateElementWithRetries(() => $(selector), maxRetries, retryDelay);

        if (isReady) {
            console.log('The \'¡Recibiste!\' title is visible and enabled.');
        } else {
            throw new Error('The \'¡Recibiste!\' title was not found after several attempts.');
        }
    }

    public async getValueExchangeRateSimulator(): Promise<string> {
        const exchangeRateValue = await this.uiHelper.getElementText(this.txtExchangeRateSimulator);
        const parts = exchangeRateValue.split(' ');
        const rateValue = parts.length > 3 ? parts[3] : '';
        return rateValue;
    }


    public async showBlockedCardError(
        title: string,
        message: string,
    ): Promise<void> {
        await this.uiHelper.validateTextPair(
            this.txtCardBlockedError,
            this.txtCardBlockedErrorMessage,
            title,
            message,
        );
    }

    public async showInsufficientFundsError(
        title: string,
        message: string,
    ): Promise<void> {
        await this.uiHelper.validateTextPair(
            this.txtDollarBalanceErrorTitle,
            this.txtDollarBalanceErrorMessage,
            title,
            message,
        );
    }

    public async btnGoToYapeHome(): Promise<void> {
        await this.uiHelper.waitForElement(this.btnGoHome);
        await this.uiHelper.interactWithElement(this.btnGoHome, 'click');
    }

    public async txtGoToHomeTdc(): Promise<void> {
        await this.uiHelper.waitForElement(this.txtGoHomeTdc);
        await this.uiHelper.interactWithElement(this.txtGoHomeTdc, 'click');
    }

    public async yapeHomeScreen(): Promise<void> {
        await this.uiHelper.waitForElementToBeEnabled(this.btnYapear);
    }

    public async yapeHomeTdcScreen(): Promise<void> {
        await this.uiHelper.waitForElementToBeEnabled(this.btnHomeTdcChangeDollars);
    }
}
export default new BetweenAccountsScreen();
