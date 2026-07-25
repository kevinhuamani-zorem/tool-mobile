import { When, Then } from '@wdio/cucumber-framework';
import myAddresses from '../../../screenobjects/nexus/misdirecciones.screen.ts';

When(
    /^el usuario da click al menu del home$/,
    async () => {
        await myAddresses.openHamburgerMenu();
    }
);

When(
    /^hace clic en la opción Mis direcciones del menu$/,
    async () => {
        await myAddresses.selectMenuOptionMisDirecciones();
    }
);

Then(
  /^se muestra correctamente la pantalla de Mis direcciones$/,
   async () => {
  await myAddresses.waitForScreen();
});

Then(
  /^se visualizan las direcciones guardadas$/,
  async () => {
    await myAddresses.validateNameDireccion();
  }
);

When(
    /^se hace click en el boton nueva direccion$/,
    async () => {        
        await myAddresses.tapNuevaDireccion();
    }
);

When(
    /^se completa el formulario de nueva direccion usando la ubicacion actual$/,
    async () => {
        await myAddresses.tapUsarUbicacionActual();
        await myAddresses.tapContinuarUbicacion();
        await myAddresses.fillNroMzEtapa();
        await myAddresses.tapGuardarDireccion();
    }
);

Then(
  /^se visualiza la nueva direccion en la lista de mis direcciones$/,
  async () => {
        await myAddresses.tapOverflowFirstCard();
        await myAddresses.tapEliminarFirstCard();
        await myAddresses.confirmarEliminarDireccion();
        await myAddresses.validarSnackbarDireccionOK();
  }
);

When(
    /^se completa el formulario de nueva direccion usando otra ubicacion$/,
    async () => {
        await myAddresses.setBuscarDireccion();
        await myAddresses.selectFirstSearchResult();
        await myAddresses.tapContinuarUbicacion();
        await myAddresses.fillNroMzEtapa();
        await myAddresses.tapGuardarDireccion();
    }
);

When(
    /^se hace click en el boton editar direccion$/,
    async () => {
        await myAddresses.tapOverflowFirstCard();
        await myAddresses.tapEditarFirstCard();
        await myAddresses.editarDptoDesdeNroMz();
        await myAddresses.tapGuardarDireccion();
        await myAddresses.tapConfirmarActualizarDireccion();
    }
);

Then(
  /^se visualiza la direccion modificada en la lista de mis direcciones$/,
  async () => {
        await myAddresses.validarSnackbarDireccionOK();
  }
);