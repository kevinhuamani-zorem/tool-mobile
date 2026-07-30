const test = require('node:test');
const assert = require('node:assert/strict');
const {
    renderCodeGraphDot,
    renderCodeGraphMermaid
} = require('../dist/core/codeGraphExporter');

const graph = {
    nodes: [
        {
            id: 'feature:test',
            type: 'feature',
            name: 'Movimientos "Yape"',
            file: 'features/payment/movimientos.feature',
            squad: 'payment'
        },
        {
            id: 'scenario:test',
            type: 'scenario',
            name: 'Listar movimientos',
            file: 'features/payment/movimientos.feature',
            squad: 'payment'
        }
    ],
    edges: [{ from: 'feature:test', to: 'scenario:test', type: 'contains' }],
    metrics: {
        totalNodes: 2,
        selectedNodes: 2,
        totalEdges: 1,
        selectedEdges: 1,
        contextReduction: 0,
        indexedFiles: 1,
        reindexedFiles: 1
    }
};

test('exporta Graphviz DOT válido con relaciones', () => {
    const output = renderCodeGraphDot(graph);
    assert.match(output, /^digraph CodeGraph/);
    assert.match(output, /n0 -> n1 \[label="contains"\]/);
    assert.match(output, /Movimientos \\"Yape\\"/);
});

test('exporta Mermaid con nodos escapados y clases por tipo', () => {
    const output = renderCodeGraphMermaid(graph);
    assert.match(output, /^flowchart LR/);
    assert.match(output, /n0 -->\|contains\| n1/);
    assert.match(output, /Movimientos &quot;Yape&quot;/);
    assert.match(output, /class n0 feature/);
});
