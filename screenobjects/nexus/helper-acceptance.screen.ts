import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import HelperInvitationLocator from '../../resources/locators/nexus/quick-items/helper-invitation.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

class HelperAcceptance extends BaseScreen {

    public get salesDayOption() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.salesDayBtn,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.salesDayBtn);
        return $(locator);
    }

    public get helperWorld() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.helperBtn,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.helperBtn);
        return $(locator);
    }


    async openHelperWorld() {
        await this.helperWorld.click();
    }
}

export default new HelperAcceptance();
