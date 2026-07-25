import { When, Then } from '@wdio/cucumber-framework';
import searchKeywordsScreen from '@screenobjects/nexus/search-keywords.screen.ts';
import { SEARCH_STORE_CATEGORIES_CATALOG } from '@utils/constants-search-store-categories.ts';

When(/^el usuario busca keywords de las categorías de tienda de la macro categoría (.+)$/, async (macroCategory: string) => {
    const config = SEARCH_STORE_CATEGORIES_CATALOG[macroCategory];
    if (!config) {
        throw new Error(`Macro category "${macroCategory}" not found in SEARCH_STORE_CATEGORIES_CATALOG`);
    }

    const failures: string[] = [];

    for (const category of config.categories) {
        for (const keyword of category.keywords) {
            try {
                await searchKeywordsScreen.typeAndSubmitSearch(keyword);
                await searchKeywordsScreen.validateCategoryResultIsDisplayed(category.categoryName);
                console.log(`✅ [${category.categoryName}] keyword="${keyword}" → OK`);
            } catch (err) {
                const msg = `❌ [${category.categoryName}] keyword="${keyword}" → ${(err as Error).message}`;
                console.log(msg);
                failures.push(msg);
            }
        }
    }

    if (failures.length > 0) {
        throw new Error(`${failures.length} keyword(s) failed in macro category "${macroCategory}":\n${failures.join('\n')}`);
    }
});

Then(/^se muestran las categorías correspondientes a la macro categoría (.+)$/, async (macroCategory: string) => {
    console.log(`All store category keyword results for macro category "${macroCategory}" were validated successfully`);
});

Then(/^cuando el usuario busca una keyword inexistente de la macro categoría (.+) se muestra el estado sin resultados$/, async (macroCategory: string) => {
    const config = SEARCH_STORE_CATEGORIES_CATALOG[macroCategory];
    if (!config) {
        throw new Error(`Macro category "${macroCategory}" not found in SEARCH_STORE_CATEGORIES_CATALOG`);
    }

    await searchKeywordsScreen.typeAndSubmitSearch(config.invalidKeyword);
    await searchKeywordsScreen.validateEmptyResultState();
});
