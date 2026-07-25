import { Then } from '@wdio/cucumber-framework';
import paymentDetailScreen from '../../../screenobjects/home/payment-detail.screen.ts';
import winstateMktplaceScreen from '../../../screenobjects/marketplace/winstate.screen.ts';
import { clickCloseNewWinstate } from 'support/utils/Utils.ts';

Then(/se selecciona el tipo de pago: (.*)$/, async(paymentType: string) => {
    await paymentDetailScreen.selectPayment(paymentType);
});

Then(/se acepta terminos y condiciones$/, async() => {
    await paymentDetailScreen.acceptTermsAndConditions();
});

Then(/selecciona el boton de pago$/, async() => {

    await  paymentDetailScreen.goToPay();
});

Then(/se valida el winstate de pago$/, async() => {
    await clickCloseNewWinstate();
});
