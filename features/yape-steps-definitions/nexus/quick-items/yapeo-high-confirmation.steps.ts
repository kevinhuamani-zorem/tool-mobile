import { Then,When,Given } from '@wdio/cucumber-framework';
import menuScreen from '@screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from '@utils/Utils.ts';
import yapeoHighConfirmationScreen from '@screenobjects/menu/yapeo-high-confirmation.screen.ts';
import { scenarioSession } from '@utils/ScenarioSession.ts';
import { BusinessProfileConstants } from '@utils/constants-business-profile.ts';

const timeout: number = getTimeoutFromEnv();

const isYapeEmpresaProfile = (): boolean => {
    const user = scenarioSession.getUser();
    const perfilStr = String(user?.perfil ?? '').trim();
    return BusinessProfileConstants.isYapeEmpresaProfile(perfilStr);
};

Given(/^el usuario ingresa a la opción "Confirmación de yapeo alto"$/, async () => {
    if (isYapeEmpresaProfile()) {
        await menuScreen.scrollToText('Confirmación de yapeo alto');
        await menuScreen.openConfirmation();
    } else {
        await menuScreen.openConfirmation();
    }

});

Given(/^se muestran correctamente los elementos de la pantalla$/, async () => {

    await yapeoHighConfirmationScreen.uiHelper.waitForElementDisplayedAndExpect(yapeoHighConfirmationScreen.txtTitle, timeout, 'The title was not displayed'
    );

    await yapeoHighConfirmationScreen.uiHelper.waitForElementDisplayedAndExpect(
        yapeoHighConfirmationScreen.txtScreenDesc, timeout, 'The description was not displayed'
    );

    await yapeoHighConfirmationScreen.uiHelper.waitForElementDisplayedAndExpect(
        yapeoHighConfirmationScreen.txtActivateConfirmation, timeout, 'The text was not displayed'
    );
});

Given(/^se valida que la confirmación de Yapeo Alto funcione correctamente al activar y desactivar la opción$/, async () => {
    await yapeoHighConfirmationScreen.uiHelper.waitForElementDisplayedAndExpect(yapeoHighConfirmationScreen.btnSwitch, timeout, 'The switch button was not displayed');

    await yapeoHighConfirmationScreen.pressSwitch();
    await yapeoHighConfirmationScreen.pressSwitch();
});

Given(
    /^la confirmacion de yapeo alto se encuentran habilitada$/,
    async () => {
        await yapeoHighConfirmationScreen.enableIfDisabled('500');
    }
);

When(/^el usuario deshabilita la Confirmación de yapeo alto$/, async () => {
    await yapeoHighConfirmationScreen.disableIfEnabled();
});

Then(
    /^se muestra el mensaje de confirmación de guardado$/,
    async () => {
        await yapeoHighConfirmationScreen.uiHelper.waitForElementDisplayedAndExpect(
            yapeoHighConfirmationScreen.txtToastSuccess,
            timeout,
            'Success toast was not displayed'
        );
    }
);