import {
    AUTOMATION_GAP_RESOLUTIONS_SCHEMA_VERSION,
    FRAMEWORK_CONTEXT_QUERIES,
    GapResolution,
    GapResolutionFile,
    GherkinResolution,
    TestDesignIssue,
    TestDesignReview,
} from '../contracts';

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

const DECISION_ALIASES = {
    'reuse-existing': 'reuse',
    'create-new': 'create',
    // Este valor describe la operación sobre los cuatro artefactos, no una
    // selección de locator. El plan ya contiene las rutas `update` exactas.
    'extend-existing': 'resolved',
} as const;

const ACCEPTED_DECISIONS = [
    'reuse',
    'create',
    'replace-existing',
    'resolved',
    'qa-required',
    'unresolved',
    ...Object.keys(DECISION_ALIASES),
] as const;

const TEST_DESIGN_ISSUE_CODES = [
    'missing-business-assertion',
    'control-existence-only',
    'acceptance-criteria-mismatch',
    'missing-test-oracle',
    'dependent-variants',
    'ambiguous-objective',
] as const;

function normalizeDecision(value: string): GapResolution['decision'] | undefined {
    if (value in DECISION_ALIASES) {
        return DECISION_ALIASES[value as keyof typeof DECISION_ALIASES];
    }
    return ['reuse', 'create', 'replace-existing', 'resolved', 'qa-required', 'unresolved'].includes(value)
        ? value as GapResolution['decision']
        : undefined;
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
                        decision: { enum: [...ACCEPTED_DECISIONS] },
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
                        replacement: {
                            type: 'object',
                            required: ['platform', 'sequence'],
                            properties: {
                                platform: { enum: ['android', 'ios'] },
                                sequence: { type: 'integer', minimum: 1 },
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
            gherkinResolutions: {
                type: 'array',
                maxItems: Math.max(1, Math.floor(maxResolutions)),
                items: {
                    type: 'object',
                    required: ['keyword', 'text', 'actionSequences'],
                    properties: {
                        keyword: { enum: ['When', 'Then', 'And', 'But'] },
                        text: { type: 'string', minLength: 4 },
                        actionSequences: {
                            type: 'array',
                            minItems: 1,
                            items: { type: 'integer', minimum: 1 },
                        },
                        reason: { type: 'string' },
                    },
                    additionalProperties: false,
                },
            },
            testDesignReview: {
                type: 'object',
                required: ['status', 'summary', 'issues'],
                properties: {
                    status: { enum: ['pass', 'suggestion', 'qa-required'] },
                    summary: { type: 'string', minLength: 8, maxLength: 500 },
                    roast: {
                        type: 'string',
                        minLength: 20,
                        maxLength: 280,
                        description: 'Compatibilidad con respuestas anteriores. La presentación troll se genera fuera de la resolución semántica.',
                    },
                    issues: {
                        type: 'array',
                        maxItems: 8,
                        items: {
                            type: 'object',
                            required: ['code', 'severity', 'message', 'actionSequences', 'recommendation'],
                            properties: {
                                code: { enum: [...TEST_DESIGN_ISSUE_CODES] },
                                severity: { enum: ['warning', 'blocking'] },
                                message: { type: 'string', minLength: 8, maxLength: 500 },
                                actionSequences: {
                                    type: 'array',
                                    maxItems: 50,
                                    items: { type: 'integer', minimum: 1 },
                                },
                                recommendation: { type: 'string', minLength: 8, maxLength: 500 },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                additionalProperties: false,
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
        const inputDecision = typeof item.decision === 'string' ? item.decision.trim() : '';
        const decision = normalizeDecision(inputDecision);
        if (!gapId) errors.push({ code: 'gap-id', path: `$.resolutions[${index}].gapId`, message: 'gapId es obligatorio.' });
        if (!decision) {
            errors.push({
                code: 'decision',
                path: `$.resolutions[${index}].decision`,
                message: `decision inválida: ${inputDecision || '<vacío>'}.`,
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
        const rawReplacement = asRecord(item.replacement);
        const replacementPlatform: 'android' | 'ios' | undefined =
            rawReplacement?.platform === 'android' || rawReplacement?.platform === 'ios'
                ? rawReplacement.platform
                : undefined;
        const replacement = rawReplacement ? {
            platform: replacementPlatform,
            sequence: Number.isInteger(rawReplacement.sequence) && Number(rawReplacement.sequence) > 0
                ? Number(rawReplacement.sequence)
                : undefined,
        } : undefined;
        if (decision === 'replace-existing' && !selectedCandidate) {
            errors.push({
                code: 'replacement-candidate-required',
                path: `$.resolutions[${index}].selectedCandidate`,
                message: 'decision replace-existing requiere selectedCandidate estructurado.',
            });
        }
        if (decision === 'replace-existing' && (!replacement?.platform || !replacement.sequence)) {
            errors.push({
                code: 'replacement-source-required',
                path: `$.resolutions[${index}].replacement`,
                message: 'decision replace-existing requiere platform y sequence válidos.',
            });
        }
        if (rawReplacement && (!replacement?.platform || !replacement.sequence)) {
            errors.push({
                code: 'replacement-source',
                path: `$.resolutions[${index}].replacement`,
                message: 'replacement requiere platform android/ios y sequence entero positivo.',
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
            decision: decision || 'unresolved',
            ...(reason ? { reason } : {}),
            ...(symbol ? { symbol } : {}),
            ...(selectedCandidate?.file && selectedCandidate.module && selectedCandidate.name
                ? { selectedCandidate }
                : {}),
            ...(replacement?.platform && replacement.sequence
                ? { replacement: { platform: replacement.platform, sequence: replacement.sequence } }
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
    const rawGherkin = record.gherkinResolutions === undefined
        ? []
        : Array.isArray(record.gherkinResolutions) ? record.gherkinResolutions : undefined;
    if (!rawGherkin) {
        errors.push({
            code: 'gherkin-resolutions-type',
            path: '$.gherkinResolutions',
            message: 'gherkinResolutions debe ser un arreglo.',
        });
    }
    if (rawGherkin && rawGherkin.length > maxResolutions) {
        errors.push({
            code: 'max-gherkin-resolutions-exceeded',
            path: '$.gherkinResolutions',
            message: `gherkinResolutions excede el máximo permitido (${maxResolutions}).`,
        });
    }
    const normalizedGherkin: GherkinResolution[] = [];
    const usedSequences = new Set<number>();
    for (let index = 0; index < (rawGherkin || []).length; index += 1) {
        const item = asRecord(rawGherkin?.[index]);
        if (!item) {
            errors.push({
                code: 'gherkin-resolution-type',
                path: `$.gherkinResolutions[${index}]`,
                message: 'Cada resolución Gherkin debe ser un objeto.',
            });
            continue;
        }
        const keyword = ['When', 'Then', 'And', 'But'].includes(String(item.keyword || ''))
            ? item.keyword as GherkinResolution['keyword']
            : undefined;
        const text = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : '';
        const sequences = Array.isArray(item.actionSequences)
            ? item.actionSequences.filter(value => Number.isInteger(value) && Number(value) > 0).map(Number)
            : [];
        if (!keyword) errors.push({
            code: 'gherkin-keyword',
            path: `$.gherkinResolutions[${index}].keyword`,
            message: 'keyword debe ser When, Then, And o But.',
        });
        if (text.length < 4) errors.push({
            code: 'gherkin-text',
            path: `$.gherkinResolutions[${index}].text`,
            message: 'text debe contener una frase declarativa.',
        });
        if (!sequences.length || sequences.length !== (item.actionSequences as unknown[] | undefined)?.length) {
            errors.push({
                code: 'gherkin-action-sequences',
                path: `$.gherkinResolutions[${index}].actionSequences`,
                message: 'actionSequences requiere enteros positivos.',
            });
        }
        for (const sequence of sequences) {
            if (usedSequences.has(sequence)) errors.push({
                code: 'duplicate-gherkin-sequence',
                path: `$.gherkinResolutions[${index}].actionSequences`,
                message: `La secuencia ${sequence} aparece en más de una resolución Gherkin.`,
            });
            usedSequences.add(sequence);
        }
        if (keyword && text.length >= 4 && sequences.length) normalizedGherkin.push({
            keyword,
            text,
            actionSequences: sequences,
            ...(typeof item.reason === 'string' && item.reason.trim() ? { reason: item.reason.trim() } : {}),
        });
    }
    let normalizedTestDesignReview: TestDesignReview | undefined;
    if (record.testDesignReview !== undefined) {
        // La revisión funcional es consultiva. Una respuesta defectuosa aquí no
        // debe invalidar resoluciones, Gherkin ni archivos técnicamente válidos.
        const reviewErrorStart = errors.length;
        const review = asRecord(record.testDesignReview);
        if (!review) {
            errors.push({
                code: 'test-design-review-type',
                path: '$.testDesignReview',
                message: 'testDesignReview debe ser un objeto.',
            });
        } else {
            const status = review.status === 'qa-required'
                ? 'suggestion'
                : review.status === 'pass' || review.status === 'suggestion'
                    ? review.status
                : undefined;
            const summary = typeof review.summary === 'string'
                ? review.summary.replace(/\s+/g, ' ').trim().slice(0, 500)
                : '';
            const roast = typeof review.roast === 'string'
                ? review.roast.replace(/\s+/g, ' ').trim().slice(0, 280)
                : '';
            const rawIssues = Array.isArray(review.issues) ? review.issues : undefined;
            if (!status) errors.push({
                code: 'test-design-review-status',
                path: '$.testDesignReview.status',
                message: 'status debe ser pass o suggestion.',
            });
            if (summary.length < 8) errors.push({
                code: 'test-design-review-summary',
                path: '$.testDesignReview.summary',
                message: 'summary debe explicar brevemente el resultado de la revisión.',
            });
            if (!rawIssues) errors.push({
                code: 'test-design-review-issues',
                path: '$.testDesignReview.issues',
                message: 'issues debe ser un arreglo.',
            });
            if (rawIssues && rawIssues.length > 8) errors.push({
                code: 'test-design-review-max-issues',
                path: '$.testDesignReview.issues',
                message: 'testDesignReview admite como máximo 8 hallazgos.',
            });
            const issues: TestDesignIssue[] = [];
            for (let index = 0; index < (rawIssues || []).length; index += 1) {
                const item = asRecord(rawIssues?.[index]);
                const code = TEST_DESIGN_ISSUE_CODES.includes(item?.code as any)
                    ? item?.code as TestDesignIssue['code']
                    : undefined;
                const severity = item?.severity === 'warning' || item?.severity === 'blocking'
                    ? item.severity
                    : undefined;
                const message = typeof item?.message === 'string'
                    ? item.message.replace(/\s+/g, ' ').trim().slice(0, 500)
                    : '';
                const recommendation = typeof item?.recommendation === 'string'
                    ? item.recommendation.replace(/\s+/g, ' ').trim().slice(0, 500)
                    : '';
                const rawSequences = Array.isArray(item?.actionSequences) ? item.actionSequences : undefined;
                const actionSequences = (rawSequences || [])
                    .filter(value => Number.isInteger(value) && Number(value) > 0)
                    .map(Number);
                if (!code || !severity || message.length < 8 || recommendation.length < 8
                    || !rawSequences || rawSequences.length !== actionSequences.length) {
                    errors.push({
                        code: 'test-design-review-issue',
                        path: `$.testDesignReview.issues[${index}]`,
                        message: 'El hallazgo requiere code, severity, message, actionSequences válidas y recommendation.',
                    });
                    continue;
                }
                issues.push({ code, severity, message, actionSequences, recommendation });
            }
            if (status === 'pass' && issues.some(issue => issue.severity === 'blocking')) errors.push({
                code: 'test-design-review-pass-blocking',
                path: '$.testDesignReview',
                message: 'Una revisión pass no puede contener hallazgos blocking.',
            });
            if (status === 'suggestion' && !issues.length) errors.push({
                code: 'test-design-review-suggestion-without-issues',
                path: '$.testDesignReview',
                message: 'suggestion necesita al menos un hallazgo.',
            });
            if (status && summary.length >= 8 && rawIssues && issues.length === rawIssues.length) {
                normalizedTestDesignReview = { status, summary, ...(roast ? { roast } : {}), issues };
            }
        }
        if (errors.length > reviewErrorStart) {
            errors.splice(reviewErrorStart);
            normalizedTestDesignReview = undefined;
        }
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
            ...(normalizedGherkin.length ? { gherkinResolutions: normalizedGherkin } : {}),
            ...(normalizedTestDesignReview ? { testDesignReview: normalizedTestDesignReview } : {}),
        },
    };
}
