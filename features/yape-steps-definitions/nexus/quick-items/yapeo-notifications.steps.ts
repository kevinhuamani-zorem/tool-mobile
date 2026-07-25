import { When, Given, Then } from '@wdio/cucumber-framework';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import notificationScreen from 'screenobjects/nexus/notification-yapeo.screen.ts';

const timeout: number = getTimeoutFromEnv();

Given(/^ingresa a la opción "Notificaciones por yapeo"$/, async () => {

    await menuScreen.scrollToText('Notificaciones por yapeo');

    await menuScreen.openNotifications();
});

Then(/^se visualizan correctamente los elementos de la pantalla "Notificaciones por yapeo"$/, async () => {
    await notificationScreen.uiHelper.waitForElementDisplayedAndExpect(notificationScreen.txtMenuTitle, timeout, 'The screen title was not displayed');
    await notificationScreen.uiHelper.waitForElementDisplayedAndExpect(notificationScreen.backButton, timeout, 'The back button was not displayed');
    await notificationScreen.uiHelper.waitForElementDisplayedAndExpect(notificationScreen.txtGetEmail, timeout, 'The Receive email notification text was not displayed');
});

Given(/^se escoge el monto (.*) para las "Notificaciones por yapeo"$/, async function (amount: string) {

    await notificationScreen.clickChange();
    await notificationScreen.selectBalance(amount);

});

Given(/^las notificaciones por yapeo se encuentran habilitadas$/, async () => {
    await notificationScreen.enableNotificationsIfDisabled('10');
});

When(
    /^el usuario deshabilita las notificaciones por yapeo$/,
    async () => {
        await notificationScreen.disableNotifications();
    }
);
Then(
    /^se muestra el mensaje de confirmación de guardado$/,
    async () => {
        await notificationScreen.uiHelper.waitForElementDisplayedAndExpect(
            notificationScreen.txtToastSuccess,
            timeout,
            'Success toast was not displayed'
        );
    }
);