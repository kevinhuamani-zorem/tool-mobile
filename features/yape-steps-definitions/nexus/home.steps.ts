import { When, Then} from '@wdio/cucumber-framework';
import PersonHomeScreen from '../../../screenobjects/nexus/person-home.screen.js';

const personHomeScreen = new PersonHomeScreen();

When(
    'el usuario ingresa al home',
    async () => {
      await personHomeScreen.openHome();
    }
);

Then(
    'el usuario visualiza su nombre en el home',
    async () => {
      await personHomeScreen.validateHomeHeaderIsVisible();
    }
);  

When(
    /^el usuario abre el menu hamburguesa del home$/,
    async () => {
        await personHomeScreen.openHamburgerMenu();
    }
);