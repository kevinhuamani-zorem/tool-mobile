const sensitiveKey = /(password|pass|secret|token|key|credential|authorization|card|cvv)/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const longNumber = /\b\d{6,19}\b/g;
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function sanitizeText(value: string): string {
    return value
        .replace(bearer, 'Bearer [REDACTED]')
        .replace(email, '<correo>')
        .replace(longNumber, match =>
            match.length <= 6 ? '<codigo>' : '<numero_sensible>'
        );
}

export function sanitizeForAi(value: unknown, key = ''): unknown {
    if (sensitiveKey.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return sanitizeText(value);
    if (Array.isArray(value)) return value.map(item => sanitizeForAi(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .map(([entryKey, entryValue]) => [
                    entryKey,
                    sanitizeForAi(entryValue, entryKey)
                ])
        );
    }
    return value;
}
