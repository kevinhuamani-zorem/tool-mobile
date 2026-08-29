import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';
import { RecordedStep, recordedStepContext } from './models';
import { locatorKeysIn } from './locatorReferences';
import { importsOf } from './locatorStrategy';

export type CodeNodeType =
    | 'feature' | 'scenario' | 'gherkinStep' | 'exampleTable'
    | 'stepDefinition' | 'screenObject' | 'method' | 'locator'
    | 'module' | 'component' | 'service' | 'ipcChannel'
    | 'domElement' | 'script' | 'test';
export type CodeEdgeType =
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

interface CachedFile {
    mtimeMs: number;
    size: number;
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
}

interface CodeGraphCache {
    version: 2;
    builtAt: string;
    files: Record<string, CachedFile>;
}

export interface CodeSubgraph {
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
    metrics: {
        totalNodes: number;
        selectedNodes: number;
        totalEdges: number;
        selectedEdges: number;
        contextReduction: number;
        indexedFiles: number;
        reindexedFiles: number;
        cacheHit?: boolean;
        filesExamined?: number;
        filesRead?: number;
        bytesRead?: number;
        indexDurationMs?: number;
    };
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

export interface CodeGraphOptions {
    frameworkRoot?: string;
    featureRoot?: string;
    stepDefinitionsRoot?: string;
    screenobjectsRoot?: string;
    locatorsRoot?: string;
    cacheFile?: string;
}

const supportedExtensions = new Set(['.feature', '.ts', '.json']);

function walk(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const output: string[] = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(full);
            else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) {
                output.push(full);
            }
        }
    }
    return output.sort();
}


/**
 * Cuerpo de una llamada empezando en `openIndex`, balanceando llaves.
 * Sirve para quedarse con el cuerpo de UN step definition o de UN metodo, en vez
 * de mirar el archivo entero.
 */
/** Palabras clave con forma de metodo: `if (...) {`, `catch (e) {`. */
const CONTROL_KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'catch', 'try', 'finally',
    'return', 'function', 'typeof', 'await', 'new', 'delete', 'void',
]);

function bodyFrom(content: string, openIndex: number): string {
    const start = content.indexOf('{', openIndex);
    if (start < 0) return '';
    let depth = 0;
    for (let index = start; index < content.length; index++) {
        const character = content[index];
        if (character === '{') depth++;
        else if (character === '}') {
            depth--;
            if (depth === 0) return content.slice(start + 1, index);
        }
    }
    return content.slice(start + 1);
}

/** `@screenobjects/x/y.screen.js` o `../x/y.screen.ts` -> `screenobjects/x/y.screen.ts`. */
function resolveScreenSpecifier(fromFile: string, specifier: string): string | undefined {
    if (!/\.screen\.(?:ts|js)$/.test(specifier)) return undefined;
    const normalized = specifier.replace(/\.js$/, '.ts');
    if (normalized.startsWith('.')) {
        return path.posix.normalize(
            path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, '/')), normalized)
        );
    }
    // Cualquier alias que apunte a screenobjects: se conserva desde ese segmento.
    const match = normalized.match(/screenobjects\/(.+)$/);
    return match ? `screenobjects/${match[1]}` : undefined;
}

/** Alias importado -> archivo del Screen Object, para un archivo de steps. */
function screenImports(fromFile: string, content: string): Map<string, string> {
    const found = new Map<string, string>();
    for (const [, identifier, specifier] of content.matchAll(
        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g
    )) {
        const file = resolveScreenSpecifier(fromFile, specifier);
        if (file) found.set(identifier, file);
    }
    return found;
}

function nodeId(type: CodeNodeType, file: string, name: string, index = 0): string {
    return `${type}:${file}:${name}:${index}`;
}

function squadFrom(file: string): string {
    const normalized = file.replace(/\\/g, '/');
    for (const root of [
        'features/yape-features/',
        'features/yape-steps-definitions/',
        'screenobjects/',
        'resources/locators/'
    ]) {
        if (normalized.startsWith(root)) return normalized.slice(root.length).split('/')[0] || 'global';
    }
    return 'global';
}

function words(value: string): Set<string> {
    return new Set(value.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 3));
}

export class CodeGraph {
    private cache: CodeGraphCache = { version: 2, builtAt: '', files: {} };
    private reindexedFiles = 0;
    private buildMetrics: CodeGraphBuildMetrics = {
        cacheHit: false,
        filesExamined: 0,
        filesRead: 0,
        bytesRead: 0,
        indexedFiles: 0,
        reindexedFiles: 0,
        indexDurationMs: 0,
    };
    private readonly frameworkRoot: string;
    private readonly roots: string[];
    private readonly cacheFile: string;
    private readFiles = new Set<string>();
    private dependentsIndex?: {
        allNodes: CodeGraphNode[];
        allEdges: CodeGraphEdge[];
        byId: Map<string, CodeGraphNode>;
    };

    constructor(options: CodeGraphOptions = {}) {
        this.frameworkRoot = options.frameworkRoot || projectPaths.frameworkRoot;
        this.roots = [
            options.featureRoot || (options.frameworkRoot
                ? path.join(options.frameworkRoot, 'features/yape-features') : projectPaths.features),
            options.stepDefinitionsRoot || (options.frameworkRoot
                ? path.join(options.frameworkRoot, 'features/yape-steps-definitions') : projectPaths.stepDefinitions),
            options.screenobjectsRoot || (options.frameworkRoot
                ? path.join(options.frameworkRoot, 'screenobjects') : projectPaths.screenobjects),
            options.locatorsRoot || (options.frameworkRoot
                ? path.join(options.frameworkRoot, 'resources/locators') : projectPaths.locators),
        ];
        this.cacheFile = options.cacheFile || (options.frameworkRoot
            ? path.join(options.frameworkRoot, '.visual-recorder-codegraph.json')
            : projectPaths.codeGraphCache);
    }

    build(): void {
        const started = process.hrtime.bigint();
        const previous = this.readCache();
        const files = this.roots.flatMap(walk);
        const nextFiles: Record<string, CachedFile> = {};
        this.reindexedFiles = 0;
        this.readFiles = new Set();
        this.buildMetrics = {
            cacheHit: false,
            filesExamined: files.length,
            filesRead: 0,
            bytesRead: 0,
            indexedFiles: files.length,
            reindexedFiles: 0,
            indexDurationMs: 0,
        };

        for (const absolute of files) {
            const relative = path.relative(this.frameworkRoot, absolute).replace(/\\/g, '/');
            const stat = fs.statSync(absolute);
            const cached = previous.files[relative];
            if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                nextFiles[relative] = cached;
                continue;
            }
            const parsed = this.parseFile(absolute, relative);
            nextFiles[relative] = {
                mtimeMs: stat.mtimeMs,
                size: stat.size,
                ...parsed
            };
            this.reindexedFiles += 1;
        }

        this.cache = {
            version: 2,
            builtAt: new Date().toISOString(),
            files: nextFiles
        };
        if (this.reindexedFiles === 0 && previous.files.__derived__) {
            this.cache.files.__derived__ = previous.files.__derived__;
        } else {
            this.addDerivedEdges();
        }
        this.dependentsIndex = undefined;
        this.writeCache();
        this.buildMetrics.cacheHit = this.reindexedFiles === 0 && Object.keys(previous.files).length > 0;
        this.buildMetrics.reindexedFiles = this.reindexedFiles;
        this.buildMetrics.indexDurationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    }

    snapshot(): CodeGraphSnapshot {
        this.build();
        const entries = Object.entries(this.cache.files).filter(([file]) => file !== '__derived__');
        const files = entries.map(([file]) => file).sort();
        const nodes = Object.values(this.cache.files).flatMap(file => file.nodes);
        const edges = Object.values(this.cache.files).flatMap(file => file.edges);
        const revision = files.map(file => {
            const cached = this.cache.files[file];
            return `${file}:${cached.mtimeMs}:${cached.size}`;
        }).join('|');
        return { revision, files, nodes, edges, metrics: { ...this.buildMetrics } };
    }

    /**
     * Travesia determinista desde unas semillas.
     *
     * A diferencia de `query`, que rankea por coincidencia de palabras, aqui se
     * sigue el grafo: se parte de archivos concretos y se recorren sus aristas.
     * Con las relaciones resueltas por sentencia el subgrafo de una pantalla se
     * queda en su squad, asi que sirve para acotar contexto sin recortar nada
     * relevante.
     */
    subgraphOf(input: { files?: string[]; ids?: string[]; depth?: number }): CodeSubgraph {
        this.build();
        const allNodes = Object.values(this.cache.files).flatMap(file => file.nodes);
        const allEdges = Object.values(this.cache.files).flatMap(file => file.edges);
        const byId = new Map(allNodes.map(node => [node.id, node]));
        const wanted = new Set((input.files || []).map(file => file.replace(/\\/g, '/')));
        const seeds = new Set<string>(input.ids || []);
        for (const node of allNodes) {
            if (wanted.has(node.file)) seeds.add(node.id);
        }
        const adjacency = new Map<string, string[]>();
        for (const edge of allEdges) {
            if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
            if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
            adjacency.get(edge.from)!.push(edge.to);
            adjacency.get(edge.to)!.push(edge.from);
        }
        const visited = new Set(seeds);
        let frontier = [...seeds];
        const depth = Math.max(1, Math.min(input.depth ?? 2, 6));
        for (let hop = 0; hop < depth; hop++) {
            const next: string[] = [];
            for (const id of frontier) {
                for (const neighbour of adjacency.get(id) || []) {
                    if (visited.has(neighbour)) continue;
                    visited.add(neighbour);
                    next.push(neighbour);
                }
            }
            frontier = next;
        }
        const nodes = [...visited].map(id => byId.get(id)).filter((node): node is CodeGraphNode => Boolean(node));
        const edges = allEdges.filter(edge => visited.has(edge.from) && visited.has(edge.to));
        return {
            nodes,
            edges,
            metrics: {
                totalNodes: allNodes.length,
                selectedNodes: nodes.length,
                totalEdges: allEdges.length,
                selectedEdges: edges.length,
                contextReduction: allNodes.length === 0 ? 0 : Math.max(0, 1 - nodes.length / allNodes.length),
                indexedFiles: Object.keys(this.cache.files).filter(file => file !== '__derived__').length,
                reindexedFiles: this.reindexedFiles,
                cacheHit: this.buildMetrics.cacheHit,
                filesExamined: this.buildMetrics.filesExamined,
                filesRead: this.buildMetrics.filesRead,
                bytesRead: this.buildMetrics.bytesRead,
                indexDurationMs: this.buildMetrics.indexDurationMs,
            },
        };
    }

    /**
     * Quien mas depende de un locator: Screen Objects que lo usan y Steps que
     * llaman a esos metodos. Es el radio de impacto de reutilizarlo o cambiarlo.
     */
    dependentsOfLocator(locatorFile: string, name: string): { screens: string[]; steps: string[] } {
        this.build();
        // Se memoiza: declarar veinte elementos hacia veinte recorridos completos.
        if (!this.dependentsIndex) {
            const allNodes = Object.values(this.cache.files).flatMap(file => file.nodes);
            const allEdges = Object.values(this.cache.files).flatMap(file => file.edges);
            this.dependentsIndex = { allNodes, allEdges, byId: new Map(allNodes.map(node => [node.id, node])) };
        }
        const { allNodes, allEdges, byId } = this.dependentsIndex;
        const target = allNodes.find(node =>
            node.type === 'locator' && node.name === name && node.file === locatorFile);
        if (!target) return { screens: [], steps: [] };
        const methodIds = allEdges
            .filter(edge => edge.type === 'uses' && edge.to === target.id)
            .map(edge => edge.from);
        const screens = new Set<string>();
        for (const id of methodIds) {
            const method = byId.get(id);
            if (method) screens.add(method.file);
        }
        const steps = new Set<string>();
        const methods = new Set(methodIds);
        for (const edge of allEdges) {
            if (edge.type !== 'calls' || !methods.has(edge.to)) continue;
            const definition = byId.get(edge.from);
            if (definition) steps.add(definition.file);
        }
        return { screens: [...screens].sort(), steps: [...steps].sort() };
    }

    query(input: {
        squad: string;
        actions: RecordedStep[];
        limit?: number;
    }): CodeSubgraph {
        this.build();
        const allNodes = Object.values(this.cache.files).flatMap(file => file.nodes);
        const allEdges = Object.values(this.cache.files).flatMap(file => file.edges);
        const searchWords = words(input.actions.map(action => [
            action.action, action.variableName, recordedStepContext(action)
        ].filter(Boolean).join(' ')).join(' '));
        const allowedSquads = new Set([input.squad, 'commons', 'home', 'global']);
        const ranked = allNodes
            .filter(node => allowedSquads.has(node.squad))
            .map(node => {
                const nodeWords = words(`${node.name} ${node.text || ''} ${node.file}`);
                const overlap = [...searchWords].filter(token => nodeWords.has(token)).length;
                const scopeScore = node.squad === input.squad ? 3 :
                    node.squad === 'commons' || node.squad === 'home' ? 2 : 1;
                const typeScore = node.type === 'stepDefinition' || node.type === 'method' ? 2 : 1;
                return { node, score: overlap * 10 + scopeScore + typeScore };
            })
            .sort((left, right) =>
                right.score - left.score ||
                left.node.file.localeCompare(right.node.file) ||
                left.node.name.localeCompare(right.node.name)
            );
        const limit = Math.max(10, Math.min(input.limit || 80, 150));
        const seedLimit = Math.max(10, Math.floor(limit * 0.7));
        const selected = ranked.slice(0, seedLimit).map(item => item.node);
        const selectedIds = new Set(selected.map(node => node.id));

        // Incluye vecinos directos sin exceder el límite para conservar relaciones útiles.
        for (const edge of allEdges) {
            if (selected.length >= limit) break;
            const neighborId = selectedIds.has(edge.from) ? edge.to :
                selectedIds.has(edge.to) ? edge.from : undefined;
            if (!neighborId || selectedIds.has(neighborId)) continue;
            const neighbor = allNodes.find(node => node.id === neighborId);
            if (neighbor && allowedSquads.has(neighbor.squad)) {
                selected.push(neighbor);
                selectedIds.add(neighbor.id);
            }
        }
        for (const { node } of ranked) {
            if (selected.length >= limit) break;
            if (!selectedIds.has(node.id)) {
                selected.push(node);
                selectedIds.add(node.id);
            }
        }
        const edges = allEdges.filter(edge =>
            selectedIds.has(edge.from) && selectedIds.has(edge.to)
        );
        return {
            nodes: selected,
            edges,
            metrics: {
                totalNodes: allNodes.length,
                selectedNodes: selected.length,
                totalEdges: allEdges.length,
                selectedEdges: edges.length,
                contextReduction: allNodes.length === 0
                    ? 0
                    : Math.max(0, 1 - selected.length / allNodes.length),
                indexedFiles: Object.keys(this.cache.files)
                    .filter(file => file !== '__derived__').length,
                reindexedFiles: this.reindexedFiles,
                cacheHit: this.buildMetrics.cacheHit,
                filesExamined: this.buildMetrics.filesExamined,
                filesRead: this.buildMetrics.filesRead,
                bytesRead: this.buildMetrics.bytesRead,
                indexDurationMs: this.buildMetrics.indexDurationMs,
            }
        };
    }

    private parseFile(absolute: string, relative: string): Pick<CachedFile, 'nodes' | 'edges'> {
        const content = this.read(absolute);
        const squad = squadFrom(relative);
        if (relative.endsWith('.feature')) return this.parseFeature(content, relative, squad);
        if (relative.includes('features/yape-steps-definitions/')) {
            return this.parseStepDefinitions(content, relative, squad);
        }
        if (relative.includes('screenobjects/')) return this.parseScreen(content, relative, squad);
        if (relative.includes('resources/locators/')) return this.parseLocators(content, relative, squad);
        return { nodes: [], edges: [] };
    }

    private parseFeature(content: string, file: string, squad: string) {
        const nodes: CodeGraphNode[] = [];
        const edges: CodeGraphEdge[] = [];
        const featureName = content.match(/^\s*Feature:\s*(.+)$/mi)?.[1]?.trim()
            || path.basename(file, '.feature');
        const featureId = nodeId('feature', file, featureName);
        nodes.push({ id: featureId, type: 'feature', name: featureName, file, squad });
        let scenarioId = featureId;
        let scenarioIndex = 0;
        let stepIndex = 0;
        const lines = content.split(/\r?\n/);
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const scenario = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
            if (scenario) {
                scenarioIndex += 1;
                scenarioId = nodeId('scenario', file, scenario[1].trim(), scenarioIndex);
                nodes.push({
                    id: scenarioId, type: 'scenario', name: scenario[1].trim(), file, squad
                });
                edges.push({ from: featureId, to: scenarioId, type: 'contains' });
                continue;
            }
            const step = line.match(/^\s*(Given|When|Then|And|But)\s+(.+)$/i);
            if (step) {
                stepIndex += 1;
                const id = nodeId('gherkinStep', file, step[2].trim(), stepIndex);
                nodes.push({
                    id, type: 'gherkinStep', name: step[1], text: step[2].trim(), file, squad
                });
                edges.push({ from: scenarioId, to: id, type: 'contains' });
                continue;
            }
            if (/^\s*Examples:\s*$/i.test(line)) {
                const table: string[] = [];
                let cursor = lineIndex + 1;
                while (cursor < lines.length && /^\s*\|.*\|\s*$/.test(lines[cursor])) {
                    table.push(lines[cursor]);
                    cursor += 1;
                }
                const headers = table[0]?.split('|').map(value => value.trim()).filter(Boolean) || [];
                const id = nodeId('exampleTable', file, `Examples ${scenarioIndex}`, scenarioIndex);
                nodes.push({
                    id,
                    type: 'exampleTable',
                    name: 'Examples',
                    file,
                    squad,
                    metadata: { headers, rowCount: Math.max(0, table.length - 1) },
                });
                edges.push({ from: scenarioId, to: id, type: 'contains' });
            }
        }
        return { nodes, edges };
    }

    private parseStepDefinitions(content: string, file: string, squad: string) {
        const nodes: CodeGraphNode[] = [];
        const pattern = /\b(Given|When|Then)\s*\(\s*\/((?:\\\/|[^/])+)\/[dgimsuvy]*\s*,/g;
        let match: RegExpExecArray | null;
        let index = 0;
        while ((match = pattern.exec(content))) {
            index += 1;
            const expression = match[2].replace(/\\\//g, '/');
            nodes.push({
                id: nodeId('stepDefinition', file, expression, index),
                type: 'stepDefinition',
                name: match[1],
                text: expression,
                file,
                squad,
                metadata: { signature: `${match[1]}(/^${expression}$/)` },
            });
        }
        return { nodes, edges: [] };
    }

    private parseScreen(content: string, file: string, squad: string) {
        const nodes: CodeGraphNode[] = [];
        const edges: CodeGraphEdge[] = [];
        const className = content.match(/\bclass\s+([A-Za-z_$][\w$]*)/)?.[1]
            || path.basename(file, '.ts');
        const screenId = nodeId('screenObject', file, className);
        nodes.push({ id: screenId, type: 'screenObject', name: className, file, squad });
        const pattern = /\b(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(?:get\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/g;
        let match: RegExpExecArray | null;
        let index = 0;
        while ((match = pattern.exec(content))) {
            // `if (x) {`, `catch (e) {` y `for (...) {` tienen la misma forma que
            // un metodo: sin este filtro el grafo indexaba 388 nodos falsos.
            if (match[1] === 'constructor' || CONTROL_KEYWORDS.has(match[1])) continue;
            index += 1;
            const id = nodeId('method', file, match[1], index);
            const signature = match[0].slice(0, match[0].lastIndexOf('{')).trim();
            nodes.push({ id, type: 'method', name: match[1], file, squad, metadata: { signature } });
            edges.push({ from: screenId, to: id, type: 'contains' });
        }
        return { nodes, edges };
    }

    private parseLocators(content: string, file: string, squad: string) {
        const nodes: CodeGraphNode[] = [];
        try {
            const document = JSON.parse(content) as Record<string, Record<string, unknown>>;
            const names = new Map<string, {
                android: boolean; ios: boolean;
                androidSelector?: string; iosSelector?: string;
                androidBlock?: string; iosBlock?: string;
            }>();
            for (const [block, values] of Object.entries(document)) {
                if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
                const platform = /ios$/i.test(block) ? 'ios' : /android$/i.test(block) ? 'android' : '';
                if (!platform) continue;
                for (const [name, value] of Object.entries(values)) {
                    const coverage = names.get(name) || { android: false, ios: false };
                    coverage[platform] = typeof value === 'string' && Boolean(value.trim());
                    if (typeof value === 'string') {
                        coverage[`${platform}Selector`] = value.trim();
                        coverage[`${platform}Block`] = block;
                    }
                    names.set(name, coverage);
                }
            }
            let index = 0;
            for (const [name, coverage] of names) {
                index += 1;
                nodes.push({
                    id: nodeId('locator', file, name, index),
                    type: 'locator',
                    name,
                    file,
                    squad,
                    metadata: coverage
                });
            }
        } catch {
            return { nodes: [], edges: [] };
        }
        return { nodes, edges: [] };
    }

    /**
     * Relaciones derivadas entre capas.
     *
     * `calls` y `uses` se resolvian por ARCHIVO: si un Screen Object importaba
     * dos JSON de locators, cada metodo quedaba unido a todos los locators de
     * ambos, y un archivo de steps unia cada definicion a todo metodo cuyo
     * nombre apareciera en el texto. Eso producia 52.239 aristas `uses` para
     * 2.044 metodos y hacia que el subgrafo de una pantalla llegara a squads sin
     * relacion. Ahora se resuelven por sentencia y contra los imports reales.
     */
    private addDerivedEdges(): void {
        const files = Object.values(this.cache.files);
        const nodes = files.flatMap(file => file.nodes);
        const edges = files.flatMap(file => file.edges);
        const definitions = nodes.filter(node => node.type === 'stepDefinition');
        const steps = nodes.filter(node => node.type === 'gherkinStep');

        const methodsByFile = new Map<string, CodeGraphNode[]>();
        for (const node of nodes.filter(item => item.type === 'method')) {
            const grouped = methodsByFile.get(node.file) || [];
            grouped.push(node);
            methodsByFile.set(node.file, grouped);
        }
        const locatorsByFile = new Map<string, Map<string, CodeGraphNode>>();
        for (const node of nodes.filter(item => item.type === 'locator')) {
            const grouped = locatorsByFile.get(node.file) || new Map<string, CodeGraphNode>();
            grouped.set(node.name, node);
            locatorsByFile.set(node.file, grouped);
        }

        for (const step of steps) {
            for (const definition of definitions) {
                try {
                    if (new RegExp(definition.text || '').test(step.text || '')) {
                        edges.push({ from: step.id, to: definition.id, type: 'matches' });
                    }
                } catch { /* expresión inválida: se ignora */ }
            }
        }

        const read = (relative: string): string => {
            try {
                return this.read(path.join(this.frameworkRoot, relative));
            } catch {
                return '';
            }
        };

        // calls: cada definición enlaza solo con los métodos que su propio cuerpo
        // invoca, sobre el Screen Object que el alias importa.
        const definitionsByFile = new Map<string, CodeGraphNode[]>();
        for (const definition of definitions) {
            const grouped = definitionsByFile.get(definition.file) || [];
            grouped.push(definition);
            definitionsByFile.set(definition.file, grouped);
        }
        for (const [file, fileDefinitions] of definitionsByFile) {
            const content = read(file);
            if (!content) continue;
            const aliases = screenImports(file, content);
            if (!aliases.size) continue;
            const pattern = /\b(?:Given|When|Then)\s*\(\s*\/((?:\\\/|[^/])+)\/[dgimsuvy]*\s*,/g;
            let match: RegExpExecArray | null;
            let index = 0;
            while ((match = pattern.exec(content))) {
                index += 1;
                const definition = fileDefinitions[index - 1];
                if (!definition) continue;
                const body = bodyFrom(content, match.index + match[0].length);
                for (const [, alias, methodName] of body.matchAll(
                    /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g
                )) {
                    const screenFile = aliases.get(alias);
                    if (!screenFile) continue;
                    for (const method of methodsByFile.get(screenFile) || []) {
                        if (method.name === methodName) {
                            edges.push({ from: definition.id, to: method.id, type: 'calls' });
                        }
                    }
                }
            }
        }

        // uses: cada método enlaza con las claves que su cuerpo referencia —
        // incluidas las de los getters que usa— dentro de los módulos que el
        // Screen Object realmente importa.
        for (const [screenFile, fileMethods] of methodsByFile) {
            const content = read(screenFile);
            if (!content) continue;
            const modules = [...importsOf(path.join(this.frameworkRoot, screenFile)).keys()];
            const available = modules
                .map(module => `resources/locators/${module}.locator.json`)
                .filter(file => locatorsByFile.has(file));
            if (!available.length) continue;

            // Un getter traduce `this.x` a claves del JSON; sin resolverlo, un
            // método parecería no usar ningún locator.
            const memberBodies = new Map<string, string>();
            const memberPattern = /\b(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(?:get\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{/g;
            let member: RegExpExecArray | null;
            while ((member = memberPattern.exec(content))) {
                if (member[1] === 'constructor') continue;
                memberBodies.set(member[1], bodyFrom(content, member.index + member[0].length - 1));
            }
            for (const method of fileMethods) {
                const body = memberBodies.get(method.name) || '';
                if (!body) continue;
                const keys = new Set(locatorKeysIn(body));
                for (const [name, memberBody] of memberBodies) {
                    if (name === method.name) continue;
                    if (new RegExp(`this\\.${name}\\b`).test(body)) {
                        locatorKeysIn(memberBody).forEach(key => keys.add(key));
                    }
                }
                for (const key of keys) {
                    for (const file of available) {
                        const locator = locatorsByFile.get(file)?.get(key);
                        if (locator) edges.push({ from: method.id, to: locator.id, type: 'uses' });
                    }
                }
            }
        }

        // Las relaciones derivadas viven en una entrada interna del cache local.
        this.cache.files['__derived__'] = {
            mtimeMs: 0,
            size: 0,
            nodes: [],
            edges: this.uniqueEdges(edges.filter(edge =>
                edge.type === 'matches' || edge.type === 'calls' || edge.type === 'uses'
            ))
        };
    }

    private uniqueEdges(edges: CodeGraphEdge[]): CodeGraphEdge[] {
        const seen = new Set<string>();
        return edges.filter(edge => {
            const key = `${edge.from}|${edge.to}|${edge.type}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private readCache(): CodeGraphCache {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
            if (parsed?.version === 2 && parsed.files) return parsed;
        } catch { /* cache inexistente o corrupto */ }
        return { version: 2, builtAt: '', files: {} };
    }

    private writeCache(): void {
        fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
        const temporary = `${this.cacheFile}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(this.cache));
        fs.renameSync(temporary, this.cacheFile);
    }

    private read(file: string): string {
        const content = fs.readFileSync(file, 'utf-8');
        if (!this.readFiles.has(file)) {
            this.readFiles.add(file);
            this.buildMetrics.filesRead += 1;
            this.buildMetrics.bytesRead += Buffer.byteLength(content, 'utf-8');
        }
        return content;
    }
}
