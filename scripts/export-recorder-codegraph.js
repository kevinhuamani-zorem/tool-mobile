const fs = require('node:fs');
const path = require('node:path');
const { RecorderCodeGraph } = require('../dist/core/indexing');
const {
    renderCodeGraphDot,
    renderCodeGraphMermaid
} = require('../dist/core/indexing');
const { projectPaths } = require('../dist/core/workspace');

function argumentsOf(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        if (!argv[index].startsWith('--')) continue;
        const key = argv[index].slice(2);
        result[key] = argv[index + 1] && !argv[index + 1].startsWith('--')
            ? argv[++index]
            : 'true';
    }
    return result;
}

function safe(value) {
    const output = String(value || 'architecture').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!output) throw new Error('Filtro de salida inválido');
    return output.slice(0, 80);
}

function main() {
    const args = argumentsOf(process.argv.slice(2));
    if (args.help === 'true') {
        console.log(
            'Uso: npm run codegraph:recorder -- ' +
            '[--search generateFwkFiles] [--component ScenarioBuilderModal] ' +
            '[--ipc preview-fwk-files] [--limit 60] [--format all|json|dot|mmd]'
        );
        return;
    }
    const limit = Number(args.limit || 60);
    if (!Number.isInteger(limit) || limit < 10 || limit > 150) {
        throw new Error('--limit debe ser un entero entre 10 y 150');
    }
    const format = String(args.format || 'all').toLowerCase();
    if (!['all', 'json', 'dot', 'mmd'].includes(format)) {
        throw new Error('--format debe ser all, json, dot o mmd');
    }
    const filter = args.component || args.ipc || args.search || 'architecture';
    const name = `codegraph-recorder-${safe(filter)}`;
    const graph = new RecorderCodeGraph().query({
        search: args.search,
        component: args.component,
        ipc: args.ipc,
        limit
    });
    const runtime = path.join(projectPaths.toolRoot, 'runtime');
    fs.mkdirSync(runtime, { recursive: true });
    const outputs = [];
    if (format === 'all' || format === 'json') {
        const file = path.join(runtime, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify(graph, null, 2) + '\n');
        outputs.push(file);
    }
    if (format === 'all' || format === 'dot') {
        const file = path.join(runtime, `${name}.dot`);
        fs.writeFileSync(file, renderCodeGraphDot(graph));
        outputs.push(file);
    }
    if (format === 'all' || format === 'mmd') {
        const file = path.join(runtime, `${name}.mmd`);
        fs.writeFileSync(file, renderCodeGraphMermaid(graph));
        outputs.push(file);
    }
    console.log(JSON.stringify({ files: outputs, filter, metrics: graph.metrics }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(`Recorder CodeGraph error: ${error.message}`);
    process.exitCode = 1;
}
