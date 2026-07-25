import { Then } from '@wdio/cucumber-framework';
import LendingOtpValidationScreen from '@screenobjects/third-party-lending/otp-validation.screen.ts';

Then(/^se valida el envío y reenvío del código otp$/, async () => {
    await LendingOtpValidationScreen.getOtpValidation();
});
