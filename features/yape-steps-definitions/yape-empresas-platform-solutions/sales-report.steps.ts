import { When } from '@wdio/cucumber-framework';
import salesScreen from '@screenobjects/payment/sales.screen.ts';
import homeScreen from '@screenobjects/home/home.screen.ts';

When(/^el usuario selecciona la opcion ver ventas$/, async () => {
    await homeScreen.clickSales();
});

When(/^el usuario selecciona la opcion reporte$/, async () => {
    await salesScreen.validateSelectSalescreen();
    await salesScreen.report();
});

When(/^el usuario selecciona la opcion enviar$/, async () => {
    await salesScreen.validateSendSalesReportScreen();
    await salesScreen.sendreport();
});

When(/^el usuario deberia visualizar el mensaje de reporte enviado$/, async () => {
    await salesScreen.validateReportSentScreen();
    await salesScreen.clickUnderstood();
});

When(/^el usuario selecciona la opcion entendido$/, async () => {
    await salesScreen.clickUnderstood();
});

When(/^el usuario selecciona la opcion filtros$/, async () => {
    await salesScreen.showfilters();
});

When(/^el usuario selecciona las opciones ultimos 15 días, exitosa y qr$/, async () => {
    await salesScreen.selectFiltersOptions();
});

When(/^el usuario selecciona opcion filtrar$/, async () => {
    await salesScreen.showfilterssales();
});

When(/^el usuario deberia visualizar los filtros aplicados$/, async () => {
    await salesScreen.validateAppliedFilters();
});
