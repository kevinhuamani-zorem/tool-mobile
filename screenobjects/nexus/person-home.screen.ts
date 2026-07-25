import locators from '../../resources/locators/nexus/home.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import HomeLocator from '../../resources/locators/nexus/home.locator.json' with { type: 'json' };
import { TypeLocator } from '../../support/utils/Enums.js';
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class PersonHomeScreen extends BaseScreen {
  /* ================= POPUP ================= */
  async closePopupIfPresent() {
    const closeBtn = $('android=new UiSelector().resourceId("buttonClose")');

    await browser.waitUntil(
      async () => await closeBtn.isDisplayed().catch(() => false),
      {
        timeout: 6000,
        interval: 500
      }
    ).catch(() => {});

    if (await closeBtn.isDisplayed().catch(() => false)) {
      await closeBtn.click();

      // Confirmamos que se fue
      await closeBtn.waitForDisplayed({
        reverse: true,
        timeout: 5000
      });
    }
  }
  /* ================= HOME ================= */
  public get hamburgerMenu() {
    const locator = LocatorFactory.getElement(
        TypeLocator.XPATH,
        HomeLocator.homeIos.btnMenuHamburguesa,
        TypeLocator.ID,
        HomeLocator.homeAndroid.btnMenuHamburguesa
    );
    return $(locator);
  }
  public get greetingText() {
    return $('android=new UiSelector().textStartsWith("Hola")');
  }
  public get searchBar() {
    return $('android=new UiSelector().descriptionContains("Buscar")');
  }
  public async openHamburgerMenu() {
    await this.hamburgerMenu.click();
  }

  async openHome() {
    await this.closePopupIfPresent();
    await this.greetingText.waitForDisplayed({
      timeout: 15000
    });
  }

  async validateHomeHeaderIsVisible() {
    const greetingExists = await this.greetingText.isDisplayed().catch(() => false);
    const searchExists = await this.searchBar.isDisplayed().catch(() => false);

    if (!greetingExists && !searchExists) {
      throw new Error('Home does not show expected header elements');
    }
  }

  async validateShortcuts(shortcuts: string[]) {
    for (const shortcutName of shortcuts) {
      const shortcut = this.getShortcutByName(shortcutName);
      await shortcut.waitForDisplayed({ timeout: 10000 });
    }
  }

  getShortcutByName(shortcut: string) {
    const shortcutsMap: Record<string, string> = {
      'Recargar celular': locators.homeAndroid.btnshortcutRecargarCelular,
      'Aprende con Yape': locators.homeAndroid.btnshortcutAprendeConYape,
      'Biometría digital': locators.homeAndroid.btnshortcutBiometriaDigital,
      'Ver más': locators.homeAndroid.btnshortcutVerMas
    };

    const selector = shortcutsMap[shortcut];

    if (!selector) {
      throw new Error(`No locator defined for shortcut: ${shortcut}`);
    }

    return $(`android=new UiSelector().descriptionContains("${selector}")`);
  }
}

export default PersonHomeScreen;