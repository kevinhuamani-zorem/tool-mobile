'use strict';
// Framework fwk-mobile aislado para tests que escriben en el destino.
//
// Copia el estado COMMITEADO del framework padre (HEAD por defecto, o un
// commit completo explícito para fixtures históricas) a una
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

function copyCommittedFramework(sourceRoot, targetRoot, commit = 'HEAD') {
    fs.mkdirSync(targetRoot, { recursive: true });
    const archive = execFileSync('git', ['-C', sourceRoot, 'archive', '--format=tar', commit], {
        maxBuffer: 256 * 1024 * 1024,
    });
    execFileSync('tar', ['-x', '-C', targetRoot], { input: archive });
}

function isolatedFramework(t, prefix = 'avr-isolated-', options = {}) {
    const commit = options.commit || 'HEAD';
    if (options.commit !== undefined) {
        if (typeof options.commit !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(options.commit)) {
            throw new Error('El framework de una fixture requiere el hash completo de un commit.');
        }
        // Fail explicitly when unavailable; never fall back to the current branch.
        execFileSync('git', ['-C', SOURCE_FRAMEWORK_ROOT, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'pipe' });
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const frameworkRoot = path.join(root, 'framework');
    const runtimeRoot = path.join(root, 'recorder');
    copyCommittedFramework(SOURCE_FRAMEWORK_ROOT, frameworkRoot, commit);
    // Synthetic positive cases need real fixture names now that login data is validated.
    // This file exists only in this temporary checkout; no credentials or QA data are changed.
    const dataDirectory = path.join(frameworkRoot, 'resources/data/recorder-tests');
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(path.join(dataDirectory, 'synthetic-users.yml'),
        ['QA', 'Usuario QA', 'Usuario QA Temporal'].map(name => `- name: ${name}\n`).join(''));
    fs.mkdirSync(runtimeRoot, { recursive: true });
    configureWorkspacePaths({ targetProject: frameworkRoot, runtimeRoot, source: 'selected' });
    t.after(() => {
        configureWorkspacePaths({ targetProject: SOURCE_FRAMEWORK_ROOT, runtimeRoot: projectPaths.toolRoot, source: 'auto' });
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { root, frameworkRoot, runtimeRoot };
}

module.exports = { isolatedFramework, SOURCE_FRAMEWORK_ROOT };
