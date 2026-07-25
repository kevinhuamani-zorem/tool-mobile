import { When, Then } from '@wdio/cucumber-framework';
import searchKeywordsScreen from '@screenobjects/nexus/search-keywords.screen.ts';
import { SEARCH_KEYWORDS_CATALOG } from '@utils/constants-search-keywords.ts';

When(/^el usuario busca keywords de las funcionalidades del mundo (.+)$/, async (world: string) => {
    const config = SEARCH_KEYWORDS_CATALOG[world];
    if (!config) {
        throw new Error(`World "${world}" not found in SEARCH_KEYWORDS_CATALOG`);
    }

    const failures: string[] = [];

    for (const functionality of config.functionalities) {
        for (const keyword of functionality.keywords) {
            try {
                await searchKeywordsScreen.typeAndSubmitSearch(keyword);
                if (functionality.hasCategoryLayout) {
                    await searchKeywordsScreen.validateCategoryResultIsDisplayed(functionality.functionalityName);
                } else {
                    await searchKeywordsScreen.validateFunctionalHomeResultIsDisplayed(functionality.functionalityName);
                }
                console.log(`✅ [${functionality.functionalityName}] keyword="${keyword}" → OK`);
            } catch (err) {
                const msg = `❌ [${functionality.functionalityName}] keyword="${keyword}" → ${(err as Error).message}`;
                console.log(msg);
                failures.push(msg);
            }
        }
    }

    if (failures.length > 0) {
        throw new Error(`${failures.length} keyword(s) failed in world "${world}":\n${failures.join('\n')}`);
    }
});

Then(/^se muestran las funcionalidades correspondientes al mundo (.+)$/, async (world: string) => {
    console.log(`All keyword results for world "${world}" were validated successfully`);
});

Then(/^cuando el usuario busca una keyword inexistente del mundo (.+) se muestra el estado sin resultados$/, async (world: string) => {
    const config = SEARCH_KEYWORDS_CATALOG[world];
    if (!config) {
        throw new Error(`World "${world}" not found in SEARCH_KEYWORDS_CATALOG`);
    }

    await searchKeywordsScreen.typeAndSubmitSearch(config.invalidKeyword);
    await searchKeywordsScreen.validateEmptyResultState();
});


