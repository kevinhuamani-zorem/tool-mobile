import { DataTable, Given, Then, When } from '@wdio/cucumber-framework';
import homeScreen from '../../../screenobjects/home/home.screen.ts';
import HomeMarketplaceScreen from '../../../screenobjects/marketplace/home-marketplace.screen.ts';
import MyOrdersScreen from '../../../screenobjects/marketplace/my-orders.screen.ts';
import { performScroll } from '../../../support/utils/Utils.ts';
import { browser } from '@wdio/globals';

// Realizar desplazamiento para verificar componentes adicionales
const SCROLL_START_X = 0;
const SCROLL_START_Y = 0;
const SCROLL_END_X = 0;
const SCROLL_END_Y = 0;
const timeout = process.env.CONFIG_DEFAULT_DISPLAY_TIMEOUT as unknown as number;


When('vea la pantalla de Home', async () => {
    await homeScreen.seeHomeScreen();
});

Then('debería ver las siguientes agrupaciones de productos', async (products:DataTable) => {
    const productsList = products.raw().map((row) => row[0]); // Extrae la primera columna
    await homeScreen.verifyGrouping(productsList);
});

Given('agregar ubicacion a la tienda', async (data_address: DataTable) => {
    const ADDRESS = data_address.raw();
    const CITY = ADDRESS[0][0];
    const MZ = ADDRESS[0][1];
    await homeScreen.addLocation(CITY, MZ);
});

Given('el usuario ingresa a la opción de Mis Pedidos del menu inferior', async () => {
    await HomeMarketplaceScreen.openMyOrdersBottomMenu();
});

When('selecciona el pedido', async () => {
    await MyOrdersScreen.openViewDetail();
});

Then('Verficamos el tracking del pedido', async () => {
    await MyOrdersScreen.verifyScreen();
});

Then('el usuario selecciona icono de ayuda', async () => {
    await MyOrdersScreen.helpIcon.waitForDisplayed({ timeout });
    await MyOrdersScreen.clickHelpIcon();
    await MyOrdersScreen.verifyHelpScreen();
});

When('el usuario selecciona Cancelar pedido', async () => {
    // Esperar hasta que el elemento sea visible desplazándose
    await browser.waitUntil(
        async () => {
            const isDisplayed = await MyOrdersScreen.btnCancelOrder.isDisplayed();
            if (!isDisplayed) {
                await performScroll(500, 1500, 500, 500); // Ajusta los valores para un desplazamiento más fino
            }
            return isDisplayed;
        },
        {
            timeout: 30000, // Incrementa el tiempo máximo de espera para elementos dinámicos
            timeoutMsg: 'The element "shortcutSeeMore" was not found after multiple scrolls'
        }
    );
    await MyOrdersScreen.clickBtnCancelOrder();
    await MyOrdersScreen.clickOptCancelOrder();
    await MyOrdersScreen.clickBtnContinue();
    await MyOrdersScreen.verifyTxtReadyWeCancelYourProduct();
    await MyOrdersScreen.clickBtnBackDetail();
});