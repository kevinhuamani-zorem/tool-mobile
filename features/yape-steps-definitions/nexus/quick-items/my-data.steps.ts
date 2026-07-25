import { Given } from '@wdio/cucumber-framework';
import menuScreen from '@screenobjects/menu/menu.screen.ts';
import myDataScreen from '@screenobjects/nexus/my-data.screen.ts';
import { scenarioSession } from '@utils/ScenarioSession.ts';
import { formatFullName, getTimeoutFromEnv, maskPhoneAsTripleStar } from '@utils/Utils.ts';

const timeout: number = getTimeoutFromEnv();
const OBFUSCATED_EMAIL_REGEX = /^[a-zA-Z0-9]{2}\*+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

Given(/^el usuario ingresa a la opción "Mis datos"$/, async () => {
    await menuScreen.uiHelper.waitForElementDisplayedAndExpect(
        menuScreen.txtMenuMyData,
        timeout,
        'The text my data was not displayed'
    );
    await menuScreen.openMyData();
});

Given(/^se muestra correctamente la pantalla "Mis datos"$/, async () => {
    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.txtMenuTitle,
        timeout,
        'The text menu title was not displayed'
    );

    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.backButton,
        timeout,
        'The back button was not displayed'
    );
});

Given(/^se muestra el nombre del usuario, número de teléfono y correo electrónico ofuscado$/, async () => {
    const user = scenarioSession.getUser();
    const formattedName = formatFullName(user.name);
    const maskedPhone = maskPhoneAsTripleStar(user.phone_number);

    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.txtDynamicItem(formattedName),
        timeout,
        `The name "${formattedName}" was not displayed`
    );

    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.txtDynamicItem(maskedPhone),
        timeout,
        `The phone "${maskedPhone}" was not displayed`
    );

    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.txtEmail,
        timeout,
        'The email was not displayed'
    );

    const displayedEmail = await myDataScreen.getDisplayedEmail();

    const normalizedUserEmail = user.email.trim().toLowerCase();
    const [localPart, domain] = normalizedUserEmail.split('@');
    const normalizedDisplayedEmail = displayedEmail.trim().toLowerCase();

    expect(normalizedDisplayedEmail).toMatch(OBFUSCATED_EMAIL_REGEX);
    expect(normalizedDisplayedEmail.startsWith(localPart.slice(0, 2))).toBe(true);
    expect(normalizedDisplayedEmail.endsWith(`@${domain}`)).toBe(true);
});

Given(/^el usuario presiona el botón "ojito" y el correo electrónico del usuario se muestra sin ofuscar$/, async () => {
    const user = scenarioSession.getUser();
    const expectedEmail = user.email.trim().toLowerCase();

    await myDataScreen.clickEyeButton();

    await myDataScreen.uiHelper.waitForElementDisplayedAndExpect(
        myDataScreen.txtEmail,
        timeout,
        'The email was not displayed'
    );

    await browser.waitUntil(
        async () => {
            const displayedEmail = await myDataScreen.getDisplayedEmail();
            return displayedEmail.trim().toLowerCase() === expectedEmail;
        },
        {
            timeout,
            timeoutMsg: `The email "${user.email}" was not displayed without obfuscation`
        }
    );
});