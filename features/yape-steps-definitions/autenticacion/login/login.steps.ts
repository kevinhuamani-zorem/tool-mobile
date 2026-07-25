import { Given } from '@wdio/cucumber-framework';
import { scenarioSession } from '../../../../support/utils/ScenarioSession.ts';
import { Assertions } from '../../../../support/utils/assertions.ts';
import apiClient from '../../../../support/utils/apiClient.ts';
import initialScreen from '../../../../screenobjects/autenticacion/login/initial.screen.ts';
import enteryouryapeScreen from '../../../../screenobjects/autenticacion/login/enteryouryape.screen.ts';
import enteryourpasswordScreen from '../../../../screenobjects/autenticacion/login/enteryourpassword.screen.ts';
import validatecodeScreen from '../../../../screenobjects/autenticacion/login/validatecode.screen.ts';
import validatedeviceScreen from '../../../../screenobjects/autenticacion/login/validatedevice.screen.ts';
import welcomeyaperoScreen from '../../../../screenobjects/home/welcomeyapero.screen.ts';
import unlockScreen from '../../../../screenobjects/autenticacion/unlock/unlock.screen.ts';
import uninstallappsScreen from '@screenobjects/autenticacion/login/uninstallapps.screen.ts';

Given(/^el usuario está registrado en Yape y presiona el boton "Ya tengo una cuenta"$/, async () => {
    await browser.pause(5000);
    await initialScreen.alreadyHaveAccount();
});

Given(/^el usuario presiona en "Ingresa al Centro de Ayuda"$/, async () => {
    await enteryouryapeScreen.clickGoToTheHelpcenter();
});

Given(/^el usuario visualiza la pantalla de "Ingresa a tu Yape"$/, async () => {
    await enteryouryapeScreen.verifyYapeAccountTitle();
});

Given(/^el usuario ingresa su (.*) y (.*)$/, async (username: string, password: string) => {

    await enteryouryapeScreen.loginAccount(username);
    await enteryourpasswordScreen.enterPassword(password);
});

Given(/^poblamos los datos del usuario (.*)$/, async (username: string) => {

    scenarioSession.loadInteroperableUsers();

    const user = scenarioSession.setUserAs(username);

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }

    try {

        const response = await apiClient.postWithYaml('/yape/populate', user);

        Assertions.assertStatusCode(response, 200);
    } catch (error) {
        throw error;
    }

});

Given(/^el usuario (.*) ingresa su correo y password$/, async (username: string) => {

    const user = scenarioSession.getUser();

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }

    const email = user.email.toUpperCase();
    const pass = user.password;

    await enteryouryapeScreen.loginAccount(email);
    await enteryourpasswordScreen.enterPassword(pass);
    await browser.pause(3000);
});

Given(/^el usuario ingresa su código OTP, que le llega al (.*)$/, async (phone: string) => {
    await validatecodeScreen.validateOtp(phone);
    await browser.pause(3000);
});

Given(/^el usuario ingresa su código OTP, obtenido del celular$/, async () => {
    const user = scenarioSession.getUser();
    await validatecodeScreen.validateOtp(user.phone_number);
    await browser.pause(3000);
});

Given(/^el usuario hace tap en entendido y es redireccionado al unlock$/, async () => {
    await validatedeviceScreen.redirectUnlock();
    await browser.pause(3000);
});

Given(/^el usuario ingresa su código OTP de dispositivo, si se le solicita al (.*)$/, async (username: string) => {
    const user = scenarioSession.getUser();
    await validatedeviceScreen.validateOtpDevice(user.email);
});

Given(/^el usuario ingresa su código OTP, obtenido del correo si se le solicita$/, async () => {
    const user = scenarioSession.getUser();
    await validatedeviceScreen.validateOtpDevice(user.email);
    await browser.pause(3000);
});

Given(/^cierra el popup de bienvenida siempre y cuando se muestre$/, async () => {
    await welcomeyaperoScreen.closePromotion();
});

Given(/^se debe mostrar el boton yapear en el home$/, async () => {
    await welcomeyaperoScreen.showHome();
});

Given(/^el usuario inicia sesión en Yape con usuario (.*), contraseña (.*) y codigo OTP (.*)$/, async (username: string, password: string, phone: string) => {
    await browser.pause(5000);
    await initialScreen.alreadyHaveAccount();
    await enteryouryapeScreen.loginAccount(username);
    await enteryourpasswordScreen.enterPassword(password);
    await browser.pause(3000);
    await validatecodeScreen.validateOtp(phone);
    await browser.pause(3000);
    await validatedeviceScreen.validateOtpDevice(username);
    await welcomeyaperoScreen.closePromotion();
    await welcomeyaperoScreen.showHome();
});
Given(/^el usuario anterior ingresa su contraseña para acceder a Yape$/, async () => {
    const user = scenarioSession.getUser();

    if (!user) {
        throw new Error('No se encontró un usuario con el nombre especificado.');
    }
    await enteryourpasswordScreen.enterPassword(user.password);
    await browser.pause(3000);
    await welcomeyaperoScreen.closePromotion();
    await welcomeyaperoScreen.showHome();
});

Given(/^el usuario (.*) inicia sesión en Yape$/, async (username: string) => {
    // Cargar los datos del usuario
    scenarioSession.loadInteroperableUsers();
    const user = scenarioSession.setUserAs(username);

    if (!user) {
        throw new Error('No user was found with the specified name.');
    }

    // Llenar datos a través de la API
    if (process.env.SKIP_POPULATE !== 'true') {
        const response = await apiClient.postWithYaml('/yape/populate', user);
        Assertions.assertStatusCode(response, 200);
    }

    // Condicionar si login inicia desde el pin
    const continuarConPin = await welcomeyaperoScreen.verificarSiIniciaLoginConPin();
    if (continuarConPin) {
        await welcomeyaperoScreen.stabilizeHomeAfterPinLogin(user.password);
        return;
    }

    await initialScreen.alreadyHaveAccount();

    // 3. Iniciar sesión con el correo y la contraseña del usuario
    await enteryouryapeScreen.loginAccount(user.email.toUpperCase());


    await uninstallappsScreen.dismissUninstallAppsIfPresent();

    await enteryourpasswordScreen.enterPassword(user.password);

    // 4. Validar que el formulario de inicio de sesión se muestre
    await browser.pause(3000);

    // 5. Validar OTP recibido en el teléfono
    await validatecodeScreen.validateOtp(user.phone_number);

    // 6. Validar OTP del dispositivo si se solicita
    await validatedeviceScreen.validateOtpDevice(user.email);

    // 7. Redirigir al unlock
    await validatedeviceScreen.redirectUnlock();


    // 8. Click condicional en 'En otro momento' si aparece tras OTP (Activar Biometría) //validar con Android tambien
    await validatedeviceScreen.clickEnOtroMomentoSiExiste();

    await unlockScreen.enterPassword(user.password);
    // Click condicional en 'Intentarlo después' si aparece tras clave (Activar Biometría)

     // 9. Click en pantalla compartenos tu ubicacion si existe
    // await browser.pause(3000);
    await validatedeviceScreen.btnCompartirUbicacionSiExiste();

     // 10.Click condicional en 'Intentarlo después' si aparece tras clave (Activar Biometría)
    await welcomeyaperoScreen.clickIntentarloDespuesSiExiste();

    // 11. Verificar que si se muestre el botón "Omitir" en la pantalla de inicio, le cierra

    await welcomeyaperoScreen.closePromotion();

});