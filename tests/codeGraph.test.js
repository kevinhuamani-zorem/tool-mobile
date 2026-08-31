const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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


// `calls` y `uses` se resolvian por archivo: un Screen Object con dos JSON de
// locators unia cada metodo a todos los locators de ambos, y un archivo de steps
// unia cada definicion a todo metodo cuyo nombre apareciera en el texto. Eso
// hacia que el subgrafo de una pantalla llegara a squads sin relacion.
function graphParts() {
    const graph = new CodeGraph();
    graph.build();
    const files = Object.values(graph.cache.files);
    const nodes = files.flatMap(file => file.nodes);
    const edges = files.flatMap(file => file.edges);
    return { nodes, edges, byId: new Map(nodes.map(node => [node.id, node])) };
}

function outDegree(edges, type) {
    const counts = {};
    edges.filter(edge => edge.type === type).forEach(edge => {
        counts[edge.from] = (counts[edge.from] || 0) + 1;
    });
    const values = Object.values(counts).sort((left, right) => left - right);
    return values.length ? values[Math.floor(values.length / 2)] : 0;
}

test('las relaciones se resuelven por sentencia, no por archivo', () => {
    const { edges } = graphParts();
    // Un metodo usa uno o dos locators, no veinticuatro.
    assert.ok(outDegree(edges, 'uses') <= 3, 'mediana de uses por metodo');
    // Una definicion llama a uno o dos metodos.
    assert.ok(outDegree(edges, 'calls') <= 3, 'mediana de calls por definicion');
});

test('cada definición enlaza solo con el método que su cuerpo invoca', () => {
    const { nodes, edges, byId } = graphParts();
    const definiciones = nodes.filter(node =>
        node.type === 'stepDefinition' && /tapp-accounts-enter-option/.test(node.file));
    if (!definiciones.length) return; // el repo puede no tener ese caso
    for (const definicion of definiciones) {
        const llamados = edges
            .filter(edge => edge.from === definicion.id && edge.type === 'calls')
            .map(edge => byId.get(edge.to));
        assert.equal(llamados.length, 1, `${definicion.text} debe llamar a un solo método`);
        assert.match(llamados[0].file, /tapp-accounts-enter-option\.screen\.ts$/);
    }
});

test('el subgrafo de una pantalla no se escapa a otros squads', () => {
    const { nodes, edges, byId } = graphParts();
    const semilla = nodes.find(node =>
        node.type === 'screenObject' && /interoperabilidad\/tapp-subhome/.test(node.file));
    if (!semilla) return;
    const adyacencia = new Map();
    for (const edge of edges) {
        if (!adyacencia.has(edge.from)) adyacencia.set(edge.from, []);
        if (!adyacencia.has(edge.to)) adyacencia.set(edge.to, []);
        adyacencia.get(edge.from).push(edge.to);
        adyacencia.get(edge.to).push(edge.from);
    }
    const visto = new Set([semilla.id]);
    let frente = [semilla.id];
    for (let salto = 0; salto < 3; salto++) {
        const siguiente = [];
        for (const id of frente) {
            for (const vecino of adyacencia.get(id) || []) {
                if (visto.has(vecino)) continue;
                visto.add(vecino);
                siguiente.push(vecino);
            }
        }
        frente = siguiente;
    }
    const alcanzados = [...visto].map(id => byId.get(id)).filter(Boolean);
    assert.ok(alcanzados.length < 60, `subgrafo acotado, fueron ${alcanzados.length}`);
    const locators = alcanzados.filter(node => node.type === 'locator');
    assert.ok(locators.length > 0, 'debe alcanzar los locators de la pantalla');
    assert.equal(
        locators.every(node => /interoperabilidad/.test(node.file)),
        true,
        'ningun locator de otro squad'
    );
});

// `if (x) {` y `catch (e) {` tienen la misma forma que un metodo.
test('no indexa palabras clave de control como métodos', () => {
    const { nodes } = graphParts();
    const control = new Set(['if', 'for', 'while', 'switch', 'catch', 'else', 'try']);
    const falsos = nodes.filter(node => node.type === 'method' && control.has(node.name));
    assert.deepEqual(falsos.map(node => `${node.name}@${node.file}`), []);
});


// `subgraphOf` es travesia determinista desde semillas, no ranking por palabras
// como `query`: es lo que permite acotar contexto sin recortar nada relevante.
test('subgraphOf parte de archivos concretos y queda acotado', () => {
    const graph = new CodeGraph();
    const resultado = graph.subgraphOf({
        files: ['screenobjects/interoperabilidad/tapp-subhome.screen.ts'],
        depth: 3,
    });
    if (!resultado.metrics.selectedNodes) return; // el repo puede no tener esa pantalla

    assert.ok(resultado.metrics.selectedNodes < 60);
    assert.ok(resultado.metrics.contextReduction > 0.9);
    const locators = resultado.nodes.filter(node => node.type === 'locator');
    assert.ok(locators.length > 0, 'debe alcanzar los locators de la pantalla');
    // Mismas semillas, mismo resultado.
    const otra = graph.subgraphOf({
        files: ['screenobjects/interoperabilidad/tapp-subhome.screen.ts'],
        depth: 3,
    });
    assert.deepEqual(
        otra.nodes.map(node => node.id).sort(),
        resultado.nodes.map(node => node.id).sort()
    );
});

test('subgraphOf sin semillas no devuelve el framework entero', () => {
    const graph = new CodeGraph();
    assert.equal(graph.subgraphOf({ files: ['no/existe.screen.ts'] }).metrics.selectedNodes, 0);
});

test('extrae className real aunque el JSDoc contenga "class"', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-classname-'));
    fs.mkdirSync(path.join(root, 'screenobjects/payment'), { recursive: true });
    fs.mkdirSync(path.join(root, 'features/yape-features/payment'), { recursive: true });
    fs.mkdirSync(path.join(root, 'features/yape-steps-definitions/payment'), { recursive: true });
    fs.mkdirSync(path.join(root, 'resources/locators/payment'), { recursive: true });
    fs.writeFileSync(path.join(root, 'screenobjects/payment/sample.screen.ts'), `
/**
 * class for all Page Objects
 */
export default class RealScreenName {
  public async open(): Promise<void> {}
}
`);
    fs.writeFileSync(path.join(root, 'resources/locators/payment/sample.locator.json'), JSON.stringify({
        sampleAndroid: { open: '~Open' },
    }));
    const cacheFile = path.join(root, '.cache', 'codegraph.json');
    const graph = new CodeGraph({ frameworkRoot: root, cacheFile });
    const snapshot = graph.snapshot();
    const node = snapshot.nodes.find(item =>
        item.type === 'screenObject' && item.file === 'screenobjects/payment/sample.screen.ts'
    );
    assert.equal(node?.name, 'RealScreenName');
});

// El radio de impacto de reutilizar: quien mas depende del locator.
test('dependentsOfLocator resuelve quién más usa un locator', () => {
    const graph = new CodeGraph();
    const dependientes = graph.dependentsOfLocator(
        'resources/locators/home/home.locator.json', 'shortcutTapp'
    );
    if (!dependientes.screens.length && !dependientes.steps.length) return;
    assert.ok(dependientes.screens.some(file => /home\/home\.screen\.ts$/.test(file)));
    assert.equal(
        graph.dependentsOfLocator('resources/locators/home/home.locator.json', 'noExiste').screens.length,
        0
    );
});
