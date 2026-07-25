import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import CategoriesLocator from '../../resources/locators/marketplace/marketplace-my-orders.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();


/**
 * sub page containing specific selectors and methods for a specific page
 */
class MyOrdersScreen extends BaseScreen{

    public get btnViewDetail(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.btnViewDetail,
            TypeLocator.XPATH, CategoriesLocator.myOrdersAndroid.btnViewDetail
        );
        return $(locator);
    }

    public get orderDetailScreen(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.orderDetailScreen,
            TypeLocator.XPATH, CategoriesLocator.myOrdersAndroid.orderDetailScreen
        );
        return $(locator);
    }

    public get helpScreen(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.helpScreen,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.helpScreen
        );
        return $(locator);
    }

    public get helpIcon(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.helpIcon,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.helpIcon
        );
        return $(locator);
    }

    public get optCancelOrder(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.optCancelOrder,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.optCancelOrder
        );
        return $(locator);
    }

    public get btnCancelOrder(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.btnCancelOrder,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.btnCancelOrder
        );
        return $(locator);
    }

    public get btnContinue(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.btnContinue,
            TypeLocator.XPATH, CategoriesLocator.myOrdersAndroid.btnContinue
        );
        return $(locator);
    }

    public get txtReadyWeCancelYourProduct(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.txtReadyWeCancelYourProduct,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.txtReadyWeCancelYourProduct
        );
        return $(locator);
    }

    public get btnBackDetail(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.myOrdersIos.btnBackDetail,
            TypeLocator.ANDROID, CategoriesLocator.myOrdersAndroid.btnBackDetail
        );
        return $(locator);
    }

    // abrir mis pedidos desde el menu inferior
    public async openViewDetail(): Promise<void> {
        await this.btnViewDetail.waitForDisplayed({ timeout });
        await this.btnViewDetail.click();
    }

    // verificamos que estemos en la pantalla de Detalle de pedido
    public async verifyScreen(): Promise<void> {
        await this.orderDetailScreen.waitForDisplayed({ timeout });
    }

    public async clickHelpIcon(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.helpIcon, true);
        await this.helpIcon.click();
    }

    public async clickBtnCancelOrder(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.btnCancelOrder, true);
        await this.btnCancelOrder.click();
    }

    public async verifyHelpScreen(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.helpScreen, true);
    }

    public async clickOptCancelOrder(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.optCancelOrder, true);
        await this.optCancelOrder.click();
    }

    public async clickBtnContinue(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.btnContinue, true);
        await this.btnContinue.click();
    }

    public async verifyTxtReadyWeCancelYourProduct(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.txtReadyWeCancelYourProduct, true);
    }

    public async clickBtnBackDetail(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.btnBackDetail, true);
        await this.btnBackDetail.click();
    }
}

export default new MyOrdersScreen();
