import { CodeGraph, CodeGraphEdge, CodeGraphNode, CodeGraphSnapshot } from './codeGraph';
import { frameworkContract } from './frameworkContract';
import { frameworkHelpersOf } from './frameworkHelpers';
import { projectPaths } from './projectPaths';
import type { FrameworkContextQuery } from './automationContracts';

export type FrameworkQueryName = FrameworkContextQuery;

export interface FrameworkQueryInput {
    squad?: string;
    term?: string;
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

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_BYTES = 8_192;
const MIN_BYTES = 768;
const MAX_BYTES = 20_000;

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
    const wanted = tokens(`${input.term || ''} ${input.path || ''}`);
    return nodes.filter(node => scopes.includes(node.squad)).map(node => {
        const found = tokens(`${node.name} ${node.text || ''} ${node.file}`);
        const overlap = [...wanted].filter(token => found.has(token)).length;
        const exact = input.path && node.file === input.path ? 100 : 0;
        return { node, score: exact + overlap * 10 + (scopes.length - scopes.indexOf(node.squad)) };
    }).filter(candidate => !wanted.size || candidate.score > scopes.length)
        .sort((left, right) => right.score - left.score
            || scopes.indexOf(left.node.squad) - scopes.indexOf(right.node.squad)
            || left.node.file.localeCompare(right.node.file)
            || left.node.name.localeCompare(right.node.name))
        .map(candidate => candidate.node);
}

export class FrameworkQueryService {
    constructor(
        private readonly graph = new CodeGraph(),
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
        const limit = Math.max(1, Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT));
        const maxBytes = Math.max(MIN_BYTES, Math.min(input.maxBytes || DEFAULT_BYTES, MAX_BYTES));
        let snapshot: CodeGraphSnapshot | undefined;
        try {
            snapshot = this.graph.snapshot();
            let nodes: CodeGraphNode[] = [];
            let directItems: FrameworkQueryItem[] | undefined;
            if (query === 'inspectScenario') nodes = rank(snapshot.nodes.filter(node =>
                node.type === 'scenario' || node.type === 'gherkinStep'), input);
            else if (query === 'findExistingScreen') nodes = rank(snapshot.nodes.filter(node =>
                node.type === 'screenObject' || node.type === 'method'), input);
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
            return this.bounded(query, candidates, relations, snapshot, started, maxBytes,
                (directItems || nodes).length > limit);
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
        maxBytes: number,
        initiallyTruncated: boolean,
    ): FrameworkQueryResponse {
        const items: FrameworkQueryItem[] = [];
        const keptRelations: typeof relations = [];
        let truncated = initiallyTruncated;
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
    maxBytes: DEFAULT_BYTES,
    maxLimit: MAX_LIMIT,
    maxResponseBytes: MAX_BYTES,
};
