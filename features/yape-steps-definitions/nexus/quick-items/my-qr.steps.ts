import { Given } from '@wdio/cucumber-framework';
import menuScreen from 'screenobjects/menu/menu.screen.ts';
import myQrScreen from 'screenobjects/nexus/my-qr.screen.ts';
import { scenarioSession } from 'support/utils/ScenarioSession.ts';
import { capitalizeText, getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given(/^el usuario ingresa a la opción "Mi QR"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(menuScreen.txtSubItemMyQR, timeout, 'The sub item my qr was not displayed');
    await menuScreen.openMyQR();
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtMenuTitle, timeout, 'The text menu title was not displayed');
});

Given(/^se muestra el QR del usuario y el botón "Comparte y descarga tu QR"$/, async () => {
    const user = scenarioSession.getUser();
    console.log('User:', user.name);
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.imgMyQR, timeout, 'The image qr was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtDynamicItem(capitalizeText(user.name)), timeout, `The name "${capitalizeText(user.name)}" was not displayed`);
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.btnShareAndDownload, timeout, 'The share and download button was not displayed');
});

Given(/^el usuario ingresa a "Comparte y descarga tu QR"$/, async () => {
    await myQrScreen.clickOnShareAndDownload();
});

Given(/^Se muestra el código QR con el texto "Paga aquí con Yape", el nombre del usuario y los botones "Compartir" y "Descargar"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.imgMyQRShareAndDownloadScreen, timeout, 'The image qr was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtPayHereShareAndDownloadScreen, timeout, 'The text pay here was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.btnShareAndDownloadScreen, timeout, 'The share button was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtShareAndDownloadScreen, timeout, 'The text share and download was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.btnDownloadShareAndDownloadScreen, timeout, 'The download button was not displayed');
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtDownloadShareAndDownloadScreen, timeout, 'The text download was not displayed');
});

Given(/^el usuario presiona el botón "Descargar" y se muestra el mensaje toast"$/, async () => {
    await myQrScreen.pressDownloadButton();
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(myQrScreen.txtToastDownload, timeout, 'The text toast download was not displayed');
});