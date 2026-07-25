import { Given, When, Then } from '@wdio/cucumber-framework';
import openBankAccount from '../../../screenobjects/tipo-de-cambio/open-bank-account.screen.ts';

Given(/^selecciona crear cuenta dólares desde el home de tipo de cambio$/, async () => {
    await openBankAccount.continueChangeDollars();
    await openBankAccount.createDollarAccount();
});

When(/^completa la información solicitada$/, async (dataTable) =>{
    const [occupation, employmentStatusOption, workplace, region, province] = dataTable.raw().map(row => row[0]);

    await openBankAccount.openDollarAccount();
    await openBankAccount.iDontHave();
    await openBankAccount.fillOccupation(occupation);
    await openBankAccount.clickEmploymentStatus();
    await openBankAccount.clickEmploymentStatusOption(employmentStatusOption);
    await openBankAccount.fillWorkplace(workplace);
    if (driver.isIOS){
        await openBankAccount.tapDismissArea(184, 513);
        await openBankAccount.continueWorkingPlace();
    } else {
        await openBankAccount.continue();
    }
    await openBankAccount.clickRegionSelect();
    await openBankAccount.clickRegionOption(region);
    await openBankAccount.clickProvinceSelect();
    await openBankAccount.clickProvinceOption(province);
    await openBankAccount.clickCheckboxes();
    if (driver.isIOS){
        await openBankAccount.continueRegion();
    } else {
        await openBankAccount.continue();
    }
});

Then(/^se confirma la creación de la cuenta dólar$/, async () => {
    if (driver.isIOS){
        await openBankAccount.registerDollarAccountOtp();
    } else {
        await openBankAccount.openDollarAccount();
    }

    await openBankAccount.showDollarAccountCreated();
});
