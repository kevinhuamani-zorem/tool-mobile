const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FrameworkCompilationValidator, includeFrameworkCompilation } = require('../dist/core/validation');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-compilation-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (name, text) => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    };
    write('base.json', JSON.stringify({ compilerOptions: {
        strict: true, types: [], target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        resolveJsonModule: true, allowSyntheticDefaultImports: true, baseUrl: '.',
        paths: { '@screenobjects/*': ['screenobjects/*'], '@locators/*': ['resources/locators/*'] },
    } }));
    write('tsconfig.json', JSON.stringify({ extends: './base.json', include: ['**/*.ts'] }));
    write('screenobjects/base.ts', 'export default class Base { click(value: number): void {} }');
    const files = [
        { path: 'features/new.steps.ts', before: null, content: "import screen from '@screenobjects/new'; screen.open(1);" },
        { path: 'screenobjects/new.ts', before: null, content: "import Base from '@screenobjects/base'; import locators from '@locators/new.json'; class Screen extends Base { open(value: number) { this.click(value); return locators.newAndroid.button; } }; export default new Screen();" },
        { path: 'resources/locators/new.json', before: null, content: JSON.stringify({ newAndroid: { button: 'Botón' } }) },
    ];
    const validate = () => new FrameworkCompilationValidator().validate(root, files);
    return { root, files, write, validate };
}

test('compila overlay de Steps, Screen y JSON nuevos con aliases y extends reales sin escribir', t => {
    const f = fixture(t);
    const result = f.validate();
    assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
    assert.ok(result.filesRead > 0);
    assert.ok(result.bytesRead > 0);
    assert.ok(result.checkedFiles > 3);
    assert.ok(result.durationMs > 0);
    for (const file of f.files) assert.equal(fs.existsSync(path.join(f.root, file.path)), false);
    assert.equal(fs.existsSync(path.join(f.root, 'tsconfig.tsbuildinfo')), false);
});

test('detecta método inexistente, argumento incorrecto y key JSON inexistente', t => {
    const f = fixture(t);
    f.files[0].content = "import screen from '@screenobjects/new'; screen.missing(); screen.open('wrong');";
    f.files[1].content = f.files[1].content.replace('.button', '.missing');
    const result = f.validate();
    assert.equal(result.status, 'failed');
    assert.ok(result.diagnostics.some(item => item.code === 2345 && item.file === 'features/new.steps.ts'));
    assert.equal(result.diagnostics.filter(item => item.code === 2339).length, 2);
    assert.ok(result.diagnostics.every(item => item.line && item.column));
});

test('no atribuye deuda preexistente al caso ni escanea suites ajenas', t => {
    const f = fixture(t);
    f.write('screenobjects/base.ts', 'export default class Base { click(value: number): void {} }\nconst legacy: number = "old debt";');
    f.write('unrelated/broken.ts', 'this is not valid TypeScript !!!');
    const result = f.validate();
    assert.equal(result.status, 'preexisting-errors');
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.preexistingDiagnostics.length, 1);
    assert.equal(result.preexistingDiagnostics[0].file, 'screenobjects/base.ts');
});

test('un update con líneas desplazadas conserva deuda pero detecta ocurrencias nuevas', t => {
    const f = fixture(t);
    const before = 'const old: number = "debt"; export {};';
    f.write('features/new.steps.ts', before);
    f.files[0].before = before;
    f.files[0].content = '\n\n' + before + '\nconst fresh: number = "debt";';
    const result = f.validate();
    assert.equal(result.status, 'failed');
    assert.equal(result.preexistingDiagnostics.length, 1);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(fs.readFileSync(path.join(f.root, 'features/new.steps.ts'), 'utf8'), before);
});

test('falta de tsconfig o tipos no se interpreta como compilación exitosa', t => {
    const f = fixture(t);
    f.write('tsconfig.json', JSON.stringify({ compilerOptions: { types: ['nonexistent-recorder-type'] } }));
    assert.equal(f.validate().status, 'unavailable');
    fs.unlinkSync(path.join(f.root, 'tsconfig.json'));
    const missing = f.validate();
    assert.equal(missing.status, 'unavailable');
    assert.ok(missing.diagnostics.length);
});

test('import ausente incluso heredado impide afirmar compilación correcta', t => {
    const f = fixture(t);
    f.write('screenobjects/base.ts', "import { missing } from 'not-installed'; export default class Base { click(value: number): void { missing(); } }");
    const result = f.validate();
    assert.equal(result.status, 'unavailable');
    assert.ok(result.preexistingDiagnostics.some(item => item.code === 2307));
});

test('revalida cambios en dependencias y no reutiliza un resultado obsoleto', t => {
    const f = fixture(t);
    assert.equal(f.validate().status, 'passed');
    f.write('screenobjects/base.ts', 'export default class Base { click(value: string): void {} }');
    assert.ok(f.validate().diagnostics.some(item => item.code === 2345));
});

test('respeta NodeNext, package type y los imports con atributo JSON', t => {
    const f = fixture(t);
    f.write('package.json', JSON.stringify({ type: 'module' }));
    f.write('tsconfig.json', JSON.stringify({ extends: './base.json', compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', allowImportingTsExtensions: true } }));
    f.files[0].content = f.files[0].content.replace("@screenobjects/new'", "@screenobjects/new.ts'");
    f.files[1].content = f.files[1].content.replace("@screenobjects/base'", "@screenobjects/base.ts'")
        .replace("from '@locators/new.json';", "from '@locators/new.json' with { type: 'json' };");
    const result = f.validate();
    assert.equal(result.status, 'passed', JSON.stringify(result.diagnostics));
});

test('rechaza escapes, duplicados y symlinks del overlay', t => {
    const f = fixture(t);
    f.files.push({ path: '../escape.ts', content: '', before: null });
    assert.equal(f.validate().status, 'unavailable');
    f.files.pop();
    f.files.push(f.files[0]);
    assert.equal(f.validate().status, 'unavailable');
    f.files.pop();
    fs.symlinkSync(path.join(f.root, 'screenobjects/base.ts'), path.join(f.root, 'screenobjects/new.ts'));
    assert.equal(f.validate().status, 'unavailable');
});

test('diagnósticos alimentan validación y reparación; deuda sola sigue como advertencia', () => {
    const validation = { valid: true, qualityScore: 100, errors: [], warnings: [] };
    includeFrameworkCompilation(validation, { status: 'preexisting-errors', diagnostics: [], preexistingDiagnostics: [{}] });
    assert.equal(validation.valid, true);
    assert.equal(validation.warnings.length, 1);
    includeFrameworkCompilation(validation, { status: 'failed', diagnostics: [{ code: 2339, file: 'screenobjects/a.ts', line: 2, column: 4, message: 'Missing method' }], preexistingDiagnostics: [] });
    assert.equal(validation.valid, false);
    assert.deepEqual(validation.repairContext.affectedFiles, ['screenobjects/a.ts']);
    assert.match(validation.errors[0].message, /TS2339 \(2:4\)/);
});

test('configuración inválida, noCheck y project references no producen un aprobado falso', t => {
    const f = fixture(t);
    for (const content of ['{ broken', JSON.stringify({ compilerOptions: { noCheck: true } }),
        JSON.stringify({ references: [{ path: './referenced' }] })]) {
        f.write('tsconfig.json', content);
        const report = f.validate();
        assert.equal(report.status, 'unavailable');
        assert.ok(report.diagnostics.length > 0);
    }
});
