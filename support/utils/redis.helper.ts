import { createClient } from 'redis';
import { setTimeout } from 'timers/promises';
import path from 'node:path';
import { Constants } from '../../support/utils/constants.ts';

/**
* main page object containing all methods, selectors and functionality
* that is shared across all page objects
*/

class RedisHelper {
    private async loadEnvConfig(env: string) {
        const dotenvFlow = await import('dotenv-flow');
        return dotenvFlow.config({
            path: path.join(process.cwd(), 'config', 'envs'),
            node_env: env,
            default_node_env: env,
        });
    }

    private async getRedisConfig(env: string) {
        const envConfig = await this.loadEnvConfig(env);
        const envVars = envConfig.parsed ?? {};
        const envSuffix = env.toUpperCase();

        const host =
            envVars[`REDIS_HOST_${envSuffix}`] ||
            envVars.REDIS_HOST ||
            process.env[`REDIS_HOST_${envSuffix}`] ||
            process.env.REDIS_HOST ||
            '';

        const password =
            envVars[`REDIS_PASSWORD_${envSuffix}`] ||
            envVars.REDIS_PASSWORD ||
            process.env[`REDIS_PASSWORD_${envSuffix}`] ||
            process.env.REDIS_PASSWORD ||
            '';

        const username =
            envVars[`REDIS_USERNAME_${envSuffix}`] ||
            envVars.REDIS_USERNAME ||
            process.env[`REDIS_USERNAME_${envSuffix}`] ||
            process.env.REDIS_USERNAME ||
            undefined;

        return { host, password, username };
    }

    /**
    * Opens a sub page of the page
    * @param path path of the sub page (e.g. /path/to/page.html)
    */

    public async openConnectionRedis() {
        const env = process.env.NODE_ENV || 'qa'; // Por defecto, 'qa'
        const redisConfig = await this.getRedisConfig(env);

        if (!redisConfig.password || !redisConfig.host) {
            throw new Error(`Redis configuration is missing for environment: ${env}. Please check REDIS_HOST_${env.toUpperCase()} / REDIS_PASSWORD_${env.toUpperCase()} or their generic equivalents.`);
        }

        const client = createClient({
            username: redisConfig.username,
            password: redisConfig.password,
            socket: {
                host: redisConfig.host,
                port: 6380,
                tls: true,
                reconnectStrategy: false,
            }
        });
        return client;
    }

    public async openConnectionRedisBillPayment() {
        const env = process.env.NODE_ENV || 'qa';
        let hostLocal = '';
        let passwordLocal = '';
        let usernameLocal = '';

        if (env === 'qa') {
            hostLocal =
                process.env.REDIS_HOST_BILL_PAYMENT_QA ||
                process.env.REDIS_HOST_BILL_PAYMENT ||
                '';
            passwordLocal =
                process.env.REDIS_PASSWORD_BILL_PAYMENT_QA ||
                process.env.REDIS_PASSWORD_BILL_PAYMENT ||
                '';
            if (!hostLocal || !passwordLocal) {
                const envConfig = await this.loadEnvConfig(env);
                if (envConfig.parsed) {
                    hostLocal =
                        hostLocal ||
                        envConfig.parsed.REDIS_HOST_BILL_PAYMENT_QA ||
                        envConfig.parsed.REDIS_HOST_BILL_PAYMENT ||
                        '';
                    passwordLocal =
                        passwordLocal ||
                        envConfig.parsed.REDIS_PASSWORD_BILL_PAYMENT_QA ||
                        envConfig.parsed.REDIS_PASSWORD_BILL_PAYMENT ||
                        '';
                    usernameLocal =
                        usernameLocal ||
                        envConfig.parsed.REDIS_USERNAME_BILL_PAYMENT_QA ||
                        envConfig.parsed.REDIS_USERNAME_BILL_PAYMENT ||
                        '';
                }
            }
        } else if (env === 'stg') {
            hostLocal =
                process.env.REDIS_HOST_BILL_PAYMENT_STG ||
                process.env.REDIS_HOST_BILL_PAYMENT ||
                '';
            passwordLocal =
                process.env.REDIS_PASSWORD_BILL_PAYMENT_STG ||
                process.env.REDIS_PASSWORD_BILL_PAYMENT ||
                '';
            if (!hostLocal || !passwordLocal) {
                const envConfig = await this.loadEnvConfig(env);
                if (envConfig.parsed) {
                    hostLocal =
                        hostLocal ||
                        envConfig.parsed.REDIS_HOST_BILL_PAYMENT_STG ||
                        envConfig.parsed.REDIS_HOST_BILL_PAYMENT ||
                        '';
                    passwordLocal =
                        passwordLocal ||
                        envConfig.parsed.REDIS_PASSWORD_BILL_PAYMENT_STG ||
                        envConfig.parsed.REDIS_PASSWORD_BILL_PAYMENT ||
                        '';
                    usernameLocal =
                        usernameLocal ||
                        envConfig.parsed.REDIS_USERNAME_BILL_PAYMENT_STG ||
                        envConfig.parsed.REDIS_USERNAME_BILL_PAYMENT ||
                        '';
                }
            }
        } else {
            hostLocal = process.env.REDIS_HOST_BILL_PAYMENT || '';
            passwordLocal = process.env.REDIS_PASSWORD_BILL_PAYMENT || '';
            usernameLocal = process.env.REDIS_USERNAME_BILL_PAYMENT || '';
        }

        usernameLocal =
            usernameLocal ||
            process.env[`REDIS_USERNAME_BILL_PAYMENT_${env.toUpperCase()}`] ||
            process.env.REDIS_USERNAME_BILL_PAYMENT ||
            '';

        if (!passwordLocal || !hostLocal) {
            throw new Error(
                `Redis Bill Payment configuration is missing for environment: ${env}. Check REDIS_HOST_BILL_PAYMENT_${env.toUpperCase()} and REDIS_PASSWORD_BILL_PAYMENT_${env.toUpperCase()} env vars.`,
            );
        }

        const client = createClient({
            username: usernameLocal || undefined,
            password: passwordLocal,
            socket: {
                host: hostLocal,
                port: 6380,
                tls: true,
                reconnectStrategy: false,
            },
        });
        return client;
    }

    public async readDataRedis(clave: string, valueSearch: string, cont: number): Promise<string> {
        // Utilizar la variable de entorno para el entorno de Redis
        const env = process.env.NODE_ENV || 'qa'; // Obtén el entorno actual, por defecto 'qa'
        const client = await this.openConnectionRedis();
        const arrayContenido: string[] = [];
        let otp = '';
        client.on('error', (err) => console.log('Redis Client Error', err));
        await client.connect();
        //Obtiene los datos de la base de datos Redis a partir de la clave: con el comodin *
        const key_mapname = clave + Constants.TWO_POINT + Constants.ASTERISK;
        const listYapeappotp = await client.keys(key_mapname);

        if (listYapeappotp) {
            console.log(listYapeappotp);
            for (let i = 0; i < listYapeappotp.length; i++) {
                const clave = listYapeappotp[i];
                console.log(clave);
                console.log(await client.get(clave));
                const valor = await client.get(clave);
                console.log(valor);
                if (valor !== null) {
                    arrayContenido.push(valor);
                }
                // arrayContenido.push(await client.get(clave));

            }
            console.log(arrayContenido);
            otp = await this.getValueForKey(arrayContenido, valueSearch);
            console.log('otp es: ' + otp);
            if (otp === '' && cont < 5) {
                await setTimeout(3000);
                cont++;
                await this.readDataRedis(clave, valueSearch, cont);

            }
        } else {
            console.log('the key does not exist: ' + valueSearch);
            if (otp === '' && cont < 5) {
                await setTimeout(3000);
                cont++;
                await this.readDataRedis(clave, valueSearch, cont);

            }
        }

        return otp;

    }

    public async readBillPaymentOtpById(
        valueSearch: string,
        maxRetries: number = 5,
        retryDelayMs: number = 3000,
    ): Promise<string> {
        const client = await this.openConnectionRedisBillPayment();
        const keyMapName = `${Constants.REDIS_OTP_BILL_PAYMENT_MAPNAME}${Constants.TWO_POINT}${Constants.ASTERISK}`;

        client.on('error', (err) => console.log('Redis Client Error', err));
        await client.connect();

        try {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const listYapeappotp = await client.keys(keyMapName);
                const values: string[] = [];

                for (const key of listYapeappotp) {
                    const value = await client.get(key);
                    if (value !== null) {
                        values.push(value);
                    }
                }

                const otp = await this.getValueForKey(values, valueSearch);
                if (otp) {
                    return otp;
                }

                if (attempt < maxRetries) {
                    await setTimeout(retryDelayMs);
                }
            }

            return '';
        } finally {
            await client.disconnect();
        }
    }

    public async readLatestBillPaymentOtp(
        maxRetries: number = 5,
        retryDelayMs: number = 3000,
    ): Promise<string> {
        const client = await this.openConnectionRedisBillPayment();
        const keyMapName = `${Constants.REDIS_OTP_BILL_PAYMENT_MAPNAME}${Constants.TWO_POINT}${Constants.ASTERISK}`;

        client.on('error', (err) => console.log('Redis Client Error', err));
        await client.connect();

        try {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const listYapeappotp = await client.keys(keyMapName);
                const values: string[] = [];

                console.log(
                    `[Redis][BillPayment][OTP] Attempt ${attempt}/${maxRetries}. Keys found: ${listYapeappotp.length}`,
                );

                for (const key of listYapeappotp) {
                    const value = await client.get(key);
                    if (value !== null) {
                        values.push(value);
                    }
                }

                const otp = await this.getMostRecentOtp(values);
                if (otp) {
                    console.log(
                        `[Redis][BillPayment][OTP] Most recent OTP resolved on attempt ${attempt}.`,
                    );
                    await this.cleanBillPaymentOtp();
                    return otp;
                }

                if (attempt < maxRetries) {
                    await setTimeout(retryDelayMs);
                }
            }

            return '';
        } finally {
            await client.disconnect();
        }
    }

    public async cleanBillPaymentOtp(): Promise<void> {
        const client = await this.openConnectionRedisBillPayment();
        const keyMapName = `${Constants.REDIS_OTP_BILL_PAYMENT_MAPNAME}${Constants.TWO_POINT}${Constants.ASTERISK}`;

        client.on('error', (err) => console.log('Redis Client Error', err));
        await client.connect();

        try {
            const listYapeappotp = await client.keys(keyMapName);
            console.log(
                `[Redis][BillPayment][OTP] Cleaning ${listYapeappotp.length} keys from ${Constants.REDIS_OTP_BILL_PAYMENT_MAPNAME}...`,
            );

            for (const key of listYapeappotp) {
                await client.del(key);
            }

            console.log(
                `[Redis][BillPayment][OTP] Cleanup completed. All ${listYapeappotp.length} keys deleted.`,
            );
        } finally {
            await client.disconnect();
        }
    }

    public async getMostRecentOtp(data: string[]): Promise<string> {
        interface OtpObject {
            otp: string;
            startTime: number;
            expired?: boolean;
        }

        const parsedData: OtpObject[] = data
            .map((item) => {
                try {
                    const parsedOnce: unknown = JSON.parse(item);
                    const normalized =
                        typeof parsedOnce === 'string' ? parsedOnce : item;
                    const parsedTwice: unknown = JSON.parse(
                        normalized
                            .replace(/\\u003d/g, '=')
                            .replace(/\\"/g, '"'),
                    );

                    if (!parsedTwice || typeof parsedTwice !== 'object') {
                        return null;
                    }

                    const otpCandidate = (parsedTwice as { otp?: unknown }).otp;
                    const startTimeCandidate = (parsedTwice as { startTime?: unknown }).startTime;

                    if (typeof otpCandidate !== 'string') {
                        return null;
                    }

                    const startTimeNumber = Number(startTimeCandidate);
                    if (Number.isNaN(startTimeNumber)) {
                        return null;
                    }

                    return {
                        ...(parsedTwice as Record<string, unknown>),
                        otp: otpCandidate,
                        startTime: startTimeNumber,
                    } as OtpObject;
                } catch {
                    return null;
                }
            })
            .filter((obj): obj is OtpObject => Boolean(obj?.otp && obj.startTime))
            .sort((a, b) => b.startTime - a.startTime);

        if (!parsedData.length) {
            console.log('[Redis][BillPayment][OTP] No valid OTP payloads found after parsing.');
            return '';
        }

        console.log(
            `[Redis][BillPayment][OTP] Selected OTP with most recent startTime: ${parsedData[0].startTime}`,
        );

        return parsedData[0].otp;
    }

    public async getValueForKey(data: string[], keySearch: string): Promise<string> {
        interface OtpObject {
            otpId: string;
            otp: string;
            id: string;
            type: string;
            startTime: number;
            expired: boolean;
        }
        let otpObtained: string;

        // .map(item => JSON.parse(item.replace(/\\/g, '')) as OtpObject)
        const filteredData = data
            .map(item => {
                // Eliminar las comillas dobles adicionales y reemplazar \\u003d\\u003d con ==
                const cleanedItem = item.slice(1, -1).replace(/\\\\u003d/g, '=').replace(/\\"/g, '"');
                return JSON.parse(cleanedItem) as OtpObject;
            })
            .filter(obj => obj.id.includes(keySearch))
            .sort((a, b) => b.startTime - a.startTime);

        otpObtained = filteredData.length > 0 ? filteredData[0].otp : '';
        return otpObtained;
    }
}

/**
 * Modifica el valor de intentos máximos de OTP en Redis.
 * @param attempts Número de intentos máximos a establecer.
 * @param client Instancia de cliente Redis ya conectada.
 * @param otpMapKey Clave de Redis a modificar.
 */
export async function setOtpAttempts(attempts: number, client: any, otpMapKey: string) {
    const valueString = '"{\\"value\\":\\"' + attempts + '\\"}"';
    await client.sendCommand(['SET', otpMapKey, valueString]);
    console.log(`[Redis] Valor de ${otpMapKey} modificado a ${attempts} intentos: ${valueString}`);
}

export default new RedisHelper();
