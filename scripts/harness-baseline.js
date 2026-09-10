#!/usr/bin/env node
'use strict';
// H0 freezes committed target inputs. It does not install packages, invoke agents or grant QA approval.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readHarnessCorpus, confinedFile, sha256 } = require('./lib/harnessCorpus');
const { readFrameworkArchive, assertOutsideSources, assertPlainDirectory } = require('./lib/harnessFramework');
const git = (root, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function engineCheck(version, required) {
    // Deliberately narrow: unknown ranges remain unverified instead of being guessed compatible.
    const wanted = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(required || '');
    const actual = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
    if (!wanted || !actual) return { version: version || null, required: required || null, status: 'unverified' };
    const a = actual.slice(1).map(Number), b = wanted.slice(1).map(Number);
    let comparison = 0;
    for (let i = 0; i < 3 && !comparison; i++) comparison = a[i] - b[i];
    return { version, required, status: comparison >= 0 ? 'compatible' : 'incompatible' };
}
function treeFingerprint(root) {
    assertPlainDirectory(root);
    const entries = [];
    function visit(relative) {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            const name = path.posix.join(relative, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`No se permiten enlaces en el baseline: ${name}`);
            if (entry.isDirectory()) visit(name);
            else if (entry.isFile()) entries.push([name, sha256(fs.readFileSync(path.join(root, name)))]);
        }
    }
    visit('');
    return { sha256: sha256(JSON.stringify(entries)), files: entries.length };
}
function recorderIdentity(root) {
    const names = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)
        .filter(name => /^(core|recorder|renderer|scripts|tests|config)\//.test(name) || /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.[jt]s)$/.test(name));
    const rows = [...new Set(names)].sort().map(name => {
        const file = path.join(root, name);
        if (!fs.existsSync(file)) return [name, 'deleted'];
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Código fuente enlazado: ${name}`);
        return [name, sha256(fs.readFileSync(file))];
    });
    const built = path.join(root, 'dist/core');
    return { commit: git(root, ['rev-parse', 'HEAD']), source: { sha256: sha256(JSON.stringify(rows)), files: rows.length },
        workingTree: git(root, ['status', '--short', '--untracked-files=all']),
        lockfileSha256: sha256(fs.readFileSync(path.join(root, 'package-lock.json'))),
        builtCore: fs.existsSync(built) ? treeFingerprint(built) : null };
}
function prepareHarnessBaseline(options, dependencies = {}) {
    if (!/^[a-f0-9]{40,64}$/.test(options.frameworkCommit || '')) throw new Error('Fija el hash completo del commit del framework.');
    const directory = path.resolve(options.directory), framework = fs.realpathSync(options.framework);
    const recorder = fs.realpathSync(options.recorder || path.resolve(__dirname, '..'));
    if (fs.existsSync(directory)) throw new Error('Usa un directorio nuevo; la evidencia anterior se conserva.');
    assertOutsideSources(directory, [framework, recorder]);
    const corpus = readHarnessCorpus(options.corpus || path.join(recorder, 'tests/fixtures/agent-harness/corpus.json'));
    const archived = readFrameworkArchive(framework, options.frameworkCommit), resolved = archived.commit;
    const recorderInfo = recorderIdentity(recorder);
    const packageBytes = execFileSync('git', ['-C', framework, 'show', `${resolved}:package.json`]);
    const lockBytes = execFileSync('git', ['-C', framework, 'show', `${resolved}:package-lock.json`], { maxBuffer: 32 * 1024 * 1024 });
    const pkg = JSON.parse(packageBytes), lock = JSON.parse(lockBytes);
    const runtime = dependencies.runtime || { node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() };
    const engines = { node: engineCheck(runtime.node, pkg.engines?.node), npm: engineCheck(runtime.npm, pkg.engines?.npm) };
    const worktree = { head: git(framework, ['rev-parse', 'HEAD']), status: git(framework, ['status', '--short', '--untracked-files=all']) };
    // Archive only the selected commit: prior Recorder exports and QA working changes cannot enter the baseline.
    const archive = archived.bytes;
    fs.mkdirSync(directory, { recursive: true });
    try {
        const target = path.join(directory, 'framework');
        fs.mkdirSync(target);
        execFileSync('tar', ['-x', '-C', target], { input: archive });
        if (fs.existsSync(path.join(target, 'node_modules'))) throw new Error('El commit contiene dependencias vendorizadas; revisa su procedencia antes del piloto.');
        for (const file of corpus.files) {
            const destination = path.join(directory, 'corpus', file.path);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, file.content, { flag: 'wx' });
        }
        const blockers = ['target-dependencies-not-provisioned', 'corpus-qa-review-pending'];
        if (Object.values(engines).some(row => row.status !== 'compatible')) blockers.push('target-runtime-not-compatible-or-unverified');
        if (!recorderInfo.builtCore) blockers.push('recorder-build-missing');
        const manifest = { schemaVersion: 1, protocol: 'recorder-harness-baseline/v1', createdAt: new Date().toISOString(),
            recorder: recorderInfo, toolRuntime: { ...runtime, platform: process.platform, arch: process.arch },
            framework: { commit: resolved, tree: archived.tree, snapshot: 'framework',
                snapshotFingerprint: treeFingerprint(target), archiveSha256: sha256(archive), packageSha256: sha256(packageBytes),
                lockfileSha256: sha256(lockBytes), lockfileVersion: lock.lockfileVersion ?? null, engines,
                sourceWorktree: worktree, sourceWorkingChangesIncluded: false, dependencies: { status: 'not-provisioned', installExecuted: false } },
            corpus: { id: corpus.manifest.corpusId, manifest: 'corpus/corpus.json', sha256: corpus.sha256,
                files: corpus.files.map(({ content, ...row }) => row), cases: corpus.cases.map(row => ({ id: row.id, caseId: row.caseId,
                    family: row.family, synthetic: row.synthetic, qaReview: row.qaReview, pilotEligible: row.pilotEligible })) },
            readiness: { baselineCaptured: true, pilot: 'not-ready', blockers },
            policies: { automaticPassLimit: 2, exportDraftsAllowed: true, goldenApproval: 'explicit-qa-only' },
            execution: { providerInvoked: false, functionalExecution: 'not-evaluated', approval: 'not-granted' } };
        write(path.join(directory, 'manifest.json'), manifest);
        write(path.join(directory, 'manifest-digest.json'), { sha256: sha256(fs.readFileSync(path.join(directory, 'manifest.json'))) });
        return manifest;
    } catch (error) {
        write(path.join(directory, 'preparation-error.json'), { status: 'incomplete', message: error.message });
        throw error;
    }
}
function verifyHarnessBaseline(directory) {
    assertPlainDirectory(directory);
    assertPlainDirectory(path.join(directory, 'corpus'));
    const manifestFile = confinedFile(directory, 'manifest.json');
    if (sha256(fs.readFileSync(manifestFile)) !== json(confinedFile(directory, 'manifest-digest.json')).sha256) throw new Error('El manifiesto del baseline cambió.');
    const manifest = json(manifestFile);
    if (manifest.protocol !== 'recorder-harness-baseline/v1') throw new Error('Protocolo de baseline no soportado.');
    if (sha256(fs.readFileSync(path.join(directory, 'corpus/corpus.json'))) !== manifest.corpus.sha256) throw new Error('El corpus fijado cambió.');
    readHarnessCorpus(path.join(directory, 'corpus/corpus.json'));
    if (treeFingerprint(path.join(directory, 'framework')).sha256 !== manifest.framework.snapshotFingerprint.sha256) throw new Error('El framework fijado cambió.');
    return manifest;
}
function main(argv = process.argv.slice(2)) {
    if (argv.includes('--help')) {
        console.log('harness:baseline --framework PATH --framework-commit FULL_HASH --directory NEW_PATH [--corpus FILE]\nharness:baseline --verify DIRECTORY\nCaptura offline; no instala dependencias ni ejecuta agentes/dispositivos. Exit 0: captura/integridad correctas; exit 2: preparación inválida. pilotReady se informa por separado.');
        return 0;
    }
    const allowed = new Set(['--framework', '--framework-commit', '--directory', '--corpus', '--verify']);
    const values = {};
    for (let i = 0; i < argv.length; i += 2) {
        if (!allowed.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--') || values[argv[i]]) throw new Error(`Argumento inválido: ${argv[i]}`);
        values[argv[i]] = argv[i + 1];
    }
    if (values['--verify'] && Object.keys(values).length !== 1) throw new Error('Usa --verify sin opciones de preparación.');
    if (!values['--verify'] && (!values['--framework'] || !values['--framework-commit'] || !values['--directory'])) throw new Error('Se requieren --framework, --framework-commit y --directory.');
    const manifest = values['--verify'] ? verifyHarnessBaseline(values['--verify']) : prepareHarnessBaseline({ framework: values['--framework'],
        frameworkCommit: values['--framework-commit'], directory: values['--directory'], corpus: values['--corpus'] });
    console.log(JSON.stringify({ protocol: manifest.protocol, frameworkCommit: manifest.framework.commit, corpus: manifest.corpus.id,
        cases: manifest.corpus.cases.length, readiness: manifest.readiness, execution: manifest.execution }, null, 2));
    return 0;
}
if (require.main === module) {
    try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
module.exports = { prepareHarnessBaseline, verifyHarnessBaseline, engineCheck, recorderIdentity, main };
