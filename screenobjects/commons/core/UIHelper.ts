import { browser, $, $$ } from '@wdio/globals';
import { Constants } from '../../../support/utils/constants.js';

/**
 * UIHelper - Core technical layer for Appium operations
 *
 * This class encapsulates all low-level Appium interactions (waits, clicks, gestures)
 * and should be used via composition in Page Objects through BaseScreen.
 *
 * Responsibilities:
 * - Element waiting strategies
 * - Element interactions (click, setValue, getText)
 * - Element visibility and state checks
 * - Platform-agnostic element operations
 *
 * @class UIHelper
 */
export class UIHelper {

    /**
     * Waits for an element to be displayed on the screen
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     * @throws Error if element is not visible after timeout
     */
    public async waitForDisplayed(selector: string, timeout = Constants.TIMEOUT_POR_DEFECTO): Promise<void> {
        const element = await $(selector);
        try {
            await element.waitForDisplayed({ timeout });
        } catch (error) {
            throw new Error(`The element with selector "${selector}" is not visible after ${timeout} ms.`);
        }
    }

    /**
     * Waits for an element to be displayed and returns it
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     * @returns The element if found and visible, null otherwise
     */
    public async waitForElement(selector: string, timeout = Constants.TIMEOUT_POR_DEFECTO): Promise<ChainablePromiseElement | null> {
        try {
            const element = await $(selector);
            await element.waitForDisplayed({ timeout });
            console.log(`Element ${selector} found and visible`);
            return element;
        } catch (error) {
            console.error(`Error waiting for element ${selector}: ${error}`);
            return null;
        }
    }

    /**
     * Waits for multiple elements to exist in the DOM
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     * @returns true if elements are found, false otherwise
     */
    public async waitForElements(selector: string, timeout = 10000): Promise<boolean> {
        try {
            await browser.waitUntil(async () => {
                try {
                    const elements = await $$(selector);
                    const elementCount = await Promise.resolve(elements.length);
                    return elementCount > 0;
                } catch {
                    return false;
                }
            }, {
                timeout,
                timeoutMsg: `Elements with selector "${selector}" did not appear after ${timeout}ms`,
            });
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    /**
     * Checks if an element exists in the DOM
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds (not used currently but kept for API compatibility)
     * @returns true if element exists, false otherwise
     */
    public async isElementPresent(selector: string, timeout = 3000): Promise<boolean> {
        try {
            const element = await $(selector);
            const isExisting = await element.isExisting();
            if (isExisting) {
                console.log('Element found');
                return true;
            }
            console.log('Element not found');
            return false;

        } catch (error) {
            console.log('Error searching for element:', error);
            return false;
        }
    }

    /**
     * Waits for an element to exist, be displayed and be enabled
     * @param selector - Element selector
     * @param isRequired - If true, throws error when element is not found
     * @param timeout - Maximum wait time in milliseconds
     * @returns true if element is ready, false if not required and not found
     * @throws Error if element is required but not found
     */
    public async waitForElementExist(selector: string, isRequired: boolean, timeout = Constants.TIMEOUT_POR_DEFECTO): Promise<boolean> {
        try {
            const element = await $(selector);
            await element.waitForExist({ timeout });
            await element.waitForDisplayed({ timeout });
            await element.waitForEnabled({ timeout });
            console.log('Element found and visible');
            return true;
        } catch (error) {
            console.error(`Error waiting for element: ${error}`);
            if (isRequired) {
                throw error;
            }
            return false;
        }
    }

    /**
     * Waits for an element (by locator object) to exist, be displayed and be enabled
     * @param element - Element object
     * @param isRequired - If true, throws error when element is not found
     * @param timeout - Maximum wait time in milliseconds
     * @returns true if element is ready, false if not required and not found
     * @throws Error with description if element is required but not found
     */
    public async waitForElementExistByLocator(element: ChainablePromiseElement, isRequired: boolean, timeout = Constants.TIMEOUT_POR_DEFECTO): Promise<boolean> {
        try {
            await element.waitForExist({ timeout });
            await element.waitForDisplayed({ timeout });
            await element.waitForEnabled({ timeout });
            console.log('Element found and visible');
            return true;
        } catch (error) {
            console.error(`Error waiting for element: ${error}`);
            if (isRequired) {
                throw new Error(`Required element not found`);
            }
            return false;
        }
    }

    /**
     * Waits for an element to be ready (exist, displayed, enabled) and returns it
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     * @returns The ready element
     * @throws Error if element is not ready
     */
    public async waitForElementToBeReady(selector: string, timeout: number = Constants.TIMEOUT_POR_DEFECTO): Promise<ChainablePromiseElement> {
        const element = $(selector);
        await element.waitForExist({ timeout });
        await element.waitForDisplayed({ timeout });
        await element.waitForEnabled({ timeout });
        return element;
    }

    /**
     * Waits for an element to be enabled with custom polling interval
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     * @param interval - Polling interval in milliseconds
     * @returns true if element is enabled, false otherwise
     */
    public async waitForElementToBeEnabled(
        selector: string,
        timeout: number = 10000,
        interval: number = 500
    ): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const element = await $(selector);

                if (await element.isExisting() && await element.isEnabled()) {
                    console.log(`Element ${selector} is enabled`);
                    return true;
                }

                await browser.pause(interval);
            } catch (error) {
                console.log(`Waiting for element ${selector} to be enabled...`);
                await browser.pause(interval);
            }
        }

        console.error(`Element ${selector} was not enabled after ${timeout}ms`);
        return false;
    }

    /**
     * Waits for element to be displayed and verifies with expect
     * @param element - Element to wait for
     * @param timeout - Maximum wait time in milliseconds
     * @param timeoutMsg - Custom timeout message
     */
    public async waitForElementDisplayedAndExpect(
        element: ChainablePromiseElement,
        timeout: number,
        timeoutMsg?: string
    ): Promise<void> {
        await element.waitForDisplayed({ timeout, timeoutMsg });
        await expect(element).toBeDisplayed();
    }

    /**
     * Performs an interaction (click or setValue) on an element
     * @param selector - Element selector
     * @param action - Action to perform ('click' or 'setValue')
     * @param value - Value to set (required if action is 'setValue')
     * @throws Error if element is not found or action fails
     */
    public async interactWithElement(selector: string, action: 'click' | 'setValue', value?: string): Promise<void> {
        try {
            const element = await this.waitForElementToBeReady(selector);
            if (action === 'click') {
                await element.click();
            } else if (action === 'setValue' && value !== undefined) {
                await element.setValue(value);
            }
        } catch (error) {
            console.error(`Error trying ${action} on element ${selector}`, error);
            throw new Error(`Error, element not found ${selector}`);
        }
    }

    /**
     * Waits for element to be displayed and clicks it
     * @param selector - Element selector
     * @param timeout - Maximum wait time in milliseconds
     */
    public async waitForDisplayedAndClick(selector: string, timeout: number = Constants.TIMEOUT_POR_DEFECTO): Promise<void> {
        try {
            const element = $(selector);
            await element.waitForDisplayed({ timeout });
            await element.click();
            console.log(`Element with the selector ${selector} found and clicked`);
        } catch (error) {
            console.error(`Element with selector ${selector} not visible in ${timeout}ms`);
        }
    }

    /**
     * Gets text from an element, optionally cleaning numeric values
     * @param selector - Element selector
     * @param currency - Currency type (if 'USD', returns raw text)
     * @param timeout - Maximum wait time in milliseconds
     * @returns The element text (cleaned if not USD)
     * @throws Error if element is not found or text is not accessible
     */
    public async getElementText(selector: string, currency?: string, timeout: number = Constants.TIMEOUT_POR_DEFECTO): Promise<string> {
        try {
            const cleanValue = (value: string) => value.replace(/[^\d.,]/g, '').trim();
            const element = await $(selector);
            await element.waitForDisplayed({ timeout });
            const rawText = await element.getText();
            if (currency === 'USD') {
                return rawText;
            }
            return cleanValue(rawText);
        } catch (error) {
            console.error(`Error getting text from element ${selector}`, error);
            throw new Error(`Element text not found or not accessible: ${selector}`);
        }
    }

    /**
     * Checks if error message matches expected text and clicks action button if provided
     * @param errorMessageSelector - Selector for error message element
     * @param expectedErrorText - Expected error text
     * @param actionButtonSelector - Optional button selector to click on match
     * @param timeout - Maximum wait time in milliseconds
     * @throws Error with appropriate message based on error text match
     */
    public async checkErrorMessageAndClickIfMatched(
        errorMessageSelector: string,
        expectedErrorText: string,
        actionButtonSelector?: string,
        timeout: number = Constants.TIMEOUT_POR_DEFECTO
    ): Promise<void> {
        try {
            const errorMessageElement = await $(errorMessageSelector);
            await errorMessageElement.waitForDisplayed({ timeout });
            const actualErrorText = await errorMessageElement.getText();

            if (actualErrorText === expectedErrorText) {
                if (actionButtonSelector) {
                    const btnInicio = await $(actionButtonSelector);
                    await btnInicio.waitForDisplayed({ timeout });
                    await btnInicio.click();
                }
                throw new Error(`The error message: "${expectedErrorText}", was encountered, which does not allow the test to continue.`);
            } else {
                throw new Error(`The error message encountered was: "${actualErrorText}", but it was expected to be: "${expectedErrorText}". The test cannot continue.`);
            }
        } catch (error) {
            console.log(`The error message was not found with the selector: ${errorMessageSelector}`);
        }
    }

    /**
    * Generates a code (OTP) for the user
    * @param selector - Element selector
    * @returns The generated OTP
    * @throws Error if the OTP generation fails
    */
    public async fillSequentialOtp(selector: string): Promise<void> {
        try {
            await this.waitForElement(selector);
            const inputs = await $$(selector);

            if (!inputs || await inputs.length === 0) {
                throw new Error(
                    `No OTP input fields were found with the selector: ${selector}`
                );
            }

            let index = 0;
            for (const input of inputs) {
                await input.setValue((index + 1).toString());
                index++;
            }
            
            try {
                await driver.hideKeyboard();
            } catch {
                throw new Error(
                    'Keyboard is not visible on the OTP screen'
                );
            }

        } catch (error) {
            throw new Error(
                `Error filling OTP sequentially: ${
                    error instanceof Error ? error.message : error
                }`
            );
        }
    }

    /**
    * Generic reusable method to validate a pair of text elements (e.g., title and message)
    * @param titleSelector - Selector for the title element
    * @param messageSelector - Selector for the message element
    * @param expectedTitle - Expected title text
    * @param expectedMessage - Expected message text
    * @throws Error with detailed message if validation fails
    */
    public async validateTextPair(
        titleSelector: string,
        messageSelector: string,
        expectedTitle: string,
        expectedMessage: string
    ): Promise<void> {
        try {
        await this.waitForElement(titleSelector);
        const actualTitle = await $(titleSelector).getText();
    
        await this.waitForElement(messageSelector);
        const actualMessage = await $(messageSelector).getText();
    
        await expect(actualTitle).toEqual(expectedTitle);
        await expect(actualMessage).toEqual(expectedMessage);
        
        } catch (error) {
            console.error(`Error validating text pair: ${error}`);
            throw new Error(
                `Failed to validate text pair. ` +
                `Expected title: "${expectedTitle}", Expected message: "${expectedMessage}". ` +
                `Error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

export default new UIHelper();
