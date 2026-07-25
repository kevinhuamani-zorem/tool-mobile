import { Given, Then, When } from "@wdio/cucumber-framework";
import rechargeScreen from '@screenobjects/recharge/recharge.screen.ts';
import rechargeWinstateScreen from "@screenobjects/recharge/recharge-winstate.screen.ts";

Given(/^que el usuario navega a la seccion de recargas con opcion "(.*)"$/, async (option: string) => {
    await rechargeScreen.navigateToRechargeSection(option);
});

When(/^realiza una recarga a mi numero exitosa con un monto "([^"]*)" "([^"]*)"$/, async (company: string, amount: string) => {
    await rechargeScreen.rechargeMyNumber(company, amount);
});

Then(/^se visualiza la pantalla WinState de recarga$/, async () => {
    await rechargeWinstateScreen.verifyWinStateRecharge();
});

When(/^realiza una nueva recarga a otro numero con "([^"]*)" "([^"]*)"$/, async (company: string, amount: string) => {
    await rechargeScreen.rechargeOtherNumberFromOptions(company, amount);
});

Then(/^se muestran todos los atributos del winstate correctamente para "(.*)"$/, async (company: string) => {
    await rechargeWinstateScreen.verifyWinStateAttributes(company);
});

When(/^realiza una recarga con monto sugerido "(.*)" "(.*)"$/, async (company: string, amount: string) => {
    await rechargeScreen.rechargeSuggestedAmount(company, amount);
});

Then(/^se visualiza el winstate en movimientos$/, async () => {
    await rechargeWinstateScreen.verifyWinStateInMovements();
});

Then(/^se visualiza el winstate en ver todos$/, async () => {
    await rechargeWinstateScreen.verifyWinStateInSeeAll();
});

When(/^digita un numero de 2 o mas digitos "(.*)"$/, async (amount: string) => {
    await rechargeScreen.typeAmountAndNavigate(amount);
});

Then(/^el boton de recargar se mantiene habilitado$/, async () => {
    await rechargeScreen.verifyRechargeButtonEnabled();
});

Then(/^se visualiza el error por monto minimo$/, async () => {
    await rechargeScreen.verifyMinimumRechargeError();
});

Then(/^se visualiza el error por monto m[aá]ximo$/, async () => {
    await rechargeScreen.verifyMaximumRechargeError();
});

Then(/^se comparte la recarga exitosamente$/, async () => {
    await rechargeWinstateScreen.verifyShareRecharge();
});

Then(/^presiona nueva recarga y se redirige a la pantalla de opciones$/, async () => {
    await rechargeWinstateScreen.startNewRechargeFromWinState();
});

When(/^realiza una nueva recarga a otro numero desde el WinState con "([^"]*)" "([^"]*)"$/,
    async (company: string, amount: string) => {
        await rechargeScreen.newRechargeFromWinState("otra persona");
        await rechargeScreen.rechargeOtherNumberFromOptions(company, amount);
    },
);