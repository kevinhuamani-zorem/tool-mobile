#!/usr/bin/env node
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** TAP top-level outcomes; skipped/todo tests never prove a failure was fixed. */
function parseTests(output) {
    return [...output.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)].map(match => {
        const directive = match[2].match(/ # (SKIP|TODO)\b/i);
        return {
            name: match[2].replace(/ # (?:SKIP|TODO)\b.*$/i, '').trim(),
            outcome: directive ? directive[1].toLowerCase() : match[1] === 'ok' ? 'passed' : 'failed',
        };
    });
}

function compareTests(current, baseline) {
    const unique = (tests, name) => {
        const matching = tests.filter(test => test.name === name);
        return matching.length === 1 ? matching[0] : undefined;
    };
    return {
        failures: current.filter(test => test.outcome === 'failed').map(test => ({
            ...test,
            category: !baseline ? 'UNBASELINED'
                : !unique(current, test.name) ? 'AMBIGUOUS'
                    : unique(baseline, test.name)?.outcome === 'failed' ? 'PREEXISTING'
                        : unique(baseline, test.name)?.outcome === 'passed' ? 'REGRESSION' : 'UNBASELINED',
        })),
        resolved: (baseline || []).filter(test => test.outcome === 'failed'
            && unique(baseline, test.name) && unique(current, test.name)?.outcome === 'passed'),
        notReevaluated: (baseline || []).filter(test => test.outcome === 'failed'
            && !['passed', 'failed'].includes(unique(current, test.name)?.outcome)),
    };
}

function context(frameworkRoot, toolRoot) {
    const git = (cwd, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const digest = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    const worktreeHash = cwd => {
        const hash = createHash('sha256').update(git(cwd, ['diff', '--binary', 'HEAD']));
        const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
        for (const file of untracked) hash.update(file).update(digest(path.join(cwd, file)) || 'missing');
        return hash.digest('hex');
    };
    return {
        recorderHead: git(toolRoot, ['rev-parse', 'HEAD']).trim(),
        recorderWorktree: git(toolRoot, ['status', '--porcelain']),
        frameworkHead: git(frameworkRoot, ['rev-parse', 'HEAD']).trim(),
        frameworkWorktree: git(frameworkRoot, ['status', '--porcelain']),
        frameworkWorkingHash: worktreeHash(frameworkRoot),
        recorderWorkingHash: worktreeHash(toolRoot),
        recorderLockHash: digest(path.join(toolRoot, 'package-lock.json')),
        frameworkLockHash: digest(path.join(frameworkRoot, 'package-lock.json')),
        node: process.version, platform: process.platform, arch: process.arch,
    };
}

function comparableContexts(a, b) {
    const fields = ['frameworkHead', 'frameworkWorktree', 'frameworkWorkingHash', 'frameworkLockHash', 'recorderLockHash', 'node', 'platform', 'arch'];
    return fields.every(field => a[field] !== undefined && a[field] === b?.[field]);
}

function run(argv = process.argv.slice(2)) {
    let baselineFile;
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] !== '--baseline' || !argv[index + 1] || baselineFile) throw new Error('Uso: test:phase43:baseline [--baseline reporte.json]');
        baselineFile = path.resolve(argv[++index]);
    }
    const baseline = baselineFile ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : undefined;
    if (baseline && (baseline.schemaVersion !== 1 || !Array.isArray(baseline.tests) || !baseline.context)) {
        throw new Error('El baseline no contiene resultados y contexto verificables; captura uno con esta versión.');
    }
    const toolRoot = path.resolve(__dirname, '..');
    const { projectPaths } = require('../dist/core/workspace');
    const runContext = context(projectPaths.frameworkRoot, toolRoot);
    const result = spawnSync('npm', ['test'], { cwd: toolRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
    const tests = parseTests(combined);
    const count = label => Number(combined.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? NaN);
    const complete = !result.error && !result.signal && tests.length > 0 && Number.isFinite(count('tests')) && count('cancelled') === 0;
    const sameContext = baseline && comparableContexts(runContext, baseline.context);
    const canCompare = complete && baseline?.complete === true && sameContext;
    const report = {
        schemaVersion: 1, generatedAt: new Date().toISOString(), context: runContext,
        complete, exitCode: result.status, signal: result.signal,
        ...(result.error ? { executionError: result.error.message } : {}),
        counts: { tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), cancelled: count('cancelled') },
        tests,
        comparison: !baseline ? 'no-baseline' : !complete || !baseline.complete ? 'incomplete' : !sameContext ? 'different-context' : 'comparable',
        ...(baselineFile ? { baseline: baselineFile } : {}),
        ...compareTests(tests, canCompare ? baseline.tests : undefined),
    };
    const targetDir = path.join(projectPaths.runtimeRoot, 'runtime', 'phase43');
    fs.mkdirSync(targetDir, { recursive: true });
    const reportPath = path.join(targetDir, `baseline-${Date.now()}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(reportPath.replace(/\.json$/, '.log'), combined, 'utf8');
    process.stdout.write(`${JSON.stringify({ reportPath, complete, counts: report.counts, comparison: report.comparison, failures: report.failures, resolved: report.resolved, notReevaluated: report.notReevaluated }, null, 2)}\n`);
    // A known failure is still a failed run, never a passing quality gate.
    process.exitCode = result.status === 0 && complete ? 0 : 1;
}

module.exports = { parseTests, compareTests, comparableContexts };
if (require.main === module) {
    try { run(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
