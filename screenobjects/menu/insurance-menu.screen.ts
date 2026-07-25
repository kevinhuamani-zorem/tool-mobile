import BaseScreen from '../commons/base.screen.js';
import { $ } from '@wdio/globals';

import { TypeLocator } from '../../support/utils/Enums.js';
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import { ConstantsInsurance } from '../../support/utils/constants-insurance.js';
import LocatorLifeMenu from '../../resources/locators/insurance-life/initial-menu.locator.json' with { type: 'json' };
import { removeDoubleQuotes } from '../../support/utils/Utils.ts';
import { Constants } from '../../support/utils/constants.ts';

class InsuranceMenuScreen extends BaseScreen {

    public get lblInsurance() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLifeMenu.menuIos.lblInsurance,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.lblInsurance);
        return $(locator);
    }

    public get lblLifeMenu() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLifeMenu.menuIos.lblLifeMenu,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.lblLifeMenu);
        return $(locator);
    }

    public get lblFutureFamily() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLifeMenu.menuIos.lblCuidaFuturoFamilia,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.lblCuidaFuturoFamilia);
        return $(locator);
    }

    public get iconLoading() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLifeMenu.menuIos.iconoProgressBar,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.iconoProgressBar);
        return $(locator);
    }

    public get lblLoading() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorLifeMenu.menuIos.lblLoading,
            TypeLocator.XPATH, LocatorLifeMenu.menuAndroid.lblLoading);
        return $(locator);
    }

    public get lblInsuranceMenu() {
        const locator = LocatorFactory.getElement(TypeLocator.ANDROID, LocatorLifeMenu.menuIos.lblInsuranceMenu,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.lblInsuranceMenu);
        return locator;
    }

    public optionInsurance(options: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ANDROID, LocatorLifeMenu.menuIos.lblInsuranceMenu,
            TypeLocator.ANDROID, LocatorLifeMenu.menuAndroid.lblInsuranceMenu.replace(Constants.DOLLAR_SYMBOL, options));
        return $(locator);
    }

    public async selectInsurance(options: string){
        await browser.pause(1000);
        (await this.optionInsurance(options)).click();
    }

    public async validateLoadingPopup() {
        await expect(this.lblLoading).toHaveText(ConstantsInsurance.TEXT_LOADING_POPUP);
    }

    public async validateLabelsMenuLife(dataTable: any){
        const arrayValues = dataTable.hashes();

        for (const { titulo, detalle } of arrayValues){
            const expectTitle = titulo;
            await expect(this.lblLifeMenu).toHaveText(expectTitle);

            const expectDetail = detalle;
            await expect(this.lblFutureFamily).toHaveText(expectDetail);
        }
    }

    public async validateTitleInsurance(ExpectedTitle: string){
        await this.lblInsurance.waitForDisplayed();
        const realResponse: string = await this.lblInsurance.getText();
        await expect(realResponse).toEqual(removeDoubleQuotes(ExpectedTitle));
    }

    public async validateLabelsMenuPhone(dataTable: any){
        const arrayRows = dataTable.rows();
        for (const [text] of arrayRows){
            const realElement = $(this.lblInsuranceMenu.replace(Constants.DOLLAR_SYMBOL, text));
            await expect(realElement).toHaveText(text);
        }
    }

}

export default new InsuranceMenuScreen();