#!/usr/bin/env node
// Preview: golden:save <recording> [--source recovery]. Review the printed files.
// Approve the exact file digest: golden:save <recording> --approve <digest> [--executed passed].
const fs = require('node:fs');
const path = require('node:path');
const { projectPaths } = require('../dist/core/workspace');
const { ReuseAnalyzer } = require('../dist/core/indexing');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { GeneratedFileRegistry, goldenHash } = require('../dist/core/automation');
const { GoldenCaseReview } = require('../dist/recorder/src/ipc/automation/goldenCase');

function parseArguments(argv) {
    const options = { executed: 'not-run', notes: '' };
    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--approve') options.approve = argv[++index];
        else if (value === '--source') options.source = argv[++index];
        else if (value === '--executed') options.executed = argv[++index];
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
    const review = new GoldenCaseReview({
        packageDirectory,
        frameworkRoot: projectPaths.frameworkRoot,
        reuseAnalyzer: new ReuseAnalyzer(),
        automationResponseValidator: new AutomationResponseValidator(),
        generatedFileRegistry: new GeneratedFileRegistry(),
    });
    const preview = review.prepare({ source: options.source });
    const digest = goldenHash(JSON.stringify(preview.files));
    if (!options.approve) { console.log(JSON.stringify({ ...preview, token: undefined, approvalDigest: digest }, null, 2)); return; }
    if (options.approve !== digest) throw new Error('El contenido cambió o el hash no coincide. Revisa el preview y usa --approve <approvalDigest>.');
    const saved = review.save({ token: preview.token, approved: true, executed: options.executed, notes: options.notes });
    console.log(`Caso guardado en ${saved.directory}`);
    console.log(`  ${saved.manifest.caseId} · ${saved.manifest.recordingId} · ejecución: ${saved.manifest.executed}` +
        `${saved.manifest.edited ? ' · con correcciones del QA' : ''}`);
    if (saved.indexWarning || saved.historyWarning) console.log(saved.indexWarning || saved.historyWarning);
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
