import { When, Then } from '@wdio/cucumber-framework';
import helperDiscardScreen from 'screenobjects/nexus/helper-discard.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

When(/^ingresa al mundo "Empresa"$/, async () => {

    await helperDiscardScreen.openBusinessWorld();

});

When(/^hace click en el sub mundo "Mis ayudantes"$/, async () => {
    
    await helperDiscardScreen.openMyHelpers();

});

Then(/^se comprueba que todos los elementos estén presentes en Mis ayudantes$/, async () => {

    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.mainText, timeout, 'The My Helpers title was not displayed');
    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.secondaryText, timeout, 'The My Helpers description was not displayed');
    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.addHelpersBtn, timeout, 'The Add Helpers button was not displayed');
    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.deleteCollaboratorBtn, timeout, 'The helper list was not displayed');

});

When(/^presiona el botón "Eliminar colaborador"$/, async () => {

    await helperDiscardScreen.openDeleteCollaborator();
});

Then(/^se comprueba que todos los elementos de eliminar colaborador estén presentes$/, async () => {

    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.txtQuestion, timeout, 'The confirmation text was not displayed');
    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.confirmDeleteBtn, timeout, 'The confirm delete button was not displayed');
    await helperDiscardScreen.uiHelper.waitForElementDisplayedAndExpect(helperDiscardScreen.cancelDeleteBtn, timeout, 'The cancel delete button was not displayed');

});
