import { Given, Then, When } from '@wdio/cucumber-framework';
import remittanceHomeScreen from '../../../screenobjects/remesas-inbound/remittance-home.screen.ts';

Given(/^que el usuario navega a la sección de remesas$/, async () => {
    await remittanceHomeScreen.navigateToRemesas();
});

Given(/^el usuario está en la sección de remesas$/, async () => {
    await remittanceHomeScreen.validateRemesasSection();
});

When(/^selecciona el botón "Atras"$/, async () => {
    await remittanceHomeScreen.btnBack.click();
});

When(/^hace click en la opción Compartir$/, async () => {
    await remittanceHomeScreen.btnShare.click();
});

Then(
    /^se muestra el modal de compartir con el texto "Compartir texto"$/,
    async () => {
        await remittanceHomeScreen.validateShareModal();
    },
);

Then(/^se muestra el campo de número de cuenta en USD$/, async () => {
    await remittanceHomeScreen.validateUsdAccountField();
});

Then(/^el número de cuenta debe tener el formato correcto$/, async () => {
    await remittanceHomeScreen.validateAccountNumberFormat();
});

Then(/^se visualiza el tag de "Dólares"$/, async () => {
    await remittanceHomeScreen.scrollAndValidateCurrencyTag('Dólares');
});

Then(/^se visualiza el tag de "Soles"$/, async () => {
    await remittanceHomeScreen.scrollAndValidateCurrencyTag('Soles');
});

When(/^hace click en el botón "Mostrar dólares"$/, async () => {
    await remittanceHomeScreen.clickShowDollars();
});

Then(/^se muestra la información de remesas en dólares$/, async () => {
    await remittanceHomeScreen.validateRemittanceInfoInDollars();
});

When(/^hace click en el botón "Quiero recibir"$/, async () => {
    await remittanceHomeScreen.btnWantToReceive.click();
});
Then(
    /^se muestra la pantalla de información para recibir remesas$/,
    async () => {
        await remittanceHomeScreen.validateReceiveRemesasScreen();
    },
);
