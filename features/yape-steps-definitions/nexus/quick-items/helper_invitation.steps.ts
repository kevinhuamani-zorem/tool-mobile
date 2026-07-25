import { Then } from '@wdio/cucumber-framework';
import helperInvitationScreen from 'screenobjects/nexus/helper-invitation.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Then(/^se muestra la notificación de invitación a ser ayudante$/, async () => {
    await helperInvitationScreen.uiHelper.waitForElementDisplayedAndExpect(helperInvitationScreen.notificationTitle, timeout, 'The helper invitation notification title was not displayed');
});

Then(/^la notificación contiene los elementos correctos$/, async () => {
    await helperInvitationScreen.uiHelper.waitForElementDisplayedAndExpect(helperInvitationScreen.notificationTitle, timeout, 'The notification title was not displayed');
    await helperInvitationScreen.uiHelper.waitForElementDisplayedAndExpect(helperInvitationScreen.notificationMessage, timeout, 'The notification message was not displayed');
});

Then(/^se puede aceptar o rechazar la invitación$/, async () => {
    await helperInvitationScreen.uiHelper.waitForElementDisplayedAndExpect(helperInvitationScreen.btnAcceptInvitation, timeout, 'The accept button was not displayed');
    await helperInvitationScreen.uiHelper.waitForElementDisplayedAndExpect(helperInvitationScreen.btnRejectInvitation, timeout, 'The reject button was not displayed');
});
