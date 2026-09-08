#!/usr/bin/env node
// Replay only local, pinned framework commits. Never modifies approved artifacts or the QA checkout.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { projectPaths, configureWorkspacePaths } = require('../dist/core/workspace');
const { ApprovedGoldenStore, goldenDatasetRoot, goldenPath, readGoldenCase, goldenBaselineSnapshotPort, goldenPlanProjection, DeterministicResolver } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');

function replayGoldenDataset({ root = goldenDatasetRoot(), frameworkRoot = projectPaths.frameworkRoot } = {}) {
    const index = new ApprovedGoldenStore(root).index();
    const results = [];
    for (const entry of index.entries) {
        let temporary;
        const original = { targetProject: projectPaths.frameworkRoot, runtimeRoot: projectPaths.runtimeRoot, source: 'selected' };
        try {
            const golden = readGoldenCase(entry.directory);
            const commit = golden.manifest.framework?.commit || golden.manifest.framework?.head;
            if (!/^[a-f0-9]{40,64}$/.test(commit || '')) throw new Error('No hay un commit local fijado para el framework.');
            // A hash is mandatory; no moving branch, checkout fallback or remote fetch.
            execFileSync('git', ['-C', frameworkRoot, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'pipe' });
            temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-replay-'));
            const target = path.join(temporary, 'framework'); fs.mkdirSync(target);
            const archive = execFileSync('git', ['-C', frameworkRoot, 'archive', '--format=tar', commit], { maxBuffer: 256 * 1024 * 1024 });
            execFileSync('tar', ['-x', '-C', target], { input: archive });
            configureWorkspacePaths({ targetProject: target, runtimeRoot: path.join(temporary, 'runtime'), source: 'selected' });
            for (const file of golden.effectivePlan.files) {
                const destination = goldenPath(target, file.path); const baseline = golden.baselines.get(file.path);
                if (file.operation === 'update' && baseline !== undefined) {
                    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, baseline);
                } else if (file.operation === 'create') fs.rmSync(destination, { force: true });
            }
            for (const dependency of JSON.parse(fs.readFileSync(goldenPath(entry.directory, 'dependency-files.json'), 'utf8'))) {
                const destination = goldenPath(target, dependency.path);
                // A projected helper cannot replace a shared committed module safely.
                if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== dependency.content)
                    throw new Error(`Dependencia compartida requiere un snapshot completo: ${dependency.path}`);
                fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, dependency.content);
            }
            const provider = { getCatalog: () => golden.catalog };
            const plan = new DeterministicResolver(provider, goldenBaselineSnapshotPort(golden)).resolve(golden.scenario);
            const planEquivalent = JSON.stringify(goldenPlanProjection(plan.plan, plan.unresolvedContext.gaps)) === JSON.stringify(goldenPlanProjection(golden.plan, golden.gaps));
            const validation = new AutomationResponseValidator(undefined, provider).validate(golden.scenario, golden.effectivePlan, golden.response);
            const counts = {};
            for (const issue of validation.errors) counts[issue.code] = (counts[issue.code] || 0) + 1;
            const codes = [...new Set([...Object.keys(counts), ...Object.keys(golden.manifest.validation.errorCounts)])].sort();
            const discrepancies = codes.filter(code => (counts[code] || 0) !== (golden.manifest.validation.errorCounts[code] || 0));
            results.push({ goldenId: entry.goldenId, revisionId: entry.revisionId, versionHash: entry.versionHash, frameworkCommit: commit,
                status: planEquivalent && validation.valid === golden.manifest.validation.valid && !discrepancies.length ? 'matched' : 'discrepant',
                planEquivalent, recordedValidation: golden.manifest.validation, actualValidation: { valid: validation.valid, errorCounts: counts }, discrepancies,
                qaApproval: golden.manifest.approval, functionalVerification: 'not-evaluated' });
        } catch (error) { results.push({ goldenId: entry.goldenId, versionHash: entry.versionHash, status: 'unreproducible', reason: error.message }); }
        finally { configureWorkspacePaths(original); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
    }
    return { schemaVersion: 1, replayVersion: 'golden-replay/v1', status: index.issues.length ? 'requires-review' : !results.length ? 'not-evaluated'
        : results.every(result => result.status === 'matched') && !index.issues.length ? 'matched' : 'requires-review',
        corpusSize: results.length, fingerprint: index.fingerprint, issues: index.issues, results };
}
if (require.main === module) {
    const args = process.argv.slice(2); const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
    try {
        const report = replayGoldenDataset({ root: value('--golden-root'), frameworkRoot: value('--framework') });
        const output = value('--output'); if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.status === 'matched' ? 0 : report.status === 'not-evaluated' ? 2 : 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { replayGoldenDataset };
