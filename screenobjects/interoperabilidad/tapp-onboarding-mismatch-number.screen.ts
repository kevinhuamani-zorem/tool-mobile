import { $ } from '@wdio/globals';
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@utils/LocatorFactory.ts';
import { TypeLocator } from '@utils/Enums.ts';
import { getTimeoutFromEnv } from '@utils/Utils.ts';
import TappOnboardingMismatchNumberLocator from '@locators/interoperabilidad/tapp-onboarding-mismatch-number.locator.json' with { type: 'json' };

const timeout: number = getTimeoutFromEnv();

/**
 * Screen Object for TAPP Onboarding Mismatch Number Modal.
 *
 * @remarks
 * - Android implementation: Complete.
 * - iOS implementation: Pending (locators marked as __NOT_IMPLEMENTED__).
 * - Related ticket: TAPP_Onboarding_u4.1 (Different number registered in Yape).
 */
class TappOnboardingMismatchNumberScreen extends BaseScreen {

    public get modalContainer() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberIos.modalContainer,
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberAndroid.modalContainer
        );
        return $(locator);
    }

    public get txtMismatchTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberIos.txtMismatchTitle,
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberAndroid.txtMismatchTitle
        );
        return $(locator);
    }

    public get txtMismatchDescription() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberIos.txtMismatchDescription,
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberAndroid.txtMismatchDescription
        );
        return $(locator);
    }

    public get btnAccept() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberIos.btnAccept,
            TypeLocator.XPATH, TappOnboardingMismatchNumberLocator.tappOnboardingMismatchNumberAndroid.btnAccept
        );
        return $(locator);
    }

    public async validateMismatchNumberModalIsDisplayed() {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.modalContainer,
            timeout,
            `[TAPP Onboarding][Mismatch Number Modal][Android] Modal container was not displayed within ${timeout}ms.`
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtMismatchTitle,
            timeout,
            `[TAPP Onboarding][Mismatch Number Modal][Android] Title was not displayed within ${timeout}ms. Expected text: "Tu numero no coincide con el de Yape".`
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtMismatchDescription,
            timeout,
            `[TAPP Onboarding][Mismatch Number Modal][Android] Description was not displayed within ${timeout}ms. Expected content starts with: "Para registrarte en Tapp".`
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.btnAccept,
            timeout,
            `[TAPP Onboarding][Mismatch Number Modal][Android] Accept button was not displayed within ${timeout}ms. Expected label: "ACEPTAR".`
        );
    }

}

export default new TappOnboardingMismatchNumberScreen();
