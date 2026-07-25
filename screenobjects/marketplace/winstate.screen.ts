import BaseScreen from '../commons/base.screen.ts';
import LocatorMktWinstate from '../../resources/locators/marketplace/marketplace-win-state.locator.json' with { type: 'json' };
import { TypeLocator } from 'support/utils/Enums.ts';
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { ConstantsMarketplace } from 'support/utils/constants-marketplace.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

class WinstateMktPlaceScreen extends BaseScreen{

    public get winstateTitle(){
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorMktWinstate.menuIos.lblYapeasteTuPedido,
            TypeLocator.ANDROID, LocatorMktWinstate.menuAndroid.lblYapeasteTuPedido
        );
        return $(locator);
    }

    public get indicationParragraph(){
        const locator = LocatorFactory.getElement(TypeLocator.XPATH, LocatorMktWinstate.menuIos.lblIndicacionesParrafo,
            TypeLocator.ANDROID, LocatorMktWinstate.menuAndroid.lblIndicacionesParrafo
        );
        return $(locator);
    }

    public get recomendationWinstate(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, LocatorMktWinstate.menuIos.lblRecomendacionWinstate,
            TypeLocator.ANDROID, LocatorMktWinstate.menuAndroid.lblRecomendacionWinstate
        );
        return $(locator);
    }

    public get goMarketplace(){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, LocatorMktWinstate.menuIos.goMarketplace,
            TypeLocator.XPATH, LocatorMktWinstate.menuAndroid.goMarketplace
        );
        return $(locator);
    }

    public async winstateValidation(){
        await this.winstateTitle.waitForExist({ timeout });
        // Validar título, párrafo de indicaciones y recomendación usando toBe
        const title = await this.winstateTitle.getText();
        const indication = await this.indicationParragraph.getText();
        const recommendation = await this.recomendationWinstate.getText();

        const constTitle = ConstantsMarketplace.TITLE_WINSTATE_MARKETPLACE;
        const constIndication = ConstantsMarketplace.INDICATIONS_PARRAGRAPH_WINSTATE_MKTPLACE;
        const constRecomendation = ConstantsMarketplace.RECOMENDATION_WINSTATE_MKTPLACE;

        expect(title).toBe(constTitle);
        expect(indication).toBe(constIndication);
        expect(recommendation).toBe(constRecomendation);

    }
    // Regresar a tienda
    public async selectGoMarketplace(): Promise<void> {
        await this.uiHelper.waitForElementExistByLocator(this.goMarketplace, true);
        this.goMarketplace.click();
    }
}

export default new WinstateMktPlaceScreen();