import locators from '../../resources/locators/nexus/yape-hijos-data.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class YapeHijosDataScreen extends BaseScreen {
    get locator() {
        return driver.isAndroid
            ? locators.homeAndroid
            : locators.homeIos;
    }

    async validateScreenContent() {
        await $(this.locator.txtTitle).waitForDisplayed();
        await $(this.locator.txtSubtitle).waitForDisplayed();
        await $(this.locator.txtDeclaracionJurada).waitForDisplayed();
    }

    async enterChildAlias(alias: string) {
        const input = await $(this.locator.txtAliasHijo);

        await input.waitForDisplayed({ timeout: 10000 });
        await input.click();
        await input.setValue(alias);

        try {
            await driver.hideKeyboard();
        } catch {}

        await driver.pause(500);
    }

    async selectBirthDate() {
        const birthInput = await $(this.locator.txtBirthhijo);

        await birthInput.waitForDisplayed({ timeout: 10000 });

        try {
            await driver.hideKeyboard();
        } catch {}

        await driver.pause(500);

        const { x, y } = await birthInput.getLocation();
        const { width, height } = await birthInput.getSize();

        await driver.execute('mobile: longClickGesture', {
            x: Math.round(x + width / 2),
            y: Math.round(y + height / 2),
            duration: 500
        });

        const acceptButton = await $(this.locator.btnAceptarCalendar);

        await acceptButton.waitForDisplayed({
            timeout: 10000,
            timeoutMsg: 'Calendar was not opened'
        });

        await this.selectAvailableCalendarDay();

        await acceptButton.click();
    }

    async checkDeclaracion() {
        const checkbox = await $(this.locator.checkBoxDeclaracionJurada);

        await checkbox.waitForDisplayed({ timeout: 10000 });
        await checkbox.click();
    }

    async selectButton(buttonName: string) {
        const key = `btn${buttonName}` as keyof typeof this.locator;
        const selector = this.locator[key];

        if (!selector) {
            throw new Error(`No locator defined for button: ${buttonName}`);
        }

        const button = await $(selector);

        await button.waitForEnabled({ timeout: 10000 });
        await button.click();
    }

    private async selectAvailableCalendarDay(): Promise<void> {
        for (const candidateDay of this.getCandidateCalendarDays()) {
            const xpath = driver.isAndroid
                ? `//*[@text="${candidateDay}"]`
                : `//*[@label="${candidateDay}"]`;
            const day = await $(xpath);

            if (await day.isExisting()) {
                await day.waitForDisplayed({ timeout: 10000 });
                await day.click();
                return;
            }
        }

        throw new Error('No available calendar day was found');
    }

    private getCandidateCalendarDays(): string[] {
    const days: string[] = [];
    const start = 16;

    days.push(String(start));

    for (let offset = 1; offset <= 15; offset++) {
        const lower = start - offset;
        const upper = start + offset;

        if (lower >= 1) {
            days.push(String(lower));
        }

        if (upper <= 31) {
            days.push(String(upper));
        }
    }

    return days;
}
}

export default YapeHijosDataScreen;