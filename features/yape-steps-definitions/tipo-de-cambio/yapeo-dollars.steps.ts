import { Given, When, Then } from '@wdio/cucumber-framework';
import yapeoDollars from '../../../screenobjects/tipo-de-cambio/yapeo-dollars.screen.ts';
import { browser } from '@wdio/globals';
import { scenarioSession } from '../../../support/utils/ScenarioSession.ts';
import { Assertions } from '../../../support/utils/assertions.ts';
import apiClient from '../../../support/utils/apiClient.ts';
import { approvePermissionForContacts } from '../../../support/utils/Utils.ts';

Given(/^selecciona yapear dólares desde el home de tipo de cambio$/, async () => {
    await yapeoDollars.enterYapearDollars();
    await yapeoDollars.allowContactsPermission();
    await yapeoDollars.handleContactScreenIfNotDisplayed();
});

Given(/^usuario selecciona celular del usuario destino (.*)$/, async (destinationUser: string) => {

    //para iOs aprobar permiso de contactos
    await approvePermissionForContacts();

    scenarioSession.loadInteroperableUsers();
    const user = scenarioSession.setUserAs(destinationUser);

    if (!user) {
        throw new Error(`No user was found with the specified name : ${destinationUser}`);
    }
    try {
        const response = await apiClient.postWithYaml('/yape/populate', user);
        Assertions.assertStatusCode(response, 200);
        console.log('User population successful for /yape/populate endpoint:', response);
    } catch (error) {
        console.error('Error making the request to /yape/populate endpoint:', error);
        throw error;
    }

    const phone = user.phone_number;

    if (driver.isAndroid) {
        // TODO: Use specific locators instead of coordinates. Pending element mapping in locator.json
        await yapeoDollars.touchYapeoDollar(465, 409);
        for (const char of phone) {
            await browser.execute('mobile: type', { text: char });
        }
        await yapeoDollars.touchYapeoDollar(441, 547);
    } else {
        await yapeoDollars.searchAndSelectContact(phone);
    }

});

When(/^usuario selecciona el monto (.+) y mensaje (.*) para realizar yapeo dolar$/, async (amount: string, message: string) => {
    if (driver.isAndroid){
        // TODO: Use specific locators instead of coordinates. Pending element mapping in locator.json
        await yapeoDollars.touchYapeoDollar(569, 1089);
        await yapeoDollars.touchYapeoDollar(405, 1778);
    } else {
        await yapeoDollars.enterAmountDollar(amount);
    }

    await yapeoDollars.enterMessage(message);
});

Then(/^el usuario confirma el yapeo dolar$/, async () => {
    await yapeoDollars.confirmDollarTransfer();
    await yapeoDollars.handleDuplicateModalIfPresent();

});

Given(/^realiza la confirmación de yapeo alto$/, async () => {
    await yapeoDollars.handleDuplicateModalIfPresent();
    await yapeoDollars.confirmYapeoHigh();
});

Given(/^cierra pantalla con la información del yapeo dólar$/, async () => {
    await yapeoDollars.close();
});

Then(/^el yapeo en dólares aparece registrado en movimientos$/, async () => {
    const transactionAmountUSD = await yapeoDollars.transactionAmountUSD();
    await yapeoDollars.goToDollars();
    const movementAmountUSD = await yapeoDollars.movementAmountUSD();
    expect(transactionAmountUSD).toEqual(movementAmountUSD);
});

Given(/^usuario confirma yapeo y ingresa codigo de otp incorrecto$/, async () => {
    await yapeoDollars.confirmDollarTransfer();
    await yapeoDollars.enterSequentialOtp();
    await yapeoDollars.confirmYapeoHigh();
});

Then(/^se muestra un mensaje de error por OTP incorrecto$/, async () => {
   await yapeoDollars.validationCodeError();
   await yapeoDollars.retryMessage();
});

Then(/^se muestra un mensaje de error de usuario sin cuenta dólares$/, async () => {
    await yapeoDollars.getErrorContactNotInYapeDollars();
    await yapeoDollars.getInviteToCreateDollarsAccount();
});

Given(/^el yapeo de dólares no se completa$/, async () => {
    await yapeoDollars.tryAgain();
});

Given(/^el usuario es redirigido al home de tipo de cambio$/, async () => {
    await yapeoDollars.homeScreen();
});
