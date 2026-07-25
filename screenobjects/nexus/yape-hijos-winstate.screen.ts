import locators from '../../resources/locators/nexus/yape-hijos-winstate.locator.json' with { type: 'json' };
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';

class YapeHijosSuccessScreen extends BaseScreen {

    get locator() {
        return driver.isAndroid
            ? locators.homeAndroid
            : locators.homeIos;
    }
    async validateSuccessScreenIsVisible() {
        await $(this.locator.txtTitle).waitForDisplayed();
        await $(this.locator.txtSubtitle).waitForDisplayed();
        await $(this.locator.txtSubtitle1).waitForDisplayed();
        await $(this.locator.txtContenido1).waitForDisplayed();
        await $(this.locator.txtSubtitle2).waitForDisplayed();
        await $(this.locator.txtContenido2).waitForDisplayed();
    }
}
export default YapeHijosSuccessScreen;