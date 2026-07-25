import { $, browser } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import MarketPlaceHomeLocator from '../../resources/locators/marketplace/marketplace-home.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import { TypeLocator } from '../../support/utils/Enums.js';
import homeScreen from './home.screen.ts';
import { getTimeoutFromEnv, performScroll } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

/**
 * sub page containing specific selectors and methods for a specific page
 */

class MarketPlaceHomeScreen extends BaseScreen{

    public get shortcutBanner (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.shortcutBanner,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.shortcutBanner);
        return $(locator);
    }

    public get titleTienda(){
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, MarketPlaceHomeLocator.MarketPlaceHomeIos.titleTienda,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.titleTienda);
        return $(locator);
    }

    public get btnCart(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.btnViewCart,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.btnViewCart);
        return $(locator);
    }

    public get btnSearch(){
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN, MarketPlaceHomeLocator.MarketPlaceHomeIos.btnSearch,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.btnSearch);
        return $(locator);
    }

    public get shortcutTienda (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.shortcutTienda,
            TypeLocator.ID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.shortcutTienda);
        return $(locator);
    }

    public get shortCutVerMasTienda (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.shortcutTienda,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.shortcutSeeMoreTienda);
        return  $(locator);
    }

    public get getTextCategory (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.textCategory,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.textCategory);
        return  $(locator);
    }

    public get getListProducts (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.listProducts,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.listProducts);
        return  $(locator);
    }

    public get getProductsList (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.productsList,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.productsList
        );
        return $(locator);
    }

    public get shortcutSeeMore(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.shortcutSeeMore,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.shortcutSeeMore);
        return $(locator);
    }

    public get getCategoryMenu (){
        return $(MarketPlaceHomeLocator.MarketPlaceHomeAndroid.shortcutBanner);
    }

    public get menuCategoryIcon() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.menuCategoryOption,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.menuCategoryOption);
        return $(locator);
    }

    public get tecCategoryIcon() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.btnIconTecCategory,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.btnIconTecCategory);
        return $(locator);
    }

    public get celSubCategory() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.btnCelSubCategory,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.btnCelSubCategory);
        return $(locator);
    }

    public get filterOn(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.filterOn,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.filterOn
        );
        return $(locator);
    }

    public get pdpTitle() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.lblDetailProduct,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.lblDetailProduct);
        return $(locator);
    }

    public get pdpImage() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.ImageDetailProduct,
            TypeLocator.ANDROID, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.ImageDetailProduct);
        return $(locator);
    }

    public pdpBrand(brand: string) {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.brandDetailProduct.replace('{brand}', brand),
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.brandDetailProduct.replace('{brand}', brand));
        return $(locator);
    }

    public get pdpSellerTitle() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.SellerTitle,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.SellerTitle);
        return $(locator);
    }

    public get pdpCantityTitle() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.CantityTitle,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.CantityTitle);
        return $(locator);
    }

    public get pdpAddProduct() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.AddProduct,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.AddProduct);
        return $(locator);
    }

    public get pdpQuitProduct() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.QuitProduct,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.QuitProduct);
        return $(locator);
    }

    public get pdpProductDescription() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.DescProduct,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.DescProduct);
        return $(locator);
    }

    public get pdpCharacteristics() {
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeIos.CharacProduct,
            TypeLocator.XPATH, MarketPlaceHomeLocator.MarketPlaceHomeAndroid.CharacProduct);
        return $(locator);
    }

    // open shortcut "Banner
    public async openPrincipalBanner() {
        await this.shortcutBanner.click();
    }

    public async openShortcutTienda() {
        await this.shortcutTienda.waitForDisplayed({ timeout });
        await this.shortcutTienda.click();
    }

    public async openShortcutSeeMoreTienda() {
        await this.shortCutVerMasTienda.waitForDisplayed({ timeout });
        await this.shortCutVerMasTienda.click();
    }

    public async selectCategoryIcon() {
        await this.menuCategoryIcon.waitForClickable({ timeout });
        await this.menuCategoryIcon.click();

    }

    public async selectTecCategory() {
        await driver.pause(1000);
        await this.tecCategoryIcon.click();
    }

    public async selectCelSubcategory() {
        await driver.pause(1000);
        await this.celSubCategory.click();
    }

    public async verifyListProducts() {
        const listProductsExists = await this.getListProducts.isExisting();
        const productsListExists = await this.getProductsList.isExisting();

        if (listProductsExists) {
            await this.getListProducts.isDisplayed();
        } else if (productsListExists) {
            await this.getProductsList.isDisplayed();
        } else {
            throw new Error('No product list was found on the screen.');
        }
    }

    public async verifyPdpDetail(brand: string): Promise<boolean> {
        try {
            await this.pdpTitle.waitForDisplayed({ timeout });
            const titleVisible = await this.pdpTitle.isDisplayed();
            const imageVisible = await this.pdpImage.isDisplayed();
            const brandVisible = await this.pdpBrand(brand).isDisplayed();
            return titleVisible && imageVisible && brandVisible;
        } catch (error) {
            console.error('Error verifying product detail:', error);
            return false;
        }
    }

    public async verifyPdpDetail2(): Promise<boolean> {
        try {
            await this.pdpSellerTitle.waitForDisplayed({ timeout });
            const sellerVisible = await this.pdpSellerTitle.isDisplayed();
            const cantityVisible = await this.pdpCantityTitle.isDisplayed();
            const addProductVisible = await this.pdpAddProduct.isDisplayed();
            const quitProductVisible = await this.pdpQuitProduct.isDisplayed();
            const descriptionVisible = await this.pdpProductDescription.isDisplayed();
            const characteristicsVisible = await this.pdpCharacteristics.isDisplayed();

            return sellerVisible && cantityVisible && addProductVisible &&
            quitProductVisible && descriptionVisible && characteristicsVisible;
        } catch (error) {
            console.error('Error verifying additional product details:', error);
            return false;
        }
    }

    //open shortcut desde opcion Ver más
    public async openSeeMore(){
        await this.shortcutSeeMore.click();
    }

    public async openTextSeeMore(){
        await homeScreen.shortcutVerMas.waitForExist();
        await homeScreen.shortcutVerMas.click();
    }

    public async openHomeSeeMore(){
        await homeScreen.shortcutHomeVerTodo.waitForExist({ timeout });
        await homeScreen.shortcutHomeVerTodo.click();
        const { width, height } = await driver.getWindowSize();
        const xCenter = Math.round(width * 0.5);
        const yStart = Math.round(height * 0.85);
        const yEnd = Math.round(height * 0.15);
        await browser.waitUntil(
            async () => {
                const isVisible = await this.shortcutTienda.isExisting()
                    && await this.shortcutTienda.isDisplayed();
                if (isVisible) return true;
                await performScroll(xCenter, yStart, xCenter, yEnd);
                return false;
            },
            {
                timeout,
                timeoutMsg: 'Tienda shortcut was not displayed after scrolling'
            }
        );
    }

    public async openViewAll(){
        await homeScreen.shortcutHomeVerTodo.waitForExist();
        await homeScreen.shortcutHomeVerTodo.click();

    }
}

export default new MarketPlaceHomeScreen();
