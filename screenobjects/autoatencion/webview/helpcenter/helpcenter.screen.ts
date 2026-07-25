import LocatorFactory from '../../../../support/utils/LocatorFactory.js';
import LocatorHelpCenter from '../../../../resources/locators/autoatencion/webview/helpcenter/helpcenter.locator.json' with { type: 'json' };
import { TypeLocator } from '../../../../support/utils/Enums.js';
import { performScroll } from '../../../../support/utils/Utils.js';

import BaseScreen from '../../../commons/base.screen.js';
import { $ } from '@wdio/globals';

class HelpCenterScreen extends BaseScreen {
    
    public lblHelpCenterGlobal(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.lblHelpCenterGlobal,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.lblHelpCenterGlobal).replace("${value}", value);
        return $(locator);
    }

    public btnHelpCenterGlobal(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.btnHelpCenterGlobal,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.btnHelpCenterGlobal).replace("${value}", value);
        return $(locator);
    }

    public arrowHelpCenterBackGlobal(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.arrowHelpCenterBackGlobal,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.arrowHelpCenterBackGlobal).replace("${value}", value);
        return $(locator);
    }

    public cntHelpCenterHeader(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.cntHelpCenterHeader,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.cntHelpCenterHeader).replace("${value}", value);
        return $(locator);
    }

    public iconSearchResult(part1: string, part2: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.iconSearchResult,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.iconSearchResult).replace("${part1}", part1).replace("${part2}", part2);
        return $(locator);
    }

    public lblSearchResult(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.lblSearchResult,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.lblSearchResult).replace("${value}", value);
        return $(locator);
    }

    public inputSearchWithText(value: string) {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.inputSearchWithText,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.inputSearchWithText).replace("${value}", value);
        return $(locator);
    }

    public get arrowSearchBack() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.arrowSearchBack,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.arrowSearchBack);
        return $(locator);
    }

    public get iconSearchClear() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.iconSearchClear,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.iconSearchClear);
        return $(locator);
    }

    public get inputSearchWriteText() {
        const locator = LocatorFactory.getElement(TypeLocator.ID, LocatorHelpCenter.helpCenterIos.inputSearchWriteText,
            TypeLocator.XPATH, LocatorHelpCenter.helpCenterAndroid.inputSearchWriteText);
        return $(locator);
    }

    public async verifyVisibleText(value: string) {
        await this.uiHelper.waitForElementExistByLocator(this.lblHelpCenterGlobal(value), true);
    }

    public async verifyVisibleInputSearchWithText(value: string) {
        await this.uiHelper.waitForElementExistByLocator(this.inputSearchWithText(value), true);
    }

    public async verifyVisibleSearchResultIcon(part1: string, part2: string) {
        await this.uiHelper.waitForElementExistByLocator(this.iconSearchResult(part1, part2), true);
    }

    public async verifyNotVisibleSearchClearIcon() {
        await this.uiHelper.waitForElementExistByLocator(this.iconSearchClear, false, 3000);
    }

    public async verifyNotVisibleSearchResult(value: string) {
        await this.uiHelper.waitForElementExistByLocator(this.lblSearchResult(value), false, 3000);
    }

    public async clickText(value: string) {
        await this.lblHelpCenterGlobal(value).click();
    }

    public async clickButton(value: string) {
        await this.btnHelpCenterGlobal(value).click();
    }
    
    // pX and pY are percentage values 0-100
    // Example: For pressing in the upper right corner with a 5% margin, the values are pX = 95 and pY = 5
    public async clickAtPercentage(locator: ChainablePromiseElement, pX: number, pY: number) {
       // Get the position and size of container
        const location = await locator.getLocation(); // { x, y }
        const size = await locator.getSize();         // { width, height }
        // Calculate the coordinates using pX and pY
        const tapX = location.x + size.width * (pX / 100); 
        const tapY = location.y + size.height * (pY / 100);
        // Press on the coordinates
        await browser.action("pointer")
        .move({ x: tapX, y: tapY, origin: "viewport" })
        .down()
        .up()
        .perform();
    }

    public async clickHelpCenterCloseArrow(value: string) {
        await this.clickAtPercentage(this.cntHelpCenterHeader(value), 5, 5);
    }

    public async clickHelpCenterSearchIcon(value: string) {
        await this.clickAtPercentage(this.cntHelpCenterHeader(value), 95, 5);
    }

    public async clickHelpCenterBackArrow(value: string) {
        await this.arrowHelpCenterBackGlobal(value).click();
    }

    public async clickSearchResult(value: string) {
        await this.lblSearchResult(value).click();
    }

    public async clickSearchBackArrow() {
        await this.arrowSearchBack.click();
    }

    public async clickSearchClearIcon() {
        await this.iconSearchClear.click();
    }

    public async addSearchText(value: string) {
        await this.inputSearchWriteText.click();
        await this.inputSearchWriteText.addValue(value);
    }

    public async scrollUntilVisible(locator: ChainablePromiseElement) {
        await this.uiHelper.waitForElementExistByLocator(locator, false, 3000);
            await browser.waitUntil(
                async () => {
                    const isDisplayed = await locator.isDisplayed();
                    if (!isDisplayed) {
                        await performScroll(500, 1500, 500, 500); // Modify the settings for better scroll performance
                    }
                    return isDisplayed;
                },
                {
                    timeout: 3000, // Extend the maximum timeout for dynamic elements.
                    timeoutMsg: `The element was not found after multiple scrolls.`
                }
            );
    }

    public async scrollUntilTextVisible(value: string) {
        await this.scrollUntilVisible(this.lblHelpCenterGlobal(value));
    }

    public async scrollUntilButtonVisible(value: string) {
        await this.scrollUntilVisible(this.btnHelpCenterGlobal(value));
    }

    public async scrollUntilSearchResultVisible(value: string) {
        await this.scrollUntilVisible(this.lblSearchResult(value));
    }

}

export default new HelpCenterScreen();
