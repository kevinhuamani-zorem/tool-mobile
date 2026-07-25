import { $ } from '@wdio/globals';
import BaseScreen from 'screenobjects/commons/base.screen.ts';
import InternetPurchasesLocator from '../../resources/locators/nexus/quick-items/internet-purchases.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

class InternetPurchasesScreen extends BaseScreen {

    get txtTitleInternetPurchases() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesIos.txtTitle,
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesAndroid.txtTitle
        );
        return $(locator);
    }

    get mainCard() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesIos.mainCard,
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesAndroid.mainCard
        );
        return $(locator);
    }

    get txtActivateSubtitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesIos.txtActivateSubtitle,
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesAndroid.txtActivateSubtitle
        );
        return $(locator);
    }

    get txtDescriptionActivate() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesIos.txtDescriptionActivate,
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesAndroid.txtDescriptionActivate
        );
        return $(locator);
    }

    get toggleActivate() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesIos.toggleActivate,
            TypeLocator.XPATH, InternetPurchasesLocator.InternetPurchasesAndroid.toggleActivate
        );
        return $(locator);
    }
}

export default new InternetPurchasesScreen();
