import { Then } from '@wdio/cucumber-framework';
import lendingQuote from '@screenobjects/third-party-lending/quote-amount.screen.ts';

Then(/^se actualiza el monto (\d+) del crédito$/, async (newAmount: string) => {
    await lendingQuote.lendingQuoteAmount(newAmount);
});

Then(/^se realiza la validación de los parámetros de la cotización$/, async () => {
    await lendingQuote.verifyQuoteAmount();
});
