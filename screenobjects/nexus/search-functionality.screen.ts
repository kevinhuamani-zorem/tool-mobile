import { $ } from '@wdio/globals';
import { expect } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import SearchLocator from '../../resources/locators/nexus/quick-items/search-functionality.locator.json' with { type: 'json' };
import { ConstantsSearchRecommendation } from 'support/utils/constants-search-recommendations.ts'
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

class SearchScreen extends BaseScreen {

  private timeout: number = getTimeoutFromEnv();

  private get searchInput() {
    const locator = LocatorFactory.getElement(
      TypeLocator.XPATH, SearchLocator.searchIos.searchInput,
      TypeLocator.ANDROID, SearchLocator.searchAndroid.searchInput
    );
    return $(locator);
  }

  private get recommendedYapearServices() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.yapearServiceBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.yapearServiceBtn
      );
      return $(locator);
    }

    private get recommendedApprovePurchases() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.approveCompraBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.approveCompraBtn
      );
      return $(locator);
    }

    private get recommendedPromos() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.promosBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.promosBtn
      );
      return $(locator);
    }

    private get recommendedTickets() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.entradasBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.entradasBtn
      );
      return $(locator);
    }

    private get recommendedStore() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.shopBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.shopBtn
      );
      return $(locator);
    }

    private get recommendedGaming() {
      const locator = LocatorFactory.getElement(
        TypeLocator.XPATH, SearchLocator.searchIos.gamingBtn,
        TypeLocator.XPATH, SearchLocator.searchAndroid.gamingBtn
      );
      return $(locator);
    }
  


  async validateRecommendedOrder() {
    
    const elements = [
      this.recommendedYapearServices,
      this.recommendedApprovePurchases,
      this.recommendedPromos,
      this.recommendedTickets,
      this.recommendedStore,
      this.recommendedGaming
    ];


    for (const [i, el] of elements.entries()) {
      await this.uiHelper.waitForElementDisplayedAndExpect(
        el,this.timeout,
        `The recommended item at position ${i} was not displayed`
      );
    }
    const texts: string[] = [];
    for (const el of elements) {
      
      texts.push(await el.getText());
    }

    expect(texts).toEqual(ConstantsSearchRecommendation.ORDER);
  }



  async typeSearch(text: string) {
    await this.searchInput.waitForDisplayed({ timeout: 15000 });

    await this.searchInput.click();
    await this.searchInput.clearValue();
    await this.searchInput.setValue(text);

    await driver.pressKeyCode(66); // KEYCODE_ENTER

    try { await driver.hideKeyboard(); } catch (e) {}
  }

  private xpathTextLiteral(text: string): string {

    if (!text.includes(`'`)) return `'${text}'`;

    if (!text.includes(`"`)) return `"${text}"`;

    const parts = text.split(`'`).map(p => `'${p}'`);
    return `concat(${parts.join(`, "'", `)})`;
  }

  async validateResultIsPresent(label: string) {
    const safeLabel = this.xpathTextLiteral(label);


    const androidXpath =
      `(//android.widget.TextView[@text=${safeLabel} or contains(@text, ${safeLabel})])[1]`;

    const iosXpath =
      `//XCUIElementTypeStaticText[@name=${safeLabel} or @label=${safeLabel} or @value=${safeLabel}]`;

    const locator = LocatorFactory.getElement(
      TypeLocator.XPATH, iosXpath,
      TypeLocator.XPATH, androidXpath
    );

    const element = $(locator);

    await element.waitForExist({ timeout: 15000 });
    await element.waitForDisplayed({ timeout: 15000 });

    await expect(element).toBeDisplayed();
  }

  async searchEachFunctionality(functionalities: string[]) {
    for (const name of functionalities) {
      await this.typeSearch(name);
      await this.validateResultIsPresent(name);
    }
  }
}

export default new SearchScreen();