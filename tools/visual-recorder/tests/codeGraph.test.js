const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CodeGraph } = require('../dist/core/codeGraph');
const { projectPaths } = require('../dist/core/projectPaths');

test('construye un subgrafo relevante y guarda el cache dentro del recorder', () => {
    const graph = new CodeGraph();
    const result = graph.query({
        squad: 'payment',
        actions: [{
            action: 'CLICK',
            variableName: 'btnYapear',
            description: 'el usuario inicia un yapeo'
        }],
        limit: 80
    });

    assert.ok(result.metrics.totalNodes > 0);
    assert.ok(result.metrics.selectedNodes <= 80);
    assert.ok(result.metrics.contextReduction > 0.5);
    assert.ok(result.nodes.every(node =>
        ['payment', 'commons', 'home', 'global'].includes(node.squad)
    ));
    assert.equal(
        path.dirname(projectPaths.codeGraphCache),
        path.join(projectPaths.toolRoot, 'runtime')
    );
    assert.equal(fs.existsSync(projectPaths.codeGraphCache), true);
});

test('reutiliza el índice si los archivos del framework no cambiaron', () => {
    const result = new CodeGraph().query({
        squad: 'payment',
        actions: [{ action: 'CLICK', variableName: 'btnYapear' }],
        limit: 40
    });
    assert.equal(result.metrics.reindexedFiles, 0);
});
