import { Given, Then } from '@wdio/cucumber-framework';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import digitalBiometricsScreen from 'screenobjects/menu/digital-biometrics.screen.ts';

const timeout: number = getTimeoutFromEnv();

Then(/^el usuario ingresa a la opción "Biometría digital"$/, async () => {
    await menuScreen.openBiometric();
});

Given(/^se muestra correctamente la pantalla "Biometría digital"$/, async () => {

    await digitalBiometricsScreen.uiHelper.waitForElementDisplayedAndExpect(digitalBiometricsScreen.txtActivate, timeout, 'The activate biometrics text was not displayed');
    await digitalBiometricsScreen.uiHelper.waitForElementDisplayedAndExpect(digitalBiometricsScreen.txtInformation, timeout, 'The biometrics informational text was not displayed');
});
