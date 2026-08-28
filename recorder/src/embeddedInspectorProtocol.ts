export const EMBEDDED_INSPECTOR_CHANNEL = 'appium-inspector:embedded';
export const EMBEDDED_INSPECTOR_VERSION = 3;
export const MAX_EMBEDDED_INSPECTOR_CANDIDATES = 50;

export const EMBEDDED_INSPECTOR_TYPES = {
    CONNECT: 'appium-inspector:connect',
    READY: 'appium-inspector:ready',
    CONNECTED: 'appium-inspector:connected',
    ERROR: 'appium-inspector:error',
    ELEMENT_USED: 'appium-inspector:element-used',
} as const;

export interface EmbeddedInspectorConnection {
    serverUrl: string;
    sessionId: string;
    capabilities: Record<string, unknown>;
    platform: string;
}

export interface EmbeddedInspectorElementUsed {
    strategy: string;
    selector: string;
    elementId?: string;
    tag?: string;
    attributes: Record<string, string>;
    screenshot?: string;
    source?: string;
    candidates: EmbeddedInspectorLocatorCandidate[];
}

export const EMBEDDED_INSPECTOR_CANDIDATE_STABILITIES = [
    'stable', 'contextual', 'structural', 'manual',
] as const;

export interface EmbeddedInspectorLocatorCandidate {
    candidateId: string;
    strategy: string;
    selector: string;
    priority: number;
    stability: typeof EMBEDDED_INSPECTOR_CANDIDATE_STABILITIES[number];
    sourceReason: string;
    matchCount: 1;
    sameElement: true;
}

export interface EmbeddedInspectorError {
    code: string;
    message: string;
}

export type EmbeddedInspectorIncomingMessage =
    | { channel: typeof EMBEDDED_INSPECTOR_CHANNEL; version: typeof EMBEDDED_INSPECTOR_VERSION; type: typeof EMBEDDED_INSPECTOR_TYPES.READY }
    | { channel: typeof EMBEDDED_INSPECTOR_CHANNEL; version: typeof EMBEDDED_INSPECTOR_VERSION; type: typeof EMBEDDED_INSPECTOR_TYPES.CONNECTED; payload: { sessionId: string } }
    | { channel: typeof EMBEDDED_INSPECTOR_CHANNEL; version: typeof EMBEDDED_INSPECTOR_VERSION; type: typeof EMBEDDED_INSPECTOR_TYPES.ERROR; payload: EmbeddedInspectorError }
    | { channel: typeof EMBEDDED_INSPECTOR_CHANNEL; version: typeof EMBEDDED_INSPECTOR_VERSION; type: typeof EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED; payload: EmbeddedInspectorElementUsed };

export type EmbeddedInspectorConnectMessage = {
    channel: typeof EMBEDDED_INSPECTOR_CHANNEL;
    version: typeof EMBEDDED_INSPECTOR_VERSION;
    type: typeof EMBEDDED_INSPECTOR_TYPES.CONNECT;
    payload: EmbeddedInspectorConnection;
};

export class EmbeddedInspectorProtocolError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'EmbeddedInspectorProtocolError';
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', `'${field}' debe ser un string no vacío`);
    }
    return value;
}

function boundedString(value: unknown, field: string, maxLength: number): string {
    const result = requiredString(value, field);
    if (result.length > maxLength) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', `'${field}' excede ${maxLength} caracteres`);
    }
    return result;
}

function optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    return requiredString(value, field);
}

function stringRecord(value: unknown, field: string): Record<string, string> {
    if (!isObject(value)) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', `'${field}' debe ser un objeto`);
    }
    const entries = Object.entries(value);
    if (entries.some(([, item]) => typeof item !== 'string')) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', `'${field}' solo admite valores string`);
    }
    return Object.fromEntries(entries) as Record<string, string>;
}

const CANDIDATE_FIELDS = new Set([
    'candidateId', 'strategy', 'selector', 'priority', 'stability',
    'sourceReason', 'matchCount', 'sameElement',
]);

function locatorCandidate(value: unknown, index: number): EmbeddedInspectorLocatorCandidate {
    const field = `candidates[${index}]`;
    if (!isObject(value) || Object.keys(value).some(key => !CANDIDATE_FIELDS.has(key))) {
        throw new EmbeddedInspectorProtocolError(
            'INVALID_PAYLOAD',
            `'${field}' debe usar exclusivamente la forma compacta verificada`,
        );
    }
    if (!Number.isInteger(value.priority) || Number(value.priority) < 0 || Number(value.priority) > 1_000_000) {
        throw new EmbeddedInspectorProtocolError(
            'INVALID_PAYLOAD',
            `'${field}.priority' debe ser un entero no negativo acotado`,
        );
    }
    if (
        typeof value.stability !== 'string'
        || !EMBEDDED_INSPECTOR_CANDIDATE_STABILITIES.includes(
            value.stability as EmbeddedInspectorLocatorCandidate['stability'],
        )
    ) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', `'${field}.stability' no es soportado`);
    }
    if (value.matchCount !== 1 || value.sameElement !== true) {
        throw new EmbeddedInspectorProtocolError(
            'INVALID_PAYLOAD',
            `'${field}' debe probar una coincidencia única con el mismo elemento`,
        );
    }
    return {
        candidateId: boundedString(value.candidateId, `${field}.candidateId`, 128),
        strategy: boundedString(value.strategy, `${field}.strategy`, 64),
        selector: boundedString(value.selector, `${field}.selector`, 2_048),
        priority: Number(value.priority),
        stability: value.stability as EmbeddedInspectorLocatorCandidate['stability'],
        sourceReason: boundedString(value.sourceReason, `${field}.sourceReason`, 256),
        matchCount: 1,
        sameElement: true,
    };
}

function validateEnvelope(data: unknown): Record<string, unknown> {
    if (!isObject(data)) {
        throw new EmbeddedInspectorProtocolError('INVALID_MESSAGE', 'El mensaje debe ser un objeto');
    }
    if (data.channel !== EMBEDDED_INSPECTOR_CHANNEL || data.version !== EMBEDDED_INSPECTOR_VERSION) {
        throw new EmbeddedInspectorProtocolError('UNSUPPORTED_PROTOCOL', 'Canal o versión de Inspector no soportados');
    }
    return data;
}

export function validateEmbeddedInspectorConnection(value: unknown): EmbeddedInspectorConnection {
    if (!isObject(value)) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', 'La conexión debe ser un objeto');
    }
    const serverUrl = requiredString(value.serverUrl, 'serverUrl');
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(serverUrl);
    } catch {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'serverUrl' debe ser una URL válida");
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'serverUrl' debe usar HTTP o HTTPS");
    }
    if (!isObject(value.capabilities)) {
        throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'capabilities' debe ser un objeto");
    }
    return {
        serverUrl: parsedUrl.toString().replace(/\/$/, ''),
        sessionId: requiredString(value.sessionId, 'sessionId'),
        capabilities: { ...value.capabilities },
        platform: requiredString(value.platform, 'platform'),
    };
}

export function createEmbeddedInspectorConnectMessage(
    connection: EmbeddedInspectorConnection,
): EmbeddedInspectorConnectMessage {
    return {
        channel: EMBEDDED_INSPECTOR_CHANNEL,
        version: EMBEDDED_INSPECTOR_VERSION,
        type: EMBEDDED_INSPECTOR_TYPES.CONNECT,
        payload: validateEmbeddedInspectorConnection(connection),
    };
}

export function validateEmbeddedInspectorMessage(data: unknown): EmbeddedInspectorIncomingMessage {
    const message = validateEnvelope(data);
    switch (message.type) {
        case EMBEDDED_INSPECTOR_TYPES.READY:
            if (message.payload !== undefined) {
                throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'ready' no admite payload");
            }
            return {
                channel: EMBEDDED_INSPECTOR_CHANNEL,
                version: EMBEDDED_INSPECTOR_VERSION,
                type: EMBEDDED_INSPECTOR_TYPES.READY,
            };
        case EMBEDDED_INSPECTOR_TYPES.CONNECTED: {
            if (!isObject(message.payload)) {
                throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'connected.payload' debe ser un objeto");
            }
            return {
                channel: EMBEDDED_INSPECTOR_CHANNEL,
                version: EMBEDDED_INSPECTOR_VERSION,
                type: EMBEDDED_INSPECTOR_TYPES.CONNECTED,
                payload: { sessionId: requiredString(message.payload.sessionId, 'sessionId') },
            };
        }
        case EMBEDDED_INSPECTOR_TYPES.ERROR: {
            if (!isObject(message.payload)) {
                throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'error.payload' debe ser un objeto");
            }
            return {
                channel: EMBEDDED_INSPECTOR_CHANNEL,
                version: EMBEDDED_INSPECTOR_VERSION,
                type: EMBEDDED_INSPECTOR_TYPES.ERROR,
                payload: {
                    code: requiredString(message.payload.code, 'code'),
                    message: requiredString(message.payload.message, 'message'),
                },
            };
        }
        case EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED: {
            if (!isObject(message.payload)) {
                throw new EmbeddedInspectorProtocolError('INVALID_PAYLOAD', "'element-used.payload' debe ser un objeto");
            }
            if (
                !Array.isArray(message.payload.candidates)
                || message.payload.candidates.length === 0
                || message.payload.candidates.length > MAX_EMBEDDED_INSPECTOR_CANDIDATES
            ) {
                throw new EmbeddedInspectorProtocolError(
                    'INVALID_PAYLOAD',
                    `'candidates' debe contener entre 1 y ${MAX_EMBEDDED_INSPECTOR_CANDIDATES} elementos`,
                );
            }
            const candidates = message.payload.candidates.map(locatorCandidate);
            const strategy = boundedString(message.payload.strategy, 'strategy', 64);
            const selector = boundedString(message.payload.selector, 'selector', 2_048);
            if (candidates[0].strategy !== strategy || candidates[0].selector !== selector) {
                throw new EmbeddedInspectorProtocolError(
                    'INVALID_PAYLOAD',
                    'El primer candidato debe ser el selector primario visible',
                );
            }
            const identities = candidates.map(candidate =>
                `${candidate.strategy.trim().toLowerCase()}\u0000${candidate.selector.trim()}`,
            );
            if (
                new Set(identities).size !== identities.length
                || new Set(candidates.map(candidate => candidate.candidateId)).size !== candidates.length
            ) {
                throw new EmbeddedInspectorProtocolError(
                    'INVALID_PAYLOAD',
                    "'candidates' no admite selectores ni candidateId duplicados",
                );
            }
            const payload: EmbeddedInspectorElementUsed = {
                strategy,
                selector,
                attributes: stringRecord(message.payload.attributes, 'attributes'),
                candidates,
            };
            const elementId = optionalString(message.payload.elementId, 'elementId');
            const tag = optionalString(message.payload.tag, 'tag');
            const screenshot = optionalString(message.payload.screenshot, 'screenshot');
            const source = optionalString(message.payload.source, 'source');
            if (elementId) payload.elementId = elementId;
            if (tag) payload.tag = tag;
            if (screenshot) payload.screenshot = screenshot;
            if (source) payload.source = source;
            return {
                channel: EMBEDDED_INSPECTOR_CHANNEL,
                version: EMBEDDED_INSPECTOR_VERSION,
                type: EMBEDDED_INSPECTOR_TYPES.ELEMENT_USED,
                payload,
            };
        }
        default:
            throw new EmbeddedInspectorProtocolError(
                'INVALID_MESSAGE_TYPE',
                `Tipo de mensaje no soportado '${String(message.type)}'`,
            );
    }
}

const STRATEGY_PREFIXES: Record<string, string> = {
    'accessibility id': '~',
    id: 'id=',
    'class name': 'class=',
    '-android uiautomator': 'android=',
    '-ios predicate string': 'iosPredicate=',
    '-ios class chain': 'iosClassChain=',
    xpath: '',
};

export function recorderSelectorFromInspector(
    elementUsed: Pick<EmbeddedInspectorElementUsed, 'strategy' | 'selector'>,
): string {
    const strategy = elementUsed.strategy.trim().toLowerCase();
    const prefix = STRATEGY_PREFIXES[strategy];
    if (prefix === undefined) {
        throw new EmbeddedInspectorProtocolError(
            'UNSUPPORTED_SELECTOR_STRATEGY',
            `Estrategia de selector no soportada: ${elementUsed.strategy}`,
        );
    }
    return `${prefix}${elementUsed.selector}`;
}

export class EmbeddedInspectorHandshake {
    private state: 'waiting-ready' | 'connecting' | 'connected' = 'waiting-ready';

    constructor(
        private readonly connection: EmbeddedInspectorConnection,
        private readonly sendConnect: (message: EmbeddedInspectorConnectMessage) => void,
        private readonly onConnected: () => void,
        private readonly onElementUsed: (elementUsed: EmbeddedInspectorElementUsed) => void,
        private readonly onError: (error: EmbeddedInspectorError) => void,
    ) {}

    handle(data: unknown): void {
        const message = validateEmbeddedInspectorMessage(data);
        if (message.type === EMBEDDED_INSPECTOR_TYPES.READY) {
            if (this.state !== 'waiting-ready') {
                throw new EmbeddedInspectorProtocolError('DUPLICATE_READY', 'Inspector envió ready más de una vez');
            }
            this.state = 'connecting';
            this.sendConnect(createEmbeddedInspectorConnectMessage(this.connection));
            return;
        }
        if (message.type === EMBEDDED_INSPECTOR_TYPES.CONNECTED) {
            if (this.state !== 'connecting' || message.payload.sessionId !== this.connection.sessionId) {
                throw new EmbeddedInspectorProtocolError('SESSION_MISMATCH', 'Inspector confirmó una sesión distinta');
            }
            this.state = 'connected';
            this.onConnected();
            return;
        }
        if (message.type === EMBEDDED_INSPECTOR_TYPES.ERROR) {
            this.onError(message.payload);
            return;
        }
        if (this.state !== 'connected') {
            throw new EmbeddedInspectorProtocolError(
                'INVALID_MESSAGE_ORDER',
                'Inspector intentó usar un elemento antes de confirmar la conexión',
            );
        }
        this.onElementUsed(message.payload);
    }
}
