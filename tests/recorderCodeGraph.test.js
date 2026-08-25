const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { RecorderCodeGraph } = require('../dist/core/recorderCodeGraph');
const { projectPaths } = require('../dist/core/projectPaths');

test('relaciona un canal IPC con los módulos internos del recorder', () => {
    // `query` rankea y corta: el límite tiene que dar aire para que el nodo del
    // controller entre. Con 50 se caía cada vez que ese archivo crecía, y lo que
    // el test comprueba es la relación, no el ranking.
    const graph = new RecorderCodeGraph().query({
        ipc: 'preview-fwk-files',
        limit: 120
    });
    const channel = graph.nodes.find(node =>
        node.type === 'ipcChannel' && node.name === 'preview-fwk-files'
    );
    assert.ok(channel);
    assert.ok(graph.nodes.some(node => node.file === 'recorder/src/main.ts'));
    assert.ok(graph.nodes.some(node => node.file.includes('recorderController.js')));
    assert.ok(graph.edges.some(edge =>
        edge.to === channel.id && (edge.type === 'handles' || edge.type === 'invokes')
    ));
    assert.ok(graph.metrics.contextReduction > 0.5);
});

test('el cache del grafo interno vive en runtime y es incremental', () => {
    const graph = new RecorderCodeGraph().query({
        component: 'ScenarioBuilderModal',
        limit: 30
    });
    assert.equal(
        projectPaths.recorderCodeGraphCache,
        path.join(projectPaths.toolRoot, 'runtime', 'codegraph-recorder.json')
    );
    assert.equal(fs.existsSync(projectPaths.recorderCodeGraphCache), true);
    assert.equal(graph.metrics.reindexedFiles, 0);
});
