import paymentModalitiesScreen from "@screenobjects/bill-payment/payment-modalities.screen.ts";
import paymentWinstateScreen from "@screenobjects/bill-payment/payment-winstate.screen.ts";
import { ConstantsPagoDeServicio } from "@utils/constants-pago-de-servicio.ts";
import redis from "@utils/redis.helper.ts";
import { After, Given, Then, When } from "@wdio/cucumber-framework";

let originalSettingsValue: string | null = null;
let originalCompaniesValue: string | null = null;
let originalCompaniesValueOffHour: string | null = null;
let offHourCompanyName: string | null = null;

// Helper: Redis values are double-stringified (JSON string wrapped in quotes with escaped inner quotes)
// Parse: JSON.parse once to unwrap outer quotes, then JSON.parse again to get the actual object
// Stringify: JSON.stringify to get the inner JSON, then JSON.stringify again to wrap in outer quotes
function parseRedisValue<T>(raw: string): T {
    let val: unknown = raw;
    if (typeof val === "string" && val.startsWith('"')) {
        val = JSON.parse(val);
    }
    return JSON.parse(val as string) as T;
}

function stringifyRedisValue(obj: unknown): string {
    return JSON.stringify(JSON.stringify(obj));
}

Given(/^se apaga el modulo de pago de servicios en Redis$/, async () => {
    const client = await redis.openConnectionRedisBillPayment();
    await client.connect();

    originalSettingsValue = await client.get(
        ConstantsPagoDeServicio.BILL_PAYMENT_SETTINGS_KEY,
    );
    console.log(
        `[Redis] Original idBillPayment:settings: ${originalSettingsValue}`,
    );

    if (originalSettingsValue) {
        const settings = parseRedisValue<{ enabled: boolean }>(
            originalSettingsValue,
        );
        settings.enabled = false;
        const disabledValue = stringifyRedisValue(settings);
        await client.set(
            ConstantsPagoDeServicio.BILL_PAYMENT_SETTINGS_KEY,
            disabledValue,
        );
        console.log(`[Redis] Module disabled: ${disabledValue}`);
    }

    await client.disconnect();
});

Given(/^se desactiva la empresa "(.*)" en Redis$/, async (company: string) => {
    const client = await redis.openConnectionRedisBillPayment();
    await client.connect();

    originalCompaniesValue = await client.get(
        ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
    );
    console.log(
        `[Redis] Read idBillPayment:companies:all (${originalCompaniesValue?.length ?? 0} chars)`,
    );

    if (originalCompaniesValue) {
        const companies = parseRedisValue<any[]>(originalCompaniesValue);
        const target = companies.find(
            (c: { searchName?: string; name?: string }) =>
                c.searchName?.toLowerCase() === company.toLowerCase() ||
                c.name?.toLowerCase() === company.toLowerCase(),
        );

        if (target) {
            console.log(
                `[Redis] Found company: ${target.name} (${target.id}), enabled: ${target.configuration?.enabled}`,
            );
            target.configuration = target.configuration || {};
            target.configuration.enabled = false;
            await client.set(
                ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
                stringifyRedisValue(companies),
            );
            console.log(`[Redis] Company "${target.name}" disabled`);
        } else {
            throw new Error(`[Redis] Company "${company}" not found in idBillPayment:companies:all. Verify the company name in the test data.`);
        }
    }

    await client.disconnect();
});

Given(
    /^se configura fuera de horario para una empresa con offHour en Redis$/,
    async () => {
        const client = await redis.openConnectionRedisBillPayment();
        await client.connect();

        originalCompaniesValueOffHour = await client.get(
            ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
        );
        console.log(
            `[Redis] Read companies:all for offHour (${originalCompaniesValueOffHour?.length ?? 0} chars)`,
        );

        if (originalCompaniesValueOffHour) {
            const companies = parseRedisValue<any[]>(
                originalCompaniesValueOffHour,
            );
            const target = companies.find(
                (c: {
                    configuration?: { offHour?: string; enabled?: boolean };
                    retired?: boolean;
                }) =>
                    c.configuration?.offHour &&
                    c.configuration?.enabled !== false,
            );

            if (target) {
                offHourCompanyName = target.searchName || target.name;

                const now = new Date();
                const hourBefore = `${String((now.getHours() - 1 + 24) % 24).padStart(2, "0")}:00:00`;
                const hourAfter = `${String((now.getHours() + 1) % 24).padStart(2, "0")}:00:00`;
                const offHourRange = `${hourBefore} - ${hourAfter}`;

                console.log(
                    `[Redis] Auto-selected company: "${target.name}" (searchName: "${target.searchName}"), original offHour: ${target.configuration.offHour}`,
                );
                target.configuration.offHour = offHourRange;
                await client.set(
                    ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
                    stringifyRedisValue(companies),
                );
                console.log(
                    `[Redis] Company "${target.name}" offHour set to: ${offHourRange}`,
                );
            } else {
                throw new Error(`[Redis] No company with offHour configuration found in idBillPayment:companies:all. Verify that at least one company has offHour set.`);
            }
        }

        await client.disconnect();
    },
);

When(/^busca la empresa configurada fuera de horario$/, async () => {
    if (!offHourCompanyName)
        throw new Error("No off-hour company was configured in the Given step");
    await paymentModalitiesScreen.searchCompany(offHourCompanyName);
});

Then(
    /^se visualiza la pantalla de mantenimiento con mensaje "(.*)"$/,
    async (message: string) => {
        paymentWinstateScreen.verifyErrorModalMessage(message);
    },
);

Then(/^se visualiza el submensaje "(.*)"$/, async (message: string) => {
    paymentWinstateScreen.verifyErrorModalMessageAndroid(message);
});

Then(/^se visualiza el mensaje "(.*)"$/, async (message: string) => {
    await paymentWinstateScreen.verifyErrorModalMessage(message);
});

Then(/^se visualiza el boton "(.*)"$/, async (buttonText: string) => {
    await paymentWinstateScreen.verifyButtonDisplayed(buttonText);
});

After({ tags: "@TC-5728" }, async () => {
    const client = await redis.openConnectionRedisBillPayment();
    await client.connect();

    try {
        if (originalSettingsValue) {
            await client.set(
                ConstantsPagoDeServicio.BILL_PAYMENT_SETTINGS_KEY,
                originalSettingsValue,
            );
            console.log(`[Redis] Module restored: ${originalSettingsValue}`);
        } else {
            const enabledValue =
                '{"name":"general","enabled":true,"retired":false,"durationRange":5,"attemptsRange":88,"codesInvalid":"XR0030|TL9999"}';
            await client.set(
                ConstantsPagoDeServicio.BILL_PAYMENT_SETTINGS_KEY,
                enabledValue,
            );
            console.log(
                `[Redis] Module restored with default: ${enabledValue}`,
            );
        }
    } finally {
        await client.disconnect();
        originalSettingsValue = null;
    }
});

After({ tags: "@TC-5730" }, async () => {
    const client = await redis.openConnectionRedisBillPayment();
    await client.connect();

    try {
        if (originalCompaniesValue) {
            await client.set(
                ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
                originalCompaniesValue,
            );
            console.log(
                `[Redis] Companies restored (${originalCompaniesValue.length} chars)`,
            );
        }
    } finally {
        await client.disconnect();
        originalCompaniesValue = null;
    }
});

After({ tags: "@TC-5729" }, async () => {
    const client = await redis.openConnectionRedisBillPayment();
    await client.connect();

    try {
        if (originalCompaniesValueOffHour) {
            await client.set(
                ConstantsPagoDeServicio.BILL_PAYMENT_COMPANIES_KEY,
                originalCompaniesValueOffHour,
            );
            console.log(
                `[Redis] Companies offHour restored (${originalCompaniesValueOffHour.length} chars)`,
            );
        }
    } finally {
        await client.disconnect();
        originalCompaniesValueOffHour = null;
        offHourCompanyName = null;
    }
});