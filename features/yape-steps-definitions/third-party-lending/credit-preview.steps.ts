import { Then } from '@wdio/cucumber-framework';
import lendingCreditPreview from '@screenobjects/third-party-lending/credit-preview.screen.ts';

Then(/^se valida la hoja resumen previo al desembolso$/, async () => {
    await lendingCreditPreview.verifyCreditPreview();
});
