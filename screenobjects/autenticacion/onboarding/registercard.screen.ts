import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';
import BaseScreen from '../../commons/base.screen.js';
import RegisterDataUserScreen from './registerdatauser.screen.js';
import { $ } from '@wdio/globals';

class RegisterCardScreen extends BaseScreen {

    public get inputCardNumber() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.inputCardNumber,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.inputCardNumber);
        return $(locator);
    }

    public get displayMonthExp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.displayMonthExp,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.displayMonthExp);
        return $(locator);
    }

    public get selectMonthExp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.selectMonthExp,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectMonthExp);
        return $(locator);
    }

    public get displayYearExp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.displayYearExp,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.displayYearExp);
        return $(locator);
    }

    public get selectYearExp() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.selectYearExp,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectYearExp);
        return $(locator);
    }

    public get acceptTermsCondition() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.acceptTermsCondition,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.acceptTermsCondition);
        return $(locator);
    }

    public get acceptInfoUse() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.acceptInfoUse,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.acceptInfoUse);
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnContinuar,
            TypeLocator.ID, LocatorOnboarding.onboardingAndroid.btnContinuar);
        return $(locator);
    }

    // Método para registrar datos de tarjeta
    async registerCard(cardnumber: string): Promise<void> {
        try {
            await this.inputCardNumber.setValue(cardnumber);

            await this.displayMonthExp.click();

            await this.selectMonthExp.click();

            await this.displayYearExp.click();

            await this.selectYearExp.click();

            await this.acceptTermsCondition.click();

            const tipoDocumento: string | undefined = RegisterDataUserScreen.getSelectedDocumentType;

            console.log(`@selected_document_type: ${tipoDocumento}`);

            if (tipoDocumento !== 'RUC') {
                await this.acceptInfoUse.click();
            }

            await this.btnContinue.click();

        } catch (error) {
            console.error('Error al registrar datos de tarjeta:', error);
        }
    }
}

export default new RegisterCardScreen();
