import { Given, Then, When } from "@wdio/cucumber-framework";
import { scenarioSession } from "@utils/ScenarioSession.ts";
import apiClient from "@utils/apiClient.ts";
import paymentPersonalityScreen from "@screenobjects/bill-payment/payment-personality.screen.ts";
import paymentWinstateScreen from "@screenobjects/bill-payment/payment-winstate.screen.ts";
import commonsPaymentScreen from "@screenobjects/bill-payment/commons-payment.screen.ts";
import { ConstantsPagoDeServicio } from "@utils/constants-pago-de-servicio.ts";


Given(/^se configura la personality "(.*)" del usuario$/,
    async (personality: string) => {
        const user = scenarioSession.getUser();
        await apiClient.change_user_personality(user.idc, personality);
    },
);


When(/^ingresa el idc del usuario como codigo de suministro$/, async () => {
    const user = scenarioSession.getUser();
    await paymentPersonalityScreen.enterCodeAndContinue(String(user.idc));
});

Then(
    /^se visualiza el modal de error con mensaje "(.*)"$/,
    async (message: string) => {
        await paymentWinstateScreen.verifyErrorModalMessage(message);
    },
);

Then(
    /^se visualiza el modal de error con mensaje "(.*)" personality$/,
    async (message: string) => {
        await paymentWinstateScreen.verifyErrorModalMessageAndroid(message);
    },
);

When(/^ingresa el idc del usuario como codigo de cliente$/, async () => {
    const user = scenarioSession.getUser();
    await paymentPersonalityScreen.enterClientCodeAndContinue(user.idc);
});

When(/^selecciona el recibo y presiona Yapear Servicio$/, async () => {
    await paymentPersonalityScreen.selectReceiptAndTapPay();
});

When(
    /^selecciona el recibo con codigo "([^"]*)" tipo "([^"]*)" de la empresa "([^"]*)" con modalidad "([^"]*)"$/,
    async (
        code: string,
        serviceType: string,
        company: string,
        modality: string,
    ) => {
        await paymentPersonalityScreen.selectReceiptAndPay(
            code,
            company,
            modality,
            serviceType,
        );
    },
);

When(
    /^selecciona el recibo con codigo "([^"]*)" de la empresa "([^"]*)"$/,
    async (
        code: string,
        serviceType: string,
    ) => {
        await commonsPaymentScreen.selectService(serviceType);
        await paymentPersonalityScreen.enterClientCodeAndContinue(code);
        await commonsPaymentScreen.enterCodeAmountAndPay(ConstantsPagoDeServicio.AMOUNT_TO_PAY);
    },
);

When(
    /^selecciona el recibo con codigo "([^"]*)" de la empresa$/,
    async (
        code: string,
    ) => {
        await paymentPersonalityScreen.enterClientCodeAndContinue(code);
        await commonsPaymentScreen.enterCodeAmountAndPay(ConstantsPagoDeServicio.AMOUNT_TO_PAY);
    },
);

When(
    /^selecciona el recibo en dolares con codigo "([^"]*)" de la empresa$/,
    async (
        code: string,
    ) => {
        await paymentPersonalityScreen.enterClientCodeAndContinue(code);
        await commonsPaymentScreen.enterCodeAmountAndPayDollar(ConstantsPagoDeServicio.AMOUNT_TO_PAY);
    },
);

When(
    /^selecciona el recibo con codigo "([^"]*)" tipo "([^"]*)" de la empresa "([^"]*)" con modalidad "([^"]*)" y monto "([^"]*)"$/,
    async (
        code: string,
        serviceType: string,
        company: string,
        modality: string,
        amount: string,
    ) => {
        await paymentPersonalityScreen.selectReceiptAndPayWithoutYapear(
            code,
            company,
            modality,
            amount,
            serviceType,
        );
    },
);

Then(
    /^se visualiza la informacion de pago con empresa en el WinState$/,
    async () => {
        await paymentWinstateScreen.verifyServicePaidWinState();
    },
);

Then(
    /^se visualiza el mensaje de error "(.*)"$/,
    async (errorMessage: string) => {
        await paymentWinstateScreen.verifyAmountErrorMessage(errorMessage);
    },
);

Then(/^el boton YAPEAR SERVICIO se encuentra deshabilitado$/, async () => {
    await paymentWinstateScreen.verifyPayServiceButtonDisabled();
});


Then(
    /^se visualiza el mensaje de error de montos$/,
    async () => {
        await paymentWinstateScreen.verifyAmountError();
    },
);

Then(
    /^se visualiza en recientes la glosa de pago con empresa "(.*)"$/,
    async (company: string) => {
        await paymentWinstateScreen.verifyRecentPaymentGloss(company);
    },
);
