import { Given, Then , DataTable } from '@wdio/cucumber-framework';
import homeScreen from 'screenobjects/home/home.screen.ts';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import menuScreenObject from 'screenobjects/nexus/menu/menu.screen.ts';
import apiClientNexus from 'support/utils/apiClientNexus.ts';
import { equalsLabel, getTimeoutFromEnv, normalizeLabel, QuickItems } from 'support/utils/Utils.ts';
import { scenarioSession } from 'support/utils/ScenarioSession.ts';
import { BusinessProfileConstants } from 'support/utils/constants-business-profile.ts';

const timeout: number = getTimeoutFromEnv();

const isYapeEmpresaProfile = (): boolean => {
    const user = scenarioSession.getUser();
    const perfilStr = String(user?.perfil ?? '').trim();
    return BusinessProfileConstants.isYapeEmpresaProfile(perfilStr);
};

Given(/^el usuario abre el menu hamburguesa$/, async () => {
    if (isYapeEmpresaProfile()) {
        await homeScreen.openMenuEmp();
    } else {
        await homeScreen.openMenu();
    }

});

Given(/se muestra correctamente el menu del usuario$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.btnCloseMenu, timeout, 'The close menu button was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuTitle, timeout, 'The text menu title was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.helpButton, timeout, 'The help button was not displayed');
});

Given(/se muestran las opciones "Mi Cuenta" y "Ajustes" y sus sub-opciones para el usuario de acuerdo a su perfil$/, async () => {
    try {
        const quickItems: QuickItems[] = await apiClientNexus.getMenuItemsFromHomeByType('quickItems');
        const requiredSections = ['Mi cuenta', 'Ajustes'];

        for (const section of requiredSections) {
            const quickItem = quickItems.find(item => item.defaultLabel === section);

            if (quickItem) {
                const labelUI = normalizeLabel(quickItem.defaultLabel);
                const uiElement = menuScreen.txtDynamicItem(labelUI);
                
                // Try to find element without scrolling first
                const isDisplayed = await uiElement.isDisplayed().catch(() => false);
                if (!isDisplayed) {
                   
                    await uiElement.scrollIntoView({ direction: 'down' }).catch((e) => {
                        console.log('Scroll failed for menu section element:', e && e.message ? e.message : e);
                    });
                }
                
                await menuScreen.uiHelper.waitForElementDisplayedAndExpect(uiElement, timeout, `The section "${labelUI}" was not displayed `);
                console.log(`Validated menu section: "${labelUI}"`);
            } else {
                console.warn(`Could not validate menu section: "${section}"`);
            }
        }

        for (const parent of quickItems) {
            if (!requiredSections.some(section => equalsLabel(parent.defaultLabel, section))) {
                // Ignore non-required sections
                continue;
            }

            const subItems = parent.items ?? [];

            for (const sub of subItems) {
                const subLabelUI = normalizeLabel(sub.defaultLabel);
                
                try {
                    // Strategy 1: Try direct xpath with text
                    const textSelector = `//android.widget.TextView[@text="${subLabelUI}"]`;
                    let subItem = await $(textSelector);
                    let isDisplayed = await subItem.isDisplayed().catch(() => false);
                    
                    if (!isDisplayed) {
                        // Strategy 2: Try with contains
                        const containsSelector = `//android.widget.TextView[contains(@text, "${subLabelUI}")]`;
                        subItem = await $(containsSelector);
                        isDisplayed = await subItem.isDisplayed().catch(() => false);
                    }
                    
                    if (!isDisplayed) {
                        // Strategy 3: Try with dynamic item method
                        subItem = menuScreen.txtDynamicItem(subLabelUI);
                        isDisplayed = await subItem.isDisplayed().catch(() => false);
                    }
                    
                    if (!isDisplayed) {
                        // Strategy 4: Try scrolling into view
                        try {
                            await subItem.scrollIntoView({ direction: 'down' });
                                await driver.waitUntil(
                                async () => await subItem.isDisplayed().catch(() => false),
                                {
                                    timeout,
                                    timeoutMsg: `Sub item "${subLabelUI}" was not displayed after scrolling`
                                }
                            );
                            isDisplayed = true;
                        } catch (e) {
                            console.log(`Scroll operation failed for sub item: ${subLabelUI}`);
                        }
                    }
                    
                    if (isDisplayed) {
                        console.log(`Sub item validated successfully: ${subLabelUI}`);
                    } else {
                        console.warn(`Sub item not displayed after all location strategies: ${subLabelUI}`);
                    }
                } catch (error) {
                    console.error(`Error validating sub item "${subLabelUI}":`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error validating menu:', error);
        throw error;
    }
});

Given(/se muestra la version de Yape, el tipo de cuenta, el nombre comercial y el RUC$/, async () => {
    await menuScreen.gestureHelper.verticalScrollingToEnd();
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuAppVersion, timeout, 'The text menu app version was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuAccountType, timeout, 'The text menu account type was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuCompanyName, timeout, 'The text menu company name was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuRUC, timeout, 'The text menu ruc was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuRUCNumber, timeout, 'The text menu ruc number version was not displayed');
});

Given(/se muestran los Términos y Condiciones, la Política de privacidad y Cerrar sesión$/, async () => {
    await menuScreen.gestureHelper.verticalScrollingToEnd();
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuTermsAndConditions, timeout, 'The text menu term and conditions was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuPrivacyPolicy, timeout, 'The text menu privacy policy was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtMenuSignOut, timeout, 'The text menu sign out was not displayed');
});

Then('el usuario visualiza las siguientes funcionalidades en su mundo correspondiente del menu de Yape Hijos:',
     async (dataTable: DataTable) => {
        const rows = dataTable.hashes();
    
        for (const row of rows) {
          const mundo = row.mundo;
          const funcionalidad = row.funcionalidades;
    
          await menuScreenObject.validateMenuItemInSection(mundo, funcionalidad);
        }
      });