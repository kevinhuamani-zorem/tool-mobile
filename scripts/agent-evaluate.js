#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { projectPaths } = require('../dist/core/workspace');
const { evaluateAutomationPackages, findAutomationPackages, goldenDatasetRoot } = require('../dist/core/automation');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
try {
    const report = evaluateAutomationPackages(findAutomationPackages(option('--recordings') || projectPaths.recordings), option('--golden-root') || goldenDatasetRoot());
    const output = option('--output');
    if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
    console.log(JSON.stringify(report, null, 2));
    if (report.issues.length || report.corpus.issues.length) process.exitCode = 1;
    else if (report.status === 'not-evaluated') process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
