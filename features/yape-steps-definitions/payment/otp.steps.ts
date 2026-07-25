import { Given, When, Then } from '@wdio/cucumber-framework';
import yapearOTPScreen from '../../../screenobjects/payment/yapear-otp.screen.ts';

When(/^se valida con codigo OTP$/, async () => {
    await yapearOTPScreen.validateConfirmaYapeoAltoScreen();
});

When(/^selecciona el boton de validacion$/, async () => {
    await yapearOTPScreen.pressButtonValideCode();
});
