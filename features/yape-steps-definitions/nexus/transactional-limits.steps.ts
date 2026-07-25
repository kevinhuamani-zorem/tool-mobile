import { When, Then } from '@wdio/cucumber-framework';
import transactionalLimits from '../../../screenobjects/nexus/transactionalLimits.screen.ts';
import transactionalLimitsScreen from '../../../screenobjects/nexus/transactionalLimits.screen.ts';

When(
  /^hace clic en la opción límites transaccionales del menu$/,
  async () => {
    await transactionalLimits.selectMenuOptionTransactionalLimits();
  }
);

Then(
  /^se muestra correctamente la pantalla de límites transaccionales$/,
  async () => {
    await transactionalLimits.waitForTransactionalLimitsScreen();
  }
);

Then(
  /^se visualiza el límite actual de yapeo del usuario$/,
  async () => {
     await transactionalLimitsScreen.getCurrentAmountText();
  }
);

When(
  /^el usuario da click en el botón cambiar$/,
  async () => {
    await transactionalLimits.clickCambiar();
    await transactionalLimits.waitForChangeLimitScreen();
  }
);

Then(
    /^se completa el cambio de limite$/,
     async () => {
        const { flow } = await transactionalLimitsScreen.seleccionarLimiteSegunMontoActual();
        await transactionalLimitsScreen.clickBtnChangeLimit();

        if (flow === 'BIOMETRIA') {
            await transactionalLimitsScreen.waitForBiometricPopup();
            await transactionalLimitsScreen.salirDeBiometriaConBack();
            return; 
        }

        await transactionalLimitsScreen.waitForOtpScreen();
        await transactionalLimitsScreen.continuarConOtp();
        await transactionalLimitsScreen.waitForSuccessChangeLimitScreen();
        await transactionalLimitsScreen.continuarDesdeSuccess();

        await transactionalLimitsScreen.waitForLogoutPopup();
        await transactionalLimitsScreen.cerrarSesionDesdePopup();
});



