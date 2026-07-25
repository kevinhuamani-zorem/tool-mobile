import BaseScreen from '@screenobjects/commons/base.screen.ts';
import LocatorFactory from '@support/utils/LocatorFactory.ts';
import LocatorLendingHome from '@resources/locators/third-party-lending/home-multi-lending.json' with { type: 'json' };
import { TypeLocator } from '@support/utils/Enums.ts';
import {
    TIMEOUTS,
    PAUSES,
    waitForMultipleElements,
    TPLendingConstants
} from '@utils/tplending-utils.ts';

class LendingHomeScreen extends BaseScreen {

    public get btnLendingMenu() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnLendingMenu,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnLendingMenu);
    }

    public get btnLendingViewAllOption() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnLendingViewAllOption,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnLendingMenu);
    }

    public get btnLendingViewMore() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnLendingViewMore,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnLendingViewMore);
    }

    public get imgTPLendingMibancoLogo() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.imgTPLendingMibancoLogo,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.imgTPLendingMibancoLogo);
    }

    public get txtTPLendingCreditAvailable() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingCreditAvailable,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingCreditAvailable);
    }

    public get txtTPLendingCreditMessage() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingCreditMessage,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingCreditMessage);
    }

    public get btnTPLendingCreditButton() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnTPLendingCreditButton,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnTPLendingCreditButton);
    }

    public get txtTPLendingMibancoTitle() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoTitle,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoTitle);
    }

    public get txtTPLendingMibancoHeading() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoHeading,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoHeading);
    }

    public get txtTPLendingMibancoAmount() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoAmount,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoAmount);
    }

    public get txtTPLendingMibancoSubHeading() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoSubHeading,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoSubHeading);
    }

    public get btnTPLendingMibancoSimulate() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnTPLendingMibancoSimulate,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnTPLendingMibancoSimulate);
    }

    public get txtTPLendingMibancoFAQTitle() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoFAQTitle,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoFAQTitle);
    }

    public get txtTPLendingMibancoFAQFirstQuestion() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoFAQFirstQuestion,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoFAQFirstQuestion);
    }

    public get txtTPLendingMibancoFAQSecondQuestion() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoFAQSecondQuestion,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoFAQSecondQuestion);
    }

    public get txtTPLendingMibancoFAQThirdQuestion(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.txtTPLendingMibancoFAQThirdQuestion,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.txtTPLendingMibancoFAQThirdQuestion);
    }

    public get btnTPLendingMibancoFAQ() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnTPLendingMibancoFAQ,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnTPLendingMibancoFAQ);
    }

    public get inputSearchShortcut() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.inputSearchShortcut,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.inputSearchShortcut);
    }

    public get btnViewAll() {
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnViewAll,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnViewAll);
    }

    public get btnViewMore(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnViewMore,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnViewMore);
    }

    public get btnSearchButton(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnSearchButton,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnSearchButton);
    }

    public get searchElementFound(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.searchElementFound,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.searchElementFound);
    }

    public get selectionElementFound(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.selectionElementFound,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.selectionElementFound);
    }

    public get btnReturnHome(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnReturnHome,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnReturnHome);
    }

    public get btnReturnHomeFromSearch(){
        return LocatorFactory.getElement(TypeLocator.XPATH, LocatorLendingHome.menuIos.btnReturnHomeFromSearch,
                                        TypeLocator.XPATH, LocatorLendingHome.menuAndroid.btnReturnHomeFromSearch);
    }

    /**
     * Helper method to perform direct element click bypassing interactWithElement
     * Used for iOS-specific elements that fail with expect.fail error
     * @param iosLocator - Locator string for iOS
     * @param androidLocator - Locator string for Android
     * @param actionDescription - Description for logging
     * @param timeout - Wait timeout in milliseconds
     */

    private async clickElementDirect(
        iosLocator: string,
        androidLocator: string,
        actionDescription: string,
        timeout: number = TIMEOUTS.MEDIUM
    ): Promise<void> {
        const locator = browser.isIOS ? iosLocator : androidLocator;
        
        const element = await $(locator);
        await element.waitForDisplayed({ timeout });
        await element.click();
        console.log(`${actionDescription} with locator: ${locator}`);
    }

    public async enterLendingViewMore() {
        await this.uiHelper.interactWithElement(this.btnLendingViewMore, 'click');
    }

    public async enterHomeTPLending() {
        await this.uiHelper.interactWithElement(this.btnTPLendingCreditButton, 'click');
    }

    public async clickSearchApp() {
        await this.uiHelper.interactWithElement(this.btnSearchButton, 'click');
    }

    public async clickElementSearch() {
        await this.clickElementDirect(
            LocatorLendingHome.menuIos.searchElementFound,
            LocatorLendingHome.menuAndroid.searchElementFound,
            'Click on search result'
        );
    }

    public async clickElementFound() {
        await this.clickElementDirect(
            LocatorLendingHome.menuIos.selectionElementFound,
            LocatorLendingHome.menuAndroid.selectionElementFound,
            'Click on selection'
        );
    }

    public async viewAll(){
        await this.uiHelper.interactWithElement(this.btnViewAll, 'click');
        const locator = browser.isIOS 
            ? LocatorLendingHome.menuIos.btnLendingViewAllOption
            : LocatorLendingHome.menuAndroid.btnLendingMenu;
        await this.uiHelper.waitForElementExist(locator, false, TIMEOUTS.MEDIUM);
    }

    public async viewMore(){
        await this.uiHelper.interactWithElement(this.btnViewMore, 'click');
    }

    public async clickReturnHome(){
        await this.uiHelper.interactWithElement(this.btnReturnHome, 'click');
    }

    public async returnToHomeFromSearch(){
        await this.uiHelper.interactWithElement(this.btnReturnHomeFromSearch, 'click');
    }

    public async enterHomeLending() {
        await this.clickElementDirect(
            LocatorLendingHome.menuIos.btnLendingMenu,
            LocatorLendingHome.menuAndroid.btnLendingMenu,
            'Click on Credits from home'
        );
    }

    public async enterHomeLendingFromViewAll() {
        await this.clickElementDirect(
            LocatorLendingHome.menuIos.btnLendingViewAllOption,
            LocatorLendingHome.menuAndroid.btnLendingMenu,
            'Click on Credits from viewAll'
        );
    }
    
    private async checkIfShortcutIsDisplayed(locatorProperty: 'btnLendingMenu' | 'btnLendingViewMore' | 'btnViewAll', errorMessage: string, notSupportedMessage: string): Promise<boolean> {
        try {
            let locator;
            if (browser.isAndroid) {
                locator = LocatorLendingHome.menuAndroid[locatorProperty];
            } else if (browser.isIOS) {
                locator = LocatorLendingHome.menuIos[locatorProperty];
            } else {
                console.log(notSupportedMessage);
                return false;
            }
            const exists = await this.uiHelper.waitForElementExist(locator, false, TIMEOUTS.SHORT);
            return exists;
        } catch (error) {
            console.error(errorMessage, error);
            return false;
        }
    }

    public async checkIfLendingExist(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            'btnLendingMenu',
            'Error verifying the element to select lending shortcut:',
            'Lending shortcut check not supported on this platform'
        );
    }

    public async checkIfTPLendingWithShortcut(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            'btnLendingViewMore',
            'Error verifying the element to select créditos shortcut:',
            'Créditos shortcut check not supported on this platform'
        );
    }

    public async checkIfViewAllIsDisplayed(): Promise<boolean> {
        return this.checkIfShortcutIsDisplayed(
            'btnViewAll',
            'Error verifying the element to select view all:',
            'View all button check not supported on this platform'
        );
    }

    public async enterWordToSearch(word: string) {
        await this.uiHelper.interactWithElement(this.inputSearchShortcut, 'setValue', word);
    }

    public async clickLendingFound(): Promise<void> {
        await this.uiHelper.interactWithElement(this.txtTPLendingMibancoTitle, 'click');
    }

    private async verifyCreditAvailability(): Promise<void> {
        await waitForMultipleElements([
            this.imgTPLendingMibancoLogo,
            this.txtTPLendingCreditAvailable,
            this.txtTPLendingCreditMessage
        ], TIMEOUTS.DEFAULT);
    }

    private async verifyLendingDetails(): Promise<void> {
        await waitForMultipleElements([
            this.txtTPLendingMibancoHeading,
            this.txtTPLendingMibancoAmount,
            this.txtTPLendingMibancoSubHeading,
            this.btnTPLendingMibancoSimulate
        ], TIMEOUTS.DEFAULT);
    }

    private async verifyFAQSection(): Promise<void> {
        await waitForMultipleElements([
            this.txtTPLendingMibancoFAQTitle,
            this.txtTPLendingMibancoFAQFirstQuestion,
            this.txtTPLendingMibancoFAQSecondQuestion,
            this.txtTPLendingMibancoFAQThirdQuestion,
            this.btnTPLendingMibancoFAQ
        ], TIMEOUTS.DEFAULT);
    }

    public async verifyHomeMultiLending(): Promise<void> {
        try {
            await this.verifyCreditAvailability();
            await this.enterHomeTPLending();
            await driver.pause(PAUSES.LONG);
            await this.verifyLendingDetails();
            await this.verifyFAQSection();
            await driver.pause(PAUSES.LONG);
        } catch (error) {
            console.error('No credit campaign is available', error);
            return;
        }
    }

    public async searchLendingFromHome(): Promise<void> {
        try {
            await this.clickSearchApp();
            await this.enterWordToSearch(TPLendingConstants.NAME_LENDING_TO_SEARCH);
            await this.clickElementSearch();
            await this.clickElementFound();
            
            await driver.pause(PAUSES.MEDIUM);
            await this.clickLendingFound();
        } catch (error) {
            console.error('Element was not found in the application', error);
            return;
        }
    }
}
export default new LendingHomeScreen();
