import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import RemittancePayoutsLocator from '../../resources/locators/remesas-inbound/remittance-payouts.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import { TypeLocator } from '../../support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

class RemittanceHomeScreen extends BaseScreen {

    public get btnRemesas() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnRemittances,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnRemittances
        );
        return $(locator);
    }

    public get btnShare() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnShare,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnShare
        );
        return $(locator);
    }

    public get txtShareModal() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtShareModal,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtShareModal
        );
        return $(locator);
    }

    public get txtRemittancesTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtRemittancesTitle,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtRemittancesTitle
        );
        return $(locator);
    }

    public get btnHelp() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnHelp,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnHelp
        );
        return $(locator);
    }

    public get btnBack() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnBack,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnBack
        );
        return $(locator);
    }

    public get btnWantToReceive() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnWantToReceive,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnWantToReceive
        );
        return $(locator);
    }

    public get txtDollarAccount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtDollarAccount,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtDollarAccount
        );
        return $(locator);
    }

    public get btnMoreInfo() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnMoreInfo,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnMoreInfo
        );
        return $(locator);
    }

    public get txtAccountNumber() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtAccountNumber,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtAccountNumber
        );
        return $(locator);
    }

    public get tagDollars() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.tagDollars,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.tagDollars
        );
        return $(locator);
    }

    public get tagSoles() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.tagSoles,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.tagSoles
        );
        return $(locator);
    }

    public get btnShowDollars() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnShowDollars,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnShowDollars
        );
        return $(locator);
    }

    public get btnHideDollars() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.btnHideDollars,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.btnHideDollars
        );
        return $(locator);
    }

    public get txtDollarAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtDollarAmount,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtDollarAmount
        );
        return $(locator);
    }

    public async navigateToRemesas(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnRemesas,
            timeout,
            'Remesas button was not displayed'
        );
        await this.btnRemesas.click();
    }

    public async validateShareModal(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtShareModal,
            timeout,
            'Share modal was not displayed'
        );
        const modalText = await this.txtShareModal.getText();
        expect(modalText).toContain('Compartir texto');
    }

    public async validateRemesasSection(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtRemittancesTitle,
            timeout,
            'Remesas title was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnHelp,
            timeout,
            'Help button was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnBack,
            timeout,
            'Back button was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnWantToReceive,
            timeout,
            'Quiero recibir button was not displayed'
        );
    }

    public async validateUsdAccountField(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtDollarAccount,
            timeout,
            'USD account title was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnMoreInfo,
            timeout,
            'More information button was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtAccountNumber,
            timeout,
            'Account number was not displayed'
        );
    }

    public async validateAccountNumberFormat(): Promise<void> {
        const accountNumber = await this.txtAccountNumber.getText();
        const accountNumberPattern = /^\*+\d{4}$/;

        expect(accountNumber).toMatch(accountNumberPattern);
        expect(accountNumber).toContain('*');
        expect(accountNumber.length).toBeGreaterThan(4);
    }

    public async scrollAndValidateCurrencyTag(tagName: string): Promise<void> {
        const tag = tagName === 'Dólares' ? this.tagDollars : this.tagSoles;

        if (driver.isAndroid) {
            await this.gestureHelper.verticalScrollTextIntoView(tagName);
        } else {
            await this.gestureHelper.verticalScrollingToEnd();
        }

        await this.uiHelper.waitForElementDisplayedAndExpect(
            tag,
            timeout,
            `${tagName} tag was not displayed`
        );
        await tag.click();
    }

    public async clickShowDollars(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnShowDollars,
            timeout,
            'Show Dollars button was not displayed'
        );
        await this.btnShowDollars.click();
    }

    public async validateRemittanceInfoInDollars(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnHideDollars,
            timeout,
            'Hide Dollars button was not displayed after showing dollars'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtDollarAmount,
            timeout,
            'Dollar amount was not displayed'
        );

        const dollarAmountText = await this.txtDollarAmount.getText();
        const dollarAmountPattern = /^\$ \d+\.\d{2}$/;
        expect(dollarAmountText).toMatch(dollarAmountPattern);
    }

    private get txtReceiveTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   RemittancePayoutsLocator.remittancePayoutsLocatorsiOS.txtReceiveTitle,
            TypeLocator.ANDROID, RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid.txtReceiveTitle
        );
        return $(locator);
    }

    public async validateReceiveRemesasScreen(): Promise<void> {
        const checks = [
            { el: this.txtReceiveTitle, msg: '"Elige cómo recibir tu dinero" was not displayed' },
        ];
        for (const { el, msg } of checks) {
            await this.uiHelper.waitForElementDisplayedAndExpect(el, timeout, msg);
        }
    }
}

export default new RemittanceHomeScreen();
