import { When, Then, Given } from '@wdio/cucumber-framework';
import paymentDetailScreen from '../../../screenobjects/home/payment-detail.screen.ts';
import cartScreen from '../../../screenobjects/marketplace/cart.screen.ts';
import { performScroll } from '../../../support/utils/Utils.ts';
import { browser } from '@wdio/globals';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given('el usuario agrega 1 producto al carrito', async () => {
    await browser.waitUntil(
        async () => {
            const isDisplayed = await cartScreen.btnAdd.isDisplayed();
            if (!isDisplayed) {
                await performScroll(500, 1500, 500, 500); // Ajusta los valores para un desplazamiento más fino
            }
            return isDisplayed;
        },
        {
            timeout: timeout, // Incrementa el tiempo máximo de espera para elementos dinámicos
            timeoutMsg: 'The "add" element was not found after multiple scrollings'
        }
    );
    await cartScreen.btnAdd.waitForDisplayed({ timeout });
    await cartScreen.addProductToCart();
});

When('ingresamos al carrito de compras', async () => {
    const contexts = await driver.getContexts(); // Obtén los contextos disponibles
    console.log('Available contexts:', contexts);
    await cartScreen.openCart();
});

Then('el carrito de compras debería mostrar {int} producto', async (numProducts: number) => {
    await cartScreen.verifyProductsAddedToCart(numProducts);
});

When('decide vaciar carrito', async () => {
    await cartScreen.clearCart();
});

When('el usuario decide regresar a la pantalla anterior', async () => {
    await cartScreen.backArrow();
});

Then('el carrito de compras debería mostrar el mensaje {string}', async (message:string) => {
    await cartScreen.validateEmptyCartMessage(message);
});

When(/ingresa al carrito y continua con la compra$/, async () => {
    await cartScreen.openCartSearch();
    await cartScreen.continuePurchase();
});

Then(/se valida el detalle de compra$/, async() => {
    await paymentDetailScreen.validatePurchaseSummaryTitle();
    await paymentDetailScreen.validatePaymentTypes();
    await paymentDetailScreen.validateOrderTitle();
});

Given(/el usuario agrega producto al carrito desde buscador$/, async() => {
    
    await driver.pause(timeout);
    await browser.waitUntil(
        () => cartScreen.SearchListView.isDisplayed(),
        { timeout, timeoutMsg: 'The cart field was never displayed.' }
    );

    if (!(await cartScreen.btnAdd.isExisting())) {
        await cartScreen.openCartSearch();
        await cartScreen.clearCart();
        await cartScreen.exitCart();
    }

    await cartScreen.btnAdd.waitForDisplayed({ timeout });
    await cartScreen.btnAdd.click();
});

Then('Se visualiza el detalle de compra', async() => {

    await paymentDetailScreen.validatePurchaseSummaryTitle();
    await paymentDetailScreen.validatePaymentTypes();
    await paymentDetailScreen.validateOrderTitle();

});

When(/el usuario agrega productos al carrito con varible: (.*)$/, async (productFeature: string) => {

    await cartScreen.btnAdd.waitForDisplayed({ timeout });
    await cartScreen.addProductsToCartWithVariant(productFeature);

});

When(/usuario selecciona yapear$/, async () => {

    await paymentDetailScreen.scrolltopaymentbutton();
    await paymentDetailScreen.clickOnPayButtonIfNotFound();
});

When(/el usuario confirma la compra$/, async () => {
    await paymentDetailScreen.selectConfirmYourPurchase();
});
