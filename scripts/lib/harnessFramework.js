// Read a pinned tree without checking out or mutating the QA framework.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sha256 } = require('./harnessCorpus');
const git = (root, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function assertPlainDirectory(root) {
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Se requiere un directorio sin enlaces: ${root}`);
}
function assertOutsideSources(destination, sources) {
    let parent = path.resolve(destination), suffix = [];
    while (!fs.existsSync(parent)) { suffix.unshift(path.basename(parent)); parent = path.dirname(parent); }
    const resolved = path.join(fs.realpathSync(parent), ...suffix);
    for (const source of sources) {
        const relative = path.relative(fs.realpathSync(source), resolved);
        if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('El baseline debe estar fuera de los checkouts fuente.');
    }
}
function readFrameworkArchive(source, commit) {
    if (!/^[a-f0-9]{40,64}$/.test(commit || '')) throw new Error('Fija el hash completo del commit del framework.');
    if (git(source, ['rev-parse', '--verify', `${commit}^{commit}`]) !== commit) throw new Error('El commit fijado no coincide con el objeto resuelto.');
    const records = git(source, ['ls-tree', '-rz', commit]).split('\0').filter(Boolean);
    for (const record of records) {
        const separator = record.indexOf('\t'), meta = record.slice(0, separator), name = record.slice(separator + 1);
        if (!/^100(644|755) blob [a-f0-9]+$/.test(meta)) throw new Error('El framework fijado contiene enlaces o submódulos sin snapshot.');
        if (separator < 0 || name.includes('\\') || path.isAbsolute(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Ruta inválida en el framework fijado.');
    }
    const bytes = execFileSync('git', ['-C', source, 'archive', '--format=tar', commit], { maxBuffer: 256 * 1024 * 1024 });
    return { commit, tree: git(source, ['rev-parse', `${commit}^{tree}`]), bytes, sha256: sha256(bytes) };
}
module.exports = { readFrameworkArchive, assertOutsideSources, assertPlainDirectory };
