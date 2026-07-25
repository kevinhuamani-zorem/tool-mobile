import { When, Then } from '@wdio/cucumber-framework';
import rmnMarketingScreen from '@screenobjects/martech/rmn/rmn-stories.screen.ts';
import { scenarioSession } from '../../../../support/utils/ScenarioSession.ts';

When(/^el usuario abre la URL (.*) mediante deep link$/, async (url: string) => {
    const password = scenarioSession.getUser()?.password;
    await rmnMarketingScreen.openDeepLink(url, password);
});

Then(/^la aplicación navega correctamente a la página solicitada$/, async () => {
    await rmnMarketingScreen.verifyMarketingPageReady();
});

Then(/^se realiza la interacción (.*) dentro de la webview$/, async (interaction: string) => {
    const normalizedInteraction = interaction.trim().toLowerCase();

    switch (normalizedInteraction) {
        case 'close':
            await rmnMarketingScreen.clickCloseButton();
            await rmnMarketingScreen.verifyHomeYapeIsDisplayed();
            break;

        case 'volume':
            await rmnMarketingScreen.clickVolumeOffButton();
            await rmnMarketingScreen.verifyVolumeActive();
            await rmnMarketingScreen.clickVolumeOnButton();
            break;

        case 'like':
            await rmnMarketingScreen.clickLikeOffButton();
            await rmnMarketingScreen.verifyLikeActive();
            await rmnMarketingScreen.clickLikeOnButton();
            break;

        default:
            throw new Error(
                `Unsupported interaction: "${interaction}". Allowed values: close | volume | like`
            );
    }
});

Then(
    /^se realiza el redireccionamiento a través del siguiente CTA (.*) desde la historia (.*)$/,
    async (cta: string, contentNumber: string) => {
        const normalizedCta = cta.trim().toLowerCase();
        const storyIndex = Number(contentNumber);

        if (Number.isNaN(storyIndex) || storyIndex < 0) {
            throw new Error(`The contentNumber must be a number greater than or equal to 0, received value: ${contentNumber}`);
        }

        // Navega hasta la historia indicada (0 = historia actual, 1 = siguiente, etc.)
        await rmnMarketingScreen.goToNextContent(storyIndex);

        switch (normalizedCta) {
            case 'cta_internal_redirect_yapear_servicios':
                await rmnMarketingScreen.tapCtaYapearServicios();
                await rmnMarketingScreen.verifyYapearServiciosScreen();
                await rmnMarketingScreen.leaveYapearServiciosScreen();
                await rmnMarketingScreen.verifyHomeAfterLeavingYapearServicios(scenarioSession.getUser()?.password);
                break;

            case 'cta_external_redirect':
                await rmnMarketingScreen.tapCtaExternalRedirect();
                await rmnMarketingScreen.verifyExternalAppAlert();
                await rmnMarketingScreen.confirmExternalAppAlert();
                await rmnMarketingScreen.verifyExternalBrowserOpened();
                await rmnMarketingScreen.returnFromExternalBrowser(scenarioSession.getUser()?.password);
                await rmnMarketingScreen.verifyHomeYapeIsDisplayed();
                break;

            case 'cta_webview_redirect':
                await rmnMarketingScreen.tapCtaWebviewRedirect();
                await rmnMarketingScreen.verifyPromotionsWebviewLoaded();
                await rmnMarketingScreen.closePromotionsWebview();
                await rmnMarketingScreen.verifyHomeYapeIsDisplayed();
                break;

            default:
                throw new Error(`Unsupported CTA: ${cta}`);
        }
    }
);

Then(/^la aplicación muestra la pantalla de error con el mensaje (.*)$/, async (expectedMessage: string) => {
    await rmnMarketingScreen.verifyErrorScreenMessage(expectedMessage);
});

Then(/^decide dar click en el boton Ir a inicio y regresar a home yape$/, async () => {
    await rmnMarketingScreen.tapGoHomeFromError();
    await rmnMarketingScreen.verifyHomeYapeIsDisplayed();
});