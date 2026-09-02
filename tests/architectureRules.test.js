const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'check-architecture.js');

function fixture(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-architecture-'));
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'config', 'architecture-baseline.json'),
        JSON.stringify({ allowedCycles: [] })
    );
    for (const [relative, content] of Object.entries(files)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    }
    return root;
}

function check(root) {
    const result = spawnSync(process.execPath, [
        script,
        '--root',
        root,
        '--baseline',
        path.join(root, 'config', 'architecture-baseline.json'),
    ], { encoding: 'utf8' });
    return {
        status: result.status,
        output: JSON.parse(result.stdout),
    };
}

/**
 * Fase "retiro de fachadas" (ver ADR-0001): las 69 fachadas legadas de
 * `core/<nombre>.ts` que reexportaban la implementación real ya movida a un
 * módulo (`core/<módulo>/<capa>/<nombre>.ts`) fueron eliminadas. Todo
 * consumidor (composition roots, otros módulos, pruebas y scripts) migró a
 * la API pública de cada módulo (`core/<módulo>/index.ts` o
 * `core/<módulo>/contracts/index.ts`). `core/` ya solo contiene directorios
 * de módulo: no debe quedar ningún archivo plano sin clasificar.
 */

test('la arquitectura actual no agrega ciclos ni violaciones sobre el baseline', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.cycles, []);
    assert.deepEqual(output.violations, []);
    // Retirada la capa de compatibilidad, cada archivo de core/ está
    // clasificado en un módulo; no debe quedar ningún archivo plano.
    assert.deepEqual(output.unclassifiedFiles, []);
});

test('core/ solo contiene directorios de módulo, sin fachadas legadas planas', () => {
    const root = path.resolve(__dirname, '..');
    const coreRoot = path.join(root, 'core');
    const entries = fs.readdirSync(coreRoot, { withFileTypes: true });
    const flatFiles = entries.filter(entry => entry.isFile()).map(entry => entry.name);
    assert.deepEqual(flatFiles, []);
    const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.deepEqual(directories, [
        'automation',
        'coverage',
        'generation',
        'indexing',
        'mobile-session',
        'shared',
        'validation',
        'workspace',
    ]);
});

test('el módulo core/coverage no queda excluido como reporte de cobertura', () => {
    const root = path.resolve(__dirname, '..');
    const source = path.join(root, 'core/coverage/index.ts');
    assert.equal(fs.existsSync(source), true);
    const ignored = spawnSync(
        'git',
        ['check-ignore', '--quiet', 'core/coverage/index.ts'],
        { cwd: root },
    );
    assert.equal(ignored.status, 1, 'core/coverage debe poder versionarse');
});

test('validation expone contratos puros y también su infraestructura concreta', () => {
    const root = path.resolve(__dirname, '..');
    const publicApi = fs.readFileSync(path.join(root, 'core/validation/index.ts'), 'utf8');

    assert.match(publicApi, /AutomationValidation/);
    assert.match(publicApi, /OutputValidation/);
    assert.match(publicApi, /ValidationRuleContract/);
    assert.match(publicApi, /OutputValidator/);
    assert.match(publicApi, /AutomationResponseValidator/);
    assert.match(publicApi, /validateTypeScriptSyntax/);
    assert.match(publicApi, /buildValidationRuleContractFromFile/);
});


test('bloquea imports profundos entre módulos y validation hacia automation application', () => {
    const root = fixture({
        'core/automation/application/internal.ts': 'export const internal = true;',
        'core/validation/application/validate.ts':
            "import { internal } from '../../automation/application/internal'; export { internal };",
        'core/generation/application/generate.ts':
            "import { internal } from '../../automation/application/internal'; export { internal };",
    });
    const result = check(root);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.some(item =>
        item.code === 'deep-cross-module-import'
    ), true);
    assert.equal(result.output.violations.some(item =>
        item.code === 'validation-automation-boundary'
    ), true);
    assert.equal(result.output.violations.some(item =>
        item.code === 'generation-automation-boundary'
    ), true);
});

test('bloquea runtimes concretos desde domain y application', () => {
    const root = fixture({
        'core/automation/domain/model.ts': "import fs from 'node:fs'; export { fs };",
        'core/generation/application/generate.ts':
            "import { remote } from 'webdriverio'; export { remote };",
    });
    const result = check(root);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.filter(item =>
        item.code === 'runtime-import-outside-infrastructure'
    ).length, 2);
});

test('automation contracts no depende de validation ni generation', () => {
    const root = fixture({
        'core/validation/index.ts': 'export interface ValidationResult {}',
        'core/generation/index.ts': 'export interface GeneratedPreview {}',
        'core/automation/contracts/index.ts':
            "import type { ValidationResult } from '../../validation';\n" +
            "import type { GeneratedPreview } from '../../generation';\n" +
            'export type InvalidContract = ValidationResult & GeneratedPreview;',
    });
    const result = check(root);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.filter(item =>
        item.code === 'automation-contract-boundary'
    ).length, 2);
});

test('permite APIs públicas y bloquea domain hacia capas superiores', () => {
    const validRoot = fixture({
        'core/automation/contracts/index.ts': 'export interface GenerationPlan {}',
        'core/validation/application/validate.ts':
            "import type { GenerationPlan } from '../../automation/contracts'; export type Validated = GenerationPlan;",
        'core/generation/application/generate.ts':
            "import type { GenerationPlan } from '../../automation/contracts'; export type Generated = GenerationPlan;",
    });
    assert.equal(check(validRoot).status, 0);

    const invalidRoot = fixture({
        'core/automation/application/useCase.ts': 'export const useCase = true;',
        'core/automation/domain/model.ts':
            "import { useCase } from '../application/useCase'; export { useCase };",
    });
    const result = check(invalidRoot);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.some(item =>
        item.code === 'domain-layer-dependency'
    ), true);
});

test('bloquea application hacia infrastructure y renderer hacia core', () => {
    const root = fixture({
        'core/automation/infrastructure/repository.ts': 'export const repository = true;',
        'core/automation/application/useCase.ts':
            "import { repository } from '../infrastructure/repository'; export { repository };",
        'core/automation/index.ts': "export { repository } from './infrastructure/repository';",
        'recorder/renderer/src/view.ts':
            "import { repository } from '../../../core/automation'; export { repository };",
    });
    const result = check(root);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.some(item =>
        item.code === 'infrastructure-dependency'
    ), true);
    assert.equal(result.output.violations.some(item =>
        item.code === 'renderer-core-import'
    ), true);
});

test('ignora imports escritos dentro de plantillas de código generado', () => {
    const root = fixture({
        'core/automation/domain/template.ts':
            "export const template = `import { adapter } from '../infrastructure/adapter';`;",
        'core/automation/infrastructure/adapter.ts': 'export const adapter = true;',
    });
    assert.equal(check(root).status, 0);
});

test('bloquea ciclos nuevos y puertos fuera del módulo consumidor', () => {
    const root = fixture({
        'core/automation/domain/a.ts': "import { b } from './b'; export const a = b;",
        'core/automation/domain/b.ts': "import { a } from './a'; export const b = a;",
        'core/automation/application/AgentPort.ts': 'export interface AgentPort {}',
    });
    const result = check(root);
    assert.equal(result.status, 1);
    assert.equal(result.output.violations.some(item => item.code === 'dependency-cycle'), true);
    assert.equal(result.output.violations.some(item => item.code === 'misplaced-port'), true);
});
