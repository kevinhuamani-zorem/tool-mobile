import { Given, When, Then } from '@wdio/cucumber-framework';
import homeScreen from '../../../screenobjects/home/home.screen.ts';
import webviewLocators from '../../../resources/locators/marketplace/webview/webview-locators.ts';
import ContextSwitcher from '../../../support/utils/ContextSwitcher.ts';

const contextSwitcher = new ContextSwitcher();

Given('el usuario ingresa al home de Yape', async () => {
    await homeScreen.seeHomeScreen();
});


When('se listan los contextos disponibles y se cambia a WebView', async () => {
    await contextSwitcher.switchToWebView();
});

When('el usuario hace click en un elemento de la webview', async () => {
    const selector = webviewLocators.bannerMarketplace;
    const element = await $(selector);
    await element.waitForDisplayed({ timeout: 15000 });
    await element.click();
});

When('se cambia de nuevo al contexto nativo', async () => {
    await contextSwitcher.switchToNative();
});

Then('se valida que el usuario está de vuelta en la app nativa', async () => {
    await homeScreen.seeHomeScreen();
    console.log('[WebView] Validation of return to native context successful');
});
