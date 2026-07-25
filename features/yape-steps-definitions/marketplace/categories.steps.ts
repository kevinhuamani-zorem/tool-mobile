import { Given, When, Then } from '@wdio/cucumber-framework';
import categoriesScreen from '../../../screenobjects/marketplace/categories.screen.ts';

Given('el usuario ingresa a la opción de {string} del menu inferior', async (option: string) => {
    await categoriesScreen.openCategoriesBottomMenu(option);
});

When('selecciona la categoría {string}', async (category: string) => {
    await categoriesScreen.selectCategory(category);
});

When('selecciona la subcategoría {string}', async (subcategory: string) => {
    await categoriesScreen.selectSubCategory(subcategory);
});

Then('el ve el producto {string}', async (product: string) => {
    await categoriesScreen.scrollToFindElement(product);
    await categoriesScreen.verifyProduct(product);
});
