import { Given, When, Then } from '@wdio/cucumber-framework';
import betweenAccounts from '@screenobjects/tipo-de-cambio/between-accounts.screen.ts';
import { ConstantsExchangeRate } from '@utils/constants-tipo-de-cambio.ts';

const NAME_DOLLARS_TO_SEARCH = 'Dólar\n';

Given(/^el usuario ingresa a cambiar dólares desde el home de yape$/, async () => {

    const isViewAllDisplayed = await betweenAccounts.checkIfViewAllShortcutIsDisplayed();
    if (isViewAllDisplayed) {
        await betweenAccounts.viewAll();
    } else {
        await betweenAccounts.viewMore();
    }

    const continueWithChangeDollarAltShortcut = await betweenAccounts.checkIfChangeDollarsAltShortcutIsDisplayed();
    if (continueWithChangeDollarAltShortcut) {
        await betweenAccounts.enterChangeDollarsAlt();
    } else {
        await betweenAccounts.enterChangeDollars();
    }

    await betweenAccounts.continue();
    if (driver.isIOS) {
        await betweenAccounts.showExchangeRateHome();
    }
});

Given(/^selecciona cambiar dólares desde el home de tipo de cambio$/, async () => {
    await betweenAccounts.enterHomeChangeDollars();
});

When(/^selecciona tab (.+) realiza la cotización (.+) ([\d.,]+)$/, async (tab: string, operation: string, amount: string) => {
    await betweenAccounts.reloadExchangeRate();
    await betweenAccounts.dollarAmount(tab, operation, amount);

    await betweenAccounts.continueChangeDollars();
});

Given(/^el usuario confirma la transacción Yape$/, async () => {
    await betweenAccounts.confirmTransferBetweenAccounts();
    await betweenAccounts.duplicateValue();
});

Then(/^se muestra pantalla con la información de la operación realizada$/, async () => {
    if (driver.isIOS) {
        await betweenAccounts.showExchangeRateWinstate();
    }
    await betweenAccounts.close();
});

Then(/^la operación entre cuentas aparece registrado en movimientos$/, async () => {
    const winstateReceiveAmount = await betweenAccounts.receiveAmount();
    const winstateExchangeAmount = await betweenAccounts.exchangeAmount();
    const currency = await betweenAccounts.currency();
    await betweenAccounts.goToDollars();
    const movementsInDollars = await betweenAccounts.movementsHomeExchangeRateDollars();
    await betweenAccounts.solesTabMovements();
    const movementsInSoles = await betweenAccounts.movementsHomeExchangeRateSoles();
    await betweenAccounts.validationAmounts(currency, winstateExchangeAmount, winstateReceiveAmount, movementsInDollars, movementsInSoles);
});

Then(/^se muestra la pantalla de error (.+) con el mensaje (.+)$/, async (title: string, message: string) => {
    if (title === ConstantsExchangeRate.TITLE_CARD_BLOCKED) {
        await betweenAccounts.showBlockedCardError(title, message);
    } else if (title === ConstantsExchangeRate.TITLE_INSUFFICIENT_DOLLAR_BALANCE) {
        await betweenAccounts.showInsufficientFundsError(title, message);
    } else {
        throw new Error(`The title cannot be found: "${title}"`);
    }
});

Given(/^el usuario puede regresar al home presionando "Ir al Inicio" desde la pantalla de error$/, async () => {
    await betweenAccounts.btnGoToYapeHome();
    await betweenAccounts.yapeHomeScreen();
});

Given(/^el usuario puede regresar al home de tdc presionando "IR AL INICIO" desde la pantalla de error$/, async () => {
    await betweenAccounts.txtGoToHomeTdc();
    await betweenAccounts.yapeHomeTdcScreen();
});
