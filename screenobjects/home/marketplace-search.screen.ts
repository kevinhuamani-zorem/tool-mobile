import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import MarketPlaceSearchLocator from  '../../resources/locators/marketplace/marketplace-search.locator.json' with { type: 'json' };
import LocatorFactory from '../../support/utils/LocatorFactory.ts';
import { TypeLocator } from '../../support/utils/Enums.ts';
import { pressEnter } from 'support/utils/Utils.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

class MarketPlaceSearchScreen extends BaseScreen{

    public get txtSearch(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.txtSearch,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.txtSearch);
        return $(locator);
    }

    public get Finder(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.txtFinder,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.txtFinder);
        return $(locator);
    }

    public get productList(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.productList,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.productList
        );
        return $(locator);
    }

    public get filterProducts(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.filterProducts,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.filterProducts
        );
        return $(locator);
    }

    public get filterCategory(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.filterByCategory,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.filterByCategory
        );
        return $(locator);
    }

    public get filterSelectCategory(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.filterSelectCategory,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.filterSelectCategory
        );
        return $(locator);
    }

    public get seeResults(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.seeResults,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.seeResults
        );
        return $(locator);
    }

    public get orderProducts(){
        const locator= LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnOrder,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.btnOrder
        );
        return $(locator);
    }

    public get orderFilterTitle(){
        const locator=LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.titleOrderFilter,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.titleOrderFilter
        );
        return $(locator);
    }

    public orderFilter(order: string){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnOrderByFilter.replace('{order}', order),
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.btnOrderByFilter.replace('{order}', order)
        );
        return $(locator);
    }

    public get orderApply(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnApplyOrder,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.btnApplyOrder
        );
        return $(locator);
    }

    public get filterBrand(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.filterByBrand,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.filterByBrand
        );
        return $(locator);
    }

    public selectBrand(brand: string){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.filterSelectBrand.replace('{brand}', brand),
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.filterSelectBrand.replace('{brand}', brand)
        );
        return $(locator);
    }

    public get productDetailTitle(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.productDetailTitle,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.productDetailTitle
        );
        return $(locator);
    }

    public get productSelected(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.productSelected,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.productSelected
        );
        return $(locator);
    }
    public get productFiltered(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.productFiltered,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.productFiltered
        );
        return $(locator);
    }

    public productItem(productText: string){
        const locator = LocatorFactory.getElement(
            TypeLocator.ID, MarketPlaceSearchLocator.menuIos.productItem.replace('{productText}', productText),
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.productItem.replace('{productText}', productText)
        );
        return $(locator);
    }

    public get btnBacktoHome(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnGoBackFromDetailProduct,
            TypeLocator.ANDROID, MarketPlaceSearchLocator.menuAndroid.btnGoBackFromDetailProduct
        );
        return $(locator);
    }

    public get btnGoBackFromSearchToHome(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnGoBackFromSearchToHome,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.btnGoBackFromSearchToHome
        );
        return $(locator);
    }

    public get btnGoBackFromSearchToHomeEmulator(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuIos.btnGoBackFromSearchToHomeEmulator,
            TypeLocator.XPATH, MarketPlaceSearchLocator.menuAndroid.btnGoBackFromSearchToHomeEmulator
        );
        return $(locator);
    }

    public async searchProducts(search: string):  Promise<void> {
        try {
            if (driver.isAndroid){
                await this.Finder.click();
            } else {
                //x:210 y:124
                await driver.execute('mobile: tap', { x:210, y:124 });
            }

            await this.txtSearch.waitForDisplayed({ timeout });
            await this.txtSearch.setValue(search);

            await pressEnter();

        // Simula la tecla "Enter" en el teclado del dispositivo
        } catch (error) {
            console.error('Error performing search:', error);
        }
    }

    public async filterSearch() {
        try {
            await this.filterProducts.waitForDisplayed({ timeout });
            await this.filterProducts.click();

            await this.filterCategory.waitForDisplayed({ timeout });

            if (driver.isAndroid) {
                // Método 1: Click directo
                let clicked = false;

                if (!clicked) {
                    try {
                        await this.filterCategory.click();
                        clicked = true;
                    } catch (e) {
                        console.warn('Direct click failed:', e);
                    }
                }

                // Método 2: Scroll + Click
                if (!clicked) {
                    try {
                        await this.filterCategory.scrollIntoView();
                        await this.filterCategory.click();
                        clicked = true;
                    } catch (e) {
                        console.warn('Scroll + click falló:', e);
                    }
                }
                // Método 3: Tap coordenadas
                if (!clicked) {
                    await driver.execute('mobile: tap', { x: 75, y: 205 });
                }
            } else {
                await driver.execute('mobile: tap', { x: 75, y: 205 });
            }

            await this.filterSelectCategory.waitForDisplayed({ timeout });
            await this.filterSelectCategory.click();
            await this.seeResults.click();

        } catch (error) {
            console.error('Could not filter by category', error);
            throw error;
        }
    }

    public async orderByFilter(order: string):  Promise<void>{
        try {

            if (!(await this.orderProducts.isDisplayed())){
                await driver.execute('mobile: scroll', { direction: 'up' });
            }
            await this.orderProducts.waitForDisplayed({ timeout });
            await this.orderProducts.click();
            await this.orderFilterTitle.waitForDisplayed({ timeout });
            await this.orderFilter(order).click();
            await this.orderApply.click();

        } catch (error){
            console.error('Could not perform sorting correctly', error);
        }
    }

    public async filterByBrand(brand: string):  Promise<void>{
        try {
            await this.filterProducts.waitForDisplayed({ timeout });
            await this.filterProducts.click();

            if (driver.isAndroid){
                await this.filterBrand.click();
            } else {
                await driver.execute('mobile: tap', { x:70, y:343 });
            }

            await this.selectBrand(brand).waitForDisplayed({ timeout });

            await this.selectBrand(brand).click();

            await this.seeResults.click();

        } catch (error){
            console.error('Could not filter by brand', error);
        }
    }

    public async selectProductByText(productText: string): Promise<void>{
        try {

            await this.productItem(productText).waitForDisplayed({ timeout });

            await this.productItem(productText).click();

        } catch (error){
            console.error('Could not tap on the product', error);
        }
    }

    public async selectProduct(){
        try {
            if (await this.productSelected.isDisplayed()) {
                await this.productSelected.waitForDisplayed({ timeout });
                await this.productSelected.click();
            } else {
                await this.productFiltered.waitForDisplayed({ timeout });
                await this.productFiltered.click();
            }

        } catch (error){
            console.error('Could not find the selected product', error);
        }
    }

    public async backToList(){
        try {
            await this.btnBacktoHome.click();
        } catch (error){
            console.error('Could not return to the menu', error);
        }
    }

    public async backToHomeFromSearchMobileOrEmulator(){
        const promisebtnGoBackFromSearchToHome = this.btnGoBackFromSearchToHome.isExisting();
        const promisebtnGoBackFromSearchToHomeEmulator = this.btnGoBackFromSearchToHomeEmulator.isExisting();
        try {
            await Promise.any([promisebtnGoBackFromSearchToHome, promisebtnGoBackFromSearchToHomeEmulator]);
            if (await this.btnGoBackFromSearchToHome.isExisting()) {
                await this.btnGoBackFromSearchToHome.click();
                console.log('resolved 1st promise');
            } else if (await this.btnGoBackFromSearchToHomeEmulator.isExisting()) {
                await this.btnGoBackFromSearchToHomeEmulator.click();
                console.log('resolved 2d promise');
            } else {
                console.error('Neither GoBackFromSearchToHome nor GoBackFromSearchToHomeEmulator button exists.');
            }
        } catch (error) {
            console.error('Neither GoBackFromSearchToHome nor GoBackFromSearchToHomeEmulator button exists (Promise.any rejected).', error);
        }
    }

}

export default new MarketPlaceSearchScreen();
