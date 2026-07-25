import paymentWinstateScreen from "@screenobjects/bill-payment/payment-winstate.screen.ts";
import { ConstantsPagoDeServicio } from "@utils/constants-pago-de-servicio.ts";
import { scenarioSession } from "@utils/ScenarioSession.ts";
import { Given, Then } from "@wdio/cucumber-framework";

function openDeepLink(url: string): Promise<void | WebdriverIO.Request> {
    if (browser.isAndroid) {
        return driver.execute("mobile: deepLink", {
            url: url,
            package: process.env.APP_YAPE_PACKAGE || "com.yape.stg",
        });
    }

    return driver.execute("mobile: deepLink", {
        url,
        bundleId: process.env.BUNDLE_ID || "com.yape.qa",
    });
}

Given(
    /^el usuario abre el deeplink de categoria "(.*)" con id "(.*)"$/,
    async (name: string, categoryId: string) => {
        const baseUrl = browser.isAndroid
            ? `https://www.yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_CATEGORY_PATH}`
            : `yape://yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_CATEGORY_PATH}`;
        const url = `${baseUrl}?categoryId=${categoryId}&name=${encodeURIComponent(name)}`;
        console.log(`[Deeplink] Opening category deeplink: ${url}`);
        await openDeepLink(url);
    },
);


Then(
    /^la categoria "(.*)" esta pre-seleccionada$/,
    async (category: string) => {
        await paymentWinstateScreen.verifyCategorySelected(category);
    },
);

Given(/^el usuario abre el deeplink de pago de servicios$/, async () => {
    const url = browser.isAndroid ? ConstantsPagoDeServicio.DEEPLINK_HOME_ANDROID : ConstantsPagoDeServicio.DEEPLINK_HOME_IOS;
    console.log(`[Deeplink] Opening PdS home deeplink: ${url}`);
    await openDeepLink(url);
});


Then(/^se visualiza la pantalla de Home de Pago de Servicios$/, async () => {
    await paymentWinstateScreen.verifyPdSHomeScreen();
});

Given(
    /^el usuario abre el deeplink de pago de servicio con empresa pre-seleccionada$/,
    async () => {
        scenarioSession.loadInteroperableUsers();
        const user = scenarioSession.setUserAs("recharge_e2e");
        const consumerCode = String(user.idc);

        const baseUrl = browser.isAndroid
            ? `https://www.yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PATH}`
            : `yape://yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PATH}`;
        const url = `${baseUrl}?${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PARAMS_BACKUS}&consumerCode=${consumerCode}`;
        console.log(`[Deeplink] Opening PdS pickService deeplink: ${url}`);
        await openDeepLink(url);
    },
);

Then(/^se visualiza la empresa "(.*)" esta pre-seleccionada$/, async (company: string) => {
    await paymentWinstateScreen.verifyCompanySelected(company);
});

Given(
    /^se prepara el usuario (.*) para deeplink$/,
    async (userName: string) => {
        scenarioSession.loadInteroperableUsers();
        scenarioSession.setUserAs(userName);
    },
);

Given(
    /^el usuario abre el deeplink enriquecido de Movistar sin deuda$/,
    async () => {
        const user = scenarioSession.getUser();
        const consumerCode = String(user.idc);

        const baseUrl = browser.isAndroid
            ? `https://www.yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PATH}`
            : `yape://yape.com.pe${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PATH}`;
        const url = `${baseUrl}?${ConstantsPagoDeServicio.DEEPLINK_PICK_SERVICE_PARAMS_ENTEL}&consumerCode=${consumerCode}`;
        console.log(`[Deeplink] Opening Movistar no-debt deeplink: ${url}`);
        await openDeepLink(url);
    },
);

Then(/^se muestra un mensaje indicando que no se encontro deuda$/, async () => {
    await paymentWinstateScreen.verifyErrorModalMessage(
        "No encontramos deudas pendientes",
    );
});

