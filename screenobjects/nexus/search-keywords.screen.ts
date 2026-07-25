import { $ } from '@wdio/globals';
import BaseScreen from 'screenobjects/commons/base.screen.ts';
import SearchKeywordsLocator from '../../resources/locators/nexus/quick-items/search-keywords.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';
import { findFunctionalityConfig, getTimeoutFromEnv } from 'support/utils/Utils.ts';
import { Constants } from '@utils/constants.ts';

class SearchKeywordsScreen extends BaseScreen {

    private timeout: number = getTimeoutFromEnv();

    private get searchInput() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsIos.searchInput,
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsAndroid.searchInput
        );
        return $(locator);
    }


    private get btnClearSearchInput() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsIos.btnClearSearchInput,
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsAndroid.btnClearSearchInput
        );
        return $(locator);
    }

    private get txtSearchEmptyResultTitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsIos.txtSearchEmptyResultTitle,
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsAndroid.txtSearchEmptyResultTitle
        );
        return $(locator);
    }

    private get txtSearchEmptyResultSubtitle() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsIos.txtSearchEmptyResultSubtitle,
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsAndroid.txtSearchEmptyResultSubtitle
        );
        return $(locator);
    }

    private get btnBack() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsIos.btnBack,
            TypeLocator.XPATH, SearchKeywordsLocator.SearchKeywordsAndroid.btnBack
        );
        return $(locator);
    }

    private buildDynamicLocator(iosTemplate: string, androidTemplate: string, text: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, iosTemplate.replace(/%s/g, text),
            TypeLocator.XPATH, androidTemplate.replace(/%s/g, text)
        );
        return $(locator);
    }

    async typeAndSubmitSearch(keyword: string) {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.searchInput, this.timeout,
            'Search input on Search screen was not displayed'
        );
        await this.searchInput.click();
        await this.searchInput.clearValue();
        await this.searchInput.setValue(keyword);

        if (driver.isAndroid) {
            await driver.pressKeyCode(Constants.ANDROID_KEYCODE_ENTER);
        }

        try { await driver.hideKeyboard(); } catch (error) {
            console.warn(`Could not hide keyboard: ${(error as Error).message}`);
        }
    }

    async validateFunctionalHomeResultIsDisplayed(name: string) {
        const element = this.buildDynamicLocator(
            SearchKeywordsLocator.SearchKeywordsIos.btnSearchFunctionalHomeByName,
            SearchKeywordsLocator.SearchKeywordsAndroid.btnSearchFunctionalHomeByName,
            name
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            element, this.timeout,
            `Functional home result "${name}" was not displayed`
        );
    }

    async validateCategoryResultIsDisplayed(name: string) {
        const element = this.buildDynamicLocator(
            SearchKeywordsLocator.SearchKeywordsIos.btnSearchCategoryByName,
            SearchKeywordsLocator.SearchKeywordsAndroid.btnSearchCategoryByName,
            name
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            element, this.timeout,
            `Category result "${name}" was not displayed`
        );
    }

    async validateEmptyResultState() {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtSearchEmptyResultTitle, this.timeout,
            'Empty result title was not displayed'
        );
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.txtSearchEmptyResultSubtitle, this.timeout,
            'Empty result subtitle was not displayed'
        );
    }
    async clearSearchInput() {
        await this.searchInput.waitForDisplayed({ timeout: this.timeout });
        const currentValue = await this.searchInput.getText();
        if (currentValue === '') {
            await this.searchInput.click();
            console.log("[Clear] Field already empty, skipping clear operation");
            return;
        }
        const clearButtonExists = await this.btnClearSearchInput.isExisting();
        if (clearButtonExists && await this.btnClearSearchInput.isDisplayed()) {
            await this.btnClearSearchInput.click();
            console.log("[Clear] Used clear button");
        } else {
            await this.searchInput.click();
            await this.searchInput.clearValue();
            console.log("[Clear] Used clearValue()");
        }

        const finalValue = await this.searchInput.getText();
        if (finalValue !== '') {
            throw new Error(`Cannot clear the field. Current value: "${finalValue}"`);
        }
        console.log("[Clear] Field cleared successfully");
    }


    async typeSearchInput(keyword: string) {
        for (let i = 1; i <= Constants.MAX_SEARCH_KEYWORDS_RETRIES; i++) {
            await this.uiHelper.waitForElementDisplayedAndExpect(
                this.searchInput, this.timeout,
                'Search input on Search screen was not displayed'
            );
            await this.searchInput.setValue(keyword);
            await browser.pause(Constants.RETRY_DELAY_MS);
            if (await this.searchInput.getText() === keyword) {
                console.log(`[Search] Search input set to "${keyword}" successfully on attempt ${i}`);
                return;
            }
            if (i < Constants.MAX_SEARCH_KEYWORDS_RETRIES) {
                console.warn(`[Search] Attempt ${i}/${Constants.MAX_SEARCH_KEYWORDS_RETRIES} failed: Could not set keyword "${keyword}"`);
                await browser.pause(Constants.RETRY_DELAY_MS);
            }
        }
        throw new Error(
            `Cannot set search input to "${keyword}" after ${Constants.MAX_SEARCH_KEYWORDS_RETRIES} attempts`
        );
    }

    async submitSearchWithEnterKey(functionalityName: string) {
        for (let i = 1; i <= Constants.MAX_SEARCH_KEYWORDS_RETRIES; i++) {
            await this.uiHelper.waitForElementDisplayedAndExpect(
                this.searchInput, this.timeout,
                'Search input on Search screen was not displayed'
            );
            await driver.pressKeyCode(Constants.ANDROID_KEYCODE_ENTER);
            await browser.pause(Constants.RETRY_DELAY_MS);
            if (await this.isFunctionalHomeResultDisplayed(functionalityName)) {
                console.log(`[Search] Enter key processed successfully on attempt ${i} for: ${functionalityName}`);
                return;
            }
            if (i < Constants.MAX_SEARCH_KEYWORDS_RETRIES) {
                console.warn(`[Search] Attempt ${i}/${Constants.MAX_SEARCH_KEYWORDS_RETRIES} failed: Functionality "${functionalityName}" not displayed after Enter key`);
                await browser.pause(Constants.RETRY_DELAY_MS);
            }
        }
        throw new Error(
            `Cannot process Enter key for "${functionalityName}" after ${Constants.MAX_SEARCH_KEYWORDS_RETRIES} attempts`
        );
    }
    async typeAndSubmitSearchWithRetry(keyword: string, functionalityName: string) {
        await this.clearSearchInput()
        await this.typeSearchInput(keyword);
        await this.submitSearchWithEnterKey(functionalityName);
    }

    async isFunctionalHomeResultDisplayed(functionalityName: string): Promise<boolean> {
        const element = this.buildDynamicLocator(
            SearchKeywordsLocator.SearchKeywordsIos.btnSearchFunctionalHomeByName,
            SearchKeywordsLocator.SearchKeywordsAndroid.btnSearchFunctionalHomeByName,
            functionalityName
        );
        try {
            await element.waitForDisplayed({ timeout: this.timeout });
            return true;
        } catch (error) {
            console.warn(`Element not displayed for "${functionalityName}": ${(error as Error).message}`);
            return false;
        }
    }
    async gotoHomePageFunctionality(name: string) {
        const element = this.buildDynamicLocator(
            SearchKeywordsLocator.SearchKeywordsIos.btnSearchFunctionalHomeByName,
            SearchKeywordsLocator.SearchKeywordsAndroid.btnSearchFunctionalHomeByName,
            name
        );

        await element.waitForDisplayed({ timeout: this.timeout });
        await element.click();
    }
    async validateNameScreenView(name: string, functionalityName: string) {
        const functionality = findFunctionalityConfig(functionalityName);
        if (!functionality) {
            throw new Error(`Functionality "${functionalityName}" not found in DERIVATION_KEYWORDS_CATALOG`);
        }
        const locatorType = functionality.locatorType;
        if (!locatorType) {
            throw new Error(`locatorType is missing for functionality "${functionalityName}"`);
        }
        const locatorMap = {
            screenView: {
                ios: SearchKeywordsLocator.SearchKeywordsIos.screenView,
                android: SearchKeywordsLocator.SearchKeywordsAndroid.screenView
            },
            screenViewFollowing: {
                ios: SearchKeywordsLocator.SearchKeywordsIos.screenViewFollowing,
                android: SearchKeywordsLocator.SearchKeywordsAndroid.screenViewFollowing
            },
            screenViewBiometry: {
                ios: SearchKeywordsLocator.SearchKeywordsIos.screenViewBiometry,
                android: SearchKeywordsLocator.SearchKeywordsAndroid.screenViewBiometry
            }
        };
        const locators = locatorMap[locatorType];
        if (!locators) {
            throw new Error(`Unsupported locatorType "${locatorType}" for functionality "${functionalityName}". Allowed: screenView, screenViewFollowing, screenViewBiometry`);
        }
        if (!locators.ios.includes('%s') || !locators.android.includes('%s')) {
            console.warn(`Locator template for ${locatorType} does not contain '%s'. Dynamic replacement will have no effect.`);
        }
        const element = this.buildDynamicLocator(locators.ios, locators.android, name);
        await this.uiHelper.waitForElementDisplayedAndExpect(
            element, this.timeout,
            `Screen view "${name}" was not displayed`
        );
    }
    async goBack() {
        const backButtonExists = await this.btnBack.isExisting();
        if (backButtonExists && await this.btnBack.isDisplayed()) {
            await this.btnBack.click();
        } else {
            if (driver.isAndroid) {
                await driver.pressKeyCode(Constants.ANDROID_KEYCODE_BACK);
            } else {
                await driver.back();
            }
        }
    }

    async validateSearchScreenIsReady() {
        await this.uiHelper.waitForElementDisplayedAndExpect(
            this.searchInput, this.timeout,
            'Search input is not displayed - search screen not ready'
        );
        const isEnabled = await this.searchInput.isEnabled();
        if (!isEnabled) {
            throw new Error('Search input is not enabled - search screen not ready for input');
        }
        console.log('[Validation] Search screen is ready for new searches');
    }
}

export default new SearchKeywordsScreen();


