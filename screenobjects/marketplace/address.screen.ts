import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import MarketPlaceAddressLocator from '../../resources/locators/marketplace/marketplace-address.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import { timeEnd } from 'console';

const timeout: number = getTimeoutFromEnv();

/**
 * sub page containing specific selectors and methods for a specific page
 */
class AddressScreen extends BaseScreen{

    public get txtChangeAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtChangeAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtChangeAddress
        );
        return $(locator);
    }

    public get txtDeliveryAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtDeliveryAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtDeliveryAddress
        );
        return $(locator);
    }

    public get txtDeliveryAddress1(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtDeliveryAddress1,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtDeliveryAddress1
        );
        return $(locator);
    }

    public get txtDepartment(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtDepartment,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtDepartment
        );
        return $(locator);
    }

    public async getInputDepartment(department: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.department.replace('${department}', department),
            TypeLocator.ANDROID, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.department.replace('${department}', department)
        );
        return $(locator);
    }

    public get txtState(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtState,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtState
        );
        return $(locator);
    }

    public async getInputState(state: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.state.replace('${state}', state),
            TypeLocator.ANDROID, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.state.replace('${state}', state)
        );
        return $(locator);
    }

    public get txtDistrict(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtDistrict,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtDistrict
        );
        return $(locator);
    }

    public async getInputDiscrict(discrict: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.discrict.replace('${discrict}', discrict),
            TypeLocator.ANDROID, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.discrict.replace('${discrict}', discrict)
        );
        return $(locator);
    }

    public get txtStage(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtStage,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtStage
        );
        return $(locator);
    }

    public get btnSaveAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.btnSaveAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.btnSaveAddress
        );
        return $(locator);
    }

    public async getInputValidation(validation: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.validation.replace('${validation}', validation),
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.validation.replace('${validation}', validation)
        );
        return $(locator);
    }

    public get validateNewAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.validateNewAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.validateNewAddress
        );
        return $(locator);
    }

      public get validateNewAddressTest(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.validateNewAddressTest,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.validateNewAddressTest
        );
        return $(locator);
    }

    public get selectNewAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.selectNewAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.selectNewAddress
        );
        return $(locator);
    }

    public get addNewAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.addNewAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.addNewAddress
        );
        return $(locator);
    }

    public get writeAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.writeAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.writeAddress
        );
        return $(locator);
    }

    public get selectionAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.selectionAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.selectionAddress
        );
        return $(locator);
    }

    public get continueButton(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.continueButton,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.continueButton
        );
        return $(locator);
    }

    public get closeAddressButton(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.closeAddressButton,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.closeAddressButton
        );
        return $(locator);
    }

    public get clickEditAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.clickEditAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.clickEditAddress
        );
        return $(locator);
    }

    public get actionOptionAddress(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.actionOptionAddress,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.actionOptionAddress
        );
        return $(locator);
    }

    public get editOption(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.editOption,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.editOption
        );
        return $(locator);
    }

    public get backNavigation(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.backNavigation,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.backNavigation
        );
        return $(locator);
    }

    public get txtAddressName(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtAddressName,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtAddressName
        );
        return $(locator);
    }

    public get txtDepartmentNumber(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtDepartmentNumber,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtDepartmentNumber
        );
        return $(locator);
    }

    public get txtEditTitle(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.txtEditTitle,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.txtEditTitle
        );
        return $(locator);
    }

    public get btnConfirmAddressUpdate(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressIos.btnConfirmAddressUpdate,
            TypeLocator.XPATH, MarketPlaceAddressLocator.MarketPlaceAddressAndroid.btnConfirmAddressUpdate
        );
        return $(locator);
    }

    //Cambiar dirección
    public async clickChangeAddress() {
        let clicked = false;
        try {
            // Verifica si el elemento existe y está visible antes de intentar el click
            if (await this.clickEditAddress.isExisting() && await this.clickEditAddress.isDisplayed()) {
                await this.clickEditAddress.click();
                clicked = true;
            }
        } catch (error) {
            // Si ocurre un error inesperado, lo loguea pero sigue con el fallback
            console.warn('Error trying to click by locator:', error);
        }

        if (!clicked) {
            console.warn('Could not click EditAddress by locator, trying to tap by relative coordinates...');
            // Fallback: tap por coordenadas relativas al tamaño de pantalla
            const { width, height } = await driver.getWindowSize();
            const x = Math.floor(width * 0.5);
            const y = Math.floor(height * 0.8);
            await driver.execute('mobile: tap', { x, y });
            console.info(`Tap executing in dynamic coordinates: x=${x}, y=${y}`);
        }
    }

    public async validateAddress(address: string, district: string, stage: string) {
        await this.uiHelper.waitForElementExistByLocator(this.txtChangeAddress, true);
        await this.txtChangeAddress.click();

        try {
            await this.validateNewAddress.waitForDisplayed({ timeout });
            console.log('It found the address, without problems');
            await this.closeAddressButton.waitForDisplayed({ timeout });
            await this.closeAddressButton.click();
        } catch (error) {
    
            const isVisible = await this.validateNewAddressTest.isDisplayed();
            if (isVisible) {
                    console.log('It doesn\'t update anything');
                    await this.closeAddressButton.waitForDisplayed({ timeout });
                    await this.closeAddressButton.click();
            } else {
                    console.log('Add new address');
                    console.error('Error during address validation flow:', error);
                    await this.addNewAddress.click();
                    await this.writeAddress.click();
                    await this.writeAddress.setValue(address + ' ' + district);

                    await this.selectionAddress.click();
                    console.error('Continue button:', error);
                    await this.continueButton.waitForDisplayed({ timeout });
                    await this.continueButton.click();

                    await this.writeStage(stage);

                    if (driver.isIOS) {
                        const okButton = $('~OK'); // O usa el selector correcto
                        if (await okButton.isDisplayed()) {
                            await okButton.click();
                        }
                    }
                    
                    await this.clickBtnSaveAddress();

            }
        }
    }

    public async writeStage(stage: string){
        await this.uiHelper.waitForElementExistByLocator(this.txtStage, true);
        await this.txtStage.clearValue();
        await this.txtStage.setValue(stage);
    }

    public async clickBtnSaveAddress(){
        await this.uiHelper.waitForElementExistByLocator(this.btnSaveAddress, true);
        await this.btnSaveAddress.click();

    }

}

export default new AddressScreen();
