
import { $ } from '@wdio/globals';
import BaseScreen from 'screenobjects/commons/base.screen.ts';
import DigitalBiometricsLocator from '../../resources/locators/nexus/quick-items/digital-biometrics.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

class DigitalBiometricsScreen extends BaseScreen {

    public get txtActivate(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DigitalBiometricsLocator.biometryIos.txtActiveBio,
            TypeLocator.XPATH, DigitalBiometricsLocator.biometryAndroid.txtActiveBio
        );
        return $(locator);

    }

    public get txtInformation(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, DigitalBiometricsLocator.biometryIos.txtInform,
            TypeLocator.XPATH, DigitalBiometricsLocator.biometryAndroid.txtInform
        );
        return $(locator);
    }

}
export default new DigitalBiometricsScreen();
