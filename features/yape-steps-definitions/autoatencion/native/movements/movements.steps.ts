import { Given, When, Then } from '@wdio/cucumber-framework';
import homeScreen from '../../../../../screenobjects/home/home.screen.ts';
import welcomeyaperoScreen from '../../../../../screenobjects/home/welcomeyapero.screen.js';
import cdaHomeScreen from '../../../../../screenobjects/autoatencion/cda-home.screen.ts';
import { Assertions } from '../../../../../support/utils/assertions.ts';
import cdaAyudaMovScreen from '../../../../../screenobjects/autoatencion/cda-ayuda-mov.screen.ts';
import {DataHelperCda} from "./support/data-helper-cda.ts";
import helpcenterUtils from "../../../../../support/utils/autoatencion-util.ts";
import {normalizarHora} from "../../../../../support/utils/autoatencion-util.ts";
import {CustomWorld} from "features/yape-steps-definitions/autoatencion/native/movements/support/world.ts";
import pautasDetailScreen from "../../../../../screenobjects/autoatencion/pautas-detail.screen.ts";
import pautasScreen from "../../../../../screenobjects/autoatencion/pautas.screen.ts";
import cdaAyudaOtroMovScreen from '../../../../../screenobjects/autoatencion/cda-ayudaotromov.screen.ts';

    When(/^ingreso al CDA del home$/, async () => {
        await homeScreen.selOmitirVerTodo();
        await browser.pause(1000);
        await welcomeyaperoScreen.closePromotion();
        await homeScreen.openCdaHome();
        await browser.pause(3000);
    });


    When(/^se debe mostrar solo 2 movimientos$/, async () => {
        await browser.pause(1000);
        const elementos = await cdaHomeScreen.getCantEleUltMov();
        Assertions.assertCompareNumbers(elementos ?? 0, 2, "<=");

    });


    Then(/^no se debe mostrar ningun movimiento$/, async () => {
        await browser.pause(1000);
        const elementos = await cdaHomeScreen.getCantEleUltMov();
        Assertions.assertCompareNumbers(elementos ?? 0, 0, "===");

    });


    Then(/^al seleccionar "Ayuda con un movimiento" se debe mostrar mensaje "(.*)"$/, async (mensajeEsperado) => {
        await cdaHomeScreen.selAyudaConMovimiento();
        await browser.pause(1000);
        const mensajeMostrada = cdaAyudaMovScreen.getMessageNotYapeo();
        console.log("mensajeEsperado " +mensajeEsperado  + " mensajeMostrada " + await mensajeMostrada);
        Assertions.assertCompareString(await mensajeMostrada ?? '', mensajeEsperado);

    });

    When(/^ingreso a ver todos los movimientos$/, async () => {
        await browser.pause(1000);
        cdaHomeScreen.selUltimoMovimiento();
    });

    When(/^selecciono actualizar$/, async () => {
        await browser.pause(1000);
        cdaAyudaMovScreen.selUpdateMovement();
    });

    When(/^se debe mostrar la transacción realiza validando la fecha y hora de la misma$/, async function (this: CustomWorld)  {
        await browser.pause(1000);
        const datosMostrados = await cdaAyudaMovScreen.getDatesLastMov();

        if (!datosMostrados || datosMostrados.length < 2) {
            throw new Error("No se encontraron datos del último movimiento.");
        }

        console.log("Hora Mostrada " + normalizarHora(datosMostrados[0]))
        console.log("Monto Mostrado " + datosMostrados[1].replace(/[-\s]/g, ""))
        const horaMostradaCda = this.dataHelperCda.getHourYape();
        const montoMostradoCda = this.dataHelperCda.getMountYape();
        console.log("Hora tranx " + normalizarHora(horaMostradaCda))
        console.log("Monto tranx " + this.dataHelperCda.getMountYape().replace(/[-\s]/g, ""))
        Assertions.assertCompareString(normalizarHora(datosMostrados[0]),normalizarHora(horaMostradaCda))
        Assertions.assertCompareString(datosMostrados[1].replace(/[-\s]/g, ""),montoMostradoCda.replace(/[-\s]/g, ""))

    });


    When(/^el usuario selecciona la opcion de Ayuda con un movimiento$/, async () => {
        await cdaHomeScreen.selAyudaConMovimiento();
        await browser.pause(3000);
    })

    When(/^el usuario visualiza la lista de movimientos$/, async () => {
        // Valida que se muestra la lista de movimientos
    });

    When(/^el usuario selecciona un movimiento (.*)$/, async (movimiento: string) => {
        await cdaAyudaMovScreen.selectMovement(movimiento);
    });

    When(/^el usuario selecciona una pauta (.*)$/, async (pauta: string) => {
        await browser.pause(2000);
        await pautasScreen.selectPauta(pauta)
    });

    Then(/^el usuario visualiza la sección de consulta Esta información resuelve tu problema con las opciones NO y SI$/, async () => {
        await pautasDetailScreen.validateQuestion();
        await pautasDetailScreen.validateAnswerNO();
        await pautasDetailScreen.validateAnswerSI();
    });

    When(/^el usuario selecciona la respuesta (.*)$/, async (option : string) => {
        await pautasDetailScreen.selectOption(option);
    });

    Then(/^el usuario valida que se muestra imagen de confirmación y  texto (.*)$/, async (text : string) => {
        await pautasDetailScreen.validateAnswerMsg(text);
    });

    Then(/^el usuario visualiza un bottomsheet ¿Te quedaste con alguna duda\?$/, async () => {
        await pautasDetailScreen.validateBottomSheetVisible();
    });

    Then(/^el usuario visualiza el boton HABLAR CON UN ASESOR$/, async () => {
        await pautasDetailScreen.validateButtonVisible();
    });

    When(/^el usuario hace back con el botón superior o el nativo del celular$/, async () => {
            if (driver.isAndroid) {
                await driver.back();
            }       
        
    });

    Then(/^el usuario valida que se ocultará el bottomsheet ¿Te quedaste con alguna duda\? y permanecerá en la pantalla$/, async () => {
        await pautasDetailScreen.validateStillOnDetailScreen();
    });


    When(/^el usuario selecciona la opcion Necesito ayuda con otro movimiento$/, async () => {
    await cdaAyudaMovScreen.selectHelpOtherMovement();
    });

    Then(/^validar que se muestre la pantalla de Ayuda con movimiento$/, async () => {
        await cdaAyudaOtroMovScreen.validatePantallaAyudaMovimiento();
    });

    Then(/^al seleccionar retroceder validar que se regrese a la pantalla de movimientos$/, async () => {
        await cdaAyudaOtroMovScreen.pressBack();
        await cdaAyudaMovScreen.validateScreenMovement();
    });