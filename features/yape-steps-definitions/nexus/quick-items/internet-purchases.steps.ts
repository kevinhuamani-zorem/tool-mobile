import internetPurchasesScreen from '@screenobjects/nexus/internet-purchases.screen.ts';
import { Given, Then } from '@wdio/cucumber-framework';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given(/^el usuario ingresa a la opción "Compras por internet"$/, async () => {
    await menuScreen.openInternetPurchases();
    await browser.pause(1500);
});

Then(/^se verifican los elementos de la opción "Compras por internet" en el menú del usuario$/, async () => {

    await internetPurchasesScreen.uiHelper.waitForElementDisplayedAndExpect(internetPurchasesScreen.txtTitleInternetPurchases, timeout, 'The title "Compras por internet" was not displayed');

    await internetPurchasesScreen.uiHelper.waitForElementDisplayedAndExpect(internetPurchasesScreen.mainCard, timeout, 'The main card was not displayed');

    await internetPurchasesScreen.uiHelper.waitForElementDisplayedAndExpect(internetPurchasesScreen.txtActivateSubtitle, timeout, 'The subtitle "Activar Compras por internet" was not displayed');

    await internetPurchasesScreen.uiHelper.waitForElementDisplayedAndExpect(internetPurchasesScreen.txtDescriptionActivate, timeout, 'The description text was not displayed');

    await internetPurchasesScreen.uiHelper.waitForElementDisplayedAndExpect(internetPurchasesScreen.toggleActivate, timeout, 'The activate toggle was not displayed');
    
});
