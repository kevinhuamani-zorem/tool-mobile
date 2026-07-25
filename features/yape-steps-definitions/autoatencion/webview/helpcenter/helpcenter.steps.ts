import { Given, When, Then } from '@wdio/cucumber-framework';
import helpcenterScreen from '../../../../../screenobjects/autoatencion/webview/helpcenter/helpcenter.screen.ts';

let helpCenterScreenTitle: string;
let categoryAndFaqScreenTitle: string;
let subcategoryScreenTitle: string;
let searchDescription: string;
let searchText: string;

Given(/^accede al "(.*)" y presiona la opción "(.*)"$/, async (helpcenterName: string, text: string) => {
    helpCenterScreenTitle = helpcenterName;
    categoryAndFaqScreenTitle = helpcenterName.split('-')[0].trim();
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    await helpcenterScreen.scrollUntilTextVisible(text)
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    await helpcenterScreen.clickText(text);
});

Given(/^accede al "(.*)" y presiona en "(.*)"$/, async (helpcenterName: string, text: string) => {
    helpCenterScreenTitle = helpcenterName;
    categoryAndFaqScreenTitle = helpcenterName.split('-')[0].trim();
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    await helpcenterScreen.scrollUntilButtonVisible(text)
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    await helpcenterScreen.clickButton(text);
});

Given(/^accede al "(.*)" y busca la opción "(.*)"$/, async (helpcenterName: string, content: string) => {
    helpCenterScreenTitle = helpcenterName;
    categoryAndFaqScreenTitle = helpcenterName.split('-')[0].trim();
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    await helpcenterScreen.scrollUntilTextVisible(content)
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
});

Given(/^presiona la categoría "(.*)" y busca la subcategoría "(.*)"$/, async (category: string, subcategory: string) => {
    subcategoryScreenTitle = category;
    await helpcenterScreen.scrollUntilTextVisible(subcategoryScreenTitle)
    await helpcenterScreen.verifyVisibleText(categoryAndFaqScreenTitle);
    await helpcenterScreen.clickText(subcategoryScreenTitle);
    await helpcenterScreen.scrollUntilTextVisible(subcategory)
    await helpcenterScreen.verifyVisibleText(subcategoryScreenTitle);
});

Given(/^visualiza la descripción "(.*)"$/, async (description: string) => {
    await helpcenterScreen.verifyVisibleText(description);
});

When(/^presiona la pregunta frecuente "(.*)"$/, async (faq: string) => {
    await helpcenterScreen.scrollUntilTextVisible(faq)
    await helpcenterScreen.clickText(faq);
});

When(/^visualiza la pregunta frecuente "(.*)"$/, async (faq: string) => {
    await helpcenterScreen.verifyVisibleText(faq);
});

When(/^presiona el contenido de la PF "(.*)"$/, async (text: string) => {
    await helpcenterScreen.scrollUntilButtonVisible(text)
    await helpcenterScreen.verifyVisibleText(categoryAndFaqScreenTitle);
    await helpcenterScreen.clickButton(text);
});

When(/^ingresa su consulta "(.*)" en el buscador$/, async (text: string) => {
    searchText = text;
    await helpcenterScreen.addSearchText(searchText);
});

When(/^revisa el resultado "(.*)"$/, async (description: string) => {
    searchDescription = description;
    await helpcenterScreen.verifyVisibleText(searchDescription);
    await helpcenterScreen.clickText(searchDescription);
});

When(/^presiona el resultado "(.*)"$/, async (searchResult: string) => {
    await helpcenterScreen.scrollUntilSearchResultVisible(searchResult)
    await helpcenterScreen.verifyVisibleText(searchDescription);
    await helpcenterScreen.clickSearchResult(searchResult);
});

When(/^visualiza el mensaje '(.*)' '(.*)'$/, async (part1: string, part2: string) => {
    await helpcenterScreen.verifyVisibleSearchResultIcon(part1, part2);
});

When(/^presiona el ícono del buscador$/, async () => {
    await helpcenterScreen.clickHelpCenterSearchIcon(helpCenterScreenTitle);
});

Then(/^presiona "Ir hacia atrás" de (\d+) PF, subcategoría, categoría y Centro de Ayuda$/, async (faqNumber: number) => {
    for (let i = 1; i <= faqNumber; i++) { 
        await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    }
    await helpcenterScreen.clickHelpCenterBackArrow(subcategoryScreenTitle);
    await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    await helpcenterScreen.clickHelpCenterCloseArrow(helpCenterScreenTitle);
});

Then(/^presiona "Ir hacia atrás" de (\d+) PF y del Centro de Ayuda$/, async (faqNumber: number) => {
    for (let i = 1; i <= faqNumber; i++) { 
        await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    } 
    await helpcenterScreen.clickHelpCenterCloseArrow(helpCenterScreenTitle);
});

Then(/^presiona "Ir hacia atrás" de (\d+) PF, del buscador y el Centro de Ayuda$/, async (faqNumber: number) => {
    for (let i = 1; i <= faqNumber; i++) { 
        await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    }
    await helpcenterScreen.clickSearchBackArrow();
    await helpcenterScreen.clickHelpCenterCloseArrow(helpCenterScreenTitle);    
});

Then(/^presiona "Ir hacia atrás" de (\d+) PF y del buscador$/, async (faqNumber: number) => {
    for (let i = 1; i <= faqNumber; i++) { 
        await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    }
    await helpcenterScreen.clickSearchBackArrow();
    await helpcenterScreen.verifyVisibleText(helpCenterScreenTitle);
    
});

Then(/^presiona "Ir hacia atrás" de (\d+) PF y regresa al buscador$/, async (faqNumber: number) => {
    for (let i = 1; i <= faqNumber; i++) { 
        await helpcenterScreen.clickHelpCenterBackArrow(categoryAndFaqScreenTitle);
    } 
    await helpcenterScreen.verifyVisibleInputSearchWithText(searchText);

});

Then(/^presiona la X del buscador$/, async () => {
    await helpcenterScreen.clickSearchClearIcon();
});

Then(/^visualiza el buscador con "(.*)"$/, async (description: string) => {
    await helpcenterScreen.verifyVisibleInputSearchWithText("");
    await helpcenterScreen.verifyNotVisibleSearchClearIcon();
    await helpcenterScreen.verifyVisibleText(description);
});

Then(/^no debe visualizar en el resultado "(.*)" porque la PF "(.*)"$/, async (text: string, _reason: string) => {
    await helpcenterScreen.verifyNotVisibleSearchResult(text)
});