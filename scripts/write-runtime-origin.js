#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const recorderRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(recorderRoot, 'package.json'), 'utf8'));
if (manifest.name !== 'appium-visual-recorder') {
    throw new Error(`No se reconoció la raíz del visual-recorder: ${recorderRoot}`);
}

const output = path.join(recorderRoot, 'build', 'runtime-origin.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({
    schemaVersion: 1,
    runtimeRoot: recorderRoot,
}, null, 2)}\n`, 'utf8');
console.log(`Runtime externo registrado para la .app: ${recorderRoot}`);
