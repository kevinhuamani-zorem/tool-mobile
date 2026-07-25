import locators from '../../resources/locators/nexus/yape-hijos-account.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class YapeHijosAccountsScreen extends BaseScreen {

  get locator() {
    return driver.isAndroid
      ? locators.homeAndroid
      : locators.homeIos;
  }

  async validateScreenContent() {
    await $(this.locator.txtTitle).waitForDisplayed();
    await $(this.locator.txtSubtitle).waitForDisplayed();
  }

  async selectMigratableAccount() {
  await this.validateScreenContent();

  const radio = await $(this.locator.rbtnFirstAccount);
  await radio.waitForDisplayed({ timeout: 10000 });
  await radio.click();

  const continueButton = await $(this.locator.btnContinuar);
  await continueButton.waitForEnabled({ timeout: 10000 });
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
}
export default YapeHijosAccountsScreen;