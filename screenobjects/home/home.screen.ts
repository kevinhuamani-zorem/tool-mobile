import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';
import HomeLocator from '../../resources/locators/home/home.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import { TypeLocator } from '../../support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import AutoAtencionUtil from '../../support/utils/autoatencion-util.ts';
import { time } from 'console';


const timeout: number = getTimeoutFromEnv();

/**
 * sub page containing specific selectors and methods for a specific page
 */
class HomeScreen extends BaseScreen{

    private _userFirstName: string;

    constructor() {
        super();
        this._userFirstName = '';
    }

    /**
     * define selectors using getter methods
     */
    public get btnMenu () {
       const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.btnMenu,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnMenu);
        return $(locator);
    }

    public get btnMenuEmpresas (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.btnMenuEmpresa,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnMenuEmpresa);
        return $(locator);
    }

    public get txtWelcomeMessage () {
        return $(`//*[@text="Hola, ${this._userFirstName}"]`);
    }

    public get txtBadgeGratis () {
        return $(HomeLocator.homeAndroid.txtBadgeGratis);
    }

    public get txtBadgeEmpresa () {
        return $(HomeLocator.homeAndroid.txtBadgeEmpresa);
    }

    public get shortcutVerMas (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.shortcutVerMas,
            TypeLocator.XPATH, HomeLocator.homeAndroid.shortcutVerMas);
        return $(locator);
    }

    public get shortcutHomeVerMas (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.shortcutVerMas,
            TypeLocator.XPATH, HomeLocator.homeAndroid.shortcutHomeVerMas);
        return $(locator);
    }

    public get shortcutHomeVerTodo (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.shortcutVerTodo,
            TypeLocator.XPATH, HomeLocator.homeAndroid.shortcutHomeVerTodo);
        return $(locator);
    }

    public get closeSheet (){
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.shortcutVerMasCloseSheet,
            TypeLocator.ANDROID, HomeLocator.homeAndroid.shortcutVerMasCloseSheet);
        return $(locator);
    }

    public get btnSeeMore() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.btnSeeMore,
            TypeLocator.ANDROID, HomeLocator.homeAndroid.btnSeeMore);
        return $(locator);
    }

    public get btnYapear (){
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, HomeLocator.homeIos.btnYapearHome,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnYapearHome);
        return $(locator);
    }

    public get txtTitleHome() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.txtTitleHome,
            TypeLocator.XPATH, HomeLocator.homeAndroid.txtTitleHome
        );
        return $(locator);
    }

    public get btnLocation (){
        return $(HomeLocator.homeAndroid.btnLocation);
    }

    public get txtDeliveryAddress (){
        return $(HomeLocator.homeAndroid.txtDeliveryAddress);
    }
    public get txtMz (){
        return $(HomeLocator.homeAndroid.txtMz);
    }
    public get btnSaveAddress (){
        return $(HomeLocator.homeAndroid.btnSaveAddress);
    }

    public get btnBtnCdaHome(){
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, HomeLocator.homeIos.btnCdaHome,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnCdaHome);
        return $(locator);
    }

    public get btnHelpEmp(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.btnHelpEmp,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnHelpEmp);
        return $(locator);
    }

    public get btnOmitirVerTodo() {
        return LocatorFactory.getElement(TypeLocator.XPATH, HomeLocator.homeIos.btnOmitirVerTodo,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnOmitirVerTodo);

    }


    public get btnSearch() {
    const locator = LocatorFactory.getElement(
        TypeLocator.ID, HomeLocator.homeIos.btnSearch,
        TypeLocator.ANDROID, HomeLocator.homeAndroid.btnSearch
    );
    return $(locator);
    }


    public get btnNotifications() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.btnNotifications,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnNotifications
        );
        return $(locator);
    }

    public get banner() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.banner,
            TypeLocator.XPATH, HomeLocator.homeAndroid.banner
        );
        return $(locator);
    }

    public get lblBalance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.lblBalance,
            TypeLocator.XPATH, HomeLocator.homeAndroid.lblBalance
        );
        return $(locator);
    }

    public get lblHideBalance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.lblHideBalance,
            TypeLocator.XPATH, HomeLocator.homeAndroid.lblHideBalance
        );
        return $(locator);
    }

    public get lblBalanceAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.lblBalanceAmount,
            TypeLocator.XPATH, HomeLocator.homeAndroid.lblBalanceAmount
        );
        return $(locator);
    }

    public get lblRecentMovements() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.lblRecentMovements,
            TypeLocator.XPATH, HomeLocator.homeAndroid.lblRecentMovements
        );
        return $(locator);
    }

    public get lblSales() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.lblSales,
            TypeLocator.XPATH, HomeLocator.homeAndroid.lblSales
        );
        return $(locator);
    }

    public get btnScanQR() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, HomeLocator.homeIos.btnScanQR,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnScanQR
        );
        return $(locator);
    }

    public get btnStore() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.btnYapearHomeIcon,
            TypeLocator.XPATH, HomeLocator.homeAndroid.btnYapearHomeIcon
        );
        return $(locator);
    }

    public get shortcutTapp() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, HomeLocator.homeIos.shortcutTapp,
            TypeLocator.XPATH, HomeLocator.homeAndroid.shortcutTapp
        );
        return $(locator);
    }

    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */

    // open burger menu
    public async openMenu() {
        (await this.btnMenu).click();
    }
    //open burguer menu empresas
    public async openMenuEmp(){
        (await this.btnMenuEmpresas).click();
    }

    // setUserFirstName for welcome message
    public async setUserFirstName(userFirstName: string) {
        this._userFirstName = userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1).toLowerCase();
    }
    // user first name
    public getUserFirstName() {
        return this._userFirstName;
    }

    // txtHomeItem
    public txtHomeItem(defaultLabel: string) {
        return $(`//*[@text="${defaultLabel}"]`);
    }

    // open shortcut "Ver más"
    public async openShortcutVerMas() {
        (await this.shortcutVerMas).click();
    }

    // txt dynamic item

    public txtDynamicItem(label: string) {
    // Normalize whitespace from the API to avoid mismatches in selectors
    const normalized = label.replace(/\s+/g, ' ').trim();

    // Build a safe XPath literal that supports strings with single and/or double quotes
    const toXPathLiteral = (s: string): string => {
        if (s.indexOf('"') === -1) return `"${s}"`;
        if (s.indexOf("'") === -1) return `'${s}'`;

        const parts = s.split('"');
        const concatArgs = parts.map(p => `"${p}"`).join(`, '"', `);
        return `concat(${concatArgs})`;
    };

    const val = toXPathLiteral(normalized);

    // Match by content-desc or text using normalized-space, supporting exact or partial matches
    const selector = `//*[
        normalize-space(@content-desc)=${val}
        or contains(normalize-space(@content-desc), ${val})
        or normalize-space(@text)=${val}
        or contains(normalize-space(@text), ${val})
    ]`;

    return $(selector);
    }

    // close shortcut "Ver más"
    public async closeShortcutVerMas() {
        ((await this.closeSheet).click());
    }

    public async seeMoreOptions() {
        const locator = this.btnSeeMore;
        const isDisplayed = await locator.waitForDisplayed({ timeout: 5000 });
        if (isDisplayed) {
            await locator.click();
        } else {
            console.log('The button is unavailable.');
        }
    }

    public async optionsMenuYape(options: string) {
        console.log (' Checking if modal is open...');
        await browser.waitUntil(
            async () => {
                try {
                    return await this.checkIfModalIsOpen();
                } catch {
                    return true;
                }
            },
            {
                timeout: timeout,
                interval: 200,
                timeoutMsg: 'UI did not stabilize in expected time'
            }
        );
        const isModalOpen = await this.checkIfModalIsOpen();
        const funcionalityYapeLocator = LocatorFactory.getElement(TypeLocator.ID,
            HomeLocator.homeIos.funcionalityYape.replace('{options}', options),
            TypeLocator.XPATH,
            HomeLocator.homeAndroid.funcionalityYape.replace('{options}', options)
        );

        if (isModalOpen) {
            const modalButton = $(funcionalityYapeLocator);
            await modalButton.click();
            return;
        }
        const homeButton = await $(funcionalityYapeLocator);
        await homeButton.click();
    }
    private async checkIfModalIsOpen(): Promise<boolean> {
        try {
            const modalLocator = LocatorFactory.getElement(TypeLocator.CLASSCHAIN, HomeLocator.homeIos.modalYape
                , TypeLocator.ANDROID, HomeLocator.homeAndroid.modalYape);
            const modal = await $(modalLocator);
            return await modal.isDisplayed();
        } catch (error) {
            return false;
        }
    }

    // abrir tienda desde el icono
    public async openStoreByIcon() {
        (await this.btnStore).click();
    }

    // ver pantalla home
    public async seeHomeScreen() {
        await expect(this.txtTitleHome).toBeDisplayed();
    }

    // verificar agrupación de productos en home
    async verifyGrouping(productList: string[]): Promise<void> {
        for (const product of productList) {
            const groupElement = await $(`//*[@text='${product}']`);
            await expect(groupElement).toBeDisplayed();
        }
    }

    // agregar ubicacion a la tienda
    public async addLocation(city: string, mz: string) {
        await this.uiHelper.waitForElementExist(HomeLocator.homeAndroid.btnLocation, true);
        (await this.btnLocation).click();
        (await this.txtDeliveryAddress).setValue(city);
        (await this.txtMz).setValue(mz);
        (await this.btnSaveAddress).click();
    }

    public async selOmitirVerTodo() {
        const element = this.btnOmitirVerTodo;
        try {
            const existeElemento = await this.uiHelper.waitForElement(element);
            if (existeElemento) {
                await $(element).click();
            } else {
                console.log(`El elemento ${element} no se visualiza en la aplicación`)
            }
        } catch (error) {
            console.error(`Error : ${error}`);
        }
    }


    public async openCdaHome() {
        console.log("Entrar a validar existencia de botón CDA");
        //const element = await this.btnBtnCdaHome;
        await this.btnBtnCdaHome.click();
       //await AutoAtencionUtil.waitElementToAction(element,"click");
    }

    public async openSearch() {
        await this.btnSearch.click();
    }

    public async openTappShortcut() {
        await this.shortcutTapp.click();
    }

    public async clickSales() {
        await this.lblSales.click();
    }

    public async clickBalance() {
        await this.lblBalance.click();
    }

    public async verifyBalanceIsVisible() {
        await this.lblHideBalance.waitForDisplayed({ timeout });
        await this.lblBalanceAmount.waitForDisplayed({ timeout });
    }

}

export default new HomeScreen();
