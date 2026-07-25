import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import HelperDiscardLocator from '../../resources/locators/nexus/quick-items/helper-discard.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
class HelperDiscard extends BaseScreen {

    public get businessBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.businessBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.businessBtn);
        return $(locator);
    }

    public get myHelpersBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.myHelpersBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.myHelpersBtn);
        return $(locator);
    }

    public get mainText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.mainText,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.mainText);
        return $(locator);
    }

    public get secondaryText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.secondaryText,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.secondaryText);
        return $(locator);
    }

    public get addHelpersBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.addHelpersBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.addHelpersBtn);
        return $(locator);
    }

    public get deleteCollaboratorBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.deleteCollaboratorBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.deleteCollaboratorBtn);
        return $(locator);
    }

    public get txtQuestion() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.txtQuestion,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.txtQuestion);
        return $(locator);
    }

    public get confirmDeleteBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.confirmDeleteBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.confirmDeleteBtn);
        return $(locator);
    }

    public get cancelDeleteBtn() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardIos.cancelDeleteBtn,
            TypeLocator.XPATH, HelperDiscardLocator.helperDiscardAndroid.cancelDeleteBtn);
        return $(locator);
    }

    

    async openBusinessWorld() {
        await this.businessBtn.click();
    }
    
    async openMyHelpers() {
        await this.myHelpersBtn.click();
    }

    async openDeleteCollaborator(){
        await this.deleteCollaboratorBtn.click();
    }
    
}

export default new HelperDiscard();
