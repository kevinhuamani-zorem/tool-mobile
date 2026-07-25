import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import CategoriesLocator from '../../resources/locators/marketplace/marketplace-category.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import { browser } from '@wdio/globals';
import { performScroll } from '../../support/utils/Utils.js';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

/**
 * sub page containing specific selectors and methods for a specific page
 */
class CategoriesScreen extends BaseScreen{

    public async getBottomMenuCategories(opcion: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.categoriesIos.btnCategoryByOption.replace('${opcion}', opcion),
            TypeLocator.ANDROID, CategoriesLocator.categoriesAndroid.btnCategoryByOption.replace('${opcion}', opcion)
        );
        return $(locator);
    }

    public async getSelectCategory(categoria: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.categoriesIos.selectCategory.replace('${categoria}', categoria),
            TypeLocator.ANDROID, CategoriesLocator.categoriesAndroid.selectCategory.replace('${categoria}', categoria)
        );
        return $(locator);
    }

    public async getSelectSubcategory(subcategoria: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.categoriesIos.selectSubCategory.replace('${subcategoria}', subcategoria),
            TypeLocator.ANDROID, CategoriesLocator.categoriesAndroid.selectSubCategory.replace('${subcategoria}', subcategoria)
        );
        return $(locator);
    }

    public async getVerifyProduct(producto: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, CategoriesLocator.categoriesIos.selectProduct.replace('${producto}', producto),
            TypeLocator.ANDROID, CategoriesLocator.categoriesAndroid.selectProduct.replace('${producto}', producto)
        );
        return $(locator);
    }

    // abrir categorias desde el menu inferior
    public async openCategoriesBottomMenu(option: string) {
        const btnCategory = await this.getBottomMenuCategories(option);
        await btnCategory.waitForDisplayed({ timeout });
        await btnCategory.click();
    }
    // selecciona una categoria o subcategoria por nombre
    public async selectCategory(category: string) {
        const selCategory = await this.getSelectCategory(category);
        await selCategory.waitForDisplayed({ timeout });
        await selCategory.click();
    }
    // verificamos que estemos en la pantalla de subcategoria
    public async selectSubCategory(subcategory: string) {
        const selectSubCategory = await this.getSelectSubcategory(subcategory);
        await selectSubCategory.waitForDisplayed({ timeout });
        await selectSubCategory.click();
    }
    // verificamos que el producto sea visible
    public async verifyProduct(product: string) {
        const selectProduct = await this.getVerifyProduct(product);
        await selectProduct.waitForDisplayed({ timeout });
        await selectProduct.click();
    }
    public async scrollToFindElement(product: string) {
        await this.uiHelper.waitForElementExistByLocator(this.getVerifyProduct(product), false);
        await browser.waitUntil(
            async () => {
                const element = await this.getVerifyProduct(product);
                const isDisplayed = await element.isDisplayed();
                if (!isDisplayed) {
                    await performScroll(500, 1500, 500, 500); // Ajusta los valores para un desplazamiento más fino
                }
                return isDisplayed;
            },
            {
                timeout: 30000, // Incrementa el tiempo máximo de espera para elementos dinámicos
                timeoutMsg: 'The element "verificaProducto" was not found after multiple scrollings.'
            }
        );
    }
}

export default new CategoriesScreen();
