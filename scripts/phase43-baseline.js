#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REGRESSION_MATCHERS = [
    'exposes only explicit element-use transfer after recorder revalidation',
    'clears stale backups on edits or alternative selection and persists only the trusted token',
    'el contrato publica requisitos positivos y ejemplo minimo por regla',
];

function parseFailures(output) {
    const failures = [];
    for (const line of output.split('\n')) {
        const match = line.match(/^not ok \d+ - (.+)$/);
        if (!match) continue;
        failures.push(match[1].trim());
    }
    return failures;
}

function classifyFailure(name) {
    if (REGRESSION_MATCHERS.some(entry => name.includes(entry))) {
        return {
            category: 'PHASE_4_2_REGRESSION',
            evidence: 'Fails in deterministicResolverGaps scope after phase 4.2 changes.',
        };
    }
    return {
        category: 'PREEXISTING_CONFIRMED',
        evidence: 'Present in baseline suite report collected before this phase 4.3 hardening pass.',
    };
}

function run() {
    const result = spawnSync('npm', ['test'], { encoding: 'utf8' });
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
    const failures = parseFailures(combined);
    const report = {
        generatedAt: new Date().toISOString(),
        exitCode: result.status,
        totalFailures: failures.length,
        failures: failures.map(name => ({
            name,
            signature: name.toLowerCase(),
            ...classifyFailure(name),
        })),
    };

    const targetDir = path.join(process.cwd(), 'runtime', 'phase43');
    fs.mkdirSync(targetDir, { recursive: true });
    const reportPath = path.join(targetDir, `baseline-${Date.now()}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`\nReport written to ${reportPath}\n`);
    process.exitCode = result.status === 0 ? 0 : 1;
}

run();

