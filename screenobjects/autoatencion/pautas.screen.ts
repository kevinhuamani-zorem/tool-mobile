import LocatorFactory from "../../support/utils/LocatorFactory.ts";
import BaseScreen from "../commons/base.screen.ts";
import { $ } from '@wdio/globals'
import LocatorPautas from 'resources/locators/autoatencion/pautas.locator.json' with { type: "json" };
import { TypeLocator } from "../../support/utils/Enums.ts";

class PautasScreen extends BaseScreen {


    public lblPauta(pauta: string) {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorPautas.Ios.lblPauta.replace("{option}",pauta),
            TypeLocator.XPATH, LocatorPautas.Android.lblPauta.replace("{option}",pauta));
    }

    public async selectPauta(pauta: string){

        console.log(`La pauta a buscar es:  ${pauta}`)
        const element = this.lblPauta(pauta);
        console.log(`La pauta-elemento a buscar es ${element}`)
        await $(element).click();

    }
}
export default new PautasScreen();