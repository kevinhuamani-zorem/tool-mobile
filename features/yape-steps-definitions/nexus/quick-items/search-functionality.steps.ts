import { Given, When, Then } from '@wdio/cucumber-framework';
import homeScreen from 'screenobjects/home/home.screen.ts';
import searchScreen from 'screenobjects/nexus/search-functionality.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';


const timeout: number = getTimeoutFromEnv();


Given(/^el usuario ingresa al buscador desde el Home$/, async () => {

    await homeScreen.btnSearch.waitForDisplayed({ timeout });
    await homeScreen.openSearch();
});




Given(/^se busca y valida cada funcionalidad en el buscador$/, async (dataTable) => {
  const functionalities: string[] = dataTable.raw().flat();
  await searchScreen.searchEachFunctionality(functionalities);
});


