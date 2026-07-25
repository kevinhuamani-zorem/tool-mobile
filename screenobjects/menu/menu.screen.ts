import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';
import MenuLocator from '../../resources/locators/menu/menu.locator.json' with { type: 'json' };

/**
 * sub page containing specific selectors and methods for a specific page
 */
class MenuScreen extends BaseScreen{

    private readonly _userFirstName: string = '';

    public get txtMenuTitle () {
        return $(MenuLocator.menuAndroid.txtMenuTitle);
    }

    public get btnCloseMenu (){
        return $(MenuLocator.menuAndroid.btnCloseMenu);
    }

    public get txtMenuAppVersion (){
        return $(MenuLocator.menuAndroid.txtMenuAppVersion);
    }

    public get txtMenuAccountType (){
        return $(MenuLocator.menuAndroid.txtMenuAccountType);
    }

    public get txtMenuCompanyName (){
        return $(MenuLocator.menuAndroid.txtMenuCompanyName);
    }

    public get txtMenuRUC (){
        return $(MenuLocator.menuAndroid.txtMenuRUC);
    }

    public get txtMenuRUCNumber (){
        return $(MenuLocator.menuAndroid.txtMenuRUCNumber);
    }

    public get txtMenuTermsAndConditions (){
        return $(MenuLocator.menuAndroid.txtMenuTermsAndConditions);
    }

    public get txtMenuPrivacyPolicy (){
        return $(MenuLocator.menuAndroid.txtMenuPrivacyPolicy);
    }

    public get txtMenuSignOut (){
        return $(MenuLocator.menuAndroid.txtMenuSignOut);
    }
    // menu scroll into view
    public get scrollViewMenu (){
        return $(MenuLocator.menuAndroid.scrollViewMenu);
    }

    public get helpButton (){
        return $(MenuLocator.menuAndroid.helpButton);
    }

    public get deleteAccountButton (){
        return $(MenuLocator.menuAndroid.deleteAccountButton);
    }

    public get txtMenuMyData (){
        return $(MenuLocator.menuAndroid.txtMenuMyData);
    }

    public get txtSubItemMyQR (){
        return $(MenuLocator.menuAndroid.txtSubItemMyQR);
    }

    // menu notification
    public get notificationButton (){
        return $(MenuLocator.menuAndroid.txtMenuNotifications);
    }

    //menu biometria
    public get biometricButton(){
        return $(MenuLocator.menuAndroid.txtBiometricButton);
    }

    public get highConfirmationButton(){
        return $(MenuLocator.menuAndroid.txtHighConfirmationButton);
    }

    public get internetPurchasesButton() {
        return $(MenuLocator.menuAndroid.txtInternetPurchases);
    }

    // txt dynamic item
    public txtDynamicItem(defaultLabel: string) {
        return $(`//*[@text="${defaultLabel}"]`);
    }

    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */

    private uiScrollableByText = (text: string) =>
        $(`android=new UiScrollable(new UiSelector().scrollable(true)).scrollTextIntoView("${text}")`);

    /**
     * Desplaza hasta que aparezca el texto indicado y devuelve el elemento.
     */
    public async scrollToText(text: string) {
        const element = await this.uiScrollableByText(text);
        await element.waitForDisplayed({ timeout: 5000 });
    }

    public async closeBurgerMenu() {
        (await this.btnCloseMenu).click();
    }

    // open terms and conditions
    public async openTermsAndConditions() {
        (await this.txtMenuTermsAndConditions).click();
    }

    // open privacy policy
    public async openPrivacyPolicy() {
        (await this.txtMenuPrivacyPolicy).click();
    }

    // sign out
    public async signOut() {
        (await this.txtMenuSignOut).click();
    }

    // help
    public async openHelp() {
        (await this.helpButton).click();
    }

    // delete account
    public async openDeleteAccount() {
        (await this.deleteAccountButton).click();
    }

    // open my data
    public async openMyData() {
        (await this.txtMenuMyData).click();
    }

    // open my qr
    public async openMyQR() {
        (await this.txtSubItemMyQR).click();
    }
    //notifications
    public async openNotifications() {
        (await this.notificationButton).click();
    }

    //Biometria
    public async openBiometric(){
        (await this.biometricButton).click();
    }

    public async openConfirmation(){
        (await this.highConfirmationButton).click();
    }

    public async openInternetPurchases(){
        (await this.internetPurchasesButton).click();
    }

}

export default new MenuScreen();
