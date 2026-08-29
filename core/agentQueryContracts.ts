import {
    AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
    AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
    AgentContextQueryRequest,
    AgentContextQueryRequests,
    AgentContextQueryResult,
    AgentContextQueryResults,
    FrameworkContextQuery,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
} from './automationContracts';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

const SUPPORTED_QUERIES = new Set<FrameworkContextQuery>([
    'inspectScenario',
    'findExistingScreen',
    'findExistingStep',
    'findExample',
    'findLocator',
    'getContract',
    'getHelperApi',
    'validateImports',
]);

const RESULT_STATUSES = new Set(['resolved', 'rejected', 'not-found', 'error']);

const REJECTION_CODES = new Set([
    'query-not-allowed',
    'no-open-gap',
    'max-queries-exceeded',
    'duplicate-query',
    'blocked-qa',
    'context-budget-exceeded',
]);

export interface ContractValidationIssue {
    code: string;
    path: string;
    message: string;
}

export interface ContractValidationResult<T> {
    valid: boolean;
    errors: ContractValidationIssue[];
    value?: T;
}

export function emptyQueryRequests(): AgentContextQueryRequests {
    return {
        schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
        requests: [],
    };
}

export function emptyQueryResults(): AgentContextQueryResults {
    return {
        schemaVersion: AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
        results: [],
    };
}

export function parseAgentContextQueryRequests(
    content: string,
    maxRequests = DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxTotalQueries,
): ContractValidationResult<AgentContextQueryRequests> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error: any) {
        return {
            valid: false,
            errors: [{ code: 'invalid-json', path: '$', message: error.message }],
        };
    }
    return validateAgentContextQueryRequests(parsed, maxRequests);
}

export function validateAgentContextQueryRequests(
    document: unknown,
    maxRequests = DEFAULT_AGENT_OPERATIONAL_BUDGETS.maxTotalQueries,
): ContractValidationResult<AgentContextQueryRequests> {
    const errors: ContractValidationIssue[] = [];
    const record = asRecord(document);
    if (!record) {
        return {
            valid: false,
            errors: [{ code: 'invalid-document', path: '$', message: 'El contrato debe ser un objeto JSON.' }],
        };
    }
    if (record.schemaVersion !== AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION) {
        errors.push({
            code: 'schema-version',
            path: '$.schemaVersion',
            message: `schemaVersion inválido: esperado ${AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION}.`,
        });
    }
    const requests = Array.isArray(record.requests) ? record.requests : undefined;
    if (!requests) {
        errors.push({
            code: 'requests-type',
            path: '$.requests',
            message: 'requests debe ser un arreglo.',
        });
    }
    if (requests && requests.length > maxRequests) {
        errors.push({
            code: 'max-requests-exceeded',
            path: '$.requests',
            message: `requests excede el máximo permitido (${maxRequests}).`,
        });
    }

    const normalizedRequests: AgentContextQueryRequest[] = [];
    const seenIds = new Set<string>();
    (requests || []).forEach((raw, index) => {
        const item = asRecord(raw);
        if (!item) {
            errors.push({
                code: 'request-type',
                path: `$.requests[${index}]`,
                message: 'Cada request debe ser un objeto.',
            });
            return;
        }
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const gapId = typeof item.gapId === 'string' ? item.gapId.trim() : '';
        const query = typeof item.query === 'string' ? item.query : '';
        const args = asRecord(item.args) || {};
        if (!id) errors.push({ code: 'request-id', path: `$.requests[${index}].id`, message: 'id es obligatorio.' });
        if (!gapId) errors.push({ code: 'request-gap-id', path: `$.requests[${index}].gapId`, message: 'gapId es obligatorio.' });
        if (!SUPPORTED_QUERIES.has(query as FrameworkContextQuery)) {
            errors.push({
                code: 'unknown-query',
                path: `$.requests[${index}].query`,
                message: `query no soportada: ${String(item.query)}.`,
            });
        }
        if (id && seenIds.has(id)) {
            errors.push({
                code: 'duplicate-request-id',
                path: `$.requests[${index}].id`,
                message: `id duplicado: ${id}.`,
            });
        }
        if (id) seenIds.add(id);
        normalizedRequests.push({
            id: id || `invalid-${index}`,
            gapId,
            query: (query || 'findExample') as FrameworkContextQuery,
            args,
        });
    });

    if (errors.length) return { valid: false, errors };
    return {
        valid: true,
        errors: [],
        value: {
            schemaVersion: AUTOMATION_QUERY_REQUESTS_SCHEMA_VERSION,
            requests: normalizedRequests,
        },
    };
}

export function validateAgentContextQueryResults(
    document: unknown,
    requestIds: ReadonlySet<string> = new Set<string>(),
): ContractValidationResult<AgentContextQueryResults> {
    const errors: ContractValidationIssue[] = [];
    const record = asRecord(document);
    if (!record) {
        return {
            valid: false,
            errors: [{ code: 'invalid-document', path: '$', message: 'El contrato debe ser un objeto JSON.' }],
        };
    }
    if (record.schemaVersion !== AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION) {
        errors.push({
            code: 'schema-version',
            path: '$.schemaVersion',
            message: `schemaVersion inválido: esperado ${AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION}.`,
        });
    }
    const results = Array.isArray(record.results) ? record.results : undefined;
    if (!results) {
        errors.push({
            code: 'results-type',
            path: '$.results',
            message: 'results debe ser un arreglo.',
        });
    }
    const normalized: AgentContextQueryResult[] = [];
    (results || []).forEach((raw, index) => {
        const item = asRecord(raw);
        if (!item) {
            errors.push({
                code: 'result-type',
                path: `$.results[${index}]`,
                message: 'Cada result debe ser un objeto.',
            });
            return;
        }
        const requestId = typeof item.requestId === 'string' ? item.requestId.trim() : '';
        const gapId = typeof item.gapId === 'string' ? item.gapId.trim() : '';
        const status = typeof item.status === 'string' ? item.status : '';
        if (!requestId) errors.push({ code: 'result-request-id', path: `$.results[${index}].requestId`, message: 'requestId es obligatorio.' });
        if (!gapId) errors.push({ code: 'result-gap-id', path: `$.results[${index}].gapId`, message: 'gapId es obligatorio.' });
        if (!RESULT_STATUSES.has(status)) {
            errors.push({
                code: 'invalid-status',
                path: `$.results[${index}].status`,
                message: `status inválido: ${String(item.status)}.`,
            });
        }
        if (requestId && requestIds.size && !requestIds.has(requestId)) {
            errors.push({
                code: 'unknown-request-id',
                path: `$.results[${index}].requestId`,
                message: `requestId no existe en query-requests: ${requestId}.`,
            });
        }
        const code = typeof item.code === 'string' ? item.code : undefined;
        if (status === 'rejected' && (!code || !REJECTION_CODES.has(code))) {
            errors.push({
                code: 'invalid-rejection-code',
                path: `$.results[${index}].code`,
                message: 'Un result rejected debe incluir un code estructurado permitido.',
            });
        }
        normalized.push({
            requestId: requestId || `invalid-${index}`,
            gapId,
            status: (status || 'error') as AgentContextQueryResult['status'],
            ...(code ? { code: code as AgentContextQueryResult['code'] } : {}),
            ...(asRecord(item.data) ? { data: item.data as Record<string, unknown> } : {}),
            ...(Array.isArray(item.evidence)
                ? { evidence: item.evidence.filter(value => typeof value === 'string') as string[] }
                : {}),
        });
    });
    if (errors.length) return { valid: false, errors };
    return {
        valid: true,
        errors: [],
        value: {
            schemaVersion: AUTOMATION_QUERY_RESULTS_SCHEMA_VERSION,
            results: normalized,
        },
    };
}
