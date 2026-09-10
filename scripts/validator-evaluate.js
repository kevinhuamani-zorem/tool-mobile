#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const { projectPaths, configureWorkspacePaths, frameworkContract } = require('../dist/core/workspace');
const { readGoldenCase, GoldenSnapshotReader, ApprovedGoldenStore, goldenDatasetRoot, goldenPath } = require('../dist/core/automation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { screenLocatorTypes } = require('../dist/core/validation/infrastructure/rules/screenLocatorTypes');
const { screenClassNameFor } = require('../dist/core/validation/infrastructure/rules/screenInspection');
const { summarizeControlledFaults } = require('../dist/core/automation/domain/evaluationMetrics');

/** Each fault has an independent expected rule. No automatic repair runs during this evaluation. */
function controlledMutations(scenario, response) {
    const mutations = [];
    const mutate = (id, expectedCode, file, replacement) => mutations.push({ id, expectedCode,
        response: { ...response, files: response.files.map(item => item === file ? { ...item, content: replacement } : { ...item }) } });
    const feature = response.files.find(file => file.layer === 'feature');
    const scenarioBlock = feature?.content.match(/^[ \t]*Scenario(?: Outline)?:[^\n]*\[TC-[^\]]+\][\s\S]*?(?=^[ \t]*Scenario(?: Outline)?:|$(?![\s\S]))/m)?.[0];
    if (scenarioBlock) mutate('duplicate-case', 'case-duplicate', feature, feature.content + '\n' + scenarioBlock);
    const contract = frameworkContract(projectPaths.frameworkRoot);
    for (const screen of response.files.filter(file => file.layer === 'screen')) {
        const bindings = [];
        screenLocatorTypes(screen.content, contract, screenClassNameFor(screen.content, screen.path, contract.baseScreenClass), bindings);
        const selected = bindings.find(binding => binding.platform === scenario.platform && (response.actionTrace || []).some(trace => trace.locatorName === binding.getter
            && scenario.actions.some(action => action.sequence === trace.sequence && action.selector && action.selectorVerified !== false)));
        if (!selected) continue;
        const replacement = contract.typeLocatorMembers.find(type => type !== selected.type && ['XPATH', 'ID', 'ANDROID', 'ACCESSIBILITY_ID'].includes(type));
        if (!replacement) continue;
        mutate('locator-type', 'locator-type-mismatch', screen, screen.content.slice(0, selected.typeStart) + replacement + screen.content.slice(selected.typeEnd));
        Object.assign(mutations.at(-1), { getter: selected.getter, platform: selected.platform, before: selected.type, after: replacement });
        break;
    }
    const assertionTexts = (response.actionTrace || []).filter(trace => scenario.actions.some(action => action.sequence === trace.sequence && action.textAssertion)).map(trace => trace.gherkinStep);
    for (const steps of response.files.filter(file => file.layer === 'steps')) {
        if (mutations.some(row => row.id === 'remove-text-assertion')) break;
        const source = ts.createSourceFile(steps.path, steps.content, ts.ScriptTarget.Latest, true);
        for (const statement of source.statements) {
            if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
            const call = statement.expression, expression = call.arguments[0], callback = call.arguments[1];
            if (!['Given', 'When', 'Then'].includes(call.expression.getText(source)) || !expression || !callback) continue;
            let matches = false;
            try {
                if (ts.isRegularExpressionLiteral(expression)) {
                    const raw = expression.getText(source), last = raw.lastIndexOf('/');
                    matches = assertionTexts.some(text => new RegExp(raw.slice(1, last), raw.slice(last + 1).replace(/[gy]/g, '')).test(text));
                } else if (ts.isStringLiteral(expression)) matches = assertionTexts.includes(expression.text);
            } catch { continue; }
            if (!matches) continue;
            let assertion;
            const visit = node => {
                if (!assertion && ts.isExpressionStatement(node) && /^(?:await\s+)?expect\([\s\S]+\)\.(?:toContain|toBe|toEqual|toStrictEqual)\(/.test(node.getText(source))) assertion = node;
                ts.forEachChild(node, visit);
            };
            visit(callback);
            if (!assertion) continue;
            mutate('remove-text-assertion', 'recorded-text-assertion-steps', steps,
                steps.content.slice(0, assertion.getStart(source)) + '; /* controlled removed assertion */' + steps.content.slice(assertion.end));
            break;
        }
    }
    return mutations;
}
function evaluateControlledFixture(scenario, response, validate, id = 'fixture', baselineExpectedValid = true, controls) {
    const baseline = validate(response), samples = [];
    if (!baselineExpectedValid || !baseline.valid) return { samples: [{ id: `${id}:baseline`, expected: 'valid', observed: baselineExpectedValid ? 'invalid' : 'not-evaluated', actualCodes: baseline.errors.map(error => error.code),
        reason: 'The unmodified approved snapshot does not pass the current validator; resolve baseline drift before injecting faults.' }], unsupported: [] };
    samples.push({ id: `${id}:baseline`, expected: 'valid', observed: 'valid', actualCodes: [] });
    const mutations = controls?.mutations ?? controlledMutations(scenario, response);
    for (const mutation of mutations) {
        const result = validate(mutation.response);
        samples.push({ id: `${id}:${mutation.id}`, expected: 'invalid', expectedCode: mutation.expectedCode,
            observed: result.valid ? 'valid' : 'invalid', actualCodes: result.errors.map(error => error.code) });
    }
    return { samples, unsupported: (controls?.requiredMutationIds ?? ['duplicate-case', 'locator-type', 'remove-text-assertion']).filter(id => !mutations.some(mutation => mutation.id === id)) };
}
function evaluateValidator({ root = goldenDatasetRoot(), framework = projectPaths.frameworkRoot } = {}) {
    const original = { targetProject: projectPaths.frameworkRoot, runtimeRoot: projectPaths.runtimeRoot, source: 'selected' };
    const index = new ApprovedGoldenStore(root).index(), samples = [], cases = [];
    for (const entry of index.entries) {
        let temporary;
        try {
            const golden = readGoldenCase(entry.directory), commit = golden.manifest.framework?.commit || golden.manifest.framework?.head;
            if (!/^[a-f0-9]{40,64}$/.test(commit || '')) throw new Error('El caso no fija un commit local completo.');
            temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-eval-'));
            const target = path.join(temporary, 'framework'); fs.mkdirSync(target);
            const archive = execFileSync('git', ['-C', framework, 'archive', '--format=tar', commit], { maxBuffer: 256 * 1024 * 1024 });
            execFileSync('tar', ['-x', '-C', target], { input: archive });
            configureWorkspacePaths({ targetProject: target, runtimeRoot: path.join(temporary, 'runtime'), source: 'selected' });
            for (const file of golden.effectivePlan.files) {
                const destination = goldenPath(target, file.path), baseline = golden.baselines.get(file.path);
                if (file.operation === 'update' && baseline !== undefined) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, baseline); }
                else if (file.operation === 'create') fs.rmSync(destination, { force: true });
            }
            for (const dependency of new GoldenSnapshotReader(entry.directory).json('dependency-files.json')) {
                const destination = goldenPath(target, dependency.path);
                if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== dependency.content) throw new Error(`Se requiere baseline completo de dependencia: ${dependency.path}`);
                fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, dependency.content);
            }
            const validator = new AutomationResponseValidator(undefined, { getCatalog: () => golden.catalog });
            const result = evaluateControlledFixture(golden.scenario, golden.response, response => validator.validate(golden.scenario, golden.effectivePlan, response), entry.goldenId, golden.manifest.validation.valid === true);
            samples.push(...result.samples); cases.push({ goldenId: entry.goldenId, versionHash: entry.versionHash, commit, unsupported: result.unsupported, baselineOracle: 'approved-historical-static-verdict', baselineRequiresQaReview: result.samples[0]?.observed === 'invalid' });
        } catch (error) { samples.push({ id: `${entry.goldenId}:baseline`, expected: 'valid', observed: 'not-evaluated', actualCodes: [], reason: error.message }); }
        finally { configureWorkspacePaths(original); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
    }
    return { schemaVersion: 1, evaluationVersion: 'controlled-faults/v1', corpusFingerprint: index.fingerprint, corpusIssues: index.issues,
        ...summarizeControlledFaults(samples), cases, scope: 'Validator mutation detection. No LLM calls, device execution or golden promotion.' };
}
if (require.main === module) {
    const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
    try {
        const report = evaluateValidator({ root: option('--golden-root'), framework: option('--framework') });
        if (option('--output')) { fs.mkdirSync(path.dirname(path.resolve(option('--output'))), { recursive: true }); fs.writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n'); }
        console.log(JSON.stringify(report, null, 2));
        if (report.falsePositives || report.falseNegatives || report.corpusIssues.length) process.exitCode = 1;
        else if (!report.measured || report.notEvaluated) process.exitCode = 2;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { controlledMutations, evaluateControlledFixture, evaluateValidator };
