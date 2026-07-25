import { Then } from '@wdio/cucumber-framework';
import tappSubhomeScreen from '@screenobjects/interoperabilidad/tapp-subhome.screen.ts';

Then(
    /^se muestra la pantalla principal de TAPP correctamente$/,
    async () => {
        await tappSubhomeScreen.validateSubhomeScreenIsDisplayed();
    }
);
