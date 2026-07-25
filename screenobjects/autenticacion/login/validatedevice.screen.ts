import { $, browser } from "@wdio/globals";
import LocatorLogin from "@resources/locators/autenticacion/login/login.locator.json" with { type: "json" };
import { Constants } from "@utils/constants.ts";
import { TypeLocator } from "@utils/Enums.ts";
import LocatorFactory from "@utils/LocatorFactory.ts";
import redis from "@utils/redis.helper.ts";
import { handlePopupIfVisible } from "@utils/Utils.ts";
import BaseScreen from "@screenobjects/commons/base.screen.ts";

class ValidationDeviceScreen extends BaseScreen {
    public get txtCodeValidation() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorLogin.loginIos.txtOtpDevice,
            TypeLocator.ANDROID,
            LocatorLogin.loginAndroid.txtOtpDevice,
        );

        return $(locator);
    }

    public get btnRedirectUnlock() {
        const locator = LocatorFactory.getElement(
            TypeLocator.ID,
            LocatorLogin.loginIos.btnRedirectUnlock,
            TypeLocator.XPATH,
            LocatorLogin.loginAndroid.btnRedirectUnlock,
        );

        return $(locator);
    }

    public get btnCodeValidate() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.btnValidarCodigoPhone,
            TypeLocator.ID,
            LocatorLogin.loginAndroid.btnValidarCodigoPhone,
        );
        return $(locator);
    }

    public get btnEnOtroMomento() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH,
            LocatorLogin.loginIos.btnEnOtroMomento,
            TypeLocator.ID,
            LocatorLogin.loginAndroid.btnEnOtroMomento,
        );
        return $(locator);
    }

    public get btnCompartenosTuUbicacion() {
        const locator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.btnCompartenosTuUbicacion,
            TypeLocator.XPATH,
            LocatorLogin.loginAndroid.btnCompartenosTuUbicacion,
        );

        return $(locator);
    }

    async validateOtpDevice(userName: string): Promise<void> {
        await browser.pause(3000);
        const btnCodeValidateLocator = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.btnValidarCodigoPhone,
            TypeLocator.ID,
            LocatorLogin.loginAndroid.btnValidarCodigoPhone,
        );

        const existeElemento = await this.uiHelper.waitForElement(
            btnCodeValidateLocator,
            4000,
        );

        if (existeElemento) {
            const otp = await redis.readDataRedis(
                Constants.REDIS_OTP_LOGIN_MAPNAME,
                userName.toUpperCase(),
                1,
            );
            await this.keyboardHelper.submitOtp(
                this.txtCodeValidation,
                otp,
                this.btnCodeValidate,
            );
        }
    }

    public async redirectUnlock(): Promise<void> {
        const txtRedirectUnlock = LocatorFactory.getElement(
            TypeLocator.CLASSCHAIN,
            LocatorLogin.loginIos.txtRedirecUnlock,
            TypeLocator.ID,
            LocatorLogin.loginAndroid.txtRedirecUnlock,
        );

        if (driver.isIOS) {
            const elementExists = await this.uiHelper.waitForElement(
                txtRedirectUnlock,
                3000,
            );

            if (elementExists) {
                await this.btnRedirectUnlock.waitForDisplayed({ timeout: 3000 });
                await this.btnRedirectUnlock.click();
                await $(txtRedirectUnlock).waitForDisplayed({ timeout: 3000, reverse: true });
            } else {
                console.log("Modal no apareció o se cerró muy rápido");
            }
            await browser.pause(1000);
        }

        if (browser.isAndroid) {
            const elementExists =
                await this.uiHelper.waitForElement(txtRedirectUnlock);
            if (!elementExists) {
                throw new Error(
                    `El elemento con el locator ${txtRedirectUnlock} no se encontró después de 10 segundos.`,
                );
            }
            await this.btnRedirectUnlock.click();
        }
    }

    public async clickEnOtroMomentoSiExiste() {
        await handlePopupIfVisible(() => this.btnEnOtroMomento, "No thanks");
    }

    public async btnCompartirUbicacionSiExiste() {
        if (driver.isIOS) {
            console.log("Buscando pantalla de ubicación...");
            await browser.pause(5000);

            try {
                await this.btnCompartenosTuUbicacion.waitForDisplayed({
                    timeout: 8000,
                });
                await this.btnCompartenosTuUbicacion.click();
                console.log("Botón de ubicación encontrado y presionado");
            } catch {
                console.log(
                    "Pantalla de ubicación custom no encontrada o ya pasó",
                );
            }

            // Fallback para popup nativo de iOS (Allow Once / Allow While Using App / Don\'t Allow)
            const nativeLocationButtons = [
                `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == \"Don't Allow\" OR name == \"Don’t Allow\" OR label == \"Don't Allow\" OR label == \"Don’t Allow\" OR name == 'No permitir' OR label == 'No permitir')`,
                `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == 'Allow Once' OR label == 'Allow Once' OR name == 'Permitir una vez' OR label == 'Permitir una vez')`,
                `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == 'Allow While Using App' OR label == 'Allow While Using App' OR name == 'Permitir al usar la app' OR label == 'Permitir al usar la app')`,
            ];

            for (const selector of nativeLocationButtons) {
                const button = await $(selector);
                if (await button.isExisting()) {
                    await button.click();
                    console.log(
                        `Popup nativo de ubicación resuelto con selector: ${selector}`,
                    );
                    return;
                }
            }

            console.log("No se detectó popup nativo de ubicación en iOS");
        }

        if (browser.isAndroid) {
            await handlePopupIfVisible(
                () => this.btnCompartenosTuUbicacion,
                "En otro momento",
            );
        }
    }
}
export default new ValidationDeviceScreen();
