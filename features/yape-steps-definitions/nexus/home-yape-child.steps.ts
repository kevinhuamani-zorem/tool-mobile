import { When, Then } from '@wdio/cucumber-framework';

import ShortcutScreen from '@screenobjects/nexus/shortcut.screen.js';
import YapeHijosInfoScreen from '@screenobjects/nexus/yape-hijos-info.screen.js';
import YapeHijosAccountsScreen from '@screenobjects/nexus/yape-hijos-account.screen.js';
import YapeHijosDataScreen from '@screenobjects/nexus/yape-hijos-data.screen.js';
import OtpScreen from '@screenobjects/nexus/yape-hijos-otp.screen.js';
import YapeHijosSuccessScreen from '@screenobjects/nexus/yape-hijos-winstate.screen.js';


const shortcutScreen = new ShortcutScreen();
const yapeHijosInfoScreen = new YapeHijosInfoScreen();
const yapeHijosAccountsScreen = new YapeHijosAccountsScreen();
const yapeHijosDataScreen = new YapeHijosDataScreen();
const otpScreen = new OtpScreen();
const yapeHijosSuccessScreen = new YapeHijosSuccessScreen();

When(
    'selecciona el atajo {string} en el home',
    async (shortcut) => {
        const shortcutElement = await shortcutScreen.getShortcutByName(shortcut);
        await shortcutElement.click();
    }
);

When(
    'selecciona el botón {string} de la pantalla informativa de Yape Hijos',
    async (buttonName) => {
        await yapeHijosInfoScreen.selectButton(buttonName);
    }
);

When(
    'selecciona la cuenta a migrar como hijo',
    async () => {
        await yapeHijosAccountsScreen.selectMigratableAccount();
    }
);

When(
  'selecciona el botón {string} de la pantalla de listado de cuentas',
  async (buttonName) => {
    await yapeHijosAccountsScreen.selectButton(buttonName);
  }
);

When(
    'ingresa el alias del hijo {string}',
    async (alias: string) => {
        await yapeHijosDataScreen.enterChildAlias(alias);
    }
);

When(
    'selecciona la fecha de nacimiento del hijo',
    async () => {
        await yapeHijosDataScreen.selectBirthDate();
    }
);

When(
    'marca la casilla de declaración jurada',
    async () => {
        await yapeHijosDataScreen.checkDeclaracion();
    }
);
When(
    'selecciona el botón {string} de la pantalla de confirmación de datos',
    async (buttonName) => {
        await yapeHijosDataScreen.selectButton(buttonName);
    }
);

When(
  'ingresa el código OTP',
  async () => {
    await otpScreen.enterOtpCode();
  }
);

When(
    'selecciona el botón {string} de la pantalla de confirmación del OTP',
    async (buttonName) => {
        await otpScreen.selectButton(buttonName);
    }
);
Then(
    'verifica que se muestre la pantalla de confirmación exitosa',
    async () => {
        await yapeHijosSuccessScreen.validateSuccessScreenIsVisible();
    }
);