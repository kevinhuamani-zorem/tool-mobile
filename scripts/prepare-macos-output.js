const fs = require('node:fs');
const path = require('node:path');

const recorderRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(recorderRoot, 'release');
const macOutputPattern = /^mac(?:-(?:arm64|x64|universal))?$/;
const FINDER_ARTIFACTS = new Set(['.DS_Store']);
const MAX_ATTEMPTS = 5;

if (!fs.existsSync(releaseRoot)) process.exit(0);

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function onlyFinderArtifactsLeft(directory) {
    try {
        return fs.readdirSync(directory).every((name) => FINDER_ARTIFACTS.has(name));
    } catch {
        return true;
    }
}

function removeOutputDirectory(outputDirectory) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            fs.rmSync(outputDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            return true;
        } catch (error) {
            // Finder recrea .DS_Store dentro de la carpeta mientras la tiene abierta
            // (reveal-macos-app.js la muestra al final de cada empaquetado). Si solo
            // queda ese archivo, la carpeta ya está vacía a efectos del empaquetado.
            const finderCollision = ['ENOTEMPTY', 'EPERM', 'EBUSY'].includes(error.code);
            if (finderCollision && onlyFinderArtifactsLeft(outputDirectory)) {
                if (attempt < MAX_ATTEMPTS) {
                    sleep(200 * attempt);
                    continue;
                }
                console.warn(`Finder mantiene abierta ${outputDirectory}; se reutiliza vacía.`);
                return false;
            }
            throw error;
        }
    }
    return false;
}

for (const entry of fs.readdirSync(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !macOutputPattern.test(entry.name)) continue;
    const outputDirectory = path.join(releaseRoot, entry.name);
    if (removeOutputDirectory(outputDirectory)) {
        console.log(`Salida macOS anterior eliminada: ${outputDirectory}`);
    }
}
