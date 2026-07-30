import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';
import { RecordedStep } from './models';

export type CodeNodeType =
    | 'feature' | 'scenario' | 'gherkinStep'
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
    metadata?: Record<string, string | boolean>;
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
    version: 1;
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
    };
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
    private cache: CodeGraphCache = { version: 1, builtAt: '', files: {} };
    private reindexedFiles = 0;

    build(): void {
        const previous = this.readCache();
        const roots = [
            projectPaths.features,
            projectPaths.stepDefinitions,
            projectPaths.screenobjects,
            projectPaths.locators
        ];
        const files = roots.flatMap(walk);
        const nextFiles: Record<string, CachedFile> = {};
        this.reindexedFiles = 0;

        for (const absolute of files) {
            const relative = path.relative(projectPaths.frameworkRoot, absolute).replace(/\\/g, '/');
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
            version: 1,
            builtAt: new Date().toISOString(),
            files: nextFiles
        };
        if (this.reindexedFiles === 0 && previous.files.__derived__) {
            this.cache.files.__derived__ = previous.files.__derived__;
        } else {
            this.addDerivedEdges();
        }
        this.writeCache();
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
            action.action, action.variableName, action.description
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
                reindexedFiles: this.reindexedFiles
            }
        };
    }

    private parseFile(absolute: string, relative: string): Pick<CachedFile, 'nodes' | 'edges'> {
        const content = fs.readFileSync(absolute, 'utf-8');
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
        for (const line of content.split(/\r?\n/)) {
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
                squad
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
            if (match[1] === 'constructor') continue;
            index += 1;
            const id = nodeId('method', file, match[1], index);
            nodes.push({ id, type: 'method', name: match[1], file, squad });
            edges.push({ from: screenId, to: id, type: 'contains' });
        }
        return { nodes, edges };
    }

    private parseLocators(content: string, file: string, squad: string) {
        const nodes: CodeGraphNode[] = [];
        try {
            const document = JSON.parse(content) as Record<string, Record<string, unknown>>;
            const names = new Map<string, { android: boolean; ios: boolean }>();
            for (const [block, values] of Object.entries(document)) {
                if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
                const platform = /ios$/i.test(block) ? 'ios' : /android$/i.test(block) ? 'android' : '';
                if (!platform) continue;
                for (const [name, value] of Object.entries(values)) {
                    const coverage = names.get(name) || { android: false, ios: false };
                    coverage[platform] = typeof value === 'string' && Boolean(value.trim());
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

    private addDerivedEdges(): void {
        const files = Object.values(this.cache.files);
        const nodes = files.flatMap(file => file.nodes);
        const edges = files.flatMap(file => file.edges);
        const definitions = nodes.filter(node => node.type === 'stepDefinition');
        const steps = nodes.filter(node => node.type === 'gherkinStep');
        const methods = nodes.filter(node => node.type === 'method');
        const locators = nodes.filter(node => node.type === 'locator');

        for (const step of steps) {
            for (const definition of definitions) {
                try {
                    if (new RegExp(definition.text || '').test(step.text || '')) {
                        edges.push({ from: step.id, to: definition.id, type: 'matches' });
                    }
                } catch { /* expresión inválida: se ignora */ }
            }
        }
        for (const file of files) {
            const definitionsInFile = file.nodes.filter(node => node.type === 'stepDefinition');
            if (!definitionsInFile.length) continue;
            const sourceFile = definitionsInFile[0].file;
            const content = fs.readFileSync(path.join(projectPaths.frameworkRoot, sourceFile), 'utf-8');
            for (const method of methods) {
                if (new RegExp(`\\.${method.name}\\s*\\(`).test(content)) {
                    definitionsInFile.forEach(definition =>
                        edges.push({ from: definition.id, to: method.id, type: 'calls' })
                    );
                }
            }
        }
        const methodsByFile = new Map<string, CodeGraphNode[]>();
        for (const method of methods) {
            const grouped = methodsByFile.get(method.file) || [];
            grouped.push(method);
            methodsByFile.set(method.file, grouped);
        }
        for (const [methodFile, fileMethods] of methodsByFile) {
            const content = fs.readFileSync(path.join(projectPaths.frameworkRoot, methodFile), 'utf-8');
            for (const locator of locators) {
                if (new RegExp(`\\b${locator.name}\\b`).test(content)) {
                    fileMethods.forEach(method =>
                        edges.push({ from: method.id, to: locator.id, type: 'uses' })
                    );
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
            const parsed = JSON.parse(fs.readFileSync(projectPaths.codeGraphCache, 'utf-8'));
            if (parsed?.version === 1 && parsed.files) return parsed;
        } catch { /* cache inexistente o corrupto */ }
        return { version: 1, builtAt: '', files: {} };
    }

    private writeCache(): void {
        fs.mkdirSync(path.dirname(projectPaths.codeGraphCache), { recursive: true });
        const temporary = `${projectPaths.codeGraphCache}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(this.cache));
        fs.renameSync(temporary, projectPaths.codeGraphCache);
    }
}
