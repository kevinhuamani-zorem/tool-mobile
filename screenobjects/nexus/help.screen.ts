import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import HelpLocator from '../../resources/locators/nexus/quick-items/help.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

/**
 * sub page containing specific selectors and methods for a specific page
 */
class HelpScreen extends BaseScreen{

    public get txtEnterYourQuery () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelpLocator.helpIos.txtEnterYourQuery,
            TypeLocator.XPATH, HelpLocator.helpAndroid.txtEnterYourQuery);
        return $(locator);
    }

    public get backButton (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelpLocator.helpIos.backButton,
            TypeLocator.XPATH, HelpLocator.helpAndroid.backButton);
        return $(locator);
    }

    // txt dynamic item
    public txtDynamicItem(defaultLabel: string) {
        return $(`//*[@text="${defaultLabel}"]`);
    }
}

export default new HelpScreen();
