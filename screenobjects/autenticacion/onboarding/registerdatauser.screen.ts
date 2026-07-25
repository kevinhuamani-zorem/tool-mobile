import LocatorFactory from '../../../support/utils/LocatorFactory.js';
import LocatorOnboarding from '../../../resources/locators/autenticacion/onboarding/onboarding.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../support/utils/Enums.js';
import enteryourpasswordScreen from './enteryourpassword.screen.js';
import BaseScreen from '../../commons/base.screen.js';
import { $ } from '@wdio/globals';
import { getInputTypeNumDocMobile, hideNativeKeyboard } from '../../../support/utils/Utils.js';
import { scenarioSession } from '../../../support/utils/ScenarioSession.js';

let selectedDocumentType: string | undefined;

class RegisterDataUserScreen extends BaseScreen {
    public get txtDocumentNumber() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtDocumentNumber,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.txtDocumentNumber);
        return $(locator);
    }

    public get txtEmail() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorOnboarding.onboardingIos.txtEmail,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.txtEmail);
        return $(locator);
    }

    public get btnContinue() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnContinuar,
            TypeLocator.ID, LocatorOnboarding.onboardingAndroid.btnContinuar);
        return $(locator);
    }

    public get btnConfirm() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.btnConfirmar);
        return $(locator);
    }

    public get display_combo_type_doc() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnContinuar,
            TypeLocator.CLASSNAME, LocatorOnboarding.onboardingAndroid.display_combo_type_doc);
        return $(locator);
    }

    public get selectDniOption() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectDniOpt);
        return $(locator);
    }

    public get selectRucOption() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectRucOpt);
        return $(locator);
    }

    public get selectPasOption() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectPasOpt);
        return $(locator);
    }

    public get selectCeOption() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.selectCeOpt);
        return $(locator);
    }

    public get btnConfirmOther() {
        const locator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, LocatorOnboarding.onboardingIos.btnConfirmar,
            TypeLocator.XPATH, LocatorOnboarding.onboardingAndroid.btnConfirmarDoc);
        return $(locator);
    }

    async selectTypeDoc(typeDocDesc: string): Promise<void> {
        try {
            switch (typeDocDesc) {
            case 'DNI':
                await this.selectDniOption.click();
                break;
            case 'RUC':
                selectedDocumentType = typeDocDesc;
                console.log(`@selected_document_type context: ${selectedDocumentType}`);
                await this.selectRucOption.click();
                await this.btnConfirmOther.click();
                break;
            case 'PAS':
                selectedDocumentType = typeDocDesc;
                console.log(`@selected_document_type context: ${selectedDocumentType}`);
                await this.selectPasOption.click();
                await this.btnConfirmOther.click();
                break;
            case 'CE':
                selectedDocumentType = typeDocDesc;
                console.log(`@selected_document_type context: ${selectedDocumentType}`);
                await this.selectCeOption.click();
                await this.btnConfirmOther.click();
                break;
            default:
                console.error(`Tipo de documento no reconocido: ${typeDocDesc}`);
            }
        } catch (error) {
            console.error('Error al seleccionar el tipo de documento:', error);
        }

    }

    // Método para obtener el tipo de documento seleccionado
    public get getSelectedDocumentType(): string | undefined {
        return selectedDocumentType;
    }

    // Método para registrar datos
    async registerData(): Promise<void> {

        const user = scenarioSession.getUser();

        try {

            await this.display_combo_type_doc.click();

            const [userDocDesc, userDoc]= getInputTypeNumDocMobile(user);

            console.log('numero de documento:', userDoc);

            this.selectTypeDoc(userDocDesc);

            await this.txtDocumentNumber.setValue(userDoc);

            await hideNativeKeyboard('tapOut');

            await this.txtEmail.setValue(user.email);

            await this.btnContinue.click();

            await this.btnConfirm.click();

            await browser.pause(5000);

            for (let i = 0; i < 2; i++) {
                await enteryourpasswordScreen.enterPassword(user.password);
                await browser.pause(1000);
            }

        } catch (error) {
            console.error('Error en el onboarding:', error);
        }
    }
}

export default new RegisterDataUserScreen();
