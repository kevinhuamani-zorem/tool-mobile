import { Given, When } from '@wdio/cucumber-framework';

import yapearScreen from '../../../screenobjects/payment/yapear-qr.screen.ts';
import yapearSelectQr from '../../../screenobjects/payment/yapear-select-qr.screen.ts';
import yapearSelectImageQr from '../../../screenobjects/payment/yapear-select-image-qr.screen.ts';
import yapearImageQr from '../../../screenobjects/payment/yapear-image-qr.screen.ts';

Given(/^el usuario ingresa a la opcion de escanear QR$/, async () => {
    await yapearScreen.yapearQr();
});

When(/^el usuario selecciono la opcion subir una imagen con QR$/, async () => {
    await yapearSelectQr.yapearSelectQr();
});

When(
    /^el usuario selecciono la imagen que desea escanear$/, async () => {
    await yapearSelectImageQr.selectImageQr();
});

When(
    /^selecciono el boton yapear$/, async () => {
    await yapearImageQr.yapearImageQr();
});

