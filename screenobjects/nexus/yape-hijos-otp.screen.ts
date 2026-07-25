import locators from '../../resources/locators/nexus/yape-hijos-otp.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class OtpScreen extends BaseScreen {

    get locator() {
        return driver.isAndroid
            ? locators.homeAndroid
            : locators.homeIos;
    }

    async validateScreenContent() {
        await $(this.locator.txtTitle).waitForDisplayed();
    }
    async enterOtpCode() {
        const otpInputs = [
            $(this.locator.txt1),
            $(this.locator.txt2),
            $(this.locator.txt3),
            $(this.locator.txt4),
            $(this.locator.txt5),
            $(this.locator.txt6)
        ];

        for (const input of otpInputs) {
            await input.waitForDisplayed({ timeout: 10000 });

            await browser.waitUntil(
                async () => {
                    const value = await input.getText();
                    return value.trim() !== '';
                },
                {
                    timeout: 15000,
                    timeoutMsg: 'OTP no se autocompletó'
                }
            );
        }
    }

    async selectButton(buttonName: string) {
        const key = `btn${buttonName}` as keyof typeof this.locator;
        const locator = this.locator[key];

        if (!locator) {
            throw new Error(`No existe locator para el botón: ${key}`);
        }

        const button = await $(locator);
        await button.waitForEnabled({ timeout: 10000 });
        await button.click();
    }
}

export default OtpScreen;