import { $ } from '@wdio/globals';
import { UIHelper } from '../../screenobjects/commons/core/UIHelper.js';

// Nexus |Screen| Mis Datos - User Name
const MAX_QUANTITY_NAME = 2;

/**
 * AutoAtencionUtil - Utility class for AutoAtencion features
 *
 * This class provides helper methods specific to AutoAtencion functionality.
 * It uses UIHelper via composition instead of inheriting from BaseScreen.
 *
 * Design: Composition over inheritance - utilities should not extend BaseScreen
 */
class AutoAtencionUtil {
    private uiHelper: UIHelper;

    constructor() {
        this.uiHelper = new UIHelper();
    }

    /**
     * Waits for an element and performs a click action if found
     * @param element - Element selector
     * @param evento - Event description (currently not used)
     */
    public async waitElementToAction(element: string, evento: string): Promise<void> {
        try {
            const existeElemento = await this.uiHelper.waitForElement(element);
            if (existeElemento) {
                await $(element).click();
            } else {
                console.log(`The element ${element} is not displayed in the application`);
            }
        } catch (error) {
            console.error(`Error : ${error}`);
        }
    }

    /**
     * Checks if element exists and returns its attribute value
     * @param element - Element selector
     * @param attribute - Attribute name to retrieve
     * @returns Attribute value if element exists, empty string otherwise
     */
    public async existeElementoGetAttribute(element: string, attribute: string): Promise<string> {
        try {
            const existeElemento = await this.uiHelper.waitForElement(element);
            if (existeElemento) {
                const attrValue = await $(element).getAttribute(attribute);
                console.log(`Show message ${attrValue || ''}`);
                return attrValue || '';
            } else {
                console.log(`The element is not displayed ${element} is not displayed`);
                return '';
            }
        } catch (error) {
            console.error(`Error : ${error}`);
            return '';
        }
    }
}

   export function normalizarHora(texto: string): string {
        // Extraer la hora (hh:mm) y el periodo (am/pm)
        const match = texto.match(/(\d{1,2}:\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
        if (!match) return "";
        const hora = match[1].padStart(5, "0"); // Asegura el formato hh:mm
        const periodo = match[2]
            .toLowerCase()
            .replace(/\s+/g, "")    // elimina espacios
            .replace(/\./g, "")     // elimina puntos
            .replace("am", "a.m")
            .replace("pm", "p.m");
        return `${hora} ${periodo}`;
    }
    // Nexus |Screen| Mis Datos - User Email Address
    export default new AutoAtencionUtil ();
