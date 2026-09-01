import fs from 'fs';
import path from 'path';
import {
    CodeGraphEdge,
    CodeGraphNode,
    CodeSubgraph
} from './codeGraph';
import { projectPaths } from '../../workspace';

interface FileIndex {
    mtimeMs: number;
    size: number;
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
    imports: string[];
    ipcInvocations: string[];
    domReferences: string[];
    symbols: string[];
}

interface RecorderGraphCache {
    version: 1;
    builtAt: string;
    files: Record<string, FileIndex>;
    derivedNodes: CodeGraphNode[];
    derivedEdges: CodeGraphEdge[];
}

const ignoredDirectories = new Set([
    'node_modules', 'dist', 'runtime', 'vendor', 'workspace', '.git'
]);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.sh']);

function walkRecorder(root: string): string[] {
    const output: string[] = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (ignoredDirectories.has(entry.name)) continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(full);
            else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
                output.push(full);
            }
        }
    }
    return output.sort();
}

function moduleId(file: string): string {
    return `module:${file}`;
}

function words(value: string): Set<string> {
    return new Set(value.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 2));
}

function uniqueNodes(nodes: CodeGraphNode[]): CodeGraphNode[] {
    const seen = new Set<string>();
    return nodes.filter(node => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return true;
    });
}

function uniqueEdges(edges: CodeGraphEdge[]): CodeGraphEdge[] {
    const seen = new Set<string>();
    return edges.filter(edge => {
        const key = `${edge.from}|${edge.to}|${edge.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export class RecorderCodeGraph {
    private cache: RecorderGraphCache = {
        version: 1, builtAt: '', files: {}, derivedNodes: [], derivedEdges: []
    };
    private reindexedFiles = 0;

    build(): void {
        const previous = this.readCache();
        const files = walkRecorder(projectPaths.toolRoot);
        const next: Record<string, FileIndex> = {};
        this.reindexedFiles = 0;
        for (const absolute of files) {
            const relative = path.relative(projectPaths.toolRoot, absolute).replace(/\\/g, '/');
            const stat = fs.statSync(absolute);
            const cached = previous.files[relative];
            if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                next[relative] = cached;
                continue;
            }
            next[relative] = {
                mtimeMs: stat.mtimeMs,
                size: stat.size,
                ...this.parseFile(absolute, relative)
            };
            this.reindexedFiles += 1;
        }
        const derived = this.reindexedFiles === 0
            ? { nodes: previous.derivedNodes || [], edges: previous.derivedEdges }
            : this.buildDerived(files, next);
        this.cache = {
            version: 1,
            builtAt: new Date().toISOString(),
            files: next,
            derivedNodes: derived.nodes,
            derivedEdges: derived.edges
        };
        this.writeCache();
    }

    query(input: {
        search?: string;
        component?: string;
        ipc?: string;
        limit?: number;
    }): CodeSubgraph {
        this.build();
        const allNodes = uniqueNodes(
            [
                ...Object.values(this.cache.files).flatMap(file => file.nodes),
                ...this.cache.derivedNodes
            ]
        );
        const allEdges = uniqueEdges([
            ...Object.values(this.cache.files).flatMap(file => file.edges),
            ...this.cache.derivedEdges
        ]);
        const terms = words([input.search, input.component, input.ipc].filter(Boolean).join(' '));
        const ranked = allNodes.map(node => {
            const searchable = words(`${node.name} ${node.text || ''} ${node.file}`);
            const overlap = [...terms].filter(term => searchable.has(term)).length;
            const exact = [...terms].some(term =>
                node.name.toLowerCase().includes(term)
            ) ? 10 : 0;
            const requestedType =
                input.component && node.type === 'component' ? 5 :
                    input.ipc && node.type === 'ipcChannel' ? 5 : 0;
            return { node, score: overlap * 20 + exact + requestedType };
        }).sort((left, right) =>
            right.score - left.score ||
            left.node.file.localeCompare(right.node.file) ||
            left.node.name.localeCompare(right.node.name)
        );
        const limit = Math.max(10, Math.min(input.limit || 60, 150));
        const maximumScore = ranked[0]?.score || 0;
        const seedCount = maximumScore > 0
            ? Math.max(1, Math.min(5, ranked.filter(item => item.score === maximumScore).length))
            : Math.max(5, Math.floor(limit * 0.5));
        const selected = ranked.slice(0, seedCount).map(item => item.node);
        const ids = new Set(selected.map(node => node.id));
        const edgePriority: Record<CodeGraphEdge['type'], number> = {
            handles: 0,
            invokes: 1,
            imports: 2,
            binds: 3,
            calls: 4,
            uses: 5,
            covers: 6,
            matches: 7,
            contains: 8
        };
        const traversalEdges = [...allEdges].sort((left, right) =>
            edgePriority[left.type] - edgePriority[right.type]
        );
        let changed = true;
        while (changed && selected.length < limit) {
            changed = false;
            for (const edge of traversalEdges) {
                if (selected.length >= limit) break;
                const neighborId = ids.has(edge.from) ? edge.to :
                    ids.has(edge.to) ? edge.from : undefined;
                if (!neighborId || ids.has(neighborId)) continue;
                const neighbor = allNodes.find(node => node.id === neighborId);
                if (neighbor) {
                    selected.push(neighbor);
                    ids.add(neighbor.id);
                    changed = true;
                }
            }
        }
        for (const { node } of ranked) {
            if (selected.length >= limit) break;
            if (!ids.has(node.id)) {
                selected.push(node);
                ids.add(node.id);
            }
        }
        const edges = allEdges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
        return {
            nodes: selected,
            edges,
            metrics: {
                totalNodes: allNodes.length,
                selectedNodes: selected.length,
                totalEdges: allEdges.length,
                selectedEdges: edges.length,
                contextReduction: allNodes.length
                    ? Math.max(0, 1 - selected.length / allNodes.length)
                    : 0,
                indexedFiles: Object.keys(this.cache.files).length,
                reindexedFiles: this.reindexedFiles
            }
        };
    }

    private parseFile(absolute: string, file: string): Omit<FileIndex, 'mtimeMs' | 'size'> {
        const content = fs.readFileSync(absolute, 'utf-8');
        const moduleNode: CodeGraphNode = {
            id: moduleId(file),
            type: 'module',
            name: path.basename(file),
            file,
            squad: 'visual-recorder'
        };
        const nodes: CodeGraphNode[] = [moduleNode];
        const edges: CodeGraphEdge[] = [];
        const imports = [
            ...content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
            ...content.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)
        ].map(match => match[1]).filter(specifier => specifier.startsWith('.'));
        const ipcInvocations = [
            ...content.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g),
            ...content.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)
        ].map(match => match[1]);
        const domReferences = [
            ...content.matchAll(/\bid=["']([^"']+)["']/g),
            ...content.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)
        ].map(match => match[1]);
        const symbols: string[] = [];
        let symbolIndex = 0;
        const declaration = /\b(?:export\s+)?(?:default\s+)?(?:class|function)\s+([A-Za-z_$][\w$]*)/g;
        let declarationMatch: RegExpExecArray | null;
        while ((declarationMatch = declaration.exec(content))) {
            const name = declarationMatch[1];
            symbols.push(name);
            symbolIndex += 1;
            const type = /^[A-Z]/.test(name) && file.endsWith('.tsx')
                ? 'component'
                : /^[A-Z]/.test(name)
                    ? 'service'
                    : 'method';
            const id = `${type}:${file}:${name}:${symbolIndex}`;
            nodes.push({ id, type, name, file, squad: 'visual-recorder' });
            edges.push({ from: moduleNode.id, to: id, type: 'contains' });
        }
        if (file === 'package.json') {
            try {
                const scripts = JSON.parse(content).scripts || {};
                for (const [name, command] of Object.entries(scripts)) {
                    const id = `script:${name}`;
                    nodes.push({
                        id, type: 'script', name, text: String(command),
                        file, squad: 'visual-recorder'
                    });
                    edges.push({ from: moduleNode.id, to: id, type: 'contains' });
                }
            } catch { /* package inválido */ }
        }
        let testIndex = 0;
        for (const match of content.matchAll(/\btest\(\s*['"`]([^'"`]+)['"`]/g)) {
            testIndex += 1;
            const id = `test:${file}:${testIndex}`;
            nodes.push({
                id, type: 'test', name: match[1], file, squad: 'visual-recorder'
            });
            edges.push({ from: moduleNode.id, to: id, type: 'contains' });
        }
        return { nodes, edges, imports, ipcInvocations, domReferences, symbols };
    }

    private buildDerived(
        absoluteFiles: string[],
        files: Record<string, FileIndex>
    ): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
        void absoluteFiles;
        const nodes: CodeGraphNode[] = [];
        const edges: CodeGraphEdge[] = [];
        const fileNames = new Set(Object.keys(files));
        const ipcHandlers = new Map<string, string>();
        const domOwners = new Map<string, string>();
        for (const [file, index] of Object.entries(files)) {
            const absolute = path.join(projectPaths.toolRoot, file);
            const content = fs.readFileSync(absolute, 'utf-8');
            for (const match of content.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)) {
                const channel = match[1];
                const channelId = `ipc:${channel}`;
                ipcHandlers.set(channel, moduleId(file));
                nodes.push({
                    id: channelId, type: 'ipcChannel', name: channel,
                    file, squad: 'visual-recorder'
                });
                edges.push({ from: moduleId(file), to: channelId, type: 'handles' });
            }
            for (const match of content.matchAll(/\bid=["']([^"']+)["']/g)) {
                const domId = match[1];
                const id = `dom:${domId}`;
                domOwners.set(domId, id);
                nodes.push({
                    id, type: 'domElement', name: domId,
                    file, squad: 'visual-recorder'
                });
                edges.push({ from: moduleId(file), to: id, type: 'contains' });
            }
        }
        for (const [file, index] of Object.entries(files)) {
            for (const specifier of index.imports) {
                const resolved = this.resolveImport(file, specifier, fileNames);
                if (resolved) edges.push({
                    from: moduleId(file), to: moduleId(resolved), type: 'imports'
                });
            }
            for (const channel of index.ipcInvocations) {
                const handler = ipcHandlers.get(channel);
                if (handler && handler !== moduleId(file)) {
                    edges.push({ from: moduleId(file), to: `ipc:${channel}`, type: 'invokes' });
                }
            }
            for (const domId of index.domReferences) {
                const domNode = domOwners.get(domId);
                if (domNode) edges.push({
                    from: moduleId(file), to: domNode, type: 'binds'
                });
            }
            if (file.startsWith('tests/')) {
                const sourceTerms = words(index.nodes
                    .filter(node => node.type === 'test')
                    .map(node => node.name).join(' '));
                for (const [targetFile, target] of Object.entries(files)) {
                    if (targetFile.startsWith('tests/')) continue;
                    if (target.symbols.some(symbol =>
                        [...sourceTerms].some(term => symbol.toLowerCase().includes(term))
                    )) {
                        edges.push({
                            from: moduleId(file), to: moduleId(targetFile), type: 'covers'
                        });
                    }
                }
            }
        }
        return { nodes: uniqueNodes(nodes), edges: uniqueEdges(edges) };
    }

    private resolveImport(fromFile: string, specifier: string, files: Set<string>): string | undefined {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
        for (const candidate of [
            base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
            `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`
        ]) {
            if (files.has(candidate)) return candidate;
        }
        return undefined;
    }

    private readCache(): RecorderGraphCache {
        try {
            const parsed = JSON.parse(fs.readFileSync(projectPaths.recorderCodeGraphCache, 'utf-8'));
            if (parsed?.version === 1 && parsed.files) return parsed;
        } catch { /* cache ausente */ }
        return { version: 1, builtAt: '', files: {}, derivedNodes: [], derivedEdges: [] };
    }

    private writeCache(): void {
        fs.mkdirSync(path.dirname(projectPaths.recorderCodeGraphCache), { recursive: true });
        const temporary = `${projectPaths.recorderCodeGraphCache}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(this.cache));
        fs.renameSync(temporary, projectPaths.recorderCodeGraphCache);
    }
}
