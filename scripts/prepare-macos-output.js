const fs = require('node:fs');
const path = require('node:path');

const recorderRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(recorderRoot, 'release');
const macOutputPattern = /^mac(?:-(?:arm64|x64|universal))?$/;

if (!fs.existsSync(releaseRoot)) process.exit(0);

for (const entry of fs.readdirSync(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !macOutputPattern.test(entry.name)) continue;
    const outputDirectory = path.join(releaseRoot, entry.name);
    fs.rmSync(outputDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    console.log(`Salida macOS anterior eliminada: ${outputDirectory}`);
}
