import { When, Then } from '@wdio/cucumber-framework';
import searchKeywordsScreen from '@screenobjects/nexus/search-keywords.screen.ts';
import { DERIVATION_KEYWORDS_CATALOG } from '@utils/constants-derivation-keywords.ts';

When(/^el usuario busca el keyword de una funcionalidad (.*) del mundo (.*) para realizar la derivación$/,
    async (functionalityName: string, world: string) => {
        await searchKeywordsScreen.validateSearchScreenIsReady();
        const config = DERIVATION_KEYWORDS_CATALOG[world];
        if (!config) {
            throw new Error(`World "${world}" not found in DERIVATION_KEYWORDS_CATALOG`);
        }
        const functionality = config.functionalities.find(
            f => f.functionalityName === functionalityName
        );
        if (!functionality) {
            throw new Error(`Functionality "${functionalityName}" not found in world "${world}"`);
        }
        const failures: string[] = [];
        console.log(`Validating functionality "${functionality.functionalityName}" with keywords: ${functionality.keywords.join(', ')}`);

        for (const keyword of functionality.keywords) {
            try {
                await searchKeywordsScreen.typeAndSubmitSearchWithRetry(keyword, functionality.functionalityName);
                await searchKeywordsScreen.gotoHomePageFunctionality(functionality.functionalityName);
                await searchKeywordsScreen.validateNameScreenView(functionality.screen, functionality.functionalityName);
                console.log(`[${functionality.functionalityName}] keyword="${keyword}" → OK`);
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                const msg = `[${functionality.functionalityName}] keyword="${keyword}" → ${errorMsg}`;
                console.log(msg);
                failures.push(msg);
            } finally {
                try {
                    await searchKeywordsScreen.goBack();
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    console.error(`CRITICAL: Cannot return to search after "${keyword}" error: ${errorMsg}`);
                    failures.push(`NAVIGATION_ERROR: goBack() failed after "${keyword}" error: ${errorMsg}`);
                    break;
                }
            }
        }
        if (failures.length > 0) {
            throw new Error(`${failures.length} keyword(s) failed in world "${world}":\n${failures.join('\n')}`);
        }
    });

Then(/^se muestra la pantalla de inicio de la funcionalidad correspondiente al keyword buscado del mundo (.*)$/, async (world: string) => {
    const config = DERIVATION_KEYWORDS_CATALOG[world];
    if (!config) {
        throw new Error(`World "${world}" not found in DERIVATION_KEYWORDS_CATALOG for final validation`);
    }
    await searchKeywordsScreen.validateSearchScreenIsReady();
    console.log(`All keyword results for world "${world}" were validated successfully and search screen is ready`);
});




