import { Given, Then } from '@wdio/cucumber-framework';
import helpScreen from 'screenobjects/nexus/help.screen.ts';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given(/^el usuario ingresa a la opción "Ayuda"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.helpButton, timeout, 'The help button was not displayed');
    await menuScreen.openHelp();
});

Then(/^se muestra correctamente el "Centro de Ayuda"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(helpScreen.backButton, timeout, 'The back button was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(helpScreen.txtEnterYourQuery, timeout, 'The text enter your query was not displayed');
});