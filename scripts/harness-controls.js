#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { projectPaths, workspaceConfiguration, configureWorkspacePaths, validateFrameworkRoot, readFrameworkUserCatalog } = require('../dist/core/workspace');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { summarizeControlledFaults, evaluationFraction } = require('../dist/core/automation/domain/evaluationMetrics');
const { evaluateControlledFixture } = require('./validator-evaluate');
const { readHarnessCorpus } = require('./lib/harnessCorpus');
const { readFrameworkArchive, assertOutsideSources } = require('./lib/harnessFramework');
const { CONTROL_DEFINITIONS, FIXTURE_IDS, buildControlFixture, mutationsFor, hash } = require('./lib/harnessControlFixtures');

const DEFAULT_CORPUS = path.join(__dirname, '../tests/fixtures/agent-harness/corpus.json');
const requiredDirectories = ['features/yape-features', 'features/yape-steps-definitions', 'resources/locators', 'screenobjects', 'support'];

function isolatedFramework(target, options) {
    fs.mkdirSync(target);
    if (Boolean(options.framework) !== Boolean(options.frameworkCommit)) throw new Error('--framework and --framework-commit must be supplied together.');
    if (!options.framework) {
        for (const relative of requiredDirectories) fs.mkdirSync(path.join(target, relative), { recursive: true });
        fs.writeFileSync(path.join(target, 'package.json'), '{"name":"recorder-offline-harness","private":true}\n');
        return { source: 'synthetic-contract-framework', commit: null };
    }
    const archive = readFrameworkArchive(options.framework, options.frameworkCommit);
    execFileSync('tar', ['-x', '-C', target], { input: archive.bytes });
    validateFrameworkRoot(target);
    return { source: 'isolated-git-archive', commit: archive.commit, tree: archive.tree, archiveSha256: archive.sha256 };
}
function notEvaluated(id, reason, definition) {
    return { id, expected: definition ? 'invalid' : 'valid', ...(definition ? { expectedCode: definition.expectedCode } : {}),
        observed: 'not-evaluated', actualCodes: [], reason };
}

/** Static controls only. Injection exists for tests; the CLI always uses the production validator. */
function runHarnessControls(options = {}, dependencies = {}) {
    const originalPaths = { ...projectPaths }, originalConfiguration = { ...workspaceConfiguration };
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-harness-controls-'));
    const samples = [], fixtures = [], unsupported = [], issues = [];
    let framework, corpus;
    try {
        corpus = readHarnessCorpus(path.resolve(options.corpus || DEFAULT_CORPUS));
        framework = isolatedFramework(path.join(temporary, 'framework'), options);
        configureWorkspacePaths({ targetProject: path.join(temporary, 'framework'), runtimeRoot: path.join(temporary, 'recorder'), source: 'selected' });
        for (const fixtureId of FIXTURE_IDS) {
            const required = CONTROL_DEFINITIONS.filter(control => control.fixture === fixtureId);
            let fixture, before, result;
            try {
                fixture = (dependencies.buildFixture || buildControlFixture)(fixtureId);
                before = hash(JSON.stringify(fixture.response));
                const validator = dependencies.createValidator?.(fixture) || new AutomationResponseValidator(undefined, fixture.catalog);
                const validate = response => validator.validate(fixture.scenario, fixture.plan, response);
                const mutations = (dependencies.mutationsFor || mutationsFor)(fixture);
                const identities = new Set();
                for (const mutation of mutations) {
                    const definition = required.find(control => control.id === mutation.id);
                    if (!definition || mutation.expectedCode !== definition.expectedCode || identities.has(mutation.id)) throw new Error('Mutation identity or expected rule does not match the fixed control contract.');
                    if (hash(JSON.stringify(mutation.response)) === before) throw new Error(`Mutation did not change its artifact: ${mutation.id}`);
                    identities.add(mutation.id);
                }
                // If any YAML cannot be interpreted, user absence is not measurable. Never count a warning as detection.
                const userCatalogUnavailable = readFrameworkUserCatalog().status !== 'available';
                const evaluableMutations = mutations.filter(mutation => mutation.id !== 'test-data-user-missing' || !userCatalogUnavailable);
                result = evaluateControlledFixture(fixture.scenario, fixture.response, validate, fixtureId, true,
                    { mutations: evaluableMutations, requiredMutationIds: required.map(control => control.id) });
                if (hash(JSON.stringify(fixture.response)) !== before) throw new Error('Validation mutated the positive control input.');
                samples.push(...result.samples);
                for (const definition of required) {
                    const id = `${fixtureId}:${definition.id}`;
                    if (result.samples.some(sample => sample.id === id)) continue;
                    const baselineFailed = result.samples[0]?.observed === 'invalid';
                    const reason = baselineFailed ? 'Positive control failed; fault injection was not evaluated.'
                        : definition.id === 'test-data-user-missing' && userCatalogUnavailable ? 'Framework user catalog is unavailable; absence cannot be checked.'
                        : 'No mutation is available for this fixed control.';
                    samples.push(notEvaluated(id, reason, definition));
                    if (!baselineFailed) unsupported.push({ fixtureId, controlId: definition.id, reason });
                }
                fixtures.push({ id: fixtureId, baselineExpectedValid: true, baselineOracle: 'versioned-synthetic-contract', baselineSha256: before,
                    baselineObserved: result.samples[0].observed, generatedLayers: fixture.response.files.map(file => file.layer),
                    requiredControlIds: required.map(control => control.id), positiveChecks: fixtureId === 'generated-contract'
                        ? ['recorded-locator-pair', 'literal-reused-login', 'recorded-text-assertion', 'quoted-ui-message-business-wording']
                        : fixtureId === 'frozen-method' ? ['frozen-method-preserved'] : ['recognized-30-day-range'] });
            } catch (error) {
                const reason = error.message;
                samples.push(notEvaluated(`${fixtureId}:baseline`, reason));
                for (const definition of required) {
                    samples.push(notEvaluated(`${fixtureId}:${definition.id}`, reason, definition));
                    unsupported.push({ fixtureId, controlId: definition.id, reason });
                }
                fixtures.push({ id: fixtureId, baselineExpectedValid: true, baselineOracle: 'versioned-synthetic-contract', baselineObserved: 'not-evaluated', reason });
            }
        }
    } catch (error) {
        issues.push({ code: 'harness-input-unavailable', message: error.message });
        for (const fixtureId of FIXTURE_IDS) {
            samples.push(notEvaluated(`${fixtureId}:baseline`, error.message));
            for (const definition of CONTROL_DEFINITIONS.filter(control => control.fixture === fixtureId)) {
                samples.push(notEvaluated(`${fixtureId}:${definition.id}`, error.message, definition));
                unsupported.push({ fixtureId, controlId: definition.id, reason: error.message });
            }
        }
    } finally {
        // Restore even a caller's not-yet-configured workspace without re-validating that unrelated path.
        Object.assign(projectPaths, originalPaths);
        Object.assign(workspaceConfiguration, originalConfiguration);
        fs.rmSync(temporary, { recursive: true, force: true });
    }
    const metrics = summarizeControlledFaults(samples);
    const negativeSamples = samples.filter(sample => sample.expected === 'invalid');
    const evaluatedNegatives = negativeSamples.filter(sample => sample.observed !== 'not-evaluated');
    // Labels remain proposed; associating a probe does not evaluate that corpus scenario.
    const proposedLabels = (corpus?.cases || []).flatMap(row => (row.labelsValue.expectedNegatives || []).map(label => {
        const definition = CONTROL_DEFINITIONS.find(control => control.id === label.id && control.caseIds.includes(row.id));
        const mapped = Boolean(definition && Array.isArray(label.expectedRuleCodes) && label.expectedRuleCodes.length === 1
            && label.expectedRuleCodes[0] === definition.expectedCode);
        return { caseId: row.id, labelId: label.id, proposedRuleCodes: label.expectedRuleCodes, mapped,
            ...(mapped ? { controlId: `${definition.fixture}:${definition.id}` } : { reason: 'No independent fixed control matches this proposed family label and exact expected rule.' }),
            mappingOnly: true, corpusScenarioExecuted: false };
    }));
    const unmappedLabels = proposedLabels.filter(label => !label.mapped).length;
    const exitCode = metrics.falsePositives || metrics.falseNegatives ? 1
        : metrics.notEvaluated || unsupported.length || issues.length || !metrics.measured || unmappedLabels ? 2 : 0;
    const caseIds = corpus?.cases.map(row => row.id) || [];
    return { schemaVersion: 1, evaluationVersion: 'harness-controls/v1', exitCode,
        provenance: { synthetic: true, qaReviewed: false, pilotEligible: false, agentExecuted: false, deviceExecuted: false,
            baselineOracle: 'fixed-positive-contract-not-current-validator-output', frameworkCatalog: 'synthetic-explicit-fixture' },
        framework, corpus: corpus && { corpusId: corpus.manifest.corpusId, sha256: corpus.sha256, caseIds,
            usage: 'Family coverage mapping only. Corpus scenarios and proposed QA labels are not evaluated or promoted by these independent probes.' },
        ...metrics, fixtures, unsupported, issues,
        coverage: { requiredNegativeControls: CONTROL_DEFINITIONS.length,
            proposedLabels: { total: proposedLabels.length, mapped: proposedLabels.length - unmappedLabels, unmapped: unmappedLabels, items: proposedLabels },
            evaluatedNegativeControls: evaluatedNegatives.length, unsupportedControls: unsupported.length,
            detection: evaluationFraction(metrics.truePositives, evaluatedNegatives.length, negativeSamples.length - evaluatedNegatives.length),
            execution: evaluationFraction(evaluatedNegatives.length, CONTROL_DEFINITIONS.length),
            families: caseIds.map(caseId => ({ caseId, controlIds: CONTROL_DEFINITIONS.filter(control => control.caseIds.includes(caseId)).map(control => control.id),
                mappingOnly: true, corpusScenarioExecuted: false })) },
        scope: 'Offline production-validator regression controls, with exact expected rule codes. This is not agent accuracy, device success, QA approval or golden promotion.' };
}
function main(argv = process.argv.slice(2), dependencies) {
    const options = {};
    const names = { '--framework': 'framework', '--framework-commit': 'frameworkCommit', '--corpus': 'corpus', '--output': 'output' };
    for (let index = 0; index < argv.length; index++) {
        const key = names[argv[index]];
        if (!key || !argv[index + 1] || argv[index + 1].startsWith('--') || options[key]) throw new Error(`Invalid or repeated option: ${argv[index]}`);
        options[key] = argv[++index];
    }
    // A report must not overwrite the QA checkout or the immutable corpus, including through symlinks.
    if (options.output) {
        assertOutsideSources(options.output, [path.dirname(options.corpus || DEFAULT_CORPUS), ...(options.framework ? [options.framework] : [])]);
        if (fs.existsSync(options.output)) throw new Error('--output already exists; preserve the previous evidence and choose a new path.');
    }
    const report = runHarnessControls(options, dependencies);
    const json = JSON.stringify(report, null, 2) + '\n';
    if (options.output) { fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true }); fs.writeFileSync(options.output, json, { flag: 'wx' }); }
    return report;
}
if (require.main === module) {
    try { const report = main(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.exitCode; }
    catch (error) { console.log(JSON.stringify({ schemaVersion: 1, evaluationVersion: 'harness-controls/v1', exitCode: 2,
        issues: [{ code: 'harness-input-unavailable', message: error.message }] }, null, 2)); process.exitCode = 2; }
}
module.exports = { runHarnessControls, main, isolatedFramework };
