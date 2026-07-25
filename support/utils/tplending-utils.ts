import { performScroll } from '@support/utils/Utils.ts';

export class TPLendingConstants {
    static NAME_LENDING_TO_SEARCH: string = 'Créditos';
}

export const TIMEOUTS = {
    DEFAULT: 15000,
    SHORT: 5000,
    MEDIUM: 10000,
    LONG: 25000
} as const;

export const PAUSES = {
    SHORT: 500,
    MEDIUM: 1000,
    LONG: 2000
} as const;

export interface ScrollConfig {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export const SCROLL_CONFIGS = {
    creditPreview: {
        howToPay: { x1: 400, y1: 1000, x2: 400, y2: 600 },
        loanInfo: { x1: 340, y1: 1180, x2: 340, y2: 290 },
        carousel: { x1: 640, y1: 780, x2: 210, y2: 790 },
        mortgageInfo: { x1: 310, y1: 1327, x2: 322, y2: 505 },
        mortgageDetails: { x1: 310, y1: 1436, x2: 322, y2: 500 }
    },
    quote: {
        moreOptions: { x1: 500, y1: 1400, x2: 500, y2: 600 }
    },
} as const;

/**
 * Wait for a single element to be displayed
 * @param selector - Element selector
 * @param timeout - Wait timeout in milliseconds
 */
export async function waitForElementToDisplay(
    selector: string,
    timeout = TIMEOUTS.DEFAULT
): Promise<void> {
    await $(selector).waitForDisplayed({ timeout });
}

/**
 * Wait for multiple elements to be displayed sequentially
 * @param selectors - Array of element selectors
 * @param timeout - Wait timeout in milliseconds for each element
 */
export async function waitForMultipleElements(
    selectors: string[],
    timeout = TIMEOUTS.DEFAULT
): Promise<void> {
    for (const selector of selectors) {
        await waitForElementToDisplay(selector, timeout);
    }
}

/**
 * Perform scroll, wait, and verify elements are displayed
 * @param scrollConfig - Scroll coordinates configuration
 * @param elements - Array of element selectors to verify
 * @param pauseAfter - Pause duration after scroll in milliseconds
 */
export async function scrollAndVerify(
    scrollConfig: ScrollConfig,
    elements: string[],
    pauseAfter: number = PAUSES.MEDIUM
): Promise<void> {
    await performScroll(scrollConfig.x1, scrollConfig.y1, scrollConfig.x2, scrollConfig.y2);
    await driver.pause(pauseAfter);
    await waitForMultipleElements(elements);
}

/**
 * Perform a scroll with pause but without element verification
 * Useful for navigation scrolls where verification happens later
 * @param scrollConfig - Scroll coordinates configuration
 * @param pauseAfter - Pause duration after scroll in milliseconds
 */
export async function scrollWithPause(
    scrollConfig: ScrollConfig,
    pauseAfter: number = PAUSES.MEDIUM
): Promise<void> {
    await performScroll(scrollConfig.x1, scrollConfig.y1, scrollConfig.x2, scrollConfig.y2);
    await driver.pause(pauseAfter);
}
