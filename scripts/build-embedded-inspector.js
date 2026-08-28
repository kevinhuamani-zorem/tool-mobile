const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'vendor', 'appium-inspector');
const commit = '4cbf81677b8a9c514f8ebbff896348ad07409086';
const hostOrigin = 'appium-recorder://host';
const cacheRoot = path.join(root, 'node_modules', '.cache', 'appium-inspector', commit);
const output = path.join(cacheRoot, 'dist-browser');
const sourceOutput = path.join(source, 'dist-browser');

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function hashesFor(directory) {
    const hashes = {};
    const visit = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
                continue;
            }
            if (!entry.isFile()) fail(`Asset no regular en el build del Inspector: ${absolute}`);
            const relative = path.relative(directory, absolute).split(path.sep).join('/');
            hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        }
    };
    visit(directory);
    return Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)));
}

function verifyCache() {
    const manifestPath = path.join(cacheRoot, 'manifest.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(path.join(output, 'embedded.html'))) return false;
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        return false;
    }
    if (manifest.commit !== commit || manifest.hostOrigin !== hostOrigin || !manifest.files) return false;
    return JSON.stringify(hashesFor(output)) === JSON.stringify(manifest.files);
}

if (!fs.existsSync(path.join(source, 'package-lock.json'))) {
    fail(
        'Falta el source fijado de Appium Inspector. Ejecuta: ' +
        'git submodule update --init --recursive vendor/appium-inspector',
    );
}

let actualCommit;
try {
    actualCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: source,
        encoding: 'utf8',
    }).trim();
} catch {
    fail('No se pudo verificar el commit del submódulo vendor/appium-inspector.');
}
if (actualCommit !== commit) {
    fail(`Appium Inspector debe estar en ${commit}; commit actual: ${actualCommit}`);
}
const dirtySource = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: source,
    encoding: 'utf8',
}).trim();
if (dirtySource) {
    fail('El submódulo de Appium Inspector tiene cambios locales; restaura el commit fijado antes de compilar.');
}

if (process.argv.includes('--check')) {
    if (!verifyCache()) {
        fail('Assets embebidos ausentes o alterados. Ejecuta: npm run inspector:build');
    }
    process.stdout.write(`Appium Inspector embebido listo: ${commit}\n`);
    process.exit(0);
}

execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: source,
    stdio: 'inherit',
});
execFileSync('npm', ['run', 'build:browser'], {
    cwd: source,
    env: {
        ...process.env,
        VITE_EMBEDDED_HOST_ORIGIN: hostOrigin,
    },
    stdio: 'inherit',
});

if (!fs.existsSync(path.join(sourceOutput, 'embedded.html'))) {
    fail('El build fijado no produjo dist-browser/embedded.html.');
}

const temporary = `${cacheRoot}.tmp-${process.pid}`;
fs.rmSync(temporary, { recursive: true, force: true });
fs.mkdirSync(temporary, { recursive: true });
fs.cpSync(sourceOutput, path.join(temporary, 'dist-browser'), { recursive: true });
const files = hashesFor(path.join(temporary, 'dist-browser'));
fs.writeFileSync(path.join(temporary, 'manifest.json'), `${JSON.stringify({
    commit,
    hostOrigin,
    buildCommand: 'npm run build:browser',
    files,
}, null, 2)}\n`);
fs.rmSync(cacheRoot, { recursive: true, force: true });
fs.renameSync(temporary, cacheRoot);
process.stdout.write(`Appium Inspector embebido compilado en ${output}\n`);
