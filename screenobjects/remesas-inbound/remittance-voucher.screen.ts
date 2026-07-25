import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import RemittanceVoucherLocator from '../../resources/locators/remesas-inbound/remittance-voucher.locator.json' with { type: 'json' };
import RemittancePayoutsLocator from '../../resources/locators/remesas-inbound/remittance-payouts.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import { TypeLocator } from '../../support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

type AmountPrefix = 'S/' | '$';

interface VoucherContext {
    amountPrefix: AmountPrefix;
    amountText: string;
    date: string;
    time: string;
}

class RemittanceVoucherScreen extends BaseScreen {
    private context: VoucherContext = {
        amountPrefix: 'S/',
        amountText: '',
        date: '',
        time: '',
    };

    private el(
        key: keyof typeof RemittanceVoucherLocator.remittanceVoucherLocatorsAndroid,
    ) {
        return $(
            LocatorFactory.getElement(
                TypeLocator.XPATH,
                RemittanceVoucherLocator.remittanceVoucherLocatorsiOS[key],
                TypeLocator.ANDROID,
                RemittanceVoucherLocator.remittanceVoucherLocatorsAndroid[key],
            ),
        );
    }

    private elPayouts(
        key: keyof typeof RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid,
    ) {
        return $(
            LocatorFactory.getElement(
                TypeLocator.XPATH,
                RemittancePayoutsLocator.remittancePayoutsLocatorsiOS[key],
                TypeLocator.ANDROID,
                RemittancePayoutsLocator.remittancePayoutsLocatorsAndroid[key],
            ),
        );
    }

    private get firstVoucherItem() {
        return this.el('firstVoucherItem');
    }
    private get firstVoucherAmountElement() {
        return this.el('firstVoucherAmount');
    }
    private get firstVoucherAmountUsd() {
        return this.el('firstVoucherAmountUsd');
    }
    private get firstVoucherDateTimeElement() {
        return this.el('firstVoucherDateTime');
    }
    private get tagDollars() {
        return this.elPayouts('tagDollars');
    }
    private get txtVoucherTitle() {
        return this.el('txtVoucherTitle');
    }
    private get btnVoucherShare() {
        return this.el('btnVoucherShare');
    }
    private get txtTransactionData() {
        return this.el('txtTransactionData');
    }
    private get txtViaLabel() {
        return this.el('txtViaLabel');
    }
    private get txtOperationNumber() {
        return this.el('txtOperationNumber');
    }
    private get btnYapearServicios() {
        return this.el('btnYapearServicios');
    }
    private get btnCambiarDolares() {
        return this.el('btnCambiarDolares');
    }
    private get txtDollarAccountLabel() {
        return this.el('txtDollarAccountLabel');
    }

    private voucherDate() {
        const locator = driver.isAndroid
            ? `//android.widget.TextView[@content-desc="${this.context.date}"]`
            : `//XCUIElementTypeStaticText[@name="${this.context.date}"]`;
        return $(locator);
    }

    private voucherTime() {
        const locator = driver.isAndroid
            ? `//android.widget.TextView[@content-desc="${this.context.time}"]`
            : `//XCUIElementTypeStaticText[@name="${this.context.time}"]`;
        return $(locator);
    }

    private voucherAmountElement() {
        const displayedAmount = this.context.amountText.replace(/\.00$/, '');
        const locator = driver.isAndroid
            ? `android=new UiSelector().text("${displayedAmount}")`
            : `//XCUIElementTypeStaticText[@name="${displayedAmount}"]`;
        return $(locator);
    }

    private parseVoucherContext(
        amountText: string,
        dateTimeText: string,
    ): void {
        const normalizedAmount = amountText?.trim() ?? '';
        this.context.amountText = normalizedAmount;
        this.context.amountPrefix = normalizedAmount.startsWith('S/')
            ? 'S/'
            : '$';

        this.context.date = '';
        this.context.time = '';

        if (!dateTimeText) {
            return;
        }

        const dashPattern = /\s[\u2013\u2014\u2212-]\s/;

        if (
            dateTimeText.startsWith('Hoy ') ||
            dateTimeText.startsWith('Ayer ')
        ) {
            const prefixLength = dateTimeText.startsWith('Hoy ') ? 4 : 5;
            const [rawTime] = dateTimeText
                .slice(prefixLength)
                .split(dashPattern);
            if (!rawTime) return;

            this.context.date = '';
            this.context.time = this.normalizeTime(rawTime.trim());
            return;
        }

        const [datePart, rawTime] = dateTimeText.split(dashPattern);
        if (!rawTime) return;

        this.context.date = datePart.trim();
        this.context.time = this.normalizeTime(rawTime.trim());
    }

    private normalizeTime(rawTime: string): string {
        const match = rawTime.match(/(\d{1,2}:\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)/i);
        if (!match) return '';
        const [hours, minutes] = match[1].split(':');
        const normalizedTime = `${hours.padStart(2, '0')}:${minutes}`;
        const period = match[2].toLowerCase()
             .replace(/\s+/g, '')
             .replace(/\./g, '');
        const normalizedPeriod = period === 'pm' ? 'p. m.' : 'a. m.';
        return `${normalizedTime} ${normalizedPeriod}`;
    }

    public async selectFirstVoucher(
        expectedPrefix?: AmountPrefix,
    ): Promise<void> {
        await this.gestureHelper.verticalScrollingToEnd();

        if (expectedPrefix === '$') {
            await this.tagDollars.waitForDisplayed({ timeout });
            await this.tagDollars.click();
        }

        const amountEl =
            expectedPrefix === '$'
                ? this.firstVoucherAmountUsd
                : this.firstVoucherAmountElement;

        await this.uiHelper.waitForElementDisplayedAndExpect(
            amountEl,
            timeout,
            `No voucher for "${expectedPrefix ?? 'S/'}" was found in the history`,
        );

        const [amountText, dateTimeText] = await Promise.all([
            amountEl.getText(),
            this.firstVoucherDateTimeElement.getText(),
        ]);

        this.parseVoucherContext(amountText, dateTimeText);

        await this.firstVoucherItem.scrollIntoView();
        await this.firstVoucherItem.click();
    }

    private async validateChecks(
        checks: Array<{ el: ChainablePromiseElement; msg: string }>,
    ): Promise<void> {
        for (const { el, msg } of checks) {
            await this.uiHelper.waitForElementDisplayedAndExpect(
                el,
                timeout,
                msg,
            );
        }
    }

    private async validateCommonElements(): Promise<void> {
        await this.validateChecks([
            {
                el: this.txtVoucherTitle,
                msg: '"¡Recibiste una remesa!" was not displayed',
            },
            { el: this.btnVoucherShare, msg: 'Share button was not displayed' },
            {
                el: this.txtTransactionData,
                msg: '"DATOS DE LA TRANSACCIÓN" was not displayed',
            },
            { el: this.txtViaLabel, msg: '"A través de" was not displayed' },
            {
                el: this.txtOperationNumber,
                msg: '"Nro. de operación" was not displayed',
            },
        ]);

        if (this.context.date) {
            await this.uiHelper.waitForElementDisplayedAndExpect(
                this.voucherDate(),
                timeout,
                `Date "${this.context.date}" was not displayed`,
            );
        }

        if (this.context.time) {
            await this.uiHelper.waitForElementDisplayedAndExpect(
                this.voucherTime(),
                timeout,
                `Time "${this.context.time}" was not displayed`,
            );
        }
    }

    private async validatePenElements(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnYapearServicios,
            timeout,
            '"Yapear Servicios" button was not displayed',
        );
    }

    private async validateUsdElements(): Promise<void> {
        await this.validateChecks([
            {
                el: this.btnCambiarDolares,
                msg: '"Cambiar Dólares" button was not displayed',
            },
            {
                el: this.txtDollarAccountLabel,
                msg: '"Nro. de cuenta en dólares:" was not displayed',
            },
        ]);
    }

    public async validateVoucherDetail(): Promise<void> {
        await this.validateCommonElements();

        if (this.context.amountPrefix === 'S/') {
            await this.validatePenElements();
            return;
        }

        await this.validateUsdElements();
    }

    public async validateVoucherAmount(
        expectedPrefix: AmountPrefix,
    ): Promise<void> {
        expect(this.context.amountPrefix).toBe(expectedPrefix);

        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.voucherAmountElement(),
            timeout,
            `Amount "${this.context.amountText}" was not displayed on voucher`,
        );
    }
}

export default new RemittanceVoucherScreen();
