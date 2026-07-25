import { Given } from '@wdio/cucumber-framework';
import homeScreen from '../../../screenobjects/home/marketplace-home.screen.ts';
import { browser } from '@wdio/globals';
import { performScroll } from '../../../support/utils/Utils.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Given(/el usuario selecciona la opcion tienda$/, async () => {
    try {
        await homeScreen.openShortcutTienda();
    } catch (error) {
        console.error('Error opening the "Store" option":', error);
        try {
            await homeScreen.openHomeSeeMore();
            await homeScreen.openShortcutTienda();
        } catch (error) {
            console.error('Error opening the "See More" option: ', error);
            throw new Error('Failed to open the "Store" option after multiple attempts.');
        }
    }
});

Given(/el usuario ingresa a Yape Tienda$/, async () => {
    await homeScreen.openHomeSeeMore();
    try {
        await homeScreen.openShortcutSeeMoreTienda();
    } catch (error) {
        console.error('Option tienda no visible', error);
        await performScroll(500, 1500, 500, 500);
        driver.pause(5000);
        await homeScreen.openShortcutSeeMoreTienda();
    }
});

Given(/selecciona el banner principal$/, async () => {
    await homeScreen.btnCart.waitForDisplayed({ timeout });
    await homeScreen.openPrincipalBanner();

});

Given(/^selecciona la opcion categorias en el home de tienda$/, async () => {
    await homeScreen.menuCategoryIcon.waitForDisplayed({ timeout });
    await homeScreen.selectCategoryIcon();
});

Given(/^selecciona la categoría tecnología y subcategoría celulares$/, async () => {
    await homeScreen.tecCategoryIcon.waitForDisplayed({ timeout });
    await homeScreen.selectTecCategory();
    await homeScreen.selectCelSubcategory();
});

Given(/se verifica que se muestre la lista de productos correctamente$/, async () => {
    await homeScreen.verifyListProducts();
});

Given(/se verifica que se muestre los componentes del detalle del producto de la marca "(.*)"$/, async (brand) => {
    // Verificar que los detalles principales del producto sean visibles
    const isDetailVisible = await homeScreen.verifyPdpDetail(brand) ?? false;
    if (!isDetailVisible) {
        throw new Error(`Los detalles del producto de la marca "${brand}" no son visibles.`);
    }

    // Realizar desplazamiento para verificar componentes adicionales
    const SCROLL_START_X = 500;
    const SCROLL_START_Y = 1500;
    const SCROLL_END_X = 500;
    const SCROLL_END_Y = 500;

    await performScroll(SCROLL_START_X, SCROLL_START_Y, SCROLL_END_X, SCROLL_END_Y);

    // Verificar componentes adicionales después del desplazamiento
    const areAdditionalDetailsVisible = await homeScreen.verifyPdpDetail2() ?? false;
    if (!areAdditionalDetailsVisible) {
        throw new Error(`Los componentes adicionales del detalle del producto de la marca "${brand}" no son visibles.`);
    }
});

Given(/selecciona la opcion ver más$/, async () => {
    await homeScreen.btnCart.waitForDisplayed();

    await browser.waitUntil(
        async () => await homeScreen.btnCart.isDisplayed(),
        {
            timeout: 10000,
            timeoutMsg: 'No se encontro el valor esperado'
        }
    );

    // Esperar hasta que el elemento sea visible desplazándose
    await browser.waitUntil(
        async () => {
            const isDisplayed = await homeScreen.shortcutSeeMore.isDisplayed();
            if (!isDisplayed) {
                await performScroll(500, 1500, 500, 500); // Ajusta los valores para un desplazamiento más fino
            }
            return isDisplayed;
        },
        {
            timeout: 30000, // Incrementa el tiempo máximo de espera para elementos dinámicos
            timeoutMsg: 'The element "shortcutSeeMore" was not found after multiple scrolls'
        }
    );

    // Una vez visible, interactúa con el elemento
    await homeScreen.shortcutSeeMore.waitForDisplayed({ timeout });
    await homeScreen.openSeeMore();

});
