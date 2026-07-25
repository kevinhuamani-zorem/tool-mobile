import { $ } from '@wdio/globals';
import BaseScreen from 'screenobjects/commons/base.screen.ts';
import MyDataLocator from '@locators/nexus/quick-items/my-data.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

class MyDataScreen extends BaseScreen {

    public get backButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MyDataLocator.myDataIos.backButton,
            TypeLocator.ANDROID,
            MyDataLocator.myDataAndroid.backButton
        );
        return $(locator);
    }
    public get txtMenuTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MyDataLocator.myDataIos.txtMenuTitle,
            TypeLocator.ANDROID,
            MyDataLocator.myDataAndroid.txtMenuTitle
        );

        return $(locator);
    }
    public get eyeButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MyDataLocator.myDataIos.eyeButton,
            TypeLocator.ANDROID,
            MyDataLocator.myDataAndroid.eyeButton
        );
        return $(locator);
    }
    public txtDynamicItem(defaultLabel: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            `//XCUIElementTypeStaticText[@name="${defaultLabel}"]`,
            TypeLocator.ANDROID,
            `new UiSelector().text("${defaultLabel}")`
        );
        return $(locator);
    }
    public get txtEmail() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MyDataLocator.myDataIos.txtEmail,
            TypeLocator.ANDROID,
            MyDataLocator.myDataAndroid.txtEmail
        );
        return $(locator);
    }
    public async getDisplayedEmail() {
        await (await this.txtEmail).waitForDisplayed({ timeout: 10000 });
        return await this.txtEmail.getText();
    }
    public async goBack() {
        await (await this.backButton).waitForDisplayed({ timeout: 10000 });
        await this.backButton.click();
    }
    public async clickEyeButton() {
        await (await this.eyeButton).waitForDisplayed({ timeout: 10000 });
        await this.eyeButton.click();
    }
}
export default new MyDataScreen();