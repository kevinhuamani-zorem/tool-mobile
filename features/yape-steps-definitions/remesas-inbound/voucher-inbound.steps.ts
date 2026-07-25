import { When, Then } from '@wdio/cucumber-framework';
import remittanceVoucherScreen from '../../../screenobjects/remesas-inbound/remittance-voucher.screen.ts';

When(/^selecciona el primer voucher de remesas$/, async () => {
    await remittanceVoucherScreen.selectFirstVoucher();
});

When(/^selecciona el primer voucher de remesas en dólares$/, async () => {
    await remittanceVoucherScreen.selectFirstVoucher('$');
});

Then(/^se muestra el comprobante de la remesa$/, async () => {
    await remittanceVoucherScreen.validateVoucherDetail();
});

Then(/^el voucher muestra el monto en soles$/, async () => {
    await remittanceVoucherScreen.validateVoucherAmount('S/');
});

Then(/^el voucher muestra el monto en dólares$/, async () => {
    await remittanceVoucherScreen.validateVoucherAmount('$');
});
