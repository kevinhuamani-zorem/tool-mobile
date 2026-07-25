import { $ } from '@wdio/globals';
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import YapeoNotificationsLocator from '@locators/nexus/quick-items/yapeo-notifications.locator.json' with { type: 'json' };
import LocatorFactory from '@utils/LocatorFactory.ts';
import { TypeLocator } from '@utils/Enums.ts';

class NotificationYapeoScreen extends BaseScreen {

    public get backButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.buttonBack,
            TypeLocator.ANDROID, YapeoNotificationsLocator.YapeoNotificationsAndroid.buttonBack
        );
        return $(locator);
    }

    public get txtMenuTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txtMenuTitle,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txtMenuTitle
        );
        return $(locator);
    }

    public get txtGetEmail() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txtGetEmail,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txtGetEmail
        );
        return $(locator);
    }

    public get btnChange() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.btnChange,
            TypeLocator.ANDROID, YapeoNotificationsLocator.YapeoNotificationsAndroid.btnChange
        );
        return $(locator);
    }

    public get txtChooseAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txtChooseAmount,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txtChooseAmount
        );
        return $(locator);
    }

    public get txt10balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txt10balance,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txt10balance
        );
        return $(locator);
    }

    public get txt50balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txt50balance,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txt50balance
        );
        return $(locator);
    }

    public get txt100balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txt100balance,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txt100balance
        );
        return $(locator);
    }

    public get txt500balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsIos.txt500balance,
            TypeLocator.XPATH, YapeoNotificationsLocator.YapeoNotificationsAndroid.txt500balance
        );
        return $(locator);
    }

    public async selectBalance(amount: string): Promise<void> {
        const getterByAmount = {
            '10': this.txt10balance,
            '50': this.txt50balance,
            '100': this.txt100balance,
            '500': this.txt500balance,
        } as const;

        if (!(amount in getterByAmount)) return;

        const element = getterByAmount[amount as keyof typeof getterByAmount];

        if (!element) return;
        if (!(await element.isExisting())) return;

        await element.click();
    }
    public get switchNotification() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoNotificationsLocator.YapeoNotificationsIos.btnSwitch,
            TypeLocator.ANDROID,
            YapeoNotificationsLocator.YapeoNotificationsAndroid.btnSwitch
        );

        return $(locator);
    }

    public get txtToastSuccess() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            YapeoNotificationsLocator.YapeoNotificationsIos.txtToastOnSuccess,
            TypeLocator.XPATH,
            YapeoNotificationsLocator.YapeoNotificationsAndroid.txtToastOnSuccess
        );

        return $(locator);
    }

    public async isNotificationSwitchEnabled(): Promise<boolean> {
        const checked = await this.switchNotification.getAttribute('checked');
        return checked === 'true';
    }

    public async enableNotificationsIfDisabled(amount: string = '10'): Promise<void> {
        const isEnabled = await this.isNotificationSwitchEnabled();

        if (!isEnabled) {
            await this.switchNotification.click();

            await this.uiHelper.waitForElementDisplayedAndExpect(
                this.txtChooseAmount,
                10000,
                'The choose amount bottom sheet was not displayed'
            );

            await this.selectBalance(amount);

            await browser.waitUntil(
                async () => await this.isNotificationSwitchEnabled(),
                {
                    timeout: 10000,
                    timeoutMsg: 'Notifications were not enabled'
                }
            );
        }
    }

    public async disableNotifications(): Promise<void> {
        const isEnabled = await this.isNotificationSwitchEnabled();

        if (isEnabled) {
            await this.switchNotification.click();

            await browser.waitUntil(
                async () => !(await this.isNotificationSwitchEnabled()),
                {
                    timeout: 10000,
                    timeoutMsg: 'Notifications were not disabled'
                }
            );
        }
    }

    public async clickChange() {
        await (await this.btnChange).click();
    }
}
export default new NotificationYapeoScreen();