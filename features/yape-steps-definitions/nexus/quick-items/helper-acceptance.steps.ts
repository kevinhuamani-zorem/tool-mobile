import { When, Then } from '@wdio/cucumber-framework';
import helperAcceptanceScreen from 'screenobjects/nexus/helper-acceptance.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Then(/^verifica si se encuentra la opción "Ver ventas del día" en Ver más$/, async () => {
    await helperAcceptanceScreen.uiHelper.waitForElementDisplayedAndExpect(helperAcceptanceScreen.salesDayOption, timeout, 'The "Ver ventas del día" option was not displayed in View More');
});

When(/^ingresa al mundo de ayudantes$/, async () => {
    await helperAcceptanceScreen.openHelperWorld();
});

Then(/^verifica si se encuentra la opción "Ver ventas del día" en el mundo de ayudantes$/, async () => {
    await helperAcceptanceScreen.uiHelper.waitForElementDisplayedAndExpect(helperAcceptanceScreen.salesDayOption, timeout, 'The "Ver ventas del día" option was not displayed in the helper world');
});
