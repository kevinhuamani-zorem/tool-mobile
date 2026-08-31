import {
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    FRAMEWORK_CONTEXT_QUERIES,
    GapResolution,
    GapResolutionFile,
} from './automationContracts';

interface ValidationIssue {
    code: string;
    path: string;
    message: string;
}

export interface GapResolutionValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    value?: GapResolutionFile;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

export function emptyGapResolutions(recordingId = '', planId = ''): GapResolutionFile {
    return {
        schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
        recordingId,
        planId,
        resolutions: [],
    };
}

export function gapResolutionsSchema(maxResolutions: number): Record<string, unknown> {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['schemaVersion', 'recordingId', 'planId', 'resolutions'],
        properties: {
            schemaVersion: { const: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION },
            recordingId: { type: 'string', minLength: 1 },
            planId: { type: 'string', minLength: 1 },
            resolutions: {
                type: 'array',
                maxItems: Math.max(1, Math.floor(maxResolutions)),
                items: {
                    type: 'object',
                    required: ['gapId', 'decision'],
                    properties: {
                        gapId: { type: 'string', minLength: 1 },
                        decision: { enum: ['reuse', 'create', 'resolved', 'qa-required', 'unresolved'] },
                        reason: { type: 'string' },
                        symbol: { type: 'string' },
                        selectedCandidate: {
                            type: 'object',
                            required: ['file', 'module', 'name'],
                            properties: {
                                file: { type: 'string', minLength: 1 },
                                module: { type: 'string', minLength: 1 },
                                name: { type: 'string', minLength: 1 },
                            },
                            additionalProperties: false,
                        },
                        evidence: { type: 'array', items: { type: 'string' } },
                        needs: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['query', 'args'],
                                properties: {
                                    query: { type: 'string' },
                                    args: { type: 'object' },
                                },
                                additionalProperties: false,
                            },
                        },
                    },
                    additionalProperties: false,
                },
            },
        },
        additionalProperties: false,
    };
}

export function parseGapResolutions(content: string, maxResolutions: number): GapResolutionValidationResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{ code: 'invalid-json', path: '$', message: error.message }],
        };
    }
    return validateGapResolutions(parsed, maxResolutions);
}

export function validateGapResolutions(document: unknown, maxResolutions: number): GapResolutionValidationResult {
    const errors: ValidationIssue[] = [];
    const record = asRecord(document);
    if (!record) {
        return {
            valid: false,
            errors: [{ code: 'invalid-document', path: '$', message: 'El contrato debe ser un objeto JSON.' }],
        };
    }
    if (record.schemaVersion !== AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION) {
        errors.push({
            code: 'schema-version',
            path: '$.schemaVersion',
            message: `schemaVersion inválido: esperado ${AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION}.`,
        });
    }
    const recordingId = typeof record.recordingId === 'string' ? record.recordingId.trim() : '';
    const planId = typeof record.planId === 'string' ? record.planId.trim() : '';
    if (!recordingId) errors.push({ code: 'recording-id', path: '$.recordingId', message: 'recordingId es obligatorio.' });
    if (!planId) errors.push({ code: 'plan-id', path: '$.planId', message: 'planId es obligatorio.' });
    const rawResolutions = Array.isArray(record.resolutions) ? record.resolutions : undefined;
    if (!rawResolutions) {
        errors.push({ code: 'resolutions-type', path: '$.resolutions', message: 'resolutions debe ser un arreglo.' });
    }
    if (rawResolutions && rawResolutions.length > maxResolutions) {
        errors.push({
            code: 'max-resolutions-exceeded',
            path: '$.resolutions',
            message: `resolutions excede el máximo permitido (${maxResolutions}).`,
        });
    }
    const decisions = new Set(['reuse', 'create', 'resolved', 'qa-required', 'unresolved']);
    const allowedQueries = new Set<string>(FRAMEWORK_CONTEXT_QUERIES);
    const normalized: GapResolution[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < (rawResolutions || []).length; index += 1) {
        const item = asRecord(rawResolutions?.[index]);
        if (!item) {
            errors.push({
                code: 'resolution-type',
                path: `$.resolutions[${index}]`,
                message: 'Cada resolución debe ser un objeto.',
            });
            continue;
        }
        const gapId = typeof item.gapId === 'string' ? item.gapId.trim() : '';
        const decision = typeof item.decision === 'string' ? item.decision.trim() : '';
        if (!gapId) errors.push({ code: 'gap-id', path: `$.resolutions[${index}].gapId`, message: 'gapId es obligatorio.' });
        if (!decisions.has(decision)) {
            errors.push({
                code: 'decision',
                path: `$.resolutions[${index}].decision`,
                message: `decision inválida: ${decision || '<vacío>'}.`,
            });
        }
        if (gapId && seen.has(gapId)) {
            errors.push({
                code: 'duplicate-gap-id',
                path: `$.resolutions[${index}].gapId`,
                message: `gapId duplicado: ${gapId}.`,
            });
        }
        if (gapId) seen.add(gapId);
        const reason = typeof item.reason === 'string' ? item.reason : undefined;
        const symbol = typeof item.symbol === 'string' ? item.symbol : undefined;
        const rawCandidate = asRecord(item.selectedCandidate);
        const selectedCandidate = rawCandidate ? {
            file: typeof rawCandidate.file === 'string' ? rawCandidate.file.trim() : '',
            module: typeof rawCandidate.module === 'string' ? rawCandidate.module.trim() : '',
            name: typeof rawCandidate.name === 'string' ? rawCandidate.name.trim() : '',
        } : undefined;
        if (rawCandidate && (!selectedCandidate?.file || !selectedCandidate.module || !selectedCandidate.name)) {
            errors.push({
                code: 'selected-candidate',
                path: `$.resolutions[${index}].selectedCandidate`,
                message: 'selectedCandidate requiere file, module y name no vacíos.',
            });
        }
        if (decision === 'reuse' && !selectedCandidate && !symbol) {
            errors.push({
                code: 'reuse-candidate-required',
                path: `$.resolutions[${index}]`,
                message: 'decision reuse requiere selectedCandidate (o symbol en respuestas legacy).',
            });
        }
        const evidence = Array.isArray(item.evidence)
            ? item.evidence.filter(entry => typeof entry === 'string') as string[]
            : undefined;
        const needs = Array.isArray(item.needs)
            ? item.needs
                .map(asRecord)
                .filter(Boolean)
                .map(entry => ({
                    query: String((entry as Record<string, unknown>).query || ''),
                    args: asRecord((entry as Record<string, unknown>).args) || {},
                }))
                .filter(entry => allowedQueries.has(entry.query))
            : undefined;
        normalized.push({
            gapId: gapId || `invalid-${index}`,
            decision: (decision || 'unresolved') as GapResolution['decision'],
            ...(reason ? { reason } : {}),
            ...(symbol ? { symbol } : {}),
            ...(selectedCandidate?.file && selectedCandidate.module && selectedCandidate.name
                ? { selectedCandidate }
                : {}),
            ...(evidence && evidence.length ? { evidence } : {}),
            ...(needs && needs.length ? {
                needs: needs.map(entry => ({
                    query: entry.query as any,
                    args: entry.args,
                })),
            } : {}),
        });
    }
    if (errors.length) return { valid: false, errors };
    return {
        valid: true,
        errors: [],
        value: {
            schemaVersion: AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
            recordingId,
            planId,
            resolutions: normalized,
        },
    };
}
