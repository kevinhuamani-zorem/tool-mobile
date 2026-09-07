#!/usr/bin/env node
/**
 * Guarda como caso golden una grabacion ya aplicada, desde la terminal.
 *
 * Es la misma operacion que «Guardar como dataset» en la revision del
 * recorder, para cuando el QA ejecuto el caso dias despues y corrigio un
 * step directamente en el framework: lo aceptado es lo que hay en disco.
 *
 *   node scripts/golden-save.js <recordingDir|recordingId> [--executed passed|failed|not-run] [--notes "..."]
 *
 * `recordingDir` es la carpeta bajo runtime/recordings (o su nombre);
 * `recordingId` es el `rec-...` del manifest. Requiere `npm run build:main`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { projectPaths } = require('../dist/core/workspace');
const { ReuseAnalyzer } = require('../dist/core/indexing');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { GeneratedFileRegistry } = require('../dist/core/automation');
const { saveGoldenCaseFromPackage } = require('../dist/recorder/src/ipc/automation/goldenCase');

function parseArguments(argv) {
    const options = { executed: 'not-run', notes: '' };
    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--executed') options.executed = argv[++index];
        else if (value === '--notes') options.notes = argv[++index] || '';
        else positional.push(value);
    }
    return { options, target: positional[0] };
}

function resolvePackageDirectory(target) {
    if (!target) throw new Error('Indica la carpeta o el recordingId de la grabación.');
    const direct = path.isAbsolute(target) ? target : path.join(projectPaths.recordings, target);
    if (fs.existsSync(path.join(direct, 'generation', 'automation', 'agent-response.json'))) {
        return path.join(direct, 'generation', 'automation');
    }
    for (const entry of fs.readdirSync(projectPaths.recordings, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifest = path.join(projectPaths.recordings, entry.name, 'manifest.json');
        if (!fs.existsSync(manifest)) continue;
        const { recordingId } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (recordingId === target || String(recordingId || '').endsWith(target)) {
            return path.join(projectPaths.recordings, entry.name, 'generation', 'automation');
        }
    }
    throw new Error(`No se encontró una grabación aplicada para ${target}`);
}

function main() {
    const { options, target } = parseArguments(process.argv.slice(2));
    if (!['passed', 'failed', 'not-run'].includes(options.executed)) {
        throw new Error('--executed admite passed | failed | not-run');
    }
    const packageDirectory = resolvePackageDirectory(target);
    if (!fs.existsSync(path.join(packageDirectory, 'agent-response.json'))) {
        throw new Error(`La grabación no tiene una automatización aplicada: ${packageDirectory}`);
    }
    const saved = saveGoldenCaseFromPackage({
        packageDirectory,
        frameworkRoot: projectPaths.frameworkRoot,
        reuseAnalyzer: new ReuseAnalyzer(),
        automationResponseValidator: new AutomationResponseValidator(),
        generatedFileRegistry: new GeneratedFileRegistry(),
    }, { executed: options.executed, notes: options.notes });
    console.log(`Caso guardado en ${saved.directory}`);
    console.log(`  ${saved.manifest.caseId} · ${saved.manifest.recordingId} · ejecución: ${saved.manifest.executed}` +
        `${saved.manifest.edited ? ' · con correcciones del QA' : ''}`);
    if (saved.appliedEdits.length) console.log(`  correcciones aplicadas al framework: ${saved.appliedEdits.join(', ')}`);
}

try {
    main();
} catch (error) {
    console.error(`✗ ${error.message}`);
    if (error.validation?.errors?.length) {
        for (const issue of error.validation.errors) console.error(`  - ${issue.code}: ${issue.message}`);
    }
    process.exit(1);
}
