
import { $ } from '@wdio/globals';
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import YapeoHighConfirmationLocator from '@resources/locators/nexus/quick-items/yapeo-high-confirmation.locator.json' with { type: 'json' };
import LocatorFactory from '@utils/LocatorFactory.ts';
import { TypeLocator } from '@utils/Enums.ts';
import { getTimeoutFromEnv } from '@utils/Utils.ts';

const timeout: number = getTimeoutFromEnv() || 10000;

class YapeoHighConfirmation extends BaseScreen {
    public get txtTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos.txtMenuTitle,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid
                .txtMenuTitle,
        );
        return $(locator);
    }

    public get txtScreenDesc() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos
                .txtScreenDescription,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid
                .txtScreenDescription,
        );
        return $(locator);
    }

    public get txtActivateConfirmation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos
                .txtActivateHighYapeoConfirmation,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid
                .txtActivateHighYapeoConfirmation,
        );
        return $(locator);
    }

    public get btnSwitch() {
    const locator = LocatorFactory.getElement(
        TypeLocator.XPATH,
        YapeoHighConfirmationLocator.YapeoHighConfirmationIos.switchButton,
        TypeLocator.ANDROID,
        YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid.switchButton
    );
    return $(locator);
}

    public get editTextAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos
                .editTextAmount,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid
                .editTextAmount,
        );
        return $(locator);
    }

    public get btnSaveChanges() {
    const locator = LocatorFactory.getElement(
        TypeLocator.XPATH,
        YapeoHighConfirmationLocator.YapeoHighConfirmationIos.btnSaveChanges,
        TypeLocator.ANDROID,
        YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid.btnSaveChanges
    );

    return $(locator);
}
public async saveChanges(): Promise<void> {
    await browser.waitUntil(
        async () => {
            const exists = await this.btnSaveChanges.isExisting();

            if (!exists) return false;

            return await this.btnSaveChanges.isEnabled();
        },
        {
            timeout,
            timeoutMsg: 'Save changes button was not enabled'
        }
    );

    await this.btnSaveChanges.click();
}

    public get btnBack() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos.backButton,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid
                .buttonBack,
        );
        return $(locator);
    }

    public async pressSwitch() {
        await (await this.btnSwitch).click();
    }

    public async configureHighYapeoAmount(amount: string): Promise<void> {
        await this.editTextAmount.waitForDisplayed({ timeout });
        await this.editTextAmount.clearValue();
        await this.editTextAmount.setValue(amount);
        await this.btnSaveChanges.waitForDisplayed({ timeout });
        await this.btnSaveChanges.click();
    }

    public async goBack(): Promise<void> {
        await this.btnBack.waitForDisplayed({ timeout });
        await this.btnBack.click();
    }
    public get txtToastSuccess() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationIos.txtToastOnSuccess,
            TypeLocator.XPATH,
            YapeoHighConfirmationLocator.YapeoHighConfirmationAndroid.txtToastOnSuccess
        );

        return $(locator);
    }

    public async isHighConfirmationEnabled(): Promise<boolean> {
    const checked = await this.btnSwitch.getAttribute('checked');

    return checked === 'true';
}

    public async enableIfDisabled(amount: string = '500'): Promise<void> {
    const isEnabled = await this.isHighConfirmationEnabled();

    if (isEnabled) return;

    await this.pressSwitch();

    await this.editTextAmount.waitForDisplayed({ timeout });
    await this.editTextAmount.clearValue();
    await this.editTextAmount.setValue(amount);

    await this.saveChanges();

    await this.txtToastSuccess.waitForDisplayed({ timeout });
}

public async disableIfEnabled(): Promise<void> {
    const isEnabled = await this.isHighConfirmationEnabled();

    if (!isEnabled) return;

    await this.pressSwitch();

    await this.saveChanges();

    await this.txtToastSuccess.waitForDisplayed({ timeout });
}
}

export default new YapeoHighConfirmation();