import { cosmosHelper } from "@utils/cosmos.helper.ts";

interface YapeAccount {
    id: string;
    email: string;
}

interface AccountSettings {
    id: string;
    idYapeAccount: string;
    amountOtpStatus: number;
    maxAmountOtp: number;
}

interface Service {
    id: string;
    name?: string;
    displayName?: string;
}

interface BillSettingField {
    key: string;
    value: string;
}

interface BillSetting {
    id: string;
    collectionId: string;
    collectionName: string;
    fields?: BillSettingField[];
    partitionKey?: string;
}

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function extractSearchTokens(value: string): string[] {
    const uniqueTokens = new Set(
        normalizeText(value)
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 3),
    );

    return Array.from(uniqueTokens);
}

function rankServiceMatch(service: Service, tokens: string[]): number {
    const candidates = [service.name ?? "", service.displayName ?? ""]
        .map((value) => normalizeText(value))
        .join(" ");

    return tokens.reduce((score, token) => {
        return candidates.includes(token) ? score + 1 : score;
    }, 0);
}

async function findServiceByName(serviceName: string): Promise<Service> {
    const services = await cosmosHelper.query<Service>(
        "services",
        {
            query:
                "SELECT c.id, c.name, c.displayName FROM c WHERE CONTAINS(LOWER(c.name), LOWER(@serviceName)) OR CONTAINS(LOWER(c.displayName), LOWER(@serviceName))",
            parameters: [{ name: "@serviceName", value: serviceName }],
        },
        { database: "billPayments" },
    );

    if (services.length === 1) {
        return services[0];
    }

    if (services.length > 1) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] More than one service matched name: ${serviceName}. Use a more exact name.`,
        );
    }

    const tokens = extractSearchTokens(serviceName);
    if (!tokens.length) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] No service found for name: ${serviceName}`,
        );
    }

    const tokenParams = tokens.map((token, index) => ({
        name: `@token${index}`,
        value: token,
    }));

    const tokenPredicates = tokenParams
        .map(
            (param) =>
                `CONTAINS(LOWER(c.name), ${param.name}) OR CONTAINS(LOWER(c.displayName), ${param.name})`,
        )
        .join(" OR ");

    const fallbackMatches = await cosmosHelper.query<Service>(
        "services",
        {
            query: `SELECT TOP 100 c.id, c.name, c.displayName FROM c WHERE ${tokenPredicates}`,
            parameters: tokenParams,
        },
        { database: "billPayments" },
    );

    if (!fallbackMatches.length) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] No service found for name: ${serviceName}`,
        );
    }

    const ranked = fallbackMatches
        .map((service) => ({ service, score: rankServiceMatch(service, tokens) }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] No service found for name: ${serviceName}`,
        );
    }

    const topScore = ranked[0].score;
    const topMatches = ranked.filter((candidate) => candidate.score === topScore);

    if (topMatches.length > 1) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] Ambiguous service name: ${serviceName}. Matches: ${topMatches
                .map((match) => match.service.displayName || match.service.name || match.service.id)
                .join(", ")}`,
        );
    }

    return topMatches[0].service;
}

export async function getYapeAccountIdByEmailHash(emailHash: string): Promise<string> {
    const accounts = await cosmosHelper.query<YapeAccount>(
        "yapeAccounts",
        {
            query: "SELECT c.id FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: emailHash }],
        },
        { database: "accounts" },
    );

    if (!accounts.length) {
        throw new Error(
            `[getYapeAccountIdByEmailHash] No yapeAccount found for email: ${emailHash}`,
        );
    }

    return accounts[0].id;
}

/**
 * Sets the "Yapeo Alto" OTP threshold for a user identified by emailHash.
 * amountOtpStatus is always kept as 1 (active).
 * To require OTP: pass activate=true with a maxAmount (e.g. 1).
 * To disable OTP check: pass activate=false (sets maxAmountOtp=0).
 *
 * @param emailHash - The user's emailHash (e.g. "px72OluvpzpWEsSvCIl9w9ba02d4qe4=")
 * @param maxAmount - OTP threshold amount. Defaults to 500.
 *
 * @example
 * await toggleYapeoAlto("px72OluvpzpWEsSvCIl9w9ba02d4qe4=", true, 1);    // OTP required above S/1
 * await toggleYapeoAlto("px72OluvpzpWEsSvCIl9w9ba02d4qe4=", false);       // disable (maxAmount=0)
 */
export async function toggleYapeoAlto(
    emailHash: string,
    maxAmount: number = 500,
): Promise<void> {
    // 1. Find idYapeAccount by emailHash
    const accounts = await cosmosHelper.query<YapeAccount>(
        "yapeAccounts",
        {
            query: "SELECT c.id FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: emailHash }],
        },
        { database: "accounts" },
    );

    if (!accounts.length) {
        throw new Error(
            `[toggleYapeoAlto] No yapeAccount found for email: ${emailHash}`,
        );
    }

    const idYapeAccount = accounts[0].id;

    // 2. Find accountSettings by idYapeAccount
    const settings = await cosmosHelper.query<AccountSettings>(
        "accountSettings",
        {
            query: "SELECT * FROM c WHERE c.idYapeAccount = @id",
            parameters: [{ name: "@id", value: idYapeAccount }],
        },
        { database: "configurations" },
    );

    if (!settings.length) {
        throw new Error(
            `[toggleYapeoAlto] No accountSettings found for idYapeAccount: ${idYapeAccount}`,
        );
    }

    // 3. Update yapeo alto: amountOtpStatus always 1, only maxAmountOtp changes
    const doc: AccountSettings = {
        ...settings[0],
        amountOtpStatus: 1,
        maxAmountOtp: maxAmount,
    };

    await cosmosHelper.replace(
        "accountSettings",
        doc.id,
        doc.idYapeAccount,
        doc,
        { database: "configurations" },
    );
}


export async function toggleFractionalPaymentByServiceName(
    serviceName: string,
    enabled: boolean,
): Promise<void> {
    // 1. Find service by name with robust fallback matching
    const service = await findServiceByName(serviceName);
    const serviceId = service.id;

    // 2. Find bill-setting by service id
    const billSettings = await cosmosHelper.query<BillSetting>(
        "billSettings",
        {
            query:
                "SELECT * FROM c WHERE c.collectionName = 'services' AND c.collectionId = @serviceId",
            parameters: [{ name: "@serviceId", value: serviceId }],
        },
        { database: "billPayments" },
    );

    if (!billSettings.length) {
        throw new Error(
            `[toggleFractionalPaymentByServiceName] No billSetting found for serviceId: ${serviceId}`,
        );
    }

    const doc = billSettings[0];
    const fields = Array.isArray(doc.fields) ? doc.fields : [];

    // 3. Update the fractional payment fields
    const updatedFields = [
        ...fields.filter(
            (field) =>
                field.key !== "fractional-payment-enabled" &&
                field.key !== "fractional-payment-advice",
        ),
        { key: "fractional-payment-enabled", value: String(enabled) },
        { key: "fractional-payment-advice", value: String(enabled) },
    ];

    const updated: BillSetting = {
        ...doc,
        fields: updatedFields,
    };

    const partitionKeyCandidates = Array.from(
        new Set(
            [
                updated.partitionKey,
                updated.collectionId,
                updated.id,
                serviceId,
                updated.collectionName,
            ].filter((value): value is string =>
                Boolean(value && value.trim()),
            ),
        ),
    );

    let lastError: unknown;

    for (const partitionKey of partitionKeyCandidates) {
        try {
            await cosmosHelper.replace(
                "billSettings",
                updated.id,
                partitionKey,
                updated,
                { database: "billPayments" },
            );
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isNotFound = message.includes("Entity with the specified id does not exist");

            if (!isNotFound) {
                throw error;
            }

            lastError = error;
        }
    }

    throw new Error(
        `[toggleFractionalPaymentByServiceName] Unable to update billSettings ${updated.id}. Tried partition keys: ${partitionKeyCandidates.join(", ")}. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)
        }`,
    );
}