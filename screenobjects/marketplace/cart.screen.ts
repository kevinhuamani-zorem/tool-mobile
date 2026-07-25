import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import CartLocator from '../../resources/locators/marketplace/marketplace-cart.json' with { type: 'json' };
import SearchLocator from '../../resources/locators/marketplace/marketplace-search.locator.json' with {type: 'json'};
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

/**
 * sub page containing specific selectors and methods for a specific page
 */
class cartScreen extends BaseScreen{

    public get btnCartTopRight (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnCartTopRight,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnCartTopRight
        );
        return $(locator);
    }

    public async getVerifyProductsInCart(numProducts: number) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.verifyProductsInCart.replace('${cantidadProductos}', numProducts+' producto'),
            TypeLocator.ANDROID, CartLocator.cartAndroid.verifyProductsInCart.replace('${cantidadProductos}', numProducts+' producto')
        );
        return $(locator);
    }

    public get btnClearCart (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnClearCart,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnClearCart
        );
        return $(locator);
    }

    public get getBtnAddProduct (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnAddProduct,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnAddProduct
        );
        return $(locator);
    }

    public get btnBackArrow (){
        return $(CartLocator.cartAndroid.btnBackArrow);
    }

    public get SearchListView(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchLocator.menuIos.ListViewSearch,
            TypeLocator.ANDROID, SearchLocator.menuAndroid.ListViewSearch
        );
        return $(locator);
    }

    public get btnAdd(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnAddProd,
            TypeLocator.XPATH, CartLocator.cartAndroid.btnAddProd
        );
        return $(locator);
    }

    public get btnContinuePurchase(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnContinuePurchase,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnContinuePurchase
        );
        return $(locator);
    }

    public get btnCartSearch(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnCartSearch,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnCartSearch
        );
        return $(locator);
    }

    public get btnExitCart(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnExitCart,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnExitCart
        );
        return $(locator);
    }

    public get btnProductVariant(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnProductVariant,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnProductVariant
        );
        return locator;
    }

    public get btnAddToCart(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.btnAddToCart,
            TypeLocator.ANDROID, CartLocator.cartAndroid.btnAddToCart
        );
        return $(locator);
    }

    public async getValidateEmptyCartMessage(message:string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CartLocator.cartIos.msgEmptyCart.replace('${mensaje}', message),
            TypeLocator.ANDROID, CartLocator.cartAndroid.msgEmptyCart.replace('${mensaje}', message)
        );
        return $(locator);
    }

    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */

    public async openCart(){
        await this.btnCartTopRight.waitForDisplayed({ timeout });
        await this.btnCartTopRight.click();
    }

    public async verifyProductsAddedToCart(numProducts: number) {
        const checkProductCart = await this.getVerifyProductsInCart(numProducts);
        await checkProductCart.waitForDisplayed({ timeout });
        await checkProductCart.click();
    }

    public async clearCart() {
        await this.btnClearCart.waitForExist();
        this.btnClearCart.click();
    }

    public async addProductToCart() {
        await this.getBtnAddProduct.waitForDisplayed({ timeout });
        await this.getBtnAddProduct.click();

    }

    public async backArrow(): Promise<void> {
        await this.uiHelper.waitForElementExist(CartLocator.cartAndroid.btnBackArrow, true);
        this.btnBackArrow.click();
    }

    public async validateEmptyCartMessage(message:string) {
        const emptyCartMessage = await this.getValidateEmptyCartMessage(message);
        await emptyCartMessage.waitForDisplayed({ timeout });
        await emptyCartMessage.click();
    }

    public async continuePurchase(){
        await this.btnContinuePurchase.waitForDisplayed({ timeout });
        await this.btnContinuePurchase.click();
    }

    public async openCartSearch(){
        await this.btnCartSearch.waitForDisplayed({ timeout });
        await this.btnCartSearch.click();
    }

    public async exitCart(){
        await this.btnExitCart.waitForDisplayed({ timeout });
        await this.btnExitCart.click();
    }

    public async addProductsToCartWithVariant(productFeature:string){
        await this.btnAdd.waitForDisplayed({ timeout });
        await this.btnAdd.click();
        if (browser.isAndroid) {
            await $(this.btnProductVariant +  '("' + productFeature + '")').click();
        } else if (browser.isIOS) {
            await $(this.btnProductVariant + '"' + productFeature + '"]').click();
        }
        console.log (this.btnProductVariant);
        await this.btnAddToCart.waitForEnabled({ timeout: 2000 });
        await this.btnAddToCart.click();
    }

}

export default new cartScreen();
