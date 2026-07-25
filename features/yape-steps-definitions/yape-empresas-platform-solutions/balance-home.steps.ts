import { When, Then } from '@wdio/cucumber-framework';
import homeScreen from '@screenobjects/home/home.screen.ts';

When(/^selecciona la opcion mostrar saldo$/, async () => {
    await homeScreen.clickBalance();
});

Then(/^el saldo del usuario con perfil empresa se visualiza en el home$/, async () => {
    await homeScreen.verifyBalanceIsVisible();
});
