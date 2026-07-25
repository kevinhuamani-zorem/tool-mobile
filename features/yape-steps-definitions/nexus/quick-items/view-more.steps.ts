import { Then, When } from '@wdio/cucumber-framework';
import homeScreen from 'screenobjects/home/home.screen.ts';
import marketplaceHomeScreen from 'screenobjects/home/marketplace-home.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import viewMoreScreen from 'screenobjects/nexus/view-more.screen.ts';
import { scenarioSession } from 'support/utils/ScenarioSession.ts';
import { BusinessProfileConstants } from 'support/utils/constants-business-profile.ts';

const timeout: number = getTimeoutFromEnv();

const isYapeEmpresaProfile = (): boolean => {
    const user = scenarioSession.getUser();
    const perfilStr = String(user?.perfil ?? '').trim();
    return BusinessProfileConstants.isYapeEmpresaProfile(perfilStr);
};

When(/^ingresa a la opción "Ver más" de los Home Items$/, async () => {

    await marketplaceHomeScreen.openViewAll();
    
});

Then(/^se muestra el modal con la lista de mundos y funcionalidades para el usuario de acuerdo a su perfil$/, async () => {

    await viewMoreScreen.verifyWorldsAndFeaturesModal();
});

Then(/^se cierra el modal$/, async () => {
    await homeScreen.closeShortcutVerMas();
});

Then(/^se muestra nuevamente la pantalla del "Home"$/, async () => {

    const menuIcon = isYapeEmpresaProfile() ? homeScreen.btnMenuEmpresas : homeScreen.btnMenu;
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(menuIcon, timeout, 'The home screen was not displayed');

});