import { When, Then } from '@wdio/cucumber-framework';
import salesDayScreen from '../../../screenobjects/nexus/salesday.screen.ts';

When(
    /^el usuario da click a la opcion ver mas$/,
    async () => {
        await salesDayScreen.clickSeeMore();
    }
);

When(
    /^el usuario da click a ver ver ventas del dia$/,
    async () => {
        await salesDayScreen.clickDailySales();
    }
);

Then(
    /^el usuario visualiza correctamente la pantalla de ventas del dia$/,
    async () => {
        await salesDayScreen.validateSalesDayScreen();
    }
);

When(
    /^el usuario regresa al home$/,
    async () => {
        await salesDayScreen.goBackToHome();
    }
);
