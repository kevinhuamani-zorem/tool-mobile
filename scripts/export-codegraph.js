const fs = require('node:fs');
const path = require('node:path');
const { CodeGraph } = require('../dist/core/indexing');
const {
    renderCodeGraphDot,
    renderCodeGraphMermaid
} = require('../dist/core/indexing');
const { projectPaths } = require('../dist/core/workspace');

function readArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];
        if (!current.startsWith('--')) continue;
        const [rawKey, inlineValue] = current.slice(2).split('=', 2);
        const next = inlineValue ?? (
            argv[index + 1] && !argv[index + 1].startsWith('--')
                ? argv[++index]
                : 'true'
        );
        result[rawKey] = next;
    }
    return result;
}

function safeName(value) {
    const normalized = String(value || 'subgraph').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!normalized) throw new Error('El nombre de salida no es válido');
    return normalized.slice(0, 80);
}

function main() {
    const args = readArgs(process.argv.slice(2));
    if (args.help === 'true') {
        console.log(
            'Uso: npm run codegraph:export -- --squad payment ' +
            '[--feature movimientos] [--search texto] [--limit 80] [--format both|dot|mmd]'
        );
        return;
    }
    const squad = safeName(args.squad || 'payment');
    const feature = String(args.feature || '').trim();
    const search = String(args.search || '').trim();
    const limit = Number(args.limit || 80);
    if (!Number.isInteger(limit) || limit < 10 || limit > 150) {
        throw new Error('--limit debe ser un entero entre 10 y 150');
    }
    const format = String(args.format || 'both').toLowerCase();
    if (!['both', 'dot', 'mmd'].includes(format)) {
        throw new Error('--format debe ser both, dot o mmd');
    }
    const outputName = safeName(
        args.output || ['codegraph', squad, feature || search].filter(Boolean).join('-')
    );
    const graph = new CodeGraph().query({
        squad,
        actions: [{
            action: 'CLICK',
            description: [feature, search].filter(Boolean).join(' ')
        }],
        limit
    });
    fs.mkdirSync(path.join(projectPaths.toolRoot, 'runtime'), { recursive: true });
    const outputs = [];
    if (format === 'both' || format === 'dot') {
        const file = path.join(projectPaths.toolRoot, 'runtime', `${outputName}.dot`);
        fs.writeFileSync(file, renderCodeGraphDot(graph));
        outputs.push(file);
    }
    if (format === 'both' || format === 'mmd') {
        const file = path.join(projectPaths.toolRoot, 'runtime', `${outputName}.mmd`);
        fs.writeFileSync(file, renderCodeGraphMermaid(graph));
        outputs.push(file);
    }
    console.log(JSON.stringify({
        files: outputs,
        squad,
        filter: feature || search || null,
        metrics: graph.metrics
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(`CodeGraph export error: ${error.message}`);
    process.exitCode = 1;
}
