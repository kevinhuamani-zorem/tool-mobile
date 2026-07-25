import LocatorFactory from "../../../support/utils/LocatorFactory.ts";
import BaseScreen from "../../commons/base.screen.ts";
import { $ } from '@wdio/globals';
import LocatorBalance from "../../../resources/locators/backfunds/balance.locator.json" with { type: "json" };
import { TypeLocator } from "../../../support/utils/Enums.ts";

class BalanceScreen extends BaseScreen {
    // Métodos centralizados para obtener locators
    public getBtnShowBalance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, LocatorBalance.balanceIos.btnMostrarSaldo,
            TypeLocator.ANDROID, LocatorBalance.balanceAndroid.btnMostrarSaldo
        );
        return $(locator);
    }

    public getBtnHideBalance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, LocatorBalance.balanceIos.btnOcultarSaldo,
            TypeLocator.ANDROID, LocatorBalance.balanceAndroid.btnOcultarSaldo
        );
        return $(locator);
    }

    public getTxtBalance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, LocatorBalance.balanceIos.txtBalance,
            TypeLocator.XPATH, LocatorBalance.balanceAndroid.txtBalance
        );
        return $(locator);
    }
    // Helper privado para esperar y validar visibilidad
    private async waitForVisibility(elementPromise: ReturnType<typeof $>, shouldBeVisible: boolean, timeout = 10000) {
        const element = await elementPromise;
        if (shouldBeVisible) {
            await element.waitForExist({ timeout });
            await element.waitForDisplayed({ timeout });
            await expect(element).toBeDisplayed();
        } else {
            await element.waitForDisplayed({ timeout, reverse: true });
            await expect(element).not.toBeDisplayed();
        }
    }

    // Acciones usando los métodos centralizados
    public async pressButtonShowBalance() {
        await this.waitForVisibility(this.getBtnShowBalance(), true);
        const btnShowBalance = await this.getBtnShowBalance();
        await btnShowBalance.click();
    }

    public async ShowBalance() {
        await this.waitForVisibility(this.getTxtBalance(), true);
    }

    public async pressButtonHideBalance() {
        await this.waitForVisibility(this.getBtnHideBalance(), true);
        const btnHideBalance = await this.getBtnHideBalance();
        await btnHideBalance.click();
    }

    public async HideBalance() {
        await this.waitForVisibility(this.getTxtBalance(), false);
    }

    public async NoShowBalance() {
        await this.waitForVisibility(this.getBtnShowBalance(), false);
    }
}

export default new BalanceScreen();
