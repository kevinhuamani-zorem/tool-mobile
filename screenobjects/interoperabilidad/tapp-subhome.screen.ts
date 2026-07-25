import { $ } from '@wdio/globals';
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@utils/LocatorFactory.ts';
import { TypeLocator } from '@utils/Enums.ts';
import { getTimeoutFromEnv } from '@utils/Utils.ts';
import TappSubhomeLocator from '@locators/interoperabilidad/tapp-subhome.locator.json' with { type: 'json' };

const timeout: number = getTimeoutFromEnv();

class TappSubhomeScreen extends BaseScreen {

    public get txtTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtTitle,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtTitle
        );
        return $(locator);
    }

    public get txtAccounts() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtAccounts,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtAccounts
        );
        return $(locator);
    }

    public get btnViewAllAccounts() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.btnViewAllAccounts,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.btnViewAllAccounts
        );
        return $(locator);
    }

    public get iconYapear() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconYapear,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconYapear
        );
        return $(locator);
    }

    public get iconScanQr() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconScanQr,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconScanQr
        );
        return $(locator);
    }

    public get iconApprovePayments() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconApprovePayments,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconApprovePayments
        );
        return $(locator);
    }

    public get iconViewStatuses() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconViewStatuses,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconViewStatuses
        );
        return $(locator);
    }

    public get txtConfiguration() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtConfiguration,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtConfiguration
        );
        return $(locator);
    }

    public get txtMyTappId() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtMyTappId,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtMyTappId
        );
        return $(locator);
    }

    public get txtUpdateTappPassword() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.txtUpdateTappPassword,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.txtUpdateTappPassword
        );
        return $(locator);
    }

    public get iconPasswordLock() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconPasswordLock,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconPasswordLock
        );
        return $(locator);
    }

    public get iconDni() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeIos.iconDni,
            TypeLocator.XPATH, TappSubhomeLocator.tappSubhomeAndroid.iconDni
        );
        return $(locator);
    }

    public async validateSubhomeScreenIsDisplayed(): Promise<void> {
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtTitle, timeout, 'The TAPP title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtAccounts, timeout, 'The accounts section title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.btnViewAllAccounts, timeout, 'The view all accounts button was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconYapear, timeout, 'The Yapear icon was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconScanQr, timeout, 'The scan QR icon was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconApprovePayments, timeout, 'The approve payments icon was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconViewStatuses, timeout, 'The view statuses icon was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtConfiguration, timeout, 'The configuration title was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtMyTappId, timeout, 'The My Tapp ID option was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.txtUpdateTappPassword, timeout, 'The update Tapp password option was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconPasswordLock, timeout, 'The password lock icon was not displayed');
        await this.uiHelper.waitForElementDisplayedAndExpect(this.iconDni, timeout, 'The DNI icon was not displayed');
    }
}

export default new TappSubhomeScreen();
