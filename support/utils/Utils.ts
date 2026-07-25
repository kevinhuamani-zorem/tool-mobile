import { constants } from 'buffer';
import { format } from 'date-fns';
import { ConstantsAutentication } from '../../support/utils/constants-autentication.js';
import { es } from 'date-fns/locale';
import type { ChainablePromiseElement } from 'webdriverio';
import * as fs from 'fs';
import { DERIVATION_KEYWORDS_CATALOG } from './constants-derivation-keywords.ts';

const timeout: number = getTimeoutFromEnv();

/**
 * Obtiene el timeout desde la variable de entorno CONFIG_DEFAULT_DISPLAY_TIMEOUT
 * con un valor por defecto si no está configurada o es inválida
 * @param defaultValue - Valor por defecto en milisegundos (default: 5000)
 * @returns {number} - El timeout en milisegundos
 */
export function getTimeoutFromEnv(defaultValue: number = 8000): number {
  const envValue = process.env.CONFIG_DEFAULT_DISPLAY_TIMEOUT;
  const parsed = envValue ? parseInt(envValue, 10) : NaN;
  return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

export function getMaxTimeoutFromEnv(defaultValue: number = 60000): number {
    const envValue = process.env.CONFIG_DEFAULT_DISPLAY_TIMEOUT_MAX;
    const parsed = envValue ? parseInt(envValue, 10) : NaN;
    return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

/**
 * Get the time difference in seconds
 */
export function timeDifference(string: string, start: number, end: number) {
    const elapsed = (end - start) / 1000;
    console.log(`${string} It took ${elapsed} seconds.`);
}

/**
 * iOS sims and real devices can be distinguished by their UDID. Based on these sources there is a diff in the UDIDS
 * - https://blog.diawi.com/2018/10/15/2018-apple-devices-and-their-new-udid-format/
 * - https://www.theiphonewiki.com/wiki/UDID
 * iOS sims have more than 1 `-` in the UDID and the UDID is being
 */
export function isIosRealDevice() {
    const realDeviceRegex = /^[a-f0-9]{25}|[a-f0-9]{40}$/i;

    return 'appium:udid' in driver.capabilities && realDeviceRegex.test(driver.capabilities['appium:udid'] as string);
}

/**
 * Create a cross platform solution for opening a deep link
 */
export async function openDeepLinkUrl(url: string) {
    const prefix = 'wdio://';

    if (driver.isAndroid) {
        // Life is so much easier
        return driver.execute('mobile:deepLink', {
            url: `${prefix}${url}`,
            package: 'com.wdiodemoapp',
        });
    }

    // We can use `driver.url` on iOS simulators, but not on iOS real devices. The reason is that iOS real devices
    // open Siri when you call `driver.url('')` to use a deep link. This means that real devices need to have a different implementation
    // then iOS sims

    // Check if we are a real device
    if (isIosRealDevice()) {
        // Launch Safari to open the deep link
        await driver.execute('mobile: launchApp', { bundleId: 'com.apple.mobilesafari' });

        // Add the deep link url in Safari in the `URL`-field
        // This can be 2 different elements, or the button, or the text field
        // Use the predicate string because  the accessibility label will return 2 different types
        // of elements making it flaky to use. With predicate string we can be more precise
        const addressBarSelector = 'label == "Address" OR name == "URL"';
        const urlFieldSelector = 'type == "XCUIElementTypeTextField" && name CONTAINS "URL"';
        const addressBar = $(`-ios predicate string:${addressBarSelector}`);
        const urlField = $(`-ios predicate string:${urlFieldSelector}`);

        // Wait for the url button to appear and click on it so the text field will appear
        // iOS 13 now has the keyboard open by default because the URL field has focus when opening the Safari browser
        if (!(await driver.isKeyboardShown())) {
            await addressBar.waitForDisplayed();
            await addressBar.click();
        }

        // Submit the url and add a break
        await urlField.setValue(`${prefix}${url}\uE007`);
    } else {
        // Else we ne are a simulator
        await driver.url(`${prefix}${url}`);
    }

    /**
     * PRO TIP:
     * if you started the iOS device with `autoAcceptAlerts:true` in the capabilities then Appium will auto accept the alert that should
     * be shown now. You can then comment out the code below
     */
    // Wait for the notification and accept it
    // When using an iOS simulator you will only get the pop-up once, all the other times it won't be shown
    try {
        const openSelector = 'type == \'XCUIElementTypeButton\' && name CONTAINS \'Open\'';
        const openButton = $(`-ios predicate string:${openSelector}`);
        // Assumption is made that the alert will be seen within 2 seconds, if not it did not appear
        await openButton.waitForDisplayed({ timeout: 2000 });
        await openButton.click();
    } catch (e) {
        // ignore
    }
}

/**
 * relaunch the app by closing it and starting it again
 */
export async function relaunchApp(identifier: string) {
    const appIdentifier = { [driver.isAndroid ? 'appId' : 'bundleId']: identifier };
    const terminateCommand = 'mobile: terminateApp';
    const launchCommand = `mobile: ${driver.isAndroid ? 'activateApp' : 'launchApp'}`;

    await driver.execute(terminateCommand, appIdentifier);
    await driver.execute(launchCommand, appIdentifier);

}

type AppInfo = {
    processArguments: {
        env: { [key: string]: any };
        args: any[];
    };
    name: string;
    pid: number;
    bundleId: string;
};

/**
 * Typically, app dialogs are initiated by the application itself and can be interacted with via standard Appium commands. However, there are occasions
 * when a dialog is initiated by the operating system, rather than the app. An example of this is the "Touch/Face ID" permission dialog on iOS. This is happening
 * with `appium-xcuitest-driver` V6 and higher.
 * Since this dialog is outside the app's context, normal Appium interactions within the app context won't work. To interact with such dialogs, a strategy is to switch
 * the interaction context to the home screen. The `executeInHomeScreenContext` function is designed for this purpose. For iOS, it temporarily changes the
 * interaction context to the home screen (com.apple.springboard), allowing interaction with the system dialog, and then switches back to the original app context
 * post-interaction.
 * Src: https://appium.github.io/appium-xcuitest-driver/latest/guides/troubleshooting/#interact-with-dialogs-managed-by-comapplespringboard
 */
export async function executeInHomeScreenContext(action: () => Promise<void>): Promise<any> {
    // For Android, directly execute the action as this workaround isn't necessary
    if (driver.isAndroid) {
        return action();
    }

    // Retrieve the currently active app information
    const activeAppInfo: AppInfo = await driver.execute('mobile: activeAppInfo');
    // Switch the active context to the iOS home screen
    await driver.updateSettings({ 'defaultActiveApplication': 'com.apple.springboard' });
    let result;

    try {
        // Execute the action in the home screen context
        result = await action();
    } catch (e) {
        // Ignore any exceptions during the action
    }

    // Revert to the original app context
    await driver.updateSettings({ 'defaultActiveApplication': activeAppInfo.bundleId });

    return result;
}

export function get_time_according_format(formatDate: string): string {
    const now: Date = new Date();
    const formattedDate: string = format(now, formatDate, { locale: es });
    console.log('The format date is: '+formattedDate);

    return formattedDate;
}

export function masked_email_insurance(email: string, symbol: string): string {
    let countSymboly: string = '';
    let obfuscate_email: string = '';
    const [nombre, _] = email.split('@');

    for (let i= 0; i < nombre.length-2 ; i++){countSymboly = countSymboly + symbol;}

    obfuscate_email = email.toLowerCase().replace(/(\w{2})[\w.-]+@([\w.-]+\.[\w]{2,4})/, '$1'+ countSymboly +'@$2');
    console.log('Email masked is: '+obfuscate_email);
    return obfuscate_email;
}

export function removeDoubleQuotes(value: string): string {
    const regex = /"/g;
    return value.replace(regex, '');
}

export function getDocAndBcpdoctype(idc: string): [string, string] {
    const doc = idc.slice(0, -1);
    const doctype = idc.slice(-1);
    return [doc, doctype];
}

export function getDocAndYapedoctype(usuarioBajoPrueba: any, userDoc: string, userBcpDocType: string): [string, string] {
    let userDocType = userBcpDocType;

    if (userBcpDocType === ConstantsAutentication.ID_RUC) {
        userDoc = usuarioBajoPrueba['ruc'];
        userDocType = usuarioBajoPrueba['tipo_doc_en_yape'];
    }

    if (userBcpDocType !== ConstantsAutentication.ID_DNI && userDocType !== ConstantsAutentication.ID_RUC) {
        userDocType = usuarioBajoPrueba['tipo_doc_en_yape'];
    }

    return [userDoc, userDocType];
}

export function getDoctypeDescBff(docTypeCod: string): string {
    const docTypeCodNum = parseInt(docTypeCod, 10);
    let docTypeDesc: string;

    switch (docTypeCodNum) {
    case 1:
        docTypeDesc = 'DNI';
        break;
    case 2:
        docTypeDesc = 'CARNET DE IDENTIDAD';
        break;
    case 3:
        docTypeDesc = 'CE';
        break;
    case 4:
        docTypeDesc = 'PAS';
        break;
    case 5:
        docTypeDesc = 'LIBRERÍA TRIBUTARIA';
        break;
    case 6:
        docTypeDesc = 'RUC';
        break;
    case 7:
        docTypeDesc = 'IDENTIFICADOR FICTICIO';
        break;
    default:
        docTypeDesc = 'DNI';
    }

    return docTypeDesc;
}

export function getInputTypeNumDocMobile(usuarioBajoPrueba: any): [string, string] {
    let [userDoc, userBcpDocType] = getDocAndBcpdoctype(usuarioBajoPrueba['idc']);
    let userDocType: string;
    [userDoc, userDocType] = getDocAndYapedoctype(usuarioBajoPrueba, userDoc, userBcpDocType);
    console.info(`user_doc: ${userDoc} - user_bcp_doc_type: ${userBcpDocType}`);
    const userDocDesc = getDoctypeDescBff(userDocType.toString());
    console.info(`Document type description: ${userDocDesc}`);
    return [userDocDesc, userDoc];
}

// Función para ocultar el teclado nativo
export async function hideNativeKeyboard(strategy: string = 'default', key?: string, keyCode?: string, keyName?: string): Promise<void> {
    try {
        await driver.hideKeyboard(strategy, key, keyCode, keyName);
    } catch (error) {
        console.error('No keyboard to hide');
    }
}

// Función para realizar el desplazamiento
export async function performScroll(xStart: number, yStart: number, xEnd: number, yEnd: number, duration: number = 1000): Promise<void> {
    if (driver.isAndroid) {
        await driver.performActions([{
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
                { type: 'pointerMove', duration: 0, x: xStart, y: yStart },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerMove', duration, x: xEnd, y: yEnd },
                { type: 'pointerUp', button: 0 }
            ]
        }]);
    } else if (driver.isIOS){
        // iOS: Usar el comando mobile:scroll
        const direction = yStart > yEnd ? 'up' : 'down';
        await driver.execute('mobile: swipe', {
            direction: direction,
            element: null, // Si necesitas desplazar un elemento específico, pásalo aquí
        });
    }
}

export async function  clickPayButton(){
    // Wait for the scrollable element to be displayed before scrolling
    const scrollable = await $('android=new UiSelector().scrollable(true)');
    await scrollable.waitForDisplayed({ timeout });

    await $('android=new UiScrollable(new UiSelector().scrollable(true)).scrollToEnd(1,5)');

    // Wait for the area to be interactable before performing actions
    // (Replace with a more specific selector if possible)
    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: 540, y: 2158 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerUp', button: 0 }
        ]
    }
    ]);
    await $('android=new UiScrollable(new UiSelector().scrollable(true)).scrollToBeginning(1,5)');

}

export async function clickConfirmPayment(){
    await driver.pause(2000);
    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: 543, y: 1365 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerUp', button: 0 }
        ]
    }
    ]);
}

export async function confirmAllContacts(){
    await driver.pause(2000);
    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: 200, y: 830 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerUp', button: 0 }
        ]
    }
    ]);
}

export async function clickCloseNewWinstate(){
    await driver.pause(20000);
    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            {
                type: 'pointerMove',
                duration: 0,
                x: driver.isIOS ? 387 : 999,
                y: driver.isIOS ? 76 : 192
            },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerUp', button: 0 }
        ]
    }]);
}

export async function pressEnter(){
    if (driver.isAndroid) {
        // KeyEvent 66 is "Enter" on Android
        await driver.pressKeyCode?.(66) ?? await browser.pressKeyCode?.(66);
    } else if (driver.isIOS) {
        // '\uE007' is the Unicode for Enter/Return key
        await driver.keys?.('\uE007') ?? await browser.keys?.('\uE007');
    }
}

/**
 * Maneja un popup genérico: verifica si está presente y visible, y lo cierra si es necesario.
 * Si el elemento no está presente, continúa sin reintentos innecesarios.
 * @param {() => any} getElement - Getter del elemento a manejar.
 * @param {string} popupName - Nombre del popup para logging.
 * @returns {Promise<boolean>} - Devuelve true si el popup fue cerrado, false en caso contrario.
 */
export async function handlePopupIfVisible(getElement: () => any, popupName: string): Promise<boolean> {
    try {
        const element = getElement();

        // Esperar hasta 10 segundos para que el elemento esté presente
        const isDisplayed = await element.waitForDisplayed({ timeout: 10000 }).catch(() => false);

        if (isDisplayed) {
            console.log(`The popup '${popupName}' is present. Attempting to close it.`);
            await element.click();
            console.log(`Popup '${popupName}' closed successfully.`);
            return true;
        }
        console.log(`The popup '${popupName}' is not present after 10 seconds. Continuing with the flow.`);
        return false;

    } catch (error) {
        console.warn(`Error handling popup '${popupName}':`, error);
        console.log('Continuing with the flow.');
        return false;
    }
}


export async function handlePopupIfVisibleWithTimeOut(getElement: () => any, popupName: string ,timeout: number): Promise<boolean> {
    try {
        const element = getElement();

        // Esperar hasta n segundos para que el elemento esté presente
        const isDisplayed = await element.waitForDisplayed({ timeout }).catch(() => false);

        if (isDisplayed) {
            console.log(`The popup '${popupName}' is present. Attempting to close it.`);
            await element.click();
            console.log(`Popup '${popupName}' closed successfully.`);
            return true;
        } else {
            console.log(`The popup '${popupName}' is not present after ${timeout} seconds. Continuing with the flow.`);
            return false;
        }
    } catch (error) {
        console.warn(`Error handling popup '${popupName}':`, error);
        console.log(`Continuing with the flow.`);
        return false;
    }
}


/**
 * Valida si un elemento está visible y habilitado con reintentos.
 * @param getElement - Función que devuelve el selector del elemento.
 * @param maxRetries - Número máximo de intentos.
 * @param retryDelay - Tiempo de espera entre intentos (en milisegundos).
 * @returns {Promise<boolean>} - Devuelve true si el elemento está listo, false en caso contrario.
 */
export async function validateElementWithRetries(
    getElement: () => ChainablePromiseElement,
    maxRetries: number = 3,
    retryDelay: number = 2000
): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Attempt ${attempt} of ${maxRetries} to validate the element.`);

        try {
            const element = getElement();
            const isDisplayed = await element.isDisplayed().catch(() => false);
            const isEnabled = await element.isEnabled().catch(() => false);

            console.log(`Element state: visible=${isDisplayed}, enabled=${isEnabled}`);

            if (isDisplayed && isEnabled) {
                return true;
            }
        } catch (error) {
            console.error("Error validating element:", error);
        }

        if (attempt < maxRetries) {
            await browser.pause(retryDelay);
        }
    }

    console.error("The element was not found after several attempts.");
    return false;
}

export function setVariable(key: string, value: string): void {
    globalVariables.set(key, value);
}

export function getVariable(key: string): string | undefined {
    return globalVariables.get(key);
}

export function clearVariables(): void {
    globalVariables.clear();
}

const globalVariables = new Map<string, string>();

export function getCurrentDate() {
    return new Date().toISOString().replace('Z', '-0000');
}

export interface QuickSubItem {
    defaultLabel: string;
}

export interface QuickItems {
    code: string;
    defaultLabel: string;
    items: QuickSubItem[];
}

export const normalizeLabel = (s?: string) => (s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export const equalsLabel = (a?: string, b?: string): boolean =>
    normalizeLabel(a).toLocaleLowerCase() === normalizeLabel(b).toLocaleLowerCase();

export function approvePermissionForContacts(){
    if (!driver.isIOS) {
        return;
    }

    return executeInHomeScreenContext(async () => {
        console.log('Trying to approve iOS Contacts permission…');

        // Posibles textos del botón "Permitir" en distintos idiomas
        const buttonPredicates = [
            "type == 'XCUIElementTypeButton' AND (name CONTAINS 'Permitir' OR label CONTAINS 'Permitir')",
            "type == 'XCUIElementTypeButton' AND (name CONTAINS 'Allow' OR label CONTAINS 'Allow')",
            "type == 'XCUIElementTypeButton' AND (name CONTAINS 'OK' OR label CONTAINS 'OK')"
        ];

        for (const predicate of buttonPredicates) {
            const button = $(`-ios predicate string:${predicate}`);

            try {
                const exists = await button.waitForDisplayed({ timeout }).catch(() => false);
                if (exists) {
                    console.log(`Found Contacts permission button with predicate: ${predicate}`);
                    await button.click();
                    console.log('Contacts permission accepted.');
                    return;
                }
            } catch (e) {
                // Ignoramos y probamos el siguiente selector
                console.error(`Error while checking button with predicate: ${predicate}`, e);
            }

        }

        console.log('Contacts permission dialog not found or already granted.');
    });
}

/**
 * Returns the phone number masked in the format "*** *** 123"
 * - If the number has fewer than 3 digits, it shows all available digits.
 * - If it has 3 or more digits, it only shows the last 3.
 * - Keeps the pattern of two blocks of "***" separated by a space.
*/
export const maskPhoneAsTripleStar = (number: string): string => {
    const digits = (number ?? '').replace(/\D/g, '');
    const visibleTail = digits.length >= 3 ? digits.slice(-3) : digits;
    return `*** *** ${visibleTail}`;
};

/**
 * Obfuscates an email address by hiding all characters in the local part
 * except the first two. Replaces hidden characters with asterisks.
 * Throws an error if the local part has fewer than 3 characters.
 * Example: "johnsmith@example.com" -> "jo******@example.com"
 */
export const obfuscateEmailAddress = (email: string): string => {
    const [localPart, domain] = email.split('@');
    if (localPart.length < 3) {
        throw new Error("Email must have at least 3 characters before the '@'");
    }
    const visiblePart = localPart.slice(0, 2);
    const hiddenPart = '*'.repeat(localPart.length - 2);
    return `${visiblePart}${hiddenPart}@${domain}`;
};

/**
 * Formats a full name by showing:
 * - First name
 * - Father's last name
 * - Initial of mother's last name followed by a period
 *
 * Examples:
 * "John Doe Smith"         -> "John Doe S."
 * "John P. Doe Smith."     -> "John Doe S."
 * "John"                   -> "John"
 * "John Doe"               -> "John Doe"
 * "  John   P.   Doe  "    -> "John Doe"
 */
export const formatFullName = (fullName: string): string => {
    // Normalize spaces and split into tokens
    const tokens = fullName.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
        return '';
    }

    const firstName = tokens[0];

    if (tokens.length === 1) {
        return firstName;
    }

    // Assume the second-to-last token is the father's last name
    const fatherLastName = stripTrailingDot(tokens[tokens.length - 2]);

    // If there are at least 3 tokens, take the last one as mother's last name
    const hasMotherLastName = tokens.length >= 3;
    const motherLastName = hasMotherLastName ? stripTrailingDot(tokens[tokens.length - 1]) : '';

    if (!hasMotherLastName || !motherLastName) {
        return `${firstName} ${fatherLastName}`;
    }

    // First name + father's last name + initial of mother's last name
    return `${firstName} ${fatherLastName} ${motherLastName.charAt(0)}.`;
};

/** Removes trailing dot if present (e.g., "Smith." -> "Smith") */
const stripTrailingDot = (s: string): string => s.replace(/\.$/, '');

/**
 * Capitalizes each group of letters: first letter uppercase, the rest lowercase.
 */
export const capitalizeText = (input: string): string => {
    return input.replace(/\p{L}+/gu, (word) =>
        word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase()
    );
};

export function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

export function ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Directory created: ${dirPath}`);
    }
}

export function generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}_${minutes}_${seconds}`;
}

export function getPlatformName(): string {
    if (driver.isAndroid) {
        return 'android';
    } else if (driver.isIOS) {
        return 'ios';
    }
    return 'unknown';
}

export function findFunctionalityConfig(functionalityName: string) {
    for (const world in DERIVATION_KEYWORDS_CATALOG) {
        const config = DERIVATION_KEYWORDS_CATALOG[world];
        const found = config.functionalities.find(
            f => f.functionalityName === functionalityName
        );
        if (found) return found;
    }
    return null;
}

/**
 * Dismisses an iOS native system permission popup (location, contacts, camera, etc.)
 * by clicking the first visible system button found.
 * Returns true if a button was found and clicked, false otherwise.
 */
export async function dismissIosNativePermissionPopup(): Promise<boolean> {
    const systemPermissionButtons = [
        `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == "Don't Allow" OR label == "Don't Allow" OR name == 'No permitir' OR label == 'No permitir')`,
        `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == 'Allow Once' OR label == 'Allow Once' OR name == 'Permitir una vez' OR label == 'Permitir una vez')`,
        `-ios predicate string:type == 'XCUIElementTypeButton' AND (name == 'Allow While Using App' OR label == 'Allow While Using App' OR name == 'Permitir al usar la app' OR label == 'Permitir al usar la app')`,
    ];

    for (const selector of systemPermissionButtons) {
        const button = $(selector);
        if (await button.isExisting()) {
            await button.click();
            return true;
        }
    }

    return false;
}
