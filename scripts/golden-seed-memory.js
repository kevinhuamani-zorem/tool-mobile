#!/usr/bin/env node
/**
 * Siembra la memoria de automatizacion con los casos del golden dataset.
 *
 * La memoria (`runtime/automation-memory`) es local a cada maquina: una
 * instalacion nueva, otra PC u otro squad arrancan sin los casos que el QA ya
 * aprobo. Este script promueve cada caso golden validado al 100 % cuyo
 * fingerprint no este todavia en la memoria, con la respuesta ACEPTADA (las
 * correcciones del QA incluidas). No reescribe entradas existentes.
 *
 *   node scripts/golden-seed-memory.js [--root tests/golden] [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const { projectPaths } = require('../dist/core/workspace');
const { AutomationMemory, listGoldenCases, readGoldenCase, goldenDatasetRoot } = require('../dist/core/automation');

function parseArguments(argv) {
    const options = { root: goldenDatasetRoot(projectPaths), dryRun: false };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--root') options.root = path.resolve(argv[++index] || '');
        else if (argv[index] === '--dry-run') options.dryRun = true;
    }
    return options;
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    const cases = listGoldenCases(options.root);
    if (!cases.length) {
        console.log(`Sin casos golden en ${options.root}`);
        return;
    }
    const memory = new AutomationMemory();
    let seeded = 0;
    for (const directory of cases) {
        const goldenCase = readGoldenCase(directory);
        const name = path.basename(directory);
        const validationFile = path.join(directory, 'package', 'validation.json');
        const validation = fs.existsSync(validationFile)
            ? JSON.parse(fs.readFileSync(validationFile, 'utf8'))
            : { valid: goldenCase.manifest.validation.valid, qualityScore: goldenCase.manifest.validation.qualityScore, errors: [], warnings: [] };
        if (!validation.valid || validation.qualityScore !== 100) {
            console.log(`- ${name}: omitido (validación ${validation.qualityScore}, ${validation.valid ? 'válida' : 'inválida'})`);
            continue;
        }
        if (memory.find(goldenCase.scenario.fingerprint)) {
            console.log(`- ${name}: ya está en memoria (fingerprint ${goldenCase.scenario.fingerprint.slice(0, 12)}…)`);
            continue;
        }
        if (options.dryRun) {
            console.log(`- ${name}: se sembraría (dry-run)`);
            continue;
        }
        const entry = memory.promote(goldenCase.scenario, goldenCase.effectivePlan, goldenCase.response, validation, goldenCase.gaps);
        seeded += 1;
        console.log(`- ${name}: sembrado como v${entry.version}${goldenCase.manifest.edited ? ' (con correcciones del QA)' : ''}`);
    }
    console.log(`${seeded} caso(s) sembrado(s) en ${projectPaths.automationMemory}`);
}

try {
    main();
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
