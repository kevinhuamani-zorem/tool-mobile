import { frameworkContract } from './frameworkContract';
import { frameworkHelpersOf } from './frameworkHelpers';
import { projectPaths } from './projectPaths';

/**
 * `workspace` no importa `indexing` ni `automation/contracts` en este
 * archivo (ver ADR-0001, "retiro de fachadas"): `indexing` depende de
 * `workspace` (`projectPaths`, `frameworkContract`) para ubicar y describir
 * el árbol del framework, así que un import inverso aquí cerraría un ciclo
 * entre ambos módulos. `FrameworkQueryName` y las formas de `CodeGraph` se
 * espejan localmente — estructuralmente idénticas a
 * `automation/contracts/FrameworkContextQuery` e
 * `indexing/infrastructure/codeGraph` — y quien construye este servicio
 * (composition root o `automation/infrastructure/agentOrchestrator.ts`, que
 * sí puede depender de `indexing`) inyecta el `CodeGraph` real: la
 * tipificación estructural de TypeScript acepta esa instancia real sin
 * ningún adaptador de por medio.
 */
export type FrameworkQueryName =
    | 'inspectScenario'
    | 'findExistingScreen'
    | 'findExistingStep'
    | 'findExample'
    | 'findLocator'
    | 'getContract'
    | 'getHelperApi'
    | 'validateImports';

type CodeNodeType =
    | 'feature' | 'scenario' | 'gherkinStep' | 'exampleTable'
    | 'stepDefinition' | 'screenObject' | 'method' | 'locator'
    | 'module' | 'component' | 'service' | 'ipcChannel'
    | 'domElement' | 'script' | 'test';
type CodeEdgeType =
    | 'contains' | 'matches' | 'calls' | 'uses'
    | 'imports' | 'handles' | 'invokes' | 'binds' | 'covers';

export interface CodeGraphNode {
    id: string;
    type: CodeNodeType;
    name: string;
    file: string;
    squad: string;
    text?: string;
    metadata?: Record<string, string | boolean | number | string[]>;
}

export interface CodeGraphEdge {
    from: string;
    to: string;
    type: CodeEdgeType;
}

export interface CodeGraphBuildMetrics {
    cacheHit: boolean;
    filesExamined: number;
    filesRead: number;
    bytesRead: number;
    indexedFiles: number;
    reindexedFiles: number;
    indexDurationMs: number;
}

export interface CodeGraphSnapshot {
    revision: string;
    files: string[];
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
    metrics: CodeGraphBuildMetrics;
}

/** Forma mínima que `FrameworkQueryService` necesita de `indexing.CodeGraph`. */
export interface CodeGraphLike {
    snapshot(): CodeGraphSnapshot;
}

export interface FrameworkQueryInput {
    squad?: string;
    term?: string;
    symbol?: string;
    intent?: string;
    path?: string;
    imports?: string[];
    limit?: number;
    maxBytes?: number;
}

export interface FrameworkQueryItem {
    type: string;
    name: string;
    path?: string;
    symbol?: string;
    signature?: string;
    text?: string;
    scope?: string;
    metadata?: Record<string, unknown>;
}

export interface FrameworkQueryMetrics {
    durationMs: number;
    indexDurationMs: number;
    cacheHit: boolean;
    filesExamined: number;
    filesRead: number;
    bytesRead: number;
    resultCount: number;
    returnedBytes: number;
    truncated: boolean;
}

export interface FrameworkQueryResponse {
    schemaVersion: 1;
    query: FrameworkQueryName;
    success: boolean;
    items: FrameworkQueryItem[];
    relations: Array<{ from: string; to: string; type: string }>;
    metrics: FrameworkQueryMetrics;
    error?: { code: string; message: string };
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 50;
const MIN_BYTES = 768;
const MAX_BYTES = 200_000;
const FRAMEWORK_QUERY_INPUT_FIELDS = [
    'squad',
    'term',
    'symbol',
    'intent',
    'path',
    'imports',
    'limit',
    'maxBytes',
] as const;
type FrameworkQueryInputField = typeof FRAMEWORK_QUERY_INPUT_FIELDS[number];
const FRAMEWORK_QUERY_INPUT_TYPES: Record<FrameworkQueryInputField, string> = {
    squad: 'string',
    term: 'string',
    symbol: 'string',
    intent: 'string',
    path: 'string',
    imports: 'string[]',
    limit: 'number',
    maxBytes: 'number',
};

function validFieldsMessage(): string {
    return FRAMEWORK_QUERY_INPUT_FIELDS
        .map(field => `${field}:${FRAMEWORK_QUERY_INPUT_TYPES[field]}`)
        .join(', ');
}

export function frameworkQueryInputSchema() {
    return { ...FRAMEWORK_QUERY_INPUT_TYPES };
}

export function validateFrameworkQueryInput(input: Record<string, unknown>): {
    valid: boolean;
    message?: string;
} {
    const allowed = new Set<string>(FRAMEWORK_QUERY_INPUT_FIELDS);
    const unknown = Object.keys(input).filter(key => !allowed.has(key));
    if (unknown.length) {
        return {
            valid: false,
            message: `Argumentos no soportados: ${unknown.join(', ')}. ` +
                `Campos válidos: ${validFieldsMessage()}.`,
        };
    }
    if (input.squad !== undefined && typeof input.squad !== 'string') {
        return { valid: false, message: `squad debe ser string. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.term !== undefined && typeof input.term !== 'string') {
        return { valid: false, message: `term debe ser string. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.symbol !== undefined && typeof input.symbol !== 'string') {
        return { valid: false, message: `symbol debe ser string. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.intent !== undefined && typeof input.intent !== 'string') {
        return { valid: false, message: `intent debe ser string. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.path !== undefined && typeof input.path !== 'string') {
        return { valid: false, message: `path debe ser string. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.imports !== undefined && (!Array.isArray(input.imports) || input.imports.some(value => typeof value !== 'string'))) {
        return { valid: false, message: `imports debe ser string[]. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.limit !== undefined && (typeof input.limit !== 'number' || !Number.isFinite(input.limit))) {
        return { valid: false, message: `limit debe ser number. Campos válidos: ${validFieldsMessage()}.` };
    }
    if (input.maxBytes !== undefined && (typeof input.maxBytes !== 'number' || !Number.isFinite(input.maxBytes))) {
        return { valid: false, message: `maxBytes debe ser number. Campos válidos: ${validFieldsMessage()}.` };
    }
    return { valid: true };
}

function tokens(value = ''): Set<string> {
    return new Set(value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/).filter(token => token.length >= 2));
}

function scopeOrder(squad: string): string[] {
    return [...new Set([squad, 'commons', 'home', 'global'].filter(Boolean))];
}

function nodeItem(node: CodeGraphNode): FrameworkQueryItem {
    const signature = typeof node.metadata?.signature === 'string'
        ? node.metadata.signature
        : undefined;
    return {
        type: node.type,
        name: node.name,
        path: node.file,
        symbol: node.name,
        signature,
        ...(node.text ? { text: node.text } : {}),
        scope: node.squad,
        ...(node.metadata ? { metadata: node.metadata } : {}),
    };
}

function rank(nodes: CodeGraphNode[], input: FrameworkQueryInput): CodeGraphNode[] {
    const squad = input.squad || 'global';
    const scopes = scopeOrder(squad);
    const wanted = tokens(`${input.term || ''} ${input.symbol || ''} ${input.intent || ''} ${input.path || ''}`);
    const moduleHint = (input.path || '').split('/').pop()
        ?.replace(/\.locator\.json$/i, '')
        ?.replace(/\.screen\.(ts|js)$/i, '')
        ?.toLowerCase();
    return nodes.filter(node => scopes.includes(node.squad)).map(node => {
        const found = tokens(`${node.name} ${node.text || ''} ${node.file}`);
        const overlap = [...wanted].filter(token => found.has(token)).length;
        const exact = input.path && node.file === input.path ? 100 : 0;
        const moduleMatch = moduleHint && (
            node.file.toLowerCase().includes(`/${moduleHint}.`)
            || node.file.toLowerCase().includes(`/${moduleHint}/`)
        ) ? 25 : 0;
        return { node, score: exact + moduleMatch + overlap * 10 + (scopes.length - scopes.indexOf(node.squad)) };
    }).filter(candidate => !wanted.size || candidate.score > scopes.length)
        .sort((left, right) => right.score - left.score
            || scopes.indexOf(left.node.squad) - scopes.indexOf(right.node.squad)
            || left.node.file.localeCompare(right.node.file)
            || left.node.name.localeCompare(right.node.name))
        .map(candidate => candidate.node);
}

function overlapCount(left: Set<string>, right: Set<string>): number {
    let total = 0;
    for (const token of left) if (right.has(token)) total += 1;
    return total;
}

function screenNodesFromLocatorContext(
    snapshot: CodeGraphSnapshot,
    input: FrameworkQueryInput,
): CodeGraphNode[] {
    const pathHint = (input.path || '').replace(/\\/g, '/');
    const symbol = (input.symbol || input.term || '').trim();
    if (!pathHint && !symbol) return [];
    const locatorNodes = snapshot.nodes.filter(node =>
        node.type === 'locator' && (
            (pathHint && node.file === pathHint)
            || (symbol && node.name === symbol)
        )
    );
    if (!locatorNodes.length) return [];
    const methodById = new Map(snapshot.nodes
        .filter(node => node.type === 'method')
        .map(node => [node.id, node]));
    const screenById = new Map(snapshot.nodes
        .filter(node => node.type === 'screenObject')
        .map(node => [node.id, node]));
    const containingScreenByMethod = new Map<string, CodeGraphNode>();
    for (const edge of snapshot.edges) {
        if (edge.type !== 'contains') continue;
        const screen = screenById.get(edge.from);
        if (!screen) continue;
        if (methodById.has(edge.to)) containingScreenByMethod.set(edge.to, screen);
    }
    const locatorIds = new Set(locatorNodes.map(node => node.id));
    const wanted = tokens(`${input.term || ''} ${input.symbol || ''} ${input.intent || ''} ${input.path || ''}`);
    const hits = new Map<string, { node: CodeGraphNode; score: number }>();
    for (const edge of snapshot.edges) {
        if (edge.type !== 'uses' || !locatorIds.has(edge.to)) continue;
        const method = methodById.get(edge.from);
        if (!method) continue;
        const scopeScore = scopeOrder(input.squad || 'global').includes(method.squad) ? 1 : 0;
        const methodTokens = tokens(`${method.name} ${method.file}`);
        const score = 100 + overlapCount(wanted, methodTokens) * 10 + scopeScore;
        const best = hits.get(method.id);
        if (!best || score > best.score) hits.set(method.id, { node: method, score });
        const screen = containingScreenByMethod.get(method.id);
        if (screen) {
            const screenTokens = tokens(`${screen.name} ${screen.file}`);
            const screenScore = 95 + overlapCount(wanted, screenTokens) * 8 + scopeScore;
            const current = hits.get(screen.id);
            if (!current || screenScore > current.score) hits.set(screen.id, { node: screen, score: screenScore });
        }
    }
    return [...hits.values()]
        .sort((left, right) => right.score - left.score
            || left.node.file.localeCompare(right.node.file)
            || left.node.name.localeCompare(right.node.name))
        .map(entry => entry.node);
}

export class FrameworkQueryService {
    constructor(
        private readonly graph: CodeGraphLike,
        private readonly frameworkRoot = projectPaths.frameworkRoot,
    ) {}

    inspectScenario(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('inspectScenario', input);
    }
    findExistingScreen(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('findExistingScreen', input);
    }
    findExistingStep(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('findExistingStep', input);
    }
    findExample(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('findExample', input);
    }
    findLocator(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('findLocator', input);
    }
    getContract(input: FrameworkQueryInput = {}): FrameworkQueryResponse {
        return this.execute('getContract', input);
    }
    getHelperApi(input: FrameworkQueryInput = {}): FrameworkQueryResponse {
        return this.execute('getHelperApi', input);
    }
    validateImports(input: FrameworkQueryInput): FrameworkQueryResponse {
        return this.execute('validateImports', input);
    }

    execute(query: FrameworkQueryName, input: FrameworkQueryInput = {}): FrameworkQueryResponse {
        const started = process.hrtime.bigint();
        const normalizedInput = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
        const argsValidation = validateFrameworkQueryInput(normalizedInput);
        if (!argsValidation.valid) {
            return {
                schemaVersion: 1,
                query,
                success: false,
                items: [],
                relations: [],
                metrics: {
                    durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
                    indexDurationMs: 0,
                    cacheHit: false,
                    filesExamined: 0,
                    filesRead: 0,
                    bytesRead: 0,
                    resultCount: 0,
                    returnedBytes: 0,
                    truncated: false,
                },
                error: { code: 'invalid-query-args', message: argsValidation.message || 'Argumentos inválidos.' },
            };
        }
        const limit = Math.max(1, Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT));
        const maxBytes = input.maxBytes == null
            ? undefined
            : Math.max(MIN_BYTES, Math.min(input.maxBytes, MAX_BYTES));
        let snapshot: CodeGraphSnapshot | undefined;
        try {
            snapshot = this.graph.snapshot();
            let nodes: CodeGraphNode[] = [];
            let directItems: FrameworkQueryItem[] | undefined;
            if (query === 'inspectScenario') nodes = rank(snapshot.nodes.filter(node =>
                node.type === 'scenario' || node.type === 'gherkinStep'), input);
            else if (query === 'findExistingScreen') {
                const targeted = screenNodesFromLocatorContext(snapshot, input);
                if (targeted.length) {
                    const rest = rank(snapshot.nodes.filter(node =>
                        (node.type === 'screenObject' || node.type === 'method')
                        && !targeted.some(candidate => candidate.id === node.id)
                    ), input);
                    nodes = [...targeted, ...rest];
                } else {
                    nodes = rank(snapshot.nodes.filter(node =>
                        node.type === 'screenObject' || node.type === 'method'), input);
                }
            }
            else if (query === 'findExistingStep') nodes = rank(snapshot.nodes.filter(node =>
                node.type === 'stepDefinition'), input);
            else if (query === 'findExample') {
                const matchingScenarios = new Set(rank(snapshot.nodes.filter(node =>
                    node.type === 'scenario'), input).map(node => node.id));
                const exampleIds = new Set(snapshot.edges.filter(edge =>
                    edge.type === 'contains' && matchingScenarios.has(edge.from)
                ).map(edge => edge.to));
                nodes = snapshot.nodes.filter(node =>
                    node.type === 'exampleTable' && exampleIds.has(node.id));
                if (!nodes.length) nodes = rank(snapshot.nodes.filter(node => node.type === 'exampleTable'), input);
            }
            else if (query === 'findLocator') nodes = rank(snapshot.nodes.filter(node =>
                node.type === 'locator'), input);
            else if (query === 'getContract') {
                const contract = frameworkContract(this.frameworkRoot);
                directItems = [{
                    type: 'frameworkContract', name: 'fwk-mobile',
                    metadata: {
                        aliases: contract.aliases,
                        baseScreenImport: contract.baseScreenImport,
                        baseScreenClass: contract.baseScreenClass,
                        locatorFactoryImport: contract.locatorFactoryImport,
                        locatorFactorySymbol: contract.locatorFactorySymbol,
                        typeLocatorImport: contract.typeLocatorImport,
                        typeLocatorSymbol: contract.typeLocatorSymbol,
                        locatorSignature: contract.locatorSignature,
                        importExtension: contract.importExtension,
                        warnings: contract.warnings,
                    },
                }];
            } else if (query === 'getHelperApi') {
                directItems = frameworkHelpersOf(this.frameworkRoot).map(helper => ({
                    type: 'helper', name: helper.property, symbol: helper.className,
                    metadata: { methods: helper.methods },
                }));
            } else if (query === 'validateImports') {
                directItems = this.importItems(input.imports || []);
            } else {
                throw new Error(`Consulta no soportada: ${query}`);
            }

            const candidates = (directItems || nodes.map(nodeItem)).slice(0, limit);
            const nodeIds = new Set(nodes.slice(0, limit).map(node => node.id));
            const relations = snapshot.edges.filter(edge =>
                nodeIds.has(edge.from) || nodeIds.has(edge.to)
            ).slice(0, limit * 2).map(edge => this.relation(edge, snapshot!));
            return this.bounded(query, candidates, relations, snapshot, started, maxBytes);
        } catch (error) {
            const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
            return {
                schemaVersion: 1, query, success: false, items: [], relations: [],
                metrics: {
                    durationMs,
                    indexDurationMs: snapshot?.metrics.indexDurationMs || 0,
                    cacheHit: snapshot?.metrics.cacheHit || false,
                    filesExamined: snapshot?.metrics.filesExamined || 0,
                    filesRead: snapshot?.metrics.filesRead || 0,
                    bytesRead: snapshot?.metrics.bytesRead || 0,
                    resultCount: 0,
                    returnedBytes: 0,
                    truncated: false,
                },
                error: { code: 'framework-query-failed', message: error instanceof Error ? error.message : String(error) },
            };
        }
    }

    private importItems(imports: string[]): FrameworkQueryItem[] {
        const contract = frameworkContract(this.frameworkRoot);
        const aliases = Object.keys(contract.aliases).sort((a, b) => b.length - a.length);
        return imports.map(specifier => {
            const relative = specifier.startsWith('.');
            const alias = aliases.find(candidate => specifier === candidate || specifier.startsWith(`${candidate}/`));
            const packageImport = !relative && !specifier.startsWith('@') || /^@(?:wdio|cucumber)\//.test(specifier);
            return {
                type: 'importValidation', name: specifier,
                metadata: {
                    valid: Boolean(alias || packageImport),
                    alias: alias || '',
                    issue: relative ? 'relative-framework-import' : (!alias && !packageImport ? 'unknown-alias' : ''),
                },
            };
        });
    }

    private relation(edge: CodeGraphEdge, snapshot: CodeGraphSnapshot) {
        const byId = new Map(snapshot.nodes.map(node => [node.id, node]));
        const describe = (id: string) => {
            const node = byId.get(id);
            return node ? `${node.file}#${node.name}` : id;
        };
        return { from: describe(edge.from), to: describe(edge.to), type: edge.type };
    }

    private bounded(
        query: FrameworkQueryName,
        candidates: FrameworkQueryItem[],
        relations: Array<{ from: string; to: string; type: string }>,
        snapshot: CodeGraphSnapshot,
        started: bigint,
        maxBytes?: number,
    ): FrameworkQueryResponse {
        if (maxBytes == null) {
            const response: FrameworkQueryResponse = {
                schemaVersion: 1,
                query,
                success: true,
                items: [...candidates],
                relations: [...relations],
                metrics: {
                    durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
                    indexDurationMs: snapshot.metrics.indexDurationMs,
                    cacheHit: snapshot.metrics.cacheHit,
                    filesExamined: snapshot.metrics.filesExamined,
                    filesRead: snapshot.metrics.filesRead,
                    bytesRead: snapshot.metrics.bytesRead,
                    resultCount: candidates.length,
                    returnedBytes: 0,
                    truncated: false,
                },
            };
            response.metrics.returnedBytes = Buffer.byteLength(JSON.stringify(response), 'utf-8');
            return response;
        }
        const items: FrameworkQueryItem[] = [];
        const keptRelations: typeof relations = [];
        let truncated = false;
        const base = (candidateItems: FrameworkQueryItem[], candidateRelations: typeof relations): FrameworkQueryResponse => ({
            schemaVersion: 1, query, success: true, items: candidateItems, relations: candidateRelations,
            metrics: {
                durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
                indexDurationMs: snapshot.metrics.indexDurationMs,
                cacheHit: snapshot.metrics.cacheHit,
                filesExamined: snapshot.metrics.filesExamined,
                filesRead: snapshot.metrics.filesRead,
                bytesRead: snapshot.metrics.bytesRead,
                resultCount: candidateItems.length,
                returnedBytes: 0,
                truncated,
            },
        });
        for (const item of candidates) {
            const next = base([...items, item], keptRelations);
            if (Buffer.byteLength(JSON.stringify(next), 'utf-8') > maxBytes) { truncated = true; break; }
            items.push(item);
        }
        for (const relation of relations) {
            const next = base(items, [...keptRelations, relation]);
            if (Buffer.byteLength(JSON.stringify(next), 'utf-8') > maxBytes) { truncated = true; break; }
            keptRelations.push(relation);
        }
        let response = base(items, keptRelations);
        response.metrics.returnedBytes = Buffer.byteLength(JSON.stringify(response), 'utf-8');
        while (response.metrics.returnedBytes > maxBytes && (keptRelations.length || items.length)) {
            truncated = true;
            if (keptRelations.length) keptRelations.pop();
            else items.pop();
            response = base(items, keptRelations);
            response.metrics.returnedBytes = Buffer.byteLength(JSON.stringify(response), 'utf-8');
        }
        return response;
    }
}

export const frameworkQueryDefaults = {
    limit: DEFAULT_LIMIT,
    maxBytes: undefined,
    maxLimit: MAX_LIMIT,
    maxResponseBytes: MAX_BYTES,
};
