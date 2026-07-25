import locators from '../../resources/locators/nexus/home.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class ShortcutScreen extends BaseScreen {

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
      'Ver más': locators.homeAndroid.btnshortcutVerMas,
      'Hijos': locators.homeAndroid.shortcutYapeHijos
    };

    const selector = shortcutsMap[shortcut];

    if (!selector) {
      throw new Error(`No locator defined for shortcut: ${shortcut}`);
    }

    return $(`android=new UiSelector().descriptionContains("${selector}")`);
  }
}

export default ShortcutScreen;