// [visual-recorder] Contratos estáticos de la organización por features del
// renderer (ver docs/ARCHITECTURE.md y
// docs/adr/0001-modular-core-architecture.md, paso 9):
//   - cada feature vive en su propia carpeta bajo `features/<nombre>/` y
//     expone una fábrica `create<Nombre>Feature(deps)` con `mount()`/`unmount()`;
//   - las features solo importan helpers compartidos explícitos
//     (`features/shared/`), nunca el archivo interno de otra feature ni
//     `core/`;
//   - no hay estado mutable a nivel de módulo fuera de la fábrica (evita
//     duplicar contexto entre instancias);
//   - el composition root (`recorderController.js`) monta cada feature una
//     vez y no concentra lógica de negocio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const featuresDir = path.join(root, 'recorder/renderer/src/features');
const controllerPath = path.join(root, 'recorder/renderer/src/controller/recorderController.js');

const EXPECTED_FEATURES = [
    'configuration',
    'recording',
    'generation',
    'review',
    'inspector',
    'platform-completion',
];

function importSpecifiers(source) {
    return [...source.matchAll(/^\s*import\s+[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map(match => match[1]);
}

test('el renderer declara exactamente las seis features requeridas bajo src/features', () => {
    const entries = fs.readdirSync(featuresDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
    assert.deepEqual(entries, [...EXPECTED_FEATURES, 'shared'].sort());
});

for (const feature of EXPECTED_FEATURES) {
    test(`feature "${feature}" expone una única fábrica create*Feature con mount/unmount`, () => {
        const featureDir = path.join(featuresDir, feature);
        const files = fs.readdirSync(featureDir).filter(name => name.endsWith('.js'));
        assert.equal(files.length, 1, `se esperaba un único módulo en ${feature}/`);
        const source = fs.readFileSync(path.join(featureDir, files[0]), 'utf8');

        assert.match(source, /export function create[A-Za-z]+Feature\(/);
        assert.match(source, /function mount\(\)/);
        assert.match(source, /function unmount\(\)/);
        assert.match(source, /return\s*\{[\s\S]*mount,[\s\S]*unmount,/);
    });

    test(`feature "${feature}" solo importa helpers compartidos, nunca otra feature ni core/`, () => {
        const featureDir = path.join(featuresDir, feature);
        const files = fs.readdirSync(featureDir).filter(name => name.endsWith('.js'));
        const source = fs.readFileSync(path.join(featureDir, files[0]), 'utf8');
        const specifiers = importSpecifiers(source);
        assert.ok(specifiers.length > 0, 'se esperaba al menos un import de shared/domHelpers');
        for (const specifier of specifiers) {
            assert.match(
                specifier,
                /^\.\.\/shared\//,
                `${feature}/${files[0]} importa "${specifier}"; las features solo pueden importar ../shared/*`
            );
        }
    });

    test(`feature "${feature}" no declara estado mutable a nivel de módulo`, () => {
        const featureDir = path.join(featuresDir, feature);
        const files = fs.readdirSync(featureDir).filter(name => name.endsWith('.js'));
        const source = fs.readFileSync(path.join(featureDir, files[0]), 'utf8');
        // Cualquier `let`/`var` a columna 0 fuera de la fábrica indicaría un
        // singleton compartido entre instancias, en vez de contexto explícito
        // recibido por dependencia.
        assert.doesNotMatch(source, /^(let|var)\s/m);
    });
}

test('el composition root importa cada fábrica de feature exactamente una vez', () => {
    const source = fs.readFileSync(controllerPath, 'utf8');
    const importedFactories = new Set(
        [...source.matchAll(/import\s*\{\s*(create[A-Za-z]+Feature)\s*\}/g)].map(match => match[1])
    );
    assert.equal(importedFactories.size, EXPECTED_FEATURES.length);
    for (const factory of importedFactories) {
        const occurrences = source.match(new RegExp(factory, 'g')) || [];
        // import + invocación (`createXFeature({`): exactamente dos apariciones.
        assert.equal(occurrences.length, 2, `${factory} debe usarse una sola vez (import + invocación)`);
    }
});

test('el composition root no registra listeners de DOM directamente (queda solo como orquestador)', () => {
    const source = fs.readFileSync(controllerPath, 'utf8');
    assert.doesNotMatch(source, /\.addEventListener\(/);
    assert.match(source, /features\.forEach\(feature => feature\.mount\(\)\)/);
    assert.match(source, /export function disposeRecorder\(/);
});

test('el composition root se mantiene como una capa delgada frente al tamaño de las features', () => {
    const controllerLines = fs.readFileSync(controllerPath, 'utf8').split('\n').length;
    const featureLineCounts = EXPECTED_FEATURES.map(feature => {
        const featureDir = path.join(featuresDir, feature);
        const files = fs.readdirSync(featureDir).filter(name => name.endsWith('.js'));
        return fs.readFileSync(path.join(featureDir, files[0]), 'utf8').split('\n').length;
    });
    assert.ok(
        controllerLines < 300,
        `recorderController.js tiene ${controllerLines} líneas; debe seguir siendo un composition root delgado`
    );
    assert.ok(
        featureLineCounts.every(count => count >= controllerLines),
        'cada feature debe concentrar al menos tanto comportamiento como el composition root'
    );
});
