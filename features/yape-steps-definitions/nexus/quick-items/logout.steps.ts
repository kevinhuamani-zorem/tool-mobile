import { Then, When } from '@wdio/cucumber-framework';
import unlockScreen from 'screenobjects/autenticacion/unlock/unlock.screen.ts';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

When(/^el usuario presiona "Cerrar Sesión"$/, async () => {

    await menuScreen.scrollToText('Cerrar sesión');
    await menuScreen.signOut();
});

Then(/^se muestra la pantalla de unlock$/, async () => {
    await unlockScreen.uiHelper.waitForElementDisplayedAndExpect(unlockScreen.txtEnterYourPassword, timeout, 'The enter your password text was not displayed');
    await unlockScreen.uiHelper.waitForElementDisplayedAndExpect(unlockScreen.descQrUnlock, timeout, 'The unlock QR was not displayed');
});