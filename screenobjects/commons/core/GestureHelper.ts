import { browser, $ } from '@wdio/globals';

/**
 * GestureHelper - Mobile gesture operations for Appium
 *
 * This class handles platform-specific gestures and scroll operations
 * for both Android and iOS platforms.
 *
 * Responsibilities:
 * - Vertical scrolling operations
 * - Touch/tap gestures
 * - Pull-to-refresh (reload) operations
 * - Platform-specific scroll implementations
 *
 * @class GestureHelper
 */
export class GestureHelper{
    /**
     * Scrolls vertically to the end of a scrollable container
     * Platform-specific implementation for Android and iOS
     */
    public async verticalScrollingToEnd(): Promise<void> {
        if (driver.isIOS) {
            const element = await $(
                '(//XCUIElementTypeOther[@name="Barra de desplazamiento vertical, 1 página"])[2]',
            );
            await driver.execute("mobile: scroll", {
                direction: "down",
                element: element.elementId,
            });
        } else if (driver.isAndroid) {
            await $(
                "android=new UiScrollable(new UiSelector().scrollable(true)).scrollToEnd(1,5)",
            );
        }
    }

    /**
     * Scrolls vertically until text is visible (Android only)
     * @param text - Text to scroll into view
     */
    public async verticalScrollTextIntoView(text: string): Promise<void> {
        await $(
            `android=new UiScrollable(new UiSelector().scrollable(true)).scrollTextIntoView("${text}")`,
        );
    }

    /**
     * Performs a pull-to-refresh gesture (reload)
     * Simulates a swipe down from top of screen
     */
    public async reloaded(): Promise<void> {
        const { width, height } = await browser.getWindowSize();
        const startX = Math.floor(width / 2);
        const startY = Math.floor(height * 0.3);
        const endY = Math.floor(height * 0.7);

        await browser.performActions([
            {
                type: "pointer",
                id: "finger",
                parameters: { pointerType: "touch" },
                actions: [
                    { type: "pointerMove", duration: 0, x: startX, y: startY },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration: 500 },
                    { type: "pointerMove", duration: 1000, x: startX, y: endY },
                    { type: "pointerUp", button: 0 },
                ],
            },
        ]);

        await browser.releaseActions();
    }

    /**
     * Performs a touch/tap at specific coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     */
    public async touch(x: number, y: number): Promise<void> {
        await browser.performActions([
            {
                type: "pointer",
                id: "finger",
                parameters: { pointerType: "touch" },
                actions: [
                    { type: "pointerMove", duration: 0, x, y },
                    { type: "pointerDown", button: 0 },
                    { type: "pause", duration: 100 },
                    { type: "pointerUp", button: 0 },
                ],
            },
        ]);
        await browser.pause(5000);
    }

    /**
     * Dismisses any active iOS system alerts (location, notifications, etc.)
     * These alerts can be invisible in cloud environments but block interaction
     * @param timeout - Maximum time to wait for alert (default: 3000ms)
     * @returns true if alert was dismissed, false otherwise
     */
    public async dismissSystemAlertsIfPresent(
        timeout: number = 3000,
    ): Promise<boolean> {
        if (driver.isIOS) {
            return false;
        }

        try {
            let alertText = "";

            // Wait up to `timeout` ms for an alert to appear
            await browser.waitUntil(
                async () => {
                    try {
                        alertText = await driver.getAlertText();
                        return true;
                    } catch {
                        return false;
                    }
                },
                { timeout, interval: 500 },
            );

            console.log(
                `[Alert] Found system alert: "${alertText}" - attempting to dismiss...`,
            );

            // Try to dismiss (reject/cancel button - left button on iOS)
            await driver.dismissAlert();
            console.log("[Alert] Successfully dismissed");
            await driver.pause(500);
            return true;
        } catch {
            // No alert appeared within timeout or already handled - this is expected behavior
            return false;
        }
    }
}

export default new GestureHelper();
