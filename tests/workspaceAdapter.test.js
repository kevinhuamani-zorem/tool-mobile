const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const recorderRoot = path.resolve(__dirname, '..');
const standaloneRoot = path.join(recorderRoot, 'runtime', 'test-standalone-workspace');

function inspectMode(mode, targetProject) {
    const script = [
        `const {getWorkspaceAdapter}=require('./dist/core/workspaceAdapter');`,
        `const a=getWorkspaceAdapter(); a.initialize();`,
        `process.stdout.write(JSON.stringify(a.describe()));`
    ].join('');
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: recorderRoot,
        env: {
            ...process.env,
            RECORDER_MODE: mode,
            TARGET_PROJECT: targetProject
        },
        encoding: 'utf-8'
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('el adaptador standalone crea su workspace dentro del recorder', () => {
    const info = inspectMode('standalone', standaloneRoot);
    assert.equal(info.mode, 'standalone');
    assert.equal(info.integrated, false);
    assert.equal(info.root, standaloneRoot);
    assert.equal(fs.existsSync(path.join(standaloneRoot, 'package.json')), true);
    assert.equal(
        fs.existsSync(path.join(standaloneRoot, 'screenobjects/commons/base.screen.ts')),
        true
    );
    assert.equal(standaloneRoot.startsWith(path.join(recorderRoot, 'runtime')), true);
});

test('el adaptador neutral confina su salida al recorder', () => {
    const neutralRoot = path.join(recorderRoot, 'runtime', 'test-neutral-workspace');
    const info = inspectMode('neutral', neutralRoot);
    assert.equal(info.mode, 'neutral');
    assert.equal(info.output, 'neutral');
    assert.equal(info.root.startsWith(path.join(recorderRoot, 'runtime')), true);
});

test('standalone previsualiza las cuatro capas sin depender de fwk-mobile', () => {
    const script = [
        `const {getWorkspaceAdapter}=require('./dist/core/workspaceAdapter');`,
        `getWorkspaceAdapter().initialize();`,
        `const {FwkMobileGenerator}=require('./dist/core/fwkMobileGenerator');`,
        `const steps=[{action:'CLICK',variableName:'btnContinuar',selector:'~Continuar'}];`,
        `const preview=new FwkMobileGenerator().preview({`,
        `squad:'default',featureName:'Standalone',scenarioName:'Continuar',`,
        `fileName:'standalone',locatorModule:'standalone',caseId:'TC-10239',`,
        `pathType:'Happy Path',tag:'standalone',platform:'android',`,
        `scenarioRows:[{keyword:'Given',text:'el usuario continúa',status:'missing',actions:steps}]`,
        `},steps);`,
        `process.stdout.write(JSON.stringify(preview.files));`
    ].join('');
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: recorderRoot,
        env: {
            ...process.env,
            RECORDER_MODE: 'standalone',
            TARGET_PROJECT: standaloneRoot
        },
        encoding: 'utf-8'
    });
    assert.equal(result.status, 0, result.stderr);
    const files = JSON.parse(result.stdout);
    assert.equal(files.length, 4);
    assert.equal(files.every(file => file.startsWith(standaloneRoot)), true);
});
