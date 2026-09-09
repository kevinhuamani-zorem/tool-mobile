import { expect } from '@wdio/globals';
import { Then, When } from '@wdio/cucumber-framework';
import movementsScreen from '@screenobjects/payment/movements.screen.ts';

When(/^el usuario consulta todos sus movimientos$/, async () => {
    await movementsScreen.viewAllMovements();
});

When(/^el usuario selecciona envia el reporte al correo por defecto del cliente$/, async () => {
    await movementsScreen.userSelectSendReportEmailDefectoCliente();
});

Then(/^confirmacion de envio de correo$/, async () => {
    const visible: boolean = await movementsScreen.confirmationSendEmail();
    expect(visible).toBe(true);
});
