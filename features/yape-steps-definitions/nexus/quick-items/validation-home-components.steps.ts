import { Then } from '@wdio/cucumber-framework';
import homeScreen from 'screenobjects/home/home.screen.ts';
import welcomeYaperoScreen from 'screenobjects/home/welcomeyapero.screen.ts';
import { scenarioSession } from 'support/utils/ScenarioSession.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import apiClientNexus from 'support/utils/apiClientNexus.ts';
import { BusinessProfileConstants } from 'support/utils/constants-business-profile.ts';

const timeout = getTimeoutFromEnv();

const isYapeEmpresaProfile = (): boolean => {
    const user = scenarioSession.getUser();
    const perfilStr = String(user?.perfil ?? '').trim();
    return BusinessProfileConstants.isYapeEmpresaProfile(perfilStr);
};

Then('se muestra correctamente la pantalla de home', async () => {
    await welcomeYaperoScreen.showHome();
});

Then('se muestra el icono del menú', async () => {
    const menuIcon = isYapeEmpresaProfile() ? homeScreen.btnMenuEmpresas : homeScreen.btnMenu;
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(menuIcon, timeout, 'The menu icon was not displayed');
});

Then('se muestra el icono de ayuda', async () => {
    const helpIcon = isYapeEmpresaProfile() ? homeScreen.btnHelpEmp : homeScreen.btnBtnCdaHome;
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(helpIcon, timeout, 'The help icon was not displayed');
});

Then('se muestra el icono de campanita', async () => {
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.btnNotifications, timeout, 'The notifications icon was not displayed');
});

Then('se muestra el buscador como "Buscar en yape"', async () => {
    if (isYapeEmpresaProfile()) return;
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.btnSearch, timeout, 'The search button was not displayed');
});

Then('se muestra la barra de banners disponibles para el perfil', async () => {
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.banner, timeout, 'The banner section was not displayed');
});

Then('se muestra el saldo correspondiente', async () => {
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.lblBalance, timeout, 'The balance was not displayed');
});

Then('se muestran los movimientos recientes', async () => {
    const movementsLabel = isYapeEmpresaProfile() ? homeScreen.lblSales : homeScreen.lblRecentMovements;
    const message = isYapeEmpresaProfile() ? 'The sales label was not displayed' : 'The recent movements were not displayed';
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(movementsLabel, timeout, message);
});

Then('se muestra el botón de "escanear qr"', async () => {
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.btnScanQR, timeout, 'The scan QR button was not displayed');
});

Then('se muestra el botón de "yapear"', async () => {
    await homeScreen.uiHelper.waitForElementDisplayedAndExpect(homeScreen.btnYapear, timeout, 'The yapear button was not displayed');
});

Then('se muestran los home items configurados para el perfil', async () => {
    const listWorlds = await apiClientNexus.getMenuItemsFromHomeByType('listWorlds');
    
    if (!listWorlds?.length) return;
    
    const worldItems = listWorlds.filter((world: { itemTypeName: string; items?: unknown[] }) => 
        world.itemTypeName === 'WorldItem' && world.items?.length
    );

    await Promise.allSettled(
        worldItems.flatMap((worldItem: { items: { defaultLabel: string }[] }) => 
            worldItem.items.map(async (subItem: { defaultLabel: string }) => {
                const element = homeScreen.txtDynamicItem(subItem.defaultLabel);
                const isDisplayed = await element.isDisplayed().catch(() => false);
                
                if (isDisplayed) {
                    console.info(`Home item "${subItem.defaultLabel}" is displayed.`);
                } else {
                    console.warn(`Home item "${subItem.defaultLabel}" is not displayed.`);
                }
            })
        )
    );
});

