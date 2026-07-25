// features/support/global.ts
import { Assertions } from './assertions.ts';
import redis, { setOtpAttempts } from './redis.helper.js';
import { BeforeAll, AfterAll } from '@wdio/cucumber-framework';
import { Constants } from './constants.ts';

declare global {
    var Assertions: any;
}

global.Assertions = Assertions;

const OTP_MAP_KEY = Constants.ATTEMPTS_OTP_MAP_KEY;

BeforeAll(async () => {
    let client;
    try {
        client = await redis.openConnectionRedis();
        await client.connect();
        const currentValue = await client.get(OTP_MAP_KEY);
        console.log(`[Redis] Original value in Redis before modification: ${currentValue}`);
        await setOtpAttempts(1000, client, OTP_MAP_KEY);
        const checkValue = await client.get(OTP_MAP_KEY);
        console.log(`[Redis] Current value in Redis after modification: ${checkValue}`);
    } catch (err) {
        console.error('[Redis] Error creating or modifying the OTP max attempts map:', err);
    } finally {
        if (client) await client.disconnect();
    }
});

// Restaura o crea el valor a 10 intentos al finalizar los tests
AfterAll(async () => {
    let client;
    try {
        client = await redis.openConnectionRedis();
        await client.connect();
        await setOtpAttempts(10, client, OTP_MAP_KEY);
    } catch (err) {
        console.error('[Redis] Error restoring the OTP max attempts map:', err);
    } finally {
        if (client) await client.disconnect();
    }
});
