import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import DeleteAccountLocator from '../../resources/locators/nexus/quick-items/delete-account.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

/**
 * sub page containing specific selectors and methods for a specific page
 */
class DeleteAccountScreen extends BaseScreen{

    public get backButton () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.backButton,
            TypeLocator.ANDROID, DeleteAccountLocator.deleteAccountAndroid.backButton);
        return $(locator);
    }

    public get txtDeleteAccountTitle () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.txtDeleteAccountTitle,
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountAndroid.txtDeleteAccountTitle);
        return $(locator);
    }

    public get txtAreYouSure () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.txtAreYouSure,
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountAndroid.txtAreYouSure);
        return $(locator);
    }

    public get txtTemporaryDeparture () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.txtTemporaryDeparture,
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountAndroid.txtTemporaryDeparture);
        return $(locator);
    }

    public get descStayButton () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.descStayButton,
            TypeLocator.ANDROID, DeleteAccountLocator.deleteAccountAndroid.descStayButton);
        return $(locator);
    }

    public get descDeleteButton () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.descDeleteButton,
            TypeLocator.ANDROID, DeleteAccountLocator.deleteAccountAndroid.descDeleteButton);
        return $(locator);
    }

    public get descYapearButton () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DeleteAccountLocator.deleteAccountIos.descYapearButton,
            TypeLocator.ANDROID, DeleteAccountLocator.deleteAccountAndroid.descYapearButton);
        return $(locator);
    }
}

export default new DeleteAccountScreen();
