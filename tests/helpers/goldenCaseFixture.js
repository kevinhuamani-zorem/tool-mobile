const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { recorderRepository } = require('./goldenRepository');
const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
function appliedPackageFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-fixture-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const frameworkRoot = path.join(root, 'framework');
    const packageDirectory = path.join(root, 'recording', 'generation', 'automation');
    const goldenRoot = path.join(root, 'golden');
    fs.mkdirSync(path.join(frameworkRoot, 'features'), { recursive: true });
    fs.mkdirSync(path.join(packageDirectory, 'baselines'), { recursive: true });

    const featurePath = 'features/test.feature';
    const stepsPath = 'features/test.steps.ts';
    const baseline = 'Feature: Test\n  @original\n  Scenario: Existing\n    Then old result\n';
    const appliedFeature = baseline + '\n  @payment @android\n  Scenario: New\n    Then new result\n';
    const appliedSteps = "import { Then } from '@wdio/cucumber-framework';\nThen(/^new result$/, async () => {});\n";
    fs.writeFileSync(path.join(frameworkRoot, featurePath), appliedFeature);
    fs.writeFileSync(path.join(frameworkRoot, stepsPath), appliedSteps);
    fs.writeFileSync(path.join(packageDirectory, 'baselines', 'feature-test.feature'), baseline);

    const scenario = {
        schemaVersion: 1, recordingId: 'rec-golden-0001', squad: 'payment', platform: 'android',
        objective: 'ver el resultado', acceptanceCriteria: 'se muestra el resultado', fingerprint: 'f'.repeat(64),
        createdAt: '2026-09-07T00:00:00.000Z',
        request: { caseId: 'TC-1', squad: 'payment', featureName: 'Test', scenarioName: 'New', fileName: 'test', locatorModule: 'test', platform: 'android' },
        actions: [{ sequence: 1, action: 'VERIFICAR_EXISTE', selector: '~result', selectorVerified: true, contextHint: 'resultado' }],
    };
    const plan = {
        planId: 'plan-golden', recordingId: scenario.recordingId,
        files: [
            { layer: 'feature', path: featurePath, operation: 'update', baseHash: sha256(baseline) },
            { layer: 'steps', path: stepsPath, operation: 'create' },
        ],
        resolutions: [{ sequence: 1, action: 'VERIFICAR_EXISTE', resolution: 'create', locatorName: 'result', selector: '~result' }],
        unresolvedGapIds: [],
        reuseTarget: { reason: 'fixture', score: 1, steps: stepsPath },
    };
    const response = {
        recordingId: scenario.recordingId, planId: plan.planId, resolutions: [], actionTrace: [{ sequence: 1, gherkinStep: 'Then new result' }],
        files: [
            { layer: 'feature', path: featurePath, content: appliedFeature },
            { layer: 'steps', path: stepsPath, content: appliedSteps },
        ],
    };
    const validation = { valid: true, qualityScore: 100, errors: [], warnings: [] };
    fs.writeFileSync(path.join(packageDirectory, 'scenario.json'), JSON.stringify(scenario, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'generation-plan.json'), JSON.stringify(plan, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'agent-response.json'), JSON.stringify(response, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'validation.json'), JSON.stringify(validation, null, 2));
    fs.writeFileSync(path.join(packageDirectory, 'unresolved-context.json'), JSON.stringify({ gaps: [{ id: 'gap-english-naming', type: 'semantic-naming', description: 'x', requiredOutput: 'y' }] }));
    fs.writeFileSync(path.join(packageDirectory, 'application-receipt.json'), JSON.stringify({
        schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId, responseHash: 'h', appliedAt: 'now',
        files: plan.files.map(file => ({ path: file.path, operation: file.operation, afterHash: sha256(fs.readFileSync(path.join(frameworkRoot, file.path))) })),
    }));
    const catalog = { squad: 'payment', platform: 'android', featureScope: '', locators: [], stepDefinitions: [], frameworkStepDefinitions: [], screenMethods: [], features: [], scenarios: [], artifactBundles: [], frameworkMetrics: { queryCount: 3 } };
    const validatorCalls = [];
    const registry = { registered: 0, register() { this.registered += 1; return {}; } };
    const deps = (validate = () => validation) => ({
        packageDirectory,
        frameworkRoot,
        reuseAnalyzer: { getCatalog: () => catalog },
        automationResponseValidator: {
            validate: (...args) => { validatorCalls.push(args); return validate(...args); },
            toPreview: current => ({ files: current.files.map(file => path.join(frameworkRoot, file.path)) }),
        },
        generatedFileRegistry: registry,
    });
    return { root, frameworkRoot, packageDirectory, goldenRoot, featurePath, stepsPath, baseline, appliedFeature, appliedSteps, scenario, plan, response, catalog, deps, validatorCalls, registry };
}

function withGoldenRoot(t, fixture) {
    // goldenDatasetRoot lee projectPaths; el fixture apunta la raiz a su tmp.
    const { projectPaths } = require('../../dist/core/workspace');
    const original = { toolRoot: projectPaths.toolRoot, runtimeRoot: projectPaths.runtimeRoot };
    projectPaths.toolRoot = recorderRepository(path.join(fixture.root, 'recorder'));
    projectPaths.runtimeRoot = fixture.root;
    t.after(() => Object.assign(projectPaths, original));
    return path.join(projectPaths.toolRoot, 'tests', 'golden');
}

const expectedFile = (saved, layer) => path.join(saved.directory, 'expected', saved.manifest.files.find(file => file.layer === layer).expected);


module.exports = { appliedPackageFixture, withGoldenRoot, expectedFile };
