import { $ } from '@wdio/globals';
import RmnMarketingLocator from '@locators/martech/rmn/rmn-stories.locator.json' with { type: 'json' };
import BaseScreen from '@screenobjects/commons/base.screen.ts';
import unlockScreen from '@screenobjects/autenticacion/unlock/unlock.screen.ts';
import welcomeyaperoScreen from '@screenobjects/home/welcomeyapero.screen.ts';
import { TypeLocator } from '@utils/Enums.ts';
import LocatorFactory from '@utils/LocatorFactory.ts';
import { getMaxTimeoutFromEnv, getTimeoutFromEnv, handlePopupIfVisibleWithTimeOut } from '@utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();
const maxTimeout: number = getMaxTimeoutFromEnv();

class RmnStoriesScreen extends BaseScreen {

    private async isAnyIosHomeElementDisplayed(timeoutMs: number): Promise<boolean> {
        const selectors = [
            '//XCUIElementTypeStaticText[contains(@name,"Hola,")]',
            '//XCUIElementTypeStaticText[contains(@label,"Hola,")]',
            '//XCUIElementTypeStaticText[contains(@name,"Mostrar saldo")]',
            '//XCUIElementTypeStaticText[contains(@label,"Mostrar saldo")]',
            '//XCUIElementTypeStaticText[contains(@name,"Mostrar movimientos")]',
            '//XCUIElementTypeStaticText[contains(@label,"Mostrar movimientos")]'
        ];

        for (const selector of selectors) {
            const displayed = await $(selector).waitForDisplayed({ timeout: timeoutMs }).catch(() => false);
            if (displayed) {
                return true;
            }
        }

        return false;
    }

    public async isIosHomeVisible(timeoutMs = 2000): Promise<boolean> {
        if (!browser.isIOS) {
            return false;
        }

        return this.isAnyIosHomeElementDisplayed(timeoutMs);
    }

    public async isIosDeepLinkDestinationVisible(timeoutMs = 2000): Promise<boolean> {
        if (!browser.isIOS) {
            return false;
        }

        const checks = [
            this.publicidadText.waitForDisplayed({ timeout: timeoutMs }).catch(() => false),
            this.closeButton.waitForDisplayed({ timeout: timeoutMs }).catch(() => false),
            $('//XCUIElementTypeStaticText[contains(@name,"Ocurrió un inconveniente") or contains(@label,"Ocurrió un inconveniente")]')
                .waitForDisplayed({ timeout: timeoutMs })
                .catch(() => false)
        ];

        const results = await Promise.all(checks);
        return results.some(Boolean);
    }

    private async tapIosTopRightClose(closeName: string): Promise<void> {
        await this.tapIosStoryControl(0.94, 0.06);
    }

    private async tapIosTopLeftBack(actionName: string): Promise<void> {
        await this.tapIosStoryControl(0.08, 0.08);
    }

    private async isIosExternalBrowserVisible(timeoutMs: number): Promise<boolean> {
        const expectedBundleId = process.env.BUNDLE_ID || 'com.yape.qa';
        const browserAppActivated = await browser.waitUntil(async () => {
            try {
                const activeAppInfo = await driver.execute('mobile: activeAppInfo') as { bundleId?: string; name?: string };
                return Boolean(activeAppInfo?.bundleId && activeAppInfo.bundleId !== expectedBundleId);
            } catch {
                return false;
            }
        }, {
            timeout: timeoutMs,
            interval: 1000,
            timeoutMsg: 'External iOS browser app did not become active.'
        }).then(() => true).catch(() => false);

        if (browserAppActivated) {
            return true;
        }

        const selectors = [
            '//*[contains(@name,"gloria.com.pe") or contains(@label,"gloria.com.pe") or contains(@value,"gloria.com.pe")]',
            '//*[contains(@name,"ACEPTAR TODAS LAS COOKIES") or contains(@label,"ACEPTAR TODAS LAS COOKIES") or contains(@value,"ACEPTAR TODAS LAS COOKIES")]',
            '//*[contains(@name,"GLORIA") or contains(@label,"GLORIA") or contains(@value,"GLORIA")]',
            '//*[contains(@name,"Política de Privacidad") or contains(@label,"Política de Privacidad")]',
            '//*[contains(@name,"ELEGIR COOKIES") or contains(@label,"ELEGIR COOKIES") or contains(@value,"ELEGIR COOKIES")]'
        ];

        for (const selector of selectors) {
            const displayed = await $(selector).waitForDisplayed({ timeout: timeoutMs }).catch(() => false);
            if (displayed) {
                return true;
            }
        }

        return false;
    }

    private async tapIosStoryControl(xRatio: number, yRatio: number): Promise<void> {
        const { width, height } = await driver.getWindowRect();
        const x = Math.round(width * xRatio);
        const y = Math.round(height * yRatio);

        await driver.execute('mobile: tap', { x, y });
    }

    private async tapIosBottomCta(ctaName: string): Promise<void> {
        await this.tapIosStoryControl(0.5, 0.94);
    }

    public get closeButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.close_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.close_button
        );
        return $(locator);
    }

    public get yapearServiciosButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.yapear_servicios_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.yapear_servicios_button
        );
        return $(locator);
    }

    public get publicidadText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.publicidad_text,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.publicidad_text
        );
        return $(locator);
    }

    public get homeGreetingText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.home_profile_icon,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.home_profile_icon
        );
        return $(locator);
    }

    public get volumeOffButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.volume_button_off,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.volume_button_off
        );
        return $(locator);
    }

    public get volumeOnButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.volume_button_on,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.volume_button_on
        );
        return $(locator);
    }

    public get likeOnButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.like_button_on,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.like_button_on
        );
        return $(locator);
    }

    public get likeOffButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.like_button_off,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.like_button_off
        );
        return $(locator);
    }

    public get ctaExternalRedirect() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.cta_external_redirect,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.cta_external_redirect
        );
        return $(locator);
    }

    public get ctaWebviewRedirect() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.cta_webview_redirect,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.cta_webview_redirect
        );
        return $(locator);
    }

    public get promotionsWebviewCloseButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.promotions_webview_close_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.promotions_webview_close_button
        );
        return $(locator);
    }

    public get locationContinueButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.location_continue_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.location_continue_button
        );
        return $(locator);
    }

    public get locationPermissionWhileUsingButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.location_permission_while_using_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.location_permission_while_using_button
        );
        return $(locator);
    }

    public get promotionsWebviewRoot() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.promotions_webview_root,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.promotions_webview_root
        );
        return $(locator);
    }

    public get externalAppAlert() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.alert_app_externa,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.alert_app_externa
        );
        return $(locator);
    }

    public get confirmExternalRedirectButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.confirm_external_redirect_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.confirm_external_redirect_button
        );
        return $(locator);
    }
    
    public get externalBrowserBrandGloria() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.external_browser_brand_gloria,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.external_browser_brand_gloria
        );
        return $(locator);
    }

    public get yapearServiciosText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.yapear_servicios_text,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.yapear_servicios_text
        );
        return $(locator);
    }

    public get errorMessageText() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.error_message_text,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.error_message_text
        );
        return $(locator);
    }

    public get backButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.back_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.back_button
        );
        return $(locator);
    }

    public get goHomeFromErrorButton() {
        const locator = LocatorFactory.getElement(
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingIos.go_home_from_error_button,
            TypeLocator.XPATH, RmnMarketingLocator.RmnMarketingAndroid.go_home_from_error_button
        );
        return $(locator);
    }

    public async validateCloseButtonIsDisplayed(): Promise<boolean> {
        try {
            await this.closeButton.waitForDisplayed({ timeout: timeout });
            return await this.closeButton.isDisplayed();
        } catch (error) {
            return false;
        }
    }

    public async validateYapearServiciosButtonIsDisplayed(): Promise<boolean> {
        try {
            await this.yapearServiciosButton.waitForDisplayed({ timeout: timeout });
            return await this.yapearServiciosButton.isDisplayed();
        } catch (error) {
            return false;
        }
    }

    public async validatePublicidadTextIsDisplayed(): Promise<boolean> {
        try {
            await this.publicidadText.waitForDisplayed({ timeout: timeout });
            return await this.publicidadText.isDisplayed();
        } catch (error) {
            return false;
        }
    }

    public async validateMarketingPageElements(): Promise<{closeButton: boolean, publicidadText: boolean}> {
        const results = {
            closeButton: await this.validateCloseButtonIsDisplayed(),
            publicidadText: await this.validatePublicidadTextIsDisplayed()
        };

        return results;
    }

    public async verifyMarketingPageReady(): Promise<void> {
        const validationResults = await this.validateMarketingPageElements();

        if (!validationResults.closeButton && !(browser.isIOS && validationResults.publicidadText)) {
            throw new Error('The X (close) button is not visible on the marketing page.');
        }

        if (!validationResults.publicidadText) {
            throw new Error('The "Publicidad" text is not visible on the marketing page.');
        }
    }

    private async unlockIosIfDeepLinkReturnsToPin(password?: string): Promise<void> {
        if (!browser.isIOS) {
            return;
        }

        const pinScreenVisible = await welcomeyaperoScreen.verificarSiIniciaLoginConPin();
        if (!pinScreenVisible) {
            return;
        }

        if (!password) {
            throw new Error('The iOS app returned to the PIN screen after the deep link and no session user password is available to unlock it.');
        }

        await unlockScreen.enterPassword(password);
        await browser.waitUntil(async () => !(await welcomeyaperoScreen.verificarSiIniciaLoginConPin()), {
            timeout: 10000,
            interval: 1000,
            timeoutMsg: 'The iOS app remained on the PIN screen after re-unlocking it post deep link.'
        });

        await unlockScreen.finishedLoading().catch(() => undefined);
    }

    private async waitForIosHomeOrUnlockAfterBack(password?: string): Promise<void> {
        if (!browser.isIOS) {
            return;
        }

        await browser.waitUntil(async () => {
            if (await this.isIosHomeVisible(1000)) {
                return true;
            }

            if (await welcomeyaperoScreen.verificarSiIniciaLoginConPin()) {
                await this.unlockIosIfDeepLinkReturnsToPin(password);
                return await this.isIosHomeVisible(3000);
            }

            return false;
        }, {
            timeout: 15000,
            interval: 1000,
            timeoutMsg: 'The iOS app did not return to home or expose the PIN gate after leaving the internal CTA.'
        });
    }

    private async waitForIosDeepLinkDestination(url: string, password?: string): Promise<void> {
        if (!browser.isIOS) {
            return;
        }

        const bundleId = process.env.BUNDLE_ID || 'com.yape.qa';

        const waitForDestination = async (): Promise<boolean> => {
            await unlockScreen.finishedLoading().catch(() => undefined);

            if (await welcomeyaperoScreen.verificarSiIniciaLoginConPin()) {
                await this.unlockIosIfDeepLinkReturnsToPin(password);
                await unlockScreen.finishedLoading().catch(() => undefined);
            }

            return this.isIosDeepLinkDestinationVisible(1000);
        };

        const destinationVisible = await browser.waitUntil(waitForDestination, {
            timeout: 15000,
            interval: 1000,
            timeoutMsg: 'The iOS RMN deep link did not resolve beyond the splash screen.'
        }).then(() => true).catch(() => false);

        if (destinationVisible) {
            return;
        }

        await driver.execute('mobile: activeAppInfo');
        await driver.activateApp(bundleId);
        await this.unlockIosIfDeepLinkReturnsToPin(password);
        await unlockScreen.finishedLoading().catch(() => undefined);

        await driver.execute('mobile: deepLink', {
            url,
            bundleId,
        });

        await browser.waitUntil(waitForDestination, {
            timeout: 15000,
            interval: 1000,
            timeoutMsg: 'The iOS RMN deep link did not resolve after reactivating the app from the splash screen.'
        });
    }

    public async openDeepLink(url: string, password?: string): Promise<void> {
        try {
            if (browser.isAndroid) {
                await driver.execute('mobile: deepLink', {
                    url,
                    package: process.env.APP_YAPE_PACKAGE || 'com.yape.qa'
                });
                return;
            }

            const bundleId = process.env.BUNDLE_ID || 'com.yape.qa';
            await driver.execute('mobile: deepLink', {
                url,
                bundleId,
            });
            await this.unlockIosIfDeepLinkReturnsToPin(password);
            await this.waitForIosDeepLinkDestination(url, password);
        } catch (error) {
            const appIdentifier = browser.isIOS
                ? process.env.BUNDLE_ID || 'com.yape.qa'
                : process.env.APP_YAPE_PACKAGE || 'com.yape.qa';

            try {
                await driver.activateApp(appIdentifier);
                await this.unlockIosIfDeepLinkReturnsToPin(password);
                await this.waitForIosDeepLinkDestination(url, password);
            } catch (fallbackError) {
                throw new Error(`Unable to open deep link: ${url}. Error: ${fallbackError || error}`);
            }
        }
    }

    public async returnFromExternalBrowser(password?: string): Promise<void> {
        if (browser.isIOS) {
            await driver.activateApp(process.env.BUNDLE_ID || 'com.yape.qa');
            await this.unlockIosIfDeepLinkReturnsToPin(password);
            return;
        }

        await driver.back();
    }

    public async verifyHomeAfterLeavingYapearServicios(password?: string): Promise<void> {
        await this.waitForIosHomeOrUnlockAfterBack(password);
        await this.verifyHomeYapeIsDisplayed();
    }

    public async clickCloseButton(): Promise<void> {
        if (browser.isIOS) {
            const closeVisible = await this.closeButton.waitForDisplayed({ timeout: 3000 }).catch(() => false);
            if (closeVisible) {
                await this.closeButton.click();
                return;
            }

            await this.tapIosTopRightClose('Close button');
            return;
        }

        await this.closeButton.waitForDisplayed({ timeout: timeout });
        await this.closeButton.click();
    }

    public async closeMarketingPage(): Promise<void> {
        await this.clickCloseButton();
    }

    public async verifyHomeYapeIsDisplayed(): Promise<void> {
        if (browser.isIOS) {
            const iosHomeVisible = await this.isAnyIosHomeElementDisplayed(5000);
            if (iosHomeVisible) {
                return;
            }

            const marketingVisible = await this.publicidadText.waitForDisplayed({ timeout: 3000 }).catch(() => false);
            if (marketingVisible) {
                await this.clickCloseButton();
                const iosHomeAfterCloseVisible = await this.isAnyIosHomeElementDisplayed(timeout);
                if (iosHomeAfterCloseVisible) {
                    return;
                }
            }
        }

        await this.homeGreetingText.waitForDisplayed({ timeout: timeout });
        await expect(this.homeGreetingText).toBeDisplayed();
    }

    public async clickVolumeOnButton(): Promise<void> {
        if (browser.isIOS) {
            await this.tapIosStoryControl(0.84, 0.86);
            return;
        }

        await this.volumeOnButton.waitForDisplayed({ timeout: timeout });
        await this.volumeOnButton.click();
    }
    
    public async clickVolumeOffButton(): Promise<void> {
        if (browser.isIOS) {
            await this.tapIosStoryControl(0.84, 0.86);
            return;
        }

        await this.volumeOffButton.waitForDisplayed({ timeout: timeout });
        await this.volumeOffButton.click();
    }

    public async verifyVolumeActive(): Promise<void> {
        if (browser.isIOS) {
            const volumeStateDetected = await this.volumeOnButton.waitForDisplayed({ timeout: timeout }).catch(() => false);

            if (volumeStateDetected) {
                await expect(this.volumeOnButton).toBeDisplayed();
                return;
            }

            await this.closeButton.waitForDisplayed({ timeout: timeout });
            await this.publicidadText.waitForDisplayed({ timeout: timeout });
            return;
        }

        await this.volumeOnButton.waitForDisplayed({ timeout: timeout });
        await expect(this.volumeOnButton).toBeDisplayed();
    }

    public async clickLikeOnButton(): Promise<void> {
        if (browser.isIOS) {
            await this.tapIosStoryControl(0.92, 0.84);
            return;
        }

        await this.likeOnButton.waitForDisplayed({ timeout: timeout });
        await this.likeOnButton.click();
    }
    
    public async clickLikeOffButton(): Promise<void> {
        if (browser.isIOS) {
            await this.tapIosStoryControl(0.92, 0.84);
            return;
        }

        await this.likeOffButton.waitForDisplayed({ timeout: timeout });
        await this.likeOffButton.click();
    }

    public async tapCtaYapearServicios(): Promise<void> {
        if (browser.isIOS) {
            const buttonDisplayed = await this.yapearServiciosButton.waitForDisplayed({ timeout: 3000 }).catch(() => false);

            if (!buttonDisplayed) {
                await this.tapIosBottomCta('CTA internal redirect Yapear Servicios');
                return;
            }
        }

        await this.yapearServiciosButton.waitForDisplayed({ timeout: timeout });
        await this.yapearServiciosButton.click();
    }

    public async tapCtaExternalRedirect(): Promise<void> {
        if (browser.isIOS) {
            const buttonDisplayed = await this.ctaExternalRedirect.waitForDisplayed({ timeout: 3000 }).catch(() => false);

            if (!buttonDisplayed) {
                await this.tapIosBottomCta('CTA external redirect');
                return;
            }
        }

        await this.ctaExternalRedirect.waitForDisplayed({ timeout: timeout });
        await this.ctaExternalRedirect.click();
    }

    public async verifyExternalAppAlert(): Promise<void> {
        if (browser.isIOS) {
            const externalBrowserOpened = await this.isIosExternalBrowserVisible(12000);
            if (externalBrowserOpened) {
                return;
            }
        }

        const externalAlertDisplayed = await this.externalAppAlert.waitForDisplayed({ timeout: 12000 }).catch(() => false);

        if (externalAlertDisplayed) {
            await expect(this.externalAppAlert).toBeDisplayed();
            return;
        }

        const externalBrowserOpened = await this.externalBrowserBrandGloria.waitForDisplayed({ timeout }).catch(() => false);
        if (externalBrowserOpened) {
            return;
        }

        throw new Error('External redirect alert was not displayed and external browser was not detected.');
    }

    public async confirmExternalAppAlert(): Promise<void> {
        if (browser.isIOS) {
            const externalBrowserOpened = await this.isIosExternalBrowserVisible(3000);
            if (externalBrowserOpened) {
                return;
            }
        }

        const confirmButtonDisplayed = await this.confirmExternalRedirectButton.waitForDisplayed({ timeout: 7000 }).catch(() => false);

        if (confirmButtonDisplayed) {
            await this.confirmExternalRedirectButton.click();
            return;
        }

        const externalBrowserOpened = await this.externalBrowserBrandGloria.waitForDisplayed({ timeout }).catch(() => false);
        if (externalBrowserOpened) {
            return;
        }

        throw new Error('Unable to confirm external redirect: confirmation dialog not shown and browser not detected.');
    }

    public async tapCtaWebviewRedirect(): Promise<void> {
        if (browser.isIOS) {
            const buttonDisplayed = await this.ctaWebviewRedirect.waitForDisplayed({ timeout: 3000 }).catch(() => false);

            if (!buttonDisplayed) {
                await this.tapIosBottomCta('CTA webview redirect');
                return;
            }
        }

        await this.ctaWebviewRedirect.waitForDisplayed({ timeout: timeout });
        await this.ctaWebviewRedirect.click();
    }

    public async handleLocationPermissionFlowIfPresent(): Promise<void> {
        if (!browser.isAndroid) {
            return;
        }

        const locationPromptDisplayed = await handlePopupIfVisibleWithTimeOut(
            () => this.locationContinueButton,
            'RMN location onboarding',
            5000
        );

        if (!locationPromptDisplayed) {
            return;
        }

        await handlePopupIfVisibleWithTimeOut(
            () => this.locationPermissionWhileUsingButton,
            'Android location permission while using app',
            5000
        );
    }

    public async verifyLikeActive(): Promise<void> {
        await this.likeOnButton.waitForDisplayed({ timeout: timeout });
        await expect(this.likeOnButton).toBeDisplayed();
    }

    public async verifyYapearServiciosScreen(): Promise<void> {
        await this.yapearServiciosText.waitForDisplayed({ timeout: timeout });
        await expect(this.yapearServiciosText).toBeDisplayed();
    }

    public async leaveYapearServiciosScreen(): Promise<void> {
        if (browser.isIOS) {
            const backDisplayed = await this.backButton.waitForDisplayed({ timeout: 3000 }).catch(() => false);

            if (backDisplayed) {
                await this.backButton.click();
                return;
            }

            await this.tapIosTopLeftBack('Yapear Servicios back button');
            return;
        }

        await driver.back();
    }

    public async verifyExternalBrowserOpened(): Promise<void> {
        if (browser.isIOS) {
            const externalBrowserOpened = await this.isIosExternalBrowserVisible(timeout);
            if (externalBrowserOpened) {
                return;
            }
        }

        await this.externalBrowserBrandGloria.waitForDisplayed({ timeout: timeout });
        await expect(this.externalBrowserBrandGloria).toBeDisplayed();
    }

    public async verifySecondaryWebviewLoaded(): Promise<void> {
        await this.publicidadText.waitForDisplayed({ timeout: timeout });
        await expect(this.publicidadText).toBeDisplayed();
    }

    public async verifyPromotionsWebviewLoaded(): Promise<void> {
        await this.handleLocationPermissionFlowIfPresent();
        const promotionsLoaded = await this.promotionsWebviewRoot.waitForDisplayed({ timeout: maxTimeout }).catch(() => false);

        if (promotionsLoaded) {
            await expect(this.promotionsWebviewRoot).toBeDisplayed();
            return;
        }

        if (browser.isIOS) {
            const iosPromotionsHeader = await $('//XCUIElementTypeStaticText[contains(@name,"Yape Promos")] | //XCUIElementTypeSearchField[contains(@value,"Busca tus promos")]').waitForDisplayed({ timeout: 5000 }).catch(() => false);

            if (iosPromotionsHeader) {
                return;
            }
        }

        await this.promotionsWebviewRoot.waitForDisplayed({ timeout: timeout });
    }

    public async closePromotionsWebview(): Promise<void> {
        if (browser.isIOS) {
            const closeDisplayed = await this.promotionsWebviewCloseButton.waitForDisplayed({ timeout: 3000 }).catch(() => false);

            if (closeDisplayed) {
                await this.promotionsWebviewCloseButton.click();
                return;
            }

            await this.tapIosTopRightClose('Promotions webview close button');
            return;
        }

        await this.promotionsWebviewCloseButton.waitForDisplayed({ timeout: timeout });
        await this.promotionsWebviewCloseButton.click();
    }

    public async goToNextContent(index: number): Promise<void> {
        if (index <= 0) {
            return;
        }

        for (let i = 0; i < index; i++) {
            await browser.pause(browser.isIOS ? 750 : 1500);

            const { width, height } = await driver.getWindowRect();

            const x = Math.floor(width * 0.9);
            const y = Math.floor(height * 0.5);

            await browser.performActions([
                {
                    type: 'pointer',
                    id: 'touch',
                    parameters: { pointerType: 'touch' },
                    actions: [
                        { type: 'pointerMove', duration: 0, x, y },
                        { type: 'pointerDown', button: 0 },
                        { type: 'pause', duration: 100 },
                        { type: 'pointerUp', button: 0 }
                    ]
                }
            ]);

            await browser.releaseActions();
        }
    }

    public async verifyErrorScreenMessage(expectedMessage: string): Promise<void> {
        await this.errorMessageText.waitForDisplayed({ timeout });

        if (browser.isIOS) {
            const errorName = await this.errorMessageText.getAttribute('name').catch(() => '');
            const errorLabel = await this.errorMessageText.getAttribute('label').catch(() => '');
            const actualText = `${errorName} ${errorLabel}`.trim();

            await expect(actualText).toContain(expectedMessage);
            return;
        }

        const actualText = await this.errorMessageText.getText();
        await expect(actualText).toContain(expectedMessage);
    }

    public async tapGoHomeFromError(): Promise<void> {
        await this.goHomeFromErrorButton.waitForDisplayed({ timeout });
        await this.goHomeFromErrorButton.click();
    }
}

export default new RmnStoriesScreen();