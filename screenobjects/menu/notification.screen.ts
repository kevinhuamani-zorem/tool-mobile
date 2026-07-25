// NOTE: This screen file should be named 'notification.screen.ts' (fixed typo from 'notifcation.screen.ts').
import { $ } from '@wdio/globals';
import BaseScreen from 'screenobjects/commons/base.screen.ts';
import YapeoNotificationsLocator from '../../resources/locators/nexus/quick-items/yapeo-notifications.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

class NotificationScreen extends BaseScreen {

    /**
     * Selectores
     */
    public get backButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsIos.buttonBack,
            TypeLocator.ANDROID,  YapeoNotificationsLocator.YapeoNotificationsAndroid.buttonBack
        );
        return $(locator);
    }

    /** Título de la pantalla */
    public get txtMenuTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsIos.txtMenuTitle,
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsAndroid.txtMenuTitle
        );
        return $(locator);
    }

    /** Texto "Recibir aviso por correo" */
    public get txtGetEmail() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsIos.txtGetEmail,
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsAndroid.txtGetEmail
        );
        return $(locator);
    }

    /** Botón "CAMBIAR" */
    public get btnChange() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,    YapeoNotificationsLocator.YapeoNotificationsIos.btnChange,
            TypeLocator.ANDROID,  YapeoNotificationsLocator.YapeoNotificationsAndroid.btnChange
        );
        return $(locator);
    }

    /** Título del bottom sheet (para asegurar que está abierto) */
    public get txtChooseAmount() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsIos.txtChooseAmount,
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsAndroid.txtChooseAmount
        );
        return $(locator);
    }

    // /** Opciones por monto */
    public get txt10balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsIos.txt10balance,
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsAndroid.txt10balance
        );
        return $(locator);
    }

    public get txt50balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsIos.txt50balance,
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsAndroid.txt50balance
        );
        return $(locator);
    }

    public get txt100balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsIos.txt100balance,
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsAndroid.txt100balance
        );
        return $(locator);
    }

    public get txt500balance() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsIos.txt500balance,
            TypeLocator.XPATH,   YapeoNotificationsLocator.YapeoNotificationsAndroid.txt500balance
        );
        return $(locator);
    }

    public async selectBalance(amount: string): Promise<void> {
    // Mapa con claves string
        const getterByAmount = {
            '10': this.txt10balance,
            '50': this.txt50balance,
            '100': this.txt100balance,
            '500': this.txt500balance,
        } as const;

        // Guard clause: si no existe la clave, salir rápido
        if (!(amount in getterByAmount)) return;

        // Ahora TypeScript sabe que amount es una key válida del objeto
        const element = getterByAmount[amount as keyof typeof getterByAmount];

        // Si por alguna razón no viene el elemento, salir
        if (!element) return;

        // Si no existe en DOM (desaparece cuando es el seleccionado), salir rápido
        if (!(await element.isExisting())) return;

        // Click directo
        await element.click();
    }

    /**
     * Acciones
     */

    /** Click en "CAMBIAR" */
    public async clickChange(){
        await (await this.btnChange).click();
    }

}
export default new NotificationScreen();
