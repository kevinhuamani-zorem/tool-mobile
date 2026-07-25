import { Given } from '@wdio/cucumber-framework';
import { scenarioSession } from '../../../../support/utils/ScenarioSession.ts';
import { Assertions } from '../../../../support/utils/assertions.ts';
import apiClient from '../../../../support/utils/apiClient.ts';
import unlockScreen from '../../../../screenobjects/autenticacion/unlock/unlock.screen.ts';
import welcomeyaperoScreen from '../../../../screenobjects/home/welcomeyapero.screen.ts';

Given(/^el usuario (.*) realiza unlock en Yape$/, async (username: string) => {

    scenarioSession.loadInteroperableUsers();
    const user = scenarioSession.setUserAs(username);

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }
    const response = await apiClient.postWithYaml('/yape/populate', user);
    Assertions.assertStatusCode(response, 200);

    await unlockScreen.enterPassword(user.password);
    await unlockScreen.finishedLoading();
    await welcomeyaperoScreen.closePromotion();

});

Given(/^el usuario (.*) realiza unlock en Yape luego de redirección$/, async (username: string) => {

    scenarioSession.loadInteroperableUsers();
    const user = scenarioSession.setUserAs(username);

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }

    await unlockScreen.enterPassword(user.password);
    await welcomeyaperoScreen.closeUbication();
    
    await welcomeyaperoScreen.closePromotion();

    await welcomeyaperoScreen.clickIntentarloDespuesSiExiste();   

});
