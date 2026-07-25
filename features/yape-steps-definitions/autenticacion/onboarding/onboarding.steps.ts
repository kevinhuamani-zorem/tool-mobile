import { Given } from '@wdio/cucumber-framework';
import { scenarioSession } from '../../../../support/utils/ScenarioSession.ts';

import initialScreen from '../../../../screenobjects/autenticacion/login/initial.screen.ts';
import enteryourphoneScreen from '../../../../screenobjects/autenticacion/onboarding/enteryourphone.screen.ts';
import validateRegistercodeScreen from '../../../../screenobjects/autenticacion/onboarding/validateregistercode.screen.ts';
import registerdatauserScreen from '../../../../screenobjects/autenticacion/onboarding/registerdatauser.screen.ts';
import selectaccounttypeScreen from '../../../../screenobjects/autenticacion/onboarding/selectaccounttype.screen.ts';
import registercardScreen from '../../../../screenobjects/autenticacion/onboarding/registercard.screen.ts';
import enteryourpinScreen from '../../../../screenobjects/autenticacion/onboarding/enteryourpin.screen.ts';
import winstateScreen from '../../../../screenobjects/autenticacion/onboarding/winstate.screen.ts';
import welcomeyaperoScreen from '../../../../screenobjects/home/welcomeyapero.screen.ts';


Given(/^el usuario no está registrado en Yape y presiona el boton "Crear una cuenta"$/, async () => {
    await browser.pause(5000)
    await initialScreen.notHaveAccount();
})


Given(/^el usuario (.*) ingresa su celular$/, async (celular: string) => {

    const user = scenarioSession.getUser();

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }

    const phone_number = user.phone_number;

    await enteryourphoneScreen.registerPhone(phone_number);
    await browser.pause(3000);
})

Given(/^el usuario ingresa el código otp, obtenido de su celular$/, async () => {
    const user = scenarioSession.getUser();
    await validateRegistercodeScreen.validateOtp(user.phone_number);
    await browser.pause(2000);
})

Given(/^el selecciona el tipo de documento e ingresa sus datos en Yape$/, async () => {
    const user = scenarioSession.getUser();
    await registerdatauserScreen.registerData();
    await browser.pause(6000);
})


Given(/^el usuario selecciona el tipo de cuenta a crear$/, async () => {
    const user = scenarioSession.getUser();
    await selectaccounttypeScreen.selectOption();
})


Given(/^el usuario ingresa los datos de su tarjeta$/, async () => {
    const user = scenarioSession.getUser();
    await registercardScreen.registerCard(user.cards[0].number);
    await browser.pause(3000);
})

Given(/^el usuario ingresa el pin de su tarjeta$/, async () => {
    const user = scenarioSession.getUser();
    await enteryourpinScreen.enterPin4(user.cards[0].pin4);
    await welcomeyaperoScreen.clickIniciarSesionSiExiste();
    await browser.pause(3000);
})


Given(/^hace tap para ir al home de Yape$/, async () => {
    await winstateScreen.gotHomeYape();
    await browser.pause(3000);
})



