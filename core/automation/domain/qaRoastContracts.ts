import { QaRoastResponse } from '../contracts';

export interface QaRoastValidationResult {
    valid: boolean;
    errors: string[];
    value?: QaRoastResponse;
}

const DIRECT_ACTION = /\b(tocaste|grabaste|validaste|comprobaste|seleccionaste|elegiste|probaste|usaste|abriste|cerraste|escribiste|presionaste|pulsaste|hiciste|recorriste|ejecutaste|navegaste|marcaste|dejaste|miraste|buscaste|confirmado)\b/i;
const SARCASTIC_PUNCHLINE = /\b(esto no es|impactante|felicidades|enhorabuena|spoiler|plot twist|tour guiado|turismo de botones|decoraci[oó]n|aplausos|descubrimiento hist[oó]rico|qu[eé] sorpresa|gran logro|maravilloso|brillante)\b/i;
const CORRECTION = /\b(ahora|vuelve|agrega|a[nñ]ade|valida|comprueba|graba|corrige|demuestra)\b/i;
const DRY_LANGUAGE = /\b(se recorrieron|se comprob[oó]|se verific[oó]|resultado de negocio|criterio de aceptaci[oó]n|or[aá]culo|aserc[ií]on)\b/i;
const PERSONAL_ATTACK = /\b(in[uú]til|idiota|est[uú]pido|tonto|incompetente|imb[eé]cil)\b/i;
const STRONG_LANGUAGE = /\b(mierda|carajo|joder|co[jñ]o|maldito|pu[tñ]etero|porquer[ií]a|desmadre)\b/i;

export const QA_ROAST_RESPONSE_SCHEMA = {
    type: 'object',
    required: ['schemaVersion', 'roast'],
    properties: {
        schemaVersion: { const: 1 },
        roast: { type: 'string', minLength: 40, maxLength: 280 },
    },
    additionalProperties: false,
} as const;

export function validateQaRoastResponse(document: unknown): QaRoastValidationResult {
    const record = document && typeof document === 'object' && !Array.isArray(document)
        ? document as Record<string, unknown>
        : null;
    if (!record) return { valid: false, errors: ['La respuesta debe ser un objeto JSON.'] };
    const roast = typeof record.roast === 'string'
        ? record.roast.replace(/\s+/g, ' ').trim()
        : '';
    const errors: string[] = [];
    if (record.schemaVersion !== 1) errors.push('schemaVersion debe ser 1.');
    if (roast.length < 40 || roast.length > 280) errors.push('El roast debe tener entre 40 y 280 caracteres.');
    if (!DIRECT_ACTION.test(roast)) errors.push('Habla directamente al QA y menciona una acción concreta que realizó.');
    if (!STRONG_LANGUAGE.test(roast)) errors.push('Incluye una grosería dirigida al caso o al resultado; no escribas feedback corporativo amable.');
    if (!SARCASTIC_PUNCHLINE.test(roast)) errors.push('Incluye un remate sarcástico evidente, no otro diagnóstico técnico.');
    if (!CORRECTION.test(roast)) errors.push('Termina con una orden concreta para corregir la grabación.');
    if (DRY_LANGUAGE.test(roast)) errors.push('Evita voz pasiva y jerga técnica.');
    if (PERSONAL_ATTACK.test(roast)) errors.push('Critica el caso, nunca a la persona.');
    const sentenceCount = (roast.match(/[.!?]+(?:\s|$)/g) || []).length;
    if (sentenceCount < 2 || sentenceCount > 3) errors.push('Usa dos o tres oraciones breves.');
    if (errors.length) return { valid: false, errors };
    return { valid: true, errors: [], value: { schemaVersion: 1, roast } };
}
