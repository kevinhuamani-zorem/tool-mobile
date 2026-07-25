import { When, Then } from '@wdio/cucumber-framework';
import lendingHome from '@screenobjects/third-party-lending/home-multi-lending.screen.ts';

When(/^el usuario selecciona la opción de créditos del sidebar de la home$/, async () => {
    const isLendingExist = await lendingHome.checkIfLendingExist();
    if (isLendingExist) {
        await lendingHome.enterHomeLending();
    } else {
        await lendingHome.viewMore();
        await lendingHome.enterLendingViewMore();
    }
    await lendingHome.verifyHomeMultiLending();
});

Then(/^se valida el ingreso a créditos por la opción de Ver más$/, async () => {
    await lendingHome.clickReturnHome();

    const isViewAllDisplayed = await lendingHome.checkIfViewAllIsDisplayed();
    if (isViewAllDisplayed) {
        await lendingHome.viewAll();
        await lendingHome.enterHomeLendingFromViewAll();
    } else {
        await lendingHome.viewMore();
        const continueWithShortcutTPLending = await lendingHome.checkIfLendingExist();
        await (continueWithShortcutTPLending 
            ? lendingHome.enterHomeLending() 
            : lendingHome.enterLendingViewMore());
    }

    await lendingHome.verifyHomeMultiLending();
    await lendingHome.clickReturnHome();
});

Then(/^se busca y valida la sección de créditos desde la home de yape$/, async () => {
    await lendingHome.searchLendingFromHome();
    await lendingHome.verifyHomeMultiLending();
    await lendingHome.clickReturnHome();
    await lendingHome.returnToHomeFromSearch();
});
