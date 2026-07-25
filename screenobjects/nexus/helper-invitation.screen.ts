import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import HelperInvitationLocator from '../../resources/locators/nexus/quick-items/helper-invitation.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';


class HelperInvitation extends BaseScreen {

    /**
     * Define selectors using getter methods
     */
    public get notificationTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.notificationTitle,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.notificationTitle);
        return $(locator);
    }

    public get notificationMessage() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.notificationMessage,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.notificationMessage);
        return $(locator);
    }

    public get btnAcceptInvitation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.btnAcceptInvitation,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.btnAcceptInvitation);
        return $(locator);
    }

    public get btnRejectInvitation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.btnRejectInvitation,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.btnRejectInvitation);
        return $(locator);
    }

    public get notificationContainer() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.notificationContainer,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.notificationContainer);
        return $(locator);
    }

    public get invitationDetails() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationIos.invitationDetails,
            TypeLocator.XPATH, HelperInvitationLocator.helperInvitationAndroid.invitationDetails);
        return $(locator);
    }


}
export default new HelperInvitation();