import { DataTable, Then } from '@wdio/cucumber-framework';
import addressScreen from '../../../screenobjects/marketplace/address.screen.ts';
import { getTimeoutFromEnv } from 'support/utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();

Then('validar dirección', async (addressData: DataTable) => {
    
    await driver.pause(5000);
    await browser.waitUntil(async () => {
        return (await addressScreen.txtChangeAddress.isDisplayed());
    }, { timeout: timeout, timeoutMsg: 'The address field was never displayed.' });


    const [address, district, stage] = addressData.raw()[0];
    await addressScreen.validateAddress(address, district, stage);
});
