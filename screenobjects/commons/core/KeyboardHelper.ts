import { browser } from '@wdio/globals';
import { hideNativeKeyboard } from '../../../support/utils/Utils.js';

/**
 * KeyboardHelper - Keyboard and input operations
 *
 * This class handles keyboard-related operations including
 * input submission with OTP codes and keyboard hiding.
 *
 * Responsibilities:
 * - OTP submission with keyboard handling
 * - Native keyboard management
 *
 * @class KeyboardHelper
 */
export class KeyboardHelper {

    /**
     * Submits an OTP code in an input field, hides keyboard and optionally clicks validation button
     * @param inputElement - The input field element
     * @param otp - The OTP code to submit
     * @param btnElement - Optional validation button element
     */
    public async submitOtp(
        inputElement: ChainablePromiseElement,
        otp: string,
        btnElement?: ChainablePromiseElement
    ): Promise<void> {
        await inputElement.setValue(otp);
        await hideNativeKeyboard();
        await browser.pause(2000);
        if (btnElement) {
            const isVisible = await btnElement.isDisplayed().catch(() => false);
            if (isVisible) await btnElement.click();
        }
    }
}

export default new KeyboardHelper();
