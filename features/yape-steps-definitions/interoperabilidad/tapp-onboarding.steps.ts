import { When, Then } from '@wdio/cucumber-framework';
import homeScreen from '@screenobjects/home/home.screen.ts';
import tappOnboardingScreen from '@screenobjects/interoperabilidad/tapp-onboarding.screen.ts';
import tappOnboardingMismatchNumberScreen from '@screenobjects/interoperabilidad/tapp-onboarding-mismatch-number.screen.ts';

When(
    /^el usuario presiona el shortcut de TAPP desde el Home$/,
    async () => {
        await homeScreen.openTappShortcut();
    }
);

Then(
    /^se muestra la pantalla introductoria del onboarding de TAPP correctamente$/,
    async () => {
        await tappOnboardingScreen.validateIntroScreenIsDisplayed();
    }
);

When(
    /^el usuario presiona el botón Empezar$/,
    async () => {
        await tappOnboardingScreen.clickStart();
    }
);

When(
    /^el usuario presiona el botón Continuar del modal de verificación$/,
    async () => {
        await tappOnboardingScreen.clickContinue();
    }
);

Then(
    /^se muestra el modal de verificación de TAPP correctamente$/,
    async () => {
        await tappOnboardingScreen.validateVerificationModalIsDisplayed();
    }
);

Then(
    /^se muestra la pantalla de selección de SIM correctamente$/,
    async () => {
        await tappOnboardingScreen.validateSimSelectionScreenIsDisplayed();
    }
);

When(
    /^el usuario presiona el botón Continuar de la pantalla asociar SIM$/,
    async () => {
        await tappOnboardingScreen.clickContinueOnSimSelection();
    }
);

Then(
    /^se muestra la pantalla de envío de SMS correctamente$/,
    async () => {
        await tappOnboardingScreen.validateSmsSendingScreenIsDisplayed();
    }
);

When(
    /^el usuario presiona el botón Enviar SMS$/,
    async () => {
        await tappOnboardingScreen.clickSendSms();
    }
);

Then(
    /^se muestra la pantalla de verificación de datos de TAPP correctamente$/,
    async () => {
        await tappOnboardingScreen.validateDataVerificationScreenIsDisplayed();
    }
);

Then(
    /^se muestra la pantalla de confirmación de Tapp ID correctamente$/,
    async () => {
        await tappOnboardingScreen.validateTappIdCreationConfirmation();
    }
);

When(
    /^el usuario presiona el botón Añadir cuenta$/,
    async () => {
        await tappOnboardingScreen.clickAddAccount();
    }
);

Then(
    /^se muestra la pantalla Selecciona tu banco correctamente$/,
    async () => {
        await tappOnboardingScreen.validateBankSelectionScreenIsDisplayed();
    }
);

When(
    /^el usuario selecciona su banco$/,
    async () => {
        await tappOnboardingScreen.clickSelectBank();
    }
);

Then(
    /^se muestra la pantalla Elige una cuenta correctamente$/,
    async () => {
        await tappOnboardingScreen.validateAccountSelectionScreenIsDisplayed();
    }
);

When(
    /^el usuario selecciona su cuenta de banco$/,
    async () => {
        await tappOnboardingScreen.selectAccount();
    }
);

Then(
    /^se muestra la pantalla de ingreso de datos de tarjeta correctamente$/,
    async () => {
        await tappOnboardingScreen.validateCardDataScreenIsDisplayed();
    }
);

When(
    /^el usuario presiona el botón Ingresar datos de tarjeta$/,
    async () => {
        await tappOnboardingScreen.clickEnterCardData();
    }
);

Then(
    /^se muestra el modal de número no coincide con Yape correctamente$/,
    async () => {
        await tappOnboardingMismatchNumberScreen.validateMismatchNumberModalIsDisplayed();
    }
);
