
import { Given, When, Then } from '@wdio/cucumber-framework';
import { scenarioSession } from '../../../support/utils/ScenarioSession.ts';
import { Assertions } from '../../../support/utils/assertions.ts';
import apiClient from '../../../support/utils/apiClient.ts';
import yapearScreen from '../../../screenobjects/payment/yapear.screen.ts';
import ConctactScreen from '../../../screenobjects/payment/contacts.screen.ts';
import yapearMountScreen from '../../../screenobjects/payment/yapear-mount.screen.ts';
import YapearInteropScreen from '../../../screenobjects/payment/yapear-interop.screen.ts';
import yapearWinstateScreen from '../../../screenobjects/payment/yapear-winstate.screen.ts';
import homeScreen from '../../../screenobjects/home/home.screen.ts';
import menuScreen from '../../../screenobjects/menu/menu.screen.ts';
import { CustomWorld } from 'features/yape-steps-definitions/autoatencion/native/movements/support/world.ts';


Given(/^el usuario ingresa a la opcion de yapear$/, async () => {
    await browser.pause(3000);
    await yapearScreen.yapear();
});

When(/^el usuario deberia visualizar la seleccion de contactos$/, async () => {
    await ConctactScreen.validateSelectContactScreen();
});


When(/^el usuario visualizo la seleccion de contactos$/, async () => {
    await ConctactScreen.validateSelectContactScreen();
});

When(/^el usuario ingresa el numero telefonico a yapear: (.*)$/,
    async (cellphone: string) => {
        await ConctactScreen.inputNumberToYapear(cellphone);
    });

When(/^ingresa el monto de yapear (.*)$/, async (amount: string) => {
    await yapearMountScreen.inputYapearAmount(amount);
});

When(/^ingresa un comentario (.*)$/, async (comment: string) => {
    await yapearMountScreen.inputYapearcomment(comment);
});

When(/^selecciona yapear$/, async () => {
    await yapearMountScreen.pressButtonYapear();
});

When(/^el usuario deberia visualizar el winstate del yapeo$/, async () => {
    await yapearWinstateScreen.validateWinStateScreen();
});

When(/^el usuario vuelve a Home desde winstate$/, async () => {
    await yapearWinstateScreen.pressButtonClose();
});

When(/^el usuario configura el yapeo alto (.*)$/, async (highamount: string) => {

    //se retrocede a Home
    await menuScreen.closeBurgerMenu();
});

When(/^selecciona a OTROS BANCOS$/, async () => {
    await yapearMountScreen.pressButtonOtrosBancos();
});

When(/^selecciona la entidad (.*)$/, async (entidad: string) => {
    await YapearInteropScreen.selectEntity(entidad);
});

When(/^confirma los datos y monto$/, async () => {
    await YapearInteropScreen.validateDataInteropScreen();
});

When(/^obtengo datos de la transacción realizada$/, async function (this: CustomWorld) {
    const datosYape = await yapearWinstateScreen.getDataWinState();
    console.log('Hour ' + datosYape[0]);
    console.log('Monto ' + datosYape[1]);

    console.log("dataHelperCda exists?", !!this.dataHelperCda);
    if (!this.dataHelperCda) {
        throw new Error("dataHelperCda no fue inicializado.");
    }
    this.dataHelperCda.setHourYape(datosYape[0]);
    this.dataHelperCda.setMountYape(datosYape[1]);

});

When(/^el usuario selecciona cerrar a la informacion$/, async () => {
    await ConctactScreen.dismissContactsIfVisible();
});

When(/^el usuario ingresa el nuevo numero telefonico a yapear: (.*)$/,
    async (cellphone: string) => {
        await ConctactScreen.inputNewNumberToYapear(cellphone);
    });

Then(/^el usuario deberia visualizar el texto de limite de yapeo diario$/, async () => {
    await yapearMountScreen.validateTransactionLimitsEnterprise();
});