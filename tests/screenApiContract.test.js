const test = require('node:test');
const assert = require('node:assert/strict');
const { buildScreenApi, screenApiInputErrors, validateScreenApi } = require('../dist/core/automation/infrastructure/layered/screenApi');

function behavior(body, actionTrace = []) {
    return { files: [{ layer: 'steps', path: 'features/steps/payment/movements.steps.ts',
        content: `import movements from '@screenobjects/payment/movements.screen.ts';\n${body}` }], actionTrace };
}
function interaction(content) {
    return { files: [{ layer: 'screen', path: 'screenobjects/payment/movements.screen.ts', content }], actionTrace: [] };
}

test('API deriva tipos, retorno y secuencias de las llamadas reales sin guardar valores del caso', () => {
    const code = behavior(`async function run() {
        const periods: string[] = ['Solo hoy'];
        const result: boolean = await movements.filter(periods, 3, true, 'dato privado');
    }`, [{ sequence: 6, screenMethod: 'movements.filter' }]);
    const api = buildScreenApi(code);
    assert.deepEqual(api.methods, [{
        importSource: 'screenobjects/payment/movements.screen', method: 'filter',
        arguments: ['string[]', 'number', 'boolean', 'string'].map((type, position) => ({ position, type, unresolved: false })),
        returnUsage: 'awaited', expectedReturnType: 'boolean', sequences: [6],
    }]);
    assert.doesNotMatch(JSON.stringify(api), /Solo hoy|dato privado/);
});

test('API no cambia por redacción, formato ni valor de string; sí por tipo o cantidad de argumentos', () => {
    const original = buildScreenApi(behavior(`async function run() { await movements.filter('hoy'); }`));
    assert.deepEqual(buildScreenApi(behavior(`// Otro Gherkin\nasync function run() {\n await movements.filter("ayer");\n}`)), original);
    assert.notDeepEqual(buildScreenApi(behavior(`async function run() { await movements.filter(7); }`)), original);
    assert.notDeepEqual(buildScreenApi(behavior(`async function run() { await movements.filter('hoy', true); }`)), original);
});

test('API distingue consumir, ignorar y esperar el retorno', () => {
    assert.equal(buildScreenApi(behavior('movements.read();')).methods[0].returnUsage, 'ignored');
    assert.equal(buildScreenApi(behavior('const result = movements.read();')).methods[0].returnUsage, 'value');
    assert.equal(buildScreenApi(behavior('const result = await movements.read();')).methods[0].returnUsage, 'awaited');
});

test('API reporta tipos desconocidos y spread sin inventar una firma', () => {
    for (const body of [
        'function run(value: any) { movements.filter(value); }',
        'function run(value: unknown) { movements.filter(value); }',
        'function run(values: string[]) { movements.filter(...values); }',
    ]) assert.match(screenApiInputErrors(behavior(body))[0], /argumentos sin tipo verificable/);
    assert.deepEqual(screenApiInputErrors(behavior('function run(value: string) { movements.filter(value); }')), []);
});

test('API no mezcla métodos homónimos de otros Screens ni variables locales', () => {
    const code = behavior(`import home from '@screenobjects/home/home.screen.ts';
        movements.open(); home.open();
        function local(movements: { open(n: number): void }) { movements.open(2); }`, [
        { sequence: 1, screenMethod: 'movements.open' },
        { sequence: 2, screenMethod: 'home.open' },
        { sequence: 3, screenMethod: 'open' },
    ]);
    const api = buildScreenApi(code);
    assert.equal(api.methods.length, 2);
    assert.deepEqual(api.methods.find(method => method.importSource.includes('/payment/')).sequences, [1]);
    assert.deepEqual(api.methods.find(method => method.importSource.includes('/home/')).sequences, [2]);
    assert.deepEqual(validateScreenApi(behavior('function local(movements: { open(): void }) { movements.open(2); }'),
        interaction('export default {};')), []);
});

test('API cache devuelve copias independientes y detecta cambios de contenido', () => {
    const code = behavior('movements.open();');
    const first = buildScreenApi(code);
    first.methods[0].method = 'corrupted';
    assert.equal(buildScreenApi(code).methods[0].method, 'open');
    code.files[0].content = code.files[0].content.replace('open()', 'close()');
    assert.equal(buildScreenApi(code).methods[0].method, 'close');
});

const invalidApis = [
    ['método ausente', 'await movements.filter("hoy");', 'class Screen {} export default new Screen();', 'TS2339'],
    ['tipo incompatible', 'await movements.filter("hoy");', 'class Screen { async filter(n: number) {} } export default new Screen();', 'TS2345'],
    ['argumento requerido ausente', 'await movements.filter();', 'class Screen { async filter(n: number) {} } export default new Screen();', 'TS2554'],
    ['argumento adicional', 'await movements.filter(1, 2);', 'class Screen { async filter(n: number) {} } export default new Screen();', 'TS2554'],
    ['retorno incompatible', 'const valid: boolean = await movements.filter();', 'class Screen { async filter() { return "ok"; } } export default new Screen();', 'TS2322'],
    ['export incorrecto', 'await movements.filter();', 'export class Screen { async filter() {} }', 'TS1192'],
    ['método privado', 'await movements.filter();', 'class Screen { private async filter() {} } export default new Screen();', 'TS2341'],
];
for (const [name, call, screen, diagnostic] of invalidApis) {
    test(`Derek detecta ${name} y asigna el diagnóstico al Screen de Zorem`, () => {
        const errors = validateScreenApi(behavior(`async function run() { ${call} }`), interaction(screen));
        assert.ok(errors.some(error => error.message.includes(diagnostic)), JSON.stringify(errors));
        assert.ok(errors.every(error => error.code === 'screen-api-mismatch' && error.file === 'screenobjects/payment/movements.screen.ts'));
    });
}

test('Derek admite métodos reutilizados con parámetros opcionales, rest y overloads compatibles', () => {
    const code = behavior(`async function run() {
        await movements.filter('hoy');
        await movements.filter(7);
        await movements.open();
        await movements.select('hoy', 'ayer');
    }`);
    assert.deepEqual(validateScreenApi(code, interaction(`class Screen {
        filter(period: string): Promise<void>;
        filter(period: number): Promise<void>;
        async filter(period: string | number) {}
        async open(force?: boolean) {}
        async select(...periods: string[]) {}
    } export default new Screen();`)), []);
});

test('API aislada deja imports externos al compilador del framework y respeta el dueño de cada Screen', () => {
    const code = behavior(`import home from '@screenobjects/home/home.screen.ts';
        home.external(); movements.open();`);
    assert.deepEqual(validateScreenApi(code, interaction(`import dependency from '@utils/helper';
        class Screen { open() { return dependency(); } } export default new Screen();`)), []);
});
