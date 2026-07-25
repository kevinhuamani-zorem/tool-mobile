import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import { TypeLocator } from '../../support/utils/Enums.js';

import HomeLocator from '../../resources/locators/nexus/home.locator.json' with { type: 'json' };
import SalesDayLocator from '../../resources/locators/nexus/sales-day.locator.json' with { type: 'json' };

class SalesDayScreen extends BaseScreen {
  private get homeAndroid(): any {
    return HomeLocator.homeAndroid as any;
  }

  private get btnSeeMoreOrSeeAll() {
    const homeAndroid = this.homeAndroid;

    const locatorSeeMore = `android=new UiSelector().description("${homeAndroid.btnVerMas}")`;
    const elSeeMore = $(locatorSeeMore);
    
    const locatorSeeAll = `android=new UiSelector().description("${homeAndroid.btnVerTodo}")`;
    const elSeeAll = $(locatorSeeAll);

    return { elSeeMore, elSeeAll };
 } 

  private get btnDailySales() {
    const locator = LocatorFactory.getElement(
      TypeLocator.XPATH,
      HomeLocator.homeIos.btnVerVentasDelDia ?? '',
      TypeLocator.ANDROID,
      `new UiSelector().description("${this.homeAndroid.btnVerVentasDelDia}")`
    );
    return $(locator);
  }

  private get txtBusinessAssistant() {
    const locator = LocatorFactory.getElement(
      TypeLocator.XPATH,
      SalesDayLocator.ventasDelDiaIos.txtAyudanteDeNegocio,
      TypeLocator.ANDROID,
      SalesDayLocator.ventasDelDiaAndroid.txtAyudanteDeNegocio
    );
    return $(locator);
  }

  async clickSeeMore() {
    const { elSeeMore, elSeeAll } = this.btnSeeMoreOrSeeAll;

    const seeMoreVisible = await elSeeMore.waitForDisplayed({ timeout: 4000 }).catch(() => false);

    const target = seeMoreVisible ? elSeeMore : elSeeAll;

    await target.waitForDisplayed({ timeout: 15000 });
    await target.waitForEnabled({ timeout: 15000 });
    await target.click();
  }

  public async clickDailySales(): Promise<void> {
    await this.btnDailySales.waitForDisplayed({ timeout: 15000 });
    await this.btnDailySales.waitForEnabled({ timeout: 15000 });
    await this.btnDailySales.click();
  }

  public async validateSalesDayScreen(): Promise<void> {
    await this.txtBusinessAssistant.waitForDisplayed({ timeout: 20000 });
    await expect(this.txtBusinessAssistant).toBeDisplayed();
  }

   async goBackToHome() {
    await driver.back();

    const { elSeeMore, elSeeAll } = this.btnSeeMoreOrSeeAll;

    const isHome = await elSeeMore.waitForDisplayed({ timeout: 7000 }).catch(() => false)
        || await elSeeAll.waitForDisplayed({ timeout: 7000 }).catch(() => false);

    if (!isHome) {
        throw new Error('Home screen was not displayed after navigating back. Neither "see more"" was found.');
    }
  }
}

export default new SalesDayScreen();
