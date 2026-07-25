import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

import TransactionalLimitsLocator from '../../resources/locators/nexus/transactional-limits.locator.json' with { type: 'json' };

class TransactionalLimitsScreen extends BaseScreen {

       
    private get android(): any {
        return TransactionalLimitsLocator.transactionalLimitsAndroid as any;
    }

    private get menuOptionTransactionalLimits() {
        return $(`android=${this.android.txtMenuOption}`);
    }

    async scrollToTransactionalLimitsMenuOption() {
        const maxSwipes = 8;

        for (let i = 0; i < maxSwipes; i++) {
            if (await this.menuOptionTransactionalLimits.isDisplayed()) return;

            await driver.performActions([{
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
                { type: 'pointerMove', duration: 0, x: 540, y: 1700 },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 200 },
                { type: 'pointerMove', duration: 600, x: 540, y: 700 },
                { type: 'pointerUp', button: 0 }
            ]
            }]);

            await driver.releaseActions();
            await driver.pause(300);
        }

        throw new Error('No Found "Transactionals Limits" after scrolling.');
    }

    async selectMenuOptionTransactionalLimits() {
        await this.scrollToTransactionalLimitsMenuOption();
        await this.menuOptionTransactionalLimits.click();
    }

    private get titleTransactionalLimits() {
        return $(`android=${this.android.txtTitle}`);
    }

    public get currentAmount() {
        return $(`android=${this.android.txtCurrentAmount}`);
    }
    
    public async getCurrentAmountText(): Promise<string> {
        await this.currentAmount.waitForDisplayed({ timeout: 15000 });
        const amount = await this.currentAmount.getText();

        console.log(`Current Limit: ${amount}`);
        return amount; 
    }

    private get btnCambiar() {
        return $(`android=${this.android.btnCambiar}`);
    }

    async waitForTransactionalLimitsScreen() {
        await this.titleTransactionalLimits.waitForDisplayed({ timeout: 15000 });
    }

    async clickCambiar() {
        await this.btnCambiar.waitForDisplayed({ timeout: 15000 });
        await this.btnCambiar.waitForEnabled({ timeout: 15000 });
        await this.btnCambiar.click();

        // Anchor of the next screen
        await this.txtChooseNewLimit.waitForDisplayed({ timeout: 15000 });
    }

    private get txtChooseNewLimit() {
        return $(`android=${this.android.txtChooseNewLimit}`);
    }

    async waitForChangeLimitScreen() {
        await this.txtChooseNewLimit.waitForDisplayed({ timeout: 15000 });
        await expect(this.txtChooseNewLimit).toBeDisplayed();
    }

    get currentLimitText() {
     return $('-android uiautomator:new UiSelector().textContains("Tu límite diario actual es")');
    }

    private get btnConfirmChange() {
        return $(`android=${this.android.btnConfirmChange}`);
    }

    async clickBtnChangeLimit() {
        await this.btnConfirmChange.waitForDisplayed({ timeout: 15000 });
        await this.btnConfirmChange.waitForEnabled({ timeout: 15000 });
        await this.btnConfirmChange.click();
    }

    private get txtOtpTitle() {
        return $(`android=${this.android.txtOtpTitle}`);
    }   

    private get btnContinuarOtp() {
        return $(`android=${this.android.btnContinuarOtp}`);
    }

    async waitForOtpScreen() {
        await this.txtOtpTitle.waitForDisplayed({ timeout: 15000 });
        await expect(this.txtOtpTitle).toBeDisplayed();
    }

    async continuarConOtp() {
        await this.btnContinuarOtp.waitForDisplayed({ timeout: 15000 });
        await this.btnContinuarOtp.waitForEnabled({ timeout: 15000 });
        await this.btnContinuarOtp.click();
    }

    private get txtSuccessTitle() {
        return $(`android=${this.android.txtSuccessTitle}`);
    }

    private get btnContinuarSuccess() {
        return $(`android=${this.android.btnContinuarSuccess}`);
    }

    private get txtLogoutPopupTitle() {
        return $(`android=${this.android.txtLogoutPopupTitle}`);
    }

    private get btnCerrarSesion() {
        return $(`android=${this.android.btnCerrarSesion}`);
    }

    async waitForSuccessChangeLimitScreen() {
        await this.txtSuccessTitle.waitForDisplayed({ timeout: 15000 });
        await expect(this.txtSuccessTitle).toBeDisplayed();
    }

    async continuarDesdeSuccess() {
        await this.btnContinuarSuccess.waitForDisplayed({ timeout: 15000 });
        await this.btnContinuarSuccess.waitForEnabled({ timeout: 15000 });
        await this.btnContinuarSuccess.click();
    }

    async waitForLogoutPopup() {
        await this.txtLogoutPopupTitle.waitForDisplayed({ timeout: 15000 });
        await expect(this.txtLogoutPopupTitle).toBeDisplayed();
    }

    async cerrarSesionDesdePopup() {
        await this.btnCerrarSesion.waitForDisplayed({ timeout: 15000 });
        await this.btnCerrarSesion.waitForEnabled({ timeout: 15000 });
        await this.btnCerrarSesion.click();
    }

    async tapLimitByValue(value: string) {
        const limitOption = $(
            `-android uiautomator:new UiSelector().text("${value}")`
        );

        await limitOption.waitForDisplayed({ timeout: 15000 });
        await limitOption.click();
    }

    private get btnVolverPopup() {
        return $(`android=${this.android.btnVolverBiometria}`);
    }

    private parseAmountToNumber(text: string): number {
        const match = text.match(/(\d[\d.,]*)/);
        if (!match) throw new Error(`The amount cannot be parsed: "${text}"`);

        const normalized = match[1].replace(/,/g, ''); 
        const value = Number.parseFloat(normalized);

        if (Number.isNaN(value)) throw new Error(`Invalid amount after parsing: "${text}" -> "${normalized}"`);
        return value;
    }

    async seleccionarLimiteSegunMontoActual() {
        const amountText = await this.getCurrentAmountText();
        const current = this.parseAmountToNumber(amountText);

        if (current === 500) {
            await this.tapLimitByValue('950');
            return { flow: 'BIOMETRIA', current };
        }

        if (current === 950) {
            await this.tapLimitByValue('500');
            return { flow: 'OTP', current };
        }

        if (current > 950) {
            await this.tapLimitByValue('950');
            return { flow: 'OTP', current };
        }

        throw new Error(`Current amount not covered: ${amountText}`);
    }


    private get biometricPopupAnyText() {
    return $(`-android uiautomator:new UiSelector()
        .className("android.widget.TextView")
        .textMatches(".*(Biometr(í|i)a|Digital|activar|huella).*")`);
    }

    async waitForBiometricPopup() {
        await this.biometricPopupAnyText.waitForDisplayed({ timeout: 15000 });
    }

    async salirDeBiometriaConBack() {
        if (await this.btnVolverPopup.isDisplayed().catch(() => false)) {
            await this.btnVolverPopup.click();
            return;
        }
        await driver.back();
    }

}

export default new TransactionalLimitsScreen();
