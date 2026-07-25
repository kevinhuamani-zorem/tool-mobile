import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.js';
import LocatorFactory from '../../support/utils/LocatorFactory.js';
import { TypeLocator } from '../../support/utils/Enums.js';
import MiPlanLocator from '../../resources/locators/nexus/menu-my-plan-enterprise.locator.json' with { type: 'json' };
import MenuLocator from '../../resources/locators/nexus/menu.locator.json' with { type: 'json' };

class MiPlanYapeEmpresaScreen extends BaseScreen {

    public get fechaAfiliacion() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MiPlanLocator.miPlanYapeEmpresaIos.txtFechaAfiliacion,
            TypeLocator.ANDROID,
            MiPlanLocator.miPlanYapeEmpresaAndroid.txtFechaAfiliacion
        );
        return $(locator);
    }

    public get cobroComision() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MiPlanLocator.miPlanYapeEmpresaIos.txtCobroComision,
            TypeLocator.ANDROID,
            MiPlanLocator.miPlanYapeEmpresaAndroid.txtCobroComision
        );
        return $(locator);
    }

    async selectMenuOptionMiPlanEmpresa() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            MenuLocator.menuIos.txtMenuMiplanYapeEmpresa,
            TypeLocator.ANDROID,
            MenuLocator.menuAndroid.txtMenuMiplanYapeEmpresa
        );
        const element = $(locator);
        await element.waitForDisplayed({ timeout: 10000 });
        await element.click();
    }

    async validateFechaAfiliacionVisible() {
        await this.fechaAfiliacion.waitForDisplayed({ timeout: 10000 });
        await expect(this.cobroComision).toBeDisplayed();
    }

    async validateCobroComisionVisible() {
        await this.cobroComision.waitForDisplayed({ timeout: 10000 });
        await expect(this.cobroComision).toBeDisplayed();
    }
}
export default new MiPlanYapeEmpresaScreen();