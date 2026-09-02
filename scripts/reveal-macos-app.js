#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const recorderRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(recorderRoot, 'release');
const appName = 'Appium Visual Recorder.app';

function findApplication() {
    if (!fs.existsSync(releaseRoot)) return undefined;
    return fs.readdirSync(releaseRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('mac'))
        .map(entry => path.join(releaseRoot, entry.name, appName))
        .filter(candidate => fs.existsSync(candidate))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

const application = findApplication();
if (!application) {
    console.error(`No se encontró ${appName} dentro de ${releaseRoot}`);
    process.exit(1);
}

if (process.platform !== 'darwin' || process.env.RECORDER_SKIP_REVEAL === '1') {
    console.log(`Aplicación generada: ${application}`);
    process.exit(0);
}

const result = spawnSync('open', ['-R', application], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
    console.error(`La aplicación se generó, pero Finder no pudo mostrarla: ${application}`);
    process.exit(result.status || 1);
}
console.log(`Aplicación generada y mostrada en Finder: ${application}`);
