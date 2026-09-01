const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { RecorderCodeGraph } = require('../dist/core/indexing');
const { projectPaths } = require('../dist/core/workspace');

test('relaciona un canal IPC con los módulos internos del recorder', () => {
    // `query` rankea y corta: el límite tiene que dar aire para que un nodo del
    // renderer entre. Con 50 se caía cada vez que ese archivo crecía, y lo que
    // el test comprueba es la relación, no el ranking. Desde la fase de
    // features (ver docs/adr/0001-modular-core-architecture.md, paso 9) el
    // renderer ya no concentra la lógica en un único `recorderController.js`;
    // basta con que algún módulo bajo `features/` participe del grafo.
    const graph = new RecorderCodeGraph().query({
        ipc: 'preview-fwk-files',
        limit: 120
    });
    const channel = graph.nodes.find(node =>
        node.type === 'ipcChannel' && node.name === 'preview-fwk-files'
    );
    assert.ok(channel);
    assert.ok(graph.nodes.some(node => node.file === 'recorder/src/main.ts'));
    assert.ok(graph.nodes.some(node => node.file.startsWith('recorder/renderer/src/features/')));
    assert.ok(graph.edges.some(edge =>
        edge.to === channel.id && (edge.type === 'handles' || edge.type === 'invokes')
    ));
    assert.ok(graph.metrics.contextReduction > 0.5);
});

test('el cache del grafo interno vive en runtime y es incremental', () => {
    // No dependas del orden/concurrencia de otros tests para calentar el cache.
    new RecorderCodeGraph().query({
        component: 'ScenarioBuilderModal',
        limit: 30
    });
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
