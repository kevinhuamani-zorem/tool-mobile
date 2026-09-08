import { Then, When } from '@wdio/cucumber-framework';
import salesScreen from '@screenobjects/payment/sales.screen.js';

When(/^el usuario accede a la sección de ventas$/, async () => {
    await salesScreen.userAccessSales();
});

Then(/^se muestra el mensaje de que aún no tiene ventas$/, async () => {
    await salesScreen.validateNoSalesMessage();
});
