import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';
import MyQRLocator from '../../resources/locators/nexus/quick-items/my-qr.locator.json' with { type: 'json' };
import LocatorFactory from 'support/utils/LocatorFactory.ts';
import { TypeLocator } from 'support/utils/Enums.ts';

/**
 * sub page containing specific selectors and methods for a specific page
 */
class MyQR extends BaseScreen{
    /**
     * define selectors using getter methods
     */
    public get backButton (){
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.backButton,
            TypeLocator.ANDROID, MyQRLocator.myQRAndroid.backButton);
        return $(locator);
    }

    public get txtMenuTitle () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtMenuTitle,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtMenuTitle);
        return $(locator);
    }

    public get txtMyQRTitle () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtMyQRTitle,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtMyQRTitle);
        return $(locator);
    }

    public get imgMyQR () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.imgMyQR,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.imgMyQR);
        return $(locator);
    }

    public get btnShareAndDownload () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.btnShareAndDownload,
            TypeLocator.ID, MyQRLocator.myQRAndroid.btnShareAndDownload);
        return $(locator);
    }

    // share and download screen
    public get imgMyQRShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.imgMyQRShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.imgMyQRShareAndDownloadScreen);
        return $(locator);
    }

    public get txtPayHereShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtPayHereShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtPayHereShareAndDownloadScreen);
        return $(locator);
    }

    public get btnShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.btnShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.btnShareAndDownloadScreen);
        return $(locator);
    }

    public get txtShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtShareAndDownloadScreen);
        return $(locator);
    }

    public get btnDownloadShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.btnDownloadShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.btnDownloadShareAndDownloadScreen);
        return $(locator);
    }

    public get txtDownloadShareAndDownloadScreen () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtDownloadShareAndDownloadScreen,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtDownloadShareAndDownloadScreen);
        return $(locator);
    }

    public get txtToastDownload () {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, MyQRLocator.myQRIos.txtToastDownload,
            TypeLocator.XPATH, MyQRLocator.myQRAndroid.txtToastDownload);
        return $(locator);
    }

    /**
     * a method to encapsule automation code to interact with the page
     * e.g. to login using username and password
     */
    // go back from "Mi QR"
    public async goBack() {
        await (this.backButton).click();
    }

    // tap on share and download"
    public async clickOnShareAndDownload() {
        await (this.btnShareAndDownload).click();
    }

    // press the download button
    public async pressDownloadButton() {
        await (this.btnDownloadShareAndDownloadScreen).click();
    }

    // txt dynamic item
    public txtDynamicItem(defaultLabel: string) {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, `//XCUIElementTypeStaticText[@name="${defaultLabel}"]`,
            TypeLocator.ANDROID, `new UiSelector().text("${defaultLabel}")`);
        return $(locator);
    }
}

export default new MyQR();
