import CommonsPaymentScreen from "@screenobjects/bill-payment/commons-payment.screen.ts";
import paymentModalitiesScreen from "@screenobjects/bill-payment/payment-modalities.screen.ts";
import paymentWinstateScreen from "@screenobjects/bill-payment/payment-winstate.screen.ts";
import {
    toggleFractionalPaymentByServiceName,
    toggleYapeoAlto,
} from "@utils/bill-payment/yapeo-alto.helper.ts";
import redis from "@utils/redis.helper.ts";
import { scenarioSession } from "@utils/ScenarioSession.ts";
import { After, Given, Then, When } from "@wdio/cucumber-framework";

let activatedFractionalService: string | null = null;

Given(/^que se activa el pago fraccionado para la empresa "(.*)"$/, async (service: string) => {
    activatedFractionalService = service;
    await toggleFractionalPaymentByServiceName(service, true);
    await driver.pause(2000);
});

After({ tags: "@payment-services" }, async () => {
    if (activatedFractionalService) {
        await toggleFractionalPaymentByServiceName(activatedFractionalService, false);
        activatedFractionalService = null;
    }
});

Given(/^que el usuario navega a la seccion de pago de servicios$/, async () => {
    await paymentModalitiesScreen.navigateToPaymentServices();
});

When(/^busca la empresa "(.*)"$/, async (company: string) => {
    await paymentModalitiesScreen.searchCompany(company);
});

When(
    /^selecciona el recibo con codigo "([^"]*)" de la empresa "([^"]*)" con modalidad "([^"]*)" y tipo "([^"]*)"$/,
    async (
        code: string,
        company: string,
        modality: string,
        serviceType: string,
    ) => {
        await paymentModalitiesScreen.selectReceiptAndPay(
            code,
            company,
            modality,
            serviceType,
        );
    },
);

Then(/^se visualiza la pantalla WinState de pago de servicio$/, async () => {
    await paymentWinstateScreen.verifyServicePaidWinState();
});

When(
    /^ingresa al buscador y busca la keyword "(.*)"$/,
    async (keyword: string) => {
        const keywords: string[] = keyword.split(",").map((k) => k.trim());
        if (keywords.length > 1) {
            await paymentModalitiesScreen.searchKeyword(keywords[0]);
            for (let i = 1; i < keywords.length; i++) {
                await CommonsPaymentScreen.clearSearch(keywords[i - 1].length);
                await driver.pause(2000);
                await paymentModalitiesScreen.enterKeyword(keywords[i]);
            }
        } else {
            await paymentModalitiesScreen.searchKeyword(keyword);
        }
    },
);

Then(/^se muestran resultados de busqueda$/, async () => {
    await paymentWinstateScreen.verifyCompanyInWinState();
});

Given(/^el usuario (.*) configura el umbral de yapeo alto$/, async (username: string) => {
    scenarioSession.loadInteroperableUsers();
    const user = scenarioSession.setUserAs(username);

    if (!user) {
        throw new Error('No user was found with the specified name.');
    }

    await toggleYapeoAlto(user.emailHash, 1);
    await driver.pause(2000);
});

Then(/^se visualiza la pantalla de validacion OTP$/, async () => {
    const otp = await redis.readLatestBillPaymentOtp();
    if (!otp) {
        throw new Error('[payment-modalities] No recent bill payment OTP found in Redis.');
    }
    await paymentWinstateScreen.validateOtpAndContinue(otp);
});

Then(/^se desactiva el OTP para pagos futuros$/, async () => {
    const user = scenarioSession.getUser();
    await toggleYapeoAlto(user.emailHash, 500);
});

Given(/^navega desde la pantalla WinState a movimientos generando el reporte de pago$/, async () => {
    await CommonsPaymentScreen.toLeaveAnAftertaste();
});

Then(/^se visualiza el envio del reporte$/, async () => {
    await paymentWinstateScreen.verifyEmailSentConfirmation();
});

Given(/^se finaliza el pago en dolares$/, async () => {
    await driver.pause(2000);
    await paymentModalitiesScreen.confirmDollarPayment();
});