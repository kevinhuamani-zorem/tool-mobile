import { Given } from '@wdio/cucumber-framework';
import searchScreen from '../../../screenobjects/home/marketplace-search.screen.ts';
import { ConstantsMarketplace } from '../../../support/utils/constants-marketplace.ts';
import homeScreen from '../../../screenobjects/home/marketplace-home.screen.ts';

const timeout = process.env.CONFIG_DEFAULT_DISPLAY_TIMEOUT as unknown as number;

Given(/realiza la busqueda de un producto o categoria: (.*)$/, async (search: string) => {
    await homeScreen.btnCart.waitForDisplayed({ timeout });
    await searchScreen.searchProducts(search);
});

Given(/selecciona la opcion filtro para acotar la busqueda$/,  async () => {
    await searchScreen.filterSearch();
});

Given(/realiza el filtro por orden: (.*)$/, async (order: string) => {
    await searchScreen.orderByFilter(order);
});

Given(/filtro de marca: (.*)$/, async (brand: string) => {
    await searchScreen.filterByBrand(brand);
});

Given(/selecciona un producto$/, async () => {
    await browser.waitUntil(
        () => searchScreen.productSelected.isDisplayed() || searchScreen.productFiltered.isDisplayed(),
        { timeout, timeoutMsg: 'Products not displayed for selection' }
    );
    await searchScreen.selectProduct();
});

Given(/selecciona el producto de la marca "(.*)"$/, async (productText) => {
    await searchScreen.selectProductByText(productText);
});

Given(/regresa a la lista de busqueda$/, async() =>  {
    await searchScreen.productDetailTitle.waitForDisplayed({ timeout });
    await searchScreen.backToList();
});

Given(/se mantiene los filtros buscados$/, async() => {
    await homeScreen.filterOn.waitForDisplayed({ timeout });
    await expect(homeScreen.filterOn).toHaveText(ConstantsMarketplace.FILTER_NUMBER);
});

Given(/el usuario regresa a tienda desde busqueda$/, async() => {
    await searchScreen.backToHomeFromSearchMobileOrEmulator();
});
