import { Given, When, Then } from '@wdio/cucumber-framework';
import BalanceScreen from '../../../../screenobjects/backfunds/balance/showbalance.screen.ts';


When(/^el usuario selecciona la opcion Mostrar Saldo$/, async () => {
	await BalanceScreen.pressButtonShowBalance();
});


When(/^se muestra el saldo al usuario$/, async () => {
	await BalanceScreen.ShowBalance();
});

When(/^el usuario selecciona la opcion Ocultar Saldo$/, async () => {
	await BalanceScreen.pressButtonHideBalance();
});


When(/^el usuario dejara de ver su saldo en la pantalla principal$/, async () => {
	await BalanceScreen.HideBalance();
});

When(/^el usuario no podra ver su saldo$/, async () => {
	await BalanceScreen.NoShowBalance();
});
