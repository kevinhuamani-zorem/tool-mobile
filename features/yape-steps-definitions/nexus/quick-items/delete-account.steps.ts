import { Given, Then } from '@wdio/cucumber-framework';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import deleteAccountScreen from 'screenobjects/nexus/delete-account.screen.ts';
import { scenarioSession } from 'support/utils/ScenarioSession.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given(/^el usuario ingresa a la opción "Eliminar mi cuenta"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.deleteAccountButton, timeout, 'The delete account option was not displayed');
    await menuScreen.openDeleteAccount();
});

Then(/^se muestra correctamente la pantalla "Eliminar mi cuenta"$/, async () => {
    const user = scenarioSession.getUser();

    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(deleteAccountScreen.txtDeleteAccountTitle, timeout, 'The delete account title was not displayed');

    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(user.perfil === '19' ? deleteAccountScreen.descYapearButton : deleteAccountScreen.descDeleteButton, timeout, 'The expect element was not displayed');
});
