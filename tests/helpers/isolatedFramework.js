'use strict';
// Framework fwk-mobile aislado para tests que escriben en el destino.
//
// Copia el estado COMMITEADO del framework padre (git archive HEAD) a una
// carpeta temporal y apunta el workspace del recorder a ella, con su propio
// runtime (recordings, memoria, registro de archivos generados). Asi el test
// no depende de lo que el QA tenga sin commitear en su working tree y nunca
// escribe en el framework real.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { configureWorkspacePaths, projectPaths } = require('../../dist/core/workspace');

const SOURCE_FRAMEWORK_ROOT = projectPaths.frameworkRoot;

function copyCommittedFramework(sourceRoot, targetRoot) {
    fs.mkdirSync(targetRoot, { recursive: true });
    const archive = execFileSync('git', ['-C', sourceRoot, 'archive', '--format=tar', 'HEAD'], {
        maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync('tar', ['-x', '-C', targetRoot], { input: archive });
}

function isolatedFramework(t, prefix = 'avr-isolated-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const frameworkRoot = path.join(root, 'framework');
    const runtimeRoot = path.join(root, 'recorder');
    copyCommittedFramework(SOURCE_FRAMEWORK_ROOT, frameworkRoot);
    fs.mkdirSync(runtimeRoot, { recursive: true });
    configureWorkspacePaths({ targetProject: frameworkRoot, runtimeRoot, source: 'selected' });
    t.after(() => {
        configureWorkspacePaths({ targetProject: SOURCE_FRAMEWORK_ROOT, runtimeRoot: projectPaths.toolRoot, source: 'auto' });
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { root, frameworkRoot, runtimeRoot };
}

module.exports = { isolatedFramework, SOURCE_FRAMEWORK_ROOT };
