import locators from '../../resources/locators/nexus/yape-hijos-info.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class YapeHijosInfoScreen extends BaseScreen {

  get locator() {
    return driver.isAndroid
      ? locators.homeAndroid
      : locators.homeIos;
  }

  async validateScreenContent() {
    await $(this.locator.txtTitle).waitForDisplayed();
    await $(this.locator.txtSubtitle).waitForDisplayed();
    await $(this.locator.txtOption1).waitForDisplayed();
    await $(this.locator.txtOption2).waitForDisplayed();
    await $(this.locator.txtOption3).waitForDisplayed();
  }

  async selectButton(buttonName: string) {
    const buttonMap = {
        Empezar: this.locator.btnEmpezar,
        Retroceder: this.locator.btnRetroceder
    } as const;
    const selector = buttonMap[buttonName as keyof typeof buttonMap];
    if (!selector) {
        throw new Error(`No locator defined for button: ${buttonName}`);
    }
    const button = await $(
        `android=new UiSelector().descriptionContains("${selector}")`
    );
    await button.waitForDisplayed({ timeout: 10000 });
    await button.click();
}
}
export default YapeHijosInfoScreen;