
import { $ } from '@wdio/globals';
import BaseScreen from '../commons/base.screen.ts';

import { getTimeoutFromEnv } from 'support/utils/Utils.ts';
import apiClientNexus from 'support/utils/apiClientNexus.ts';
import homeScreen from 'screenobjects/home/home.screen.ts';

class ViewMore extends BaseScreen {
    private timeout: number = getTimeoutFromEnv();
    // Normalize the text the same way as in your original step (translate)
    private normalize(text?: string): string {
        return (text ?? '').replace(/\s+/g, ' ').trim();
    }

    /**
     * "the modal is displayed with the list of worlds and functionalities for the user according to their profile"
     */

    public async verifyWorldsAndFeaturesModal(): Promise<void> {
        const listWorlds = await apiClientNexus.getMenuItemsFromHomeByType('listWorlds');

        let worldsSeen = 0;
        let didHorizontalScroll = false;

        for (const world of listWorlds) {
            const worldLabel = this.normalize(world?.defaultLabel);
            const item = homeScreen.txtDynamicItem(worldLabel);

            await item.waitForDisplayed({ timeout: this.timeout });
            await expect(item).toBeDisplayed();
            await item.click(); 

            for (const subWorld of world.items) {
                const label = this.normalize(subWorld?.defaultLabel);
                const subWorldItem = homeScreen.txtDynamicItem(label);

                await subWorldItem.waitForDisplayed({ timeout: this.timeout });
                await expect(subWorldItem).toBeDisplayed();
            }

            worldsSeen++;
            if (driver.isAndroid && !didHorizontalScroll && worldsSeen === 3) {
                await $(
                    'android=new UiScrollable(new UiSelector().scrollable(true)).setAsHorizontalList().scrollForward()'
                );
                didHorizontalScroll = true;
            }
        }
    }

}

export default new ViewMore();
