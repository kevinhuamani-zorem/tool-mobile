#!/usr/bin/env node
'use strict';
// New generations, never replayed responses. Paid provider execution is explicitly opt-in.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { projectPaths, configureWorkspacePaths, saveGoldenRepository } = require('../dist/core/workspace');
const { ApprovedGoldenStore, AutomationPackageBuilder, AutomationHistoryStore, LayeredGenerationOrchestrator, CopilotCliAdapter, AutomationApplier, validatePreparedAgentResponse } = require('../dist/core/automation');
const { AutomationResponseValidator, FrameworkCompilationValidator, includeFrameworkCompilation, refreshAssessmentStatic } = require('../dist/core/validation');
const { summarizePilot } = require('../dist/core/automation/domain/evaluationMetrics');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); };
const git = (root, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fileFingerprint(root, relative = '', entries = []) {
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const name = path.join(relative, item.name);
        if (item.isSymbolicLink()) throw new Error(`No se permiten enlaces en evidencia: ${name}`);
        if (item.isDirectory()) fileFingerprint(root, name, entries);
        else if (item.isFile()) entries.push([name.replace(/\\/g, '/'), hash(fs.readFileSync(path.join(root, name)))]);
    }
    return hash(JSON.stringify(entries));
}
function codeFingerprint() {
    const root = projectPaths.toolRoot;
    return hash(JSON.stringify(['dist/core', 'scripts/agent-pilot.js'].map(name => [name,
        fs.statSync(path.join(root, name)).isDirectory() ? fileFingerprint(path.join(root, name)) : hash(fs.readFileSync(path.join(root, name)))])));
}
function archiveFramework(source, commit, destination) {
    fs.mkdirSync(destination, { recursive: true });
    const archive = execFileSync('git', ['-C', source, 'archive', '--format=tar', commit], { maxBuffer: 256 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', destination], { input: archive });
}
function preparePilot(config, directory) {
    if (![3, 5].includes(config.repetitions)) throw new Error('El piloto requiere 3 o 5 repeticiones por caso y brazo.');
    if (!config.model || config.model === 'auto' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(config.model)) throw new Error('Fija un modelo explícito, sin auto.');
    if (!/^[a-f0-9]{40,64}$/.test(config.frameworkCommit || '')) throw new Error('Fija el hash completo del commit del framework.');
    if (!Array.isArray(config.cases) || !config.cases.length || new Set(config.cases.map(row => row.caseId)).size !== config.cases.length) throw new Error('Se requieren casos únicos con scenario.json.');
    if (fs.existsSync(directory)) throw new Error('Usa un directorio nuevo para conservar evidencia de pilotos anteriores.');
    const framework = fs.realpathSync(config.framework), goldenRoot = fs.realpathSync(config.goldenRoot);
    git(framework, ['cat-file', '-e', `${config.frameworkCommit}^{commit}`]);
    const index = new ApprovedGoldenStore(goldenRoot).index();
    if (index.issues.length) throw new Error('El corpus golden tiene problemas de integridad.');
    const cases = config.cases.map((row, i) => {
        const content = fs.readFileSync(row.scenario), scenario = JSON.parse(content);
        if (scenario.request?.caseId !== row.caseId || !scenario.actions?.length) throw new Error(`Identidad/acciones inválidas: ${row.caseId}`);
        // Copies only authoritative recording input. No previous plans, outputs or QA corrections enter a trial.
        const input = `inputs/${i + 1}/scenario.json`;
        return { caseId: row.caseId, input, sha256: hash(content), content };
    });
    fs.mkdirSync(directory, { recursive: true });
    for (const row of cases) { fs.mkdirSync(path.dirname(path.join(directory, row.input)), { recursive: true }); fs.writeFileSync(path.join(directory, row.input), row.content, { flag: 'wx' }); }
    const goldenSnapshot = path.join(directory, 'golden-snapshot');
    fs.cpSync(goldenRoot, goldenSnapshot, { recursive: true, dereference: false });
    const goldenBytesHash = fileFingerprint(goldenSnapshot);
    const trials = cases.flatMap(row => Array.from({ length: config.repetitions }, (_, i) => {
        // Counterbalance order to avoid giving one arm all earlier invocations.
        return (i % 2 ? [true, false] : [false, true]).map(examples => ({ caseId: row.caseId, repetition: i + 1, examples }));
    }).flat());
    const manifest = { schemaVersion: 1, protocol: 'agent-pilot/v1', createdAt: new Date().toISOString(), framework,
        frameworkCommit: config.frameworkCommit, model: config.model, codeHash: codeFingerprint(),
        goldenFingerprint: index.fingerprint, goldenBytesHash, goldenVersions: index.entries.map(row => ({ goldenId: row.goldenId, versionHash: row.versionHash })),
        repetitions: config.repetitions, automaticPassLimit: 2, purpose: 'evaluation', cases: cases.map(({ content, ...row }) => row), trials,
        exclusions: ['same caseId', 'same recordingId', 'all golden usage=evaluation'],
        functionalExecution: 'not-evaluated', approval: 'not-granted' };
    write(path.join(directory, 'manifest.json'), manifest);
    write(path.join(directory, 'manifest-digest.json'), { sha256: hash(JSON.stringify(manifest)) });
    return manifest;
}
/** Same final overlay preparation and compilation checks as the app's response importer. Never commits. */
function validatePilotOutput(packageDirectory, response, dependencies = {}) {
    const scenario = read(path.join(packageDirectory, 'scenario.json'));
    const plan = read(path.join(packageDirectory, 'generation-plan.json'));
    const validator = dependencies.validator || new AutomationResponseValidator();
    let prepared, preparationError, compilation;
    try {
        prepared = (dependencies.applier || new AutomationApplier()).prepare(scenario, plan, response, validator.toPreview(response));
        response = prepared.response;
        if (prepared.conflicts?.length) preparationError = prepared.conflicts.join(' | ');
    } catch (error) { preparationError = error.message; }
    const validation = validator.validate(scenario, plan, response);
    if (prepared) {
        compilation = (dependencies.compiler || new FrameworkCompilationValidator()).validate(projectPaths.frameworkRoot, prepared.files);
        includeFrameworkCompilation(validation, compilation);
    }
    if (preparationError) {
        validation.valid = false;
        validation.errors.push({ code: 'application-preview', message: preparationError });
        validation.qualityScore = Math.max(0, 100 - validation.errors.length * 10);
    }
    refreshAssessmentStatic(validation);
    return { response, validation, compilation, preparationError, prepared: !!prepared };
}
function roleExecution(packageDirectory, calls) {
    const reportFile = path.join(packageDirectory, 'layered-generation-run.json');
    const stages = fs.existsSync(reportFile) ? read(reportFile).stages || [] : [];
    return [['Lorem', 'behavior-author'], ['Zorem', 'interaction-author'], ['Sumrak', 'integration-reviewer']].map(([agent, role]) => {
        const own = stages.filter(stage => stage.role === role), invocations = calls.filter(call => call.agent === agent).length;
        return { agent, role, invocations, mode: invocations ? 'agent' : own.some(stage => stage.execution === 'deterministic') ? 'deterministic' : own.some(stage => stage.execution === 'cache') ? 'cache' : 'not-invoked',
            stages: own.map(({ attempt, execution, invoked, state, error }) => ({ attempt, execution, invoked: invoked === true, state, error })) };
    });
}
/** Historical reporting checks evidence integrity; executing also requires the currently built code to match. */
function verifyPilotProtocol(directory, requireCurrentCode = false) {
    const manifest = read(path.join(directory, 'manifest.json'));
    if (hash(JSON.stringify(manifest)) !== read(path.join(directory, 'manifest-digest.json')).sha256) throw new Error('El protocolo fue alterado.');
    if (requireCurrentCode && manifest.codeHash !== codeFingerprint()) throw new Error('El código cambió; prepara otro piloto.');
    const goldenSnapshot = path.join(directory, 'golden-snapshot');
    if (fileFingerprint(goldenSnapshot) !== manifest.goldenBytesHash) throw new Error('Cambió el snapshot golden fijado.');
    for (const row of manifest.cases) if (hash(fs.readFileSync(path.join(directory, row.input))) !== row.sha256) throw new Error('Cambió la grabación fijada.');
    return { manifest, goldenSnapshot };
}
async function executeTrial({ manifest, trial, directory, input, goldenSnapshot }, dependencies = {}) {
    const original = { targetProject: projectPaths.frameworkRoot, runtimeRoot: projectPaths.runtimeRoot, source: 'selected' };
    const variables = ['RECORDER_GOLDEN_PURPOSE', 'RECORDER_GOLDEN_EXAMPLES', 'RECORDER_AGENT_RELAXED_CONTRACT', 'RECORDER_AGENT_EXECUTION_MODE'];
    const previous = Object.fromEntries(variables.map(name => [name, process.env[name]]));
    const calls = [];
    let provider, pkg;
    try {
        const target = path.join(directory, 'framework'); archiveFramework(manifest.framework, manifest.frameworkCommit, target);
        configureWorkspacePaths({ targetProject: target, runtimeRoot: path.join(directory, 'recorder-runtime'), source: 'selected' });
        // Separate repository satisfies the same repository resolver used by the app, without modifying the shared corpus.
        const goldenRepo = path.join(directory, 'golden-repository');
        fs.mkdirSync(path.join(goldenRepo, 'tests'), { recursive: true });
        write(path.join(goldenRepo, 'package.json'), { name: 'appium-visual-recorder' });
        execFileSync('git', ['init', '-q', goldenRepo]);
        fs.cpSync(goldenSnapshot, path.join(goldenRepo, 'tests', 'golden'), { recursive: true });
        saveGoldenRepository(goldenRepo);
        process.env.RECORDER_GOLDEN_PURPOSE = 'evaluation'; process.env.RECORDER_GOLDEN_EXAMPLES = trial.examples ? '1' : '0';
        process.env.RECORDER_AGENT_RELAXED_CONTRACT = '0'; process.env.RECORDER_AGENT_EXECUTION_MODE = 'automatic';
        const recording = path.join(projectPaths.recordings, 'pilot');
        fs.mkdirSync(recording, { recursive: true }); fs.copyFileSync(input, path.join(recording, 'scenario.json'));
        if (dependencies.prepare) await dependencies.prepare(recording);
        else new AutomationPackageBuilder().prepareRecordedScenario(recording);
        pkg = path.join(recording, 'generation', 'automation');
        provider = dependencies.providerFactory ? dependencies.providerFactory() : new CopilotCliAdapter();
        const version = await provider.getVersion();
        const guarded = { name: provider.name, getVersion: () => provider.getVersion(), cancel: () => provider.cancel(), execute: async request => {
            if (request.model !== manifest.model) throw new Error('La invocación cambió el modelo fijado.');
            if (calls.filter(call => call.agent === request.agentName).length >= 2 || calls.length >= 6) throw new Error('La evaluación excedió las dos pasadas automáticas.');
            const call = { agent: request.agentName, promptHash: hash(request.prompt), model: request.model, actualModels: [], version };
            calls.push(call);
            const result = await provider.execute(request); call.actualModels = result.modelUsage?.actualModels || []; return result;
        } };
        const validator = new AutomationResponseValidator();
        const validate = dependencies.validate || ((root, response, pass) => validatePreparedAgentResponse(root, response, validator, new AutomationApplier(), pass));
        const run = dependencies.run || ((root, service) => new LayeredGenerationOrchestrator(service, service, validate).run(root, { model: manifest.model, forceRegenerate: true }));
        const result = await run(pkg, guarded, manifest);
        const responseFile = result.responseFile || path.join(pkg, 'agent-response.json');
        const response = fs.existsSync(responseFile) ? read(responseFile) : undefined;
        const final = response ? (dependencies.finalize || validatePilotOutput)(pkg, response) : undefined;
        const validation = final?.validation;
        const preparedFile = final?.prepared ? path.join(pkg, 'pilot-prepared-response.json') : undefined;
        if (preparedFile) write(preparedFile, final.response);
        if (validation) {
            write(path.join(directory, 'validation.json'), validation);
            if (final.compilation) write(path.join(directory, 'framework-compilation.json'), final.compilation);
            const history = new AutomationHistoryStore(pkg);
            history.append({ ...history.identity(), kind: 'generation-result', origin: 'recorder', stage: 'import-validation',
                result: result.success === true && validation.valid && final.prepared ? 'passed' : 'failed' }, [
                { name: 'prepared-response.json', content: JSON.stringify(final.response) }, { name: 'validation.json', content: JSON.stringify(validation) },
            ]);
        }
        const actualModels = calls.flatMap(call => call.actualModels), modelVerified = calls.length > 0 && calls.every(call => call.actualModels.length > 0 && call.actualModels.every(model => model === manifest.model));
        return { ...trial, status: 'completed', static: validation ? validation.valid ? 'passed' : 'failed' : 'not-evaluated',
            acceptance: validation?.assessment?.acceptance?.status || 'not-evaluated', functional: 'not-evaluated', qaCorrected: false,
            modelVerified, actualModels, calls, roleExecution: roleExecution(pkg, calls), packageDirectory: pkg, artifactHash: validation?.assessment?.artifactHash,
            responseHash: response ? hash(fs.readFileSync(responseFile)) : null, preparedResponseFile: preparedFile, preparedResponseHash: preparedFile ? hash(fs.readFileSync(preparedFile)) : null,
            prepared: final?.prepared === true, compilationStatus: final?.compilation?.status || 'not-evaluated', preparationError: final?.preparationError,
            generated: !!response, pipelinePassed: result.success === true, pipelineError: result.error || null };
    } catch (error) {
        return { ...trial, status: 'infrastructure-error', static: 'not-evaluated', acceptance: 'not-evaluated', functional: 'not-evaluated',
            qaCorrected: false, modelVerified: false, pipelinePassed: false, calls, roleExecution: pkg ? roleExecution(pkg, calls) : [], packageDirectory: pkg, reason: error.message };
    } finally {
        for (const name of variables) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
        configureWorkspacePaths(original);
    }
}
async function executePilot(directory, options = {}) {
    if (options.execute !== true) throw new Error('Ejecutar agentes requiere --execute explícito. Preparar el protocolo no los invoca.');
    const { manifest, goldenSnapshot } = verifyPilotProtocol(directory, true);
    const observations = [];
    for (const [i, trial] of manifest.trials.entries()) {
        const trialDirectory = path.join(directory, 'trials', String(i + 1).padStart(3, '0'));
        if (fs.existsSync(trialDirectory)) throw new Error('Este piloto ya inició ejecución. Prepara otro protocolo para no sobrescribir intentos.');
        const input = path.join(directory, manifest.cases.find(row => row.caseId === trial.caseId).input);
        fs.mkdirSync(trialDirectory, { recursive: true });
        write(path.join(trialDirectory, 'started.json'), { ...trial, at: new Date().toISOString() });
        const observation = await executeTrial({ manifest, trial, directory: trialDirectory, input, goldenSnapshot }, options);
        observations.push(observation); write(path.join(trialDirectory, 'result.json'), observation);
        write(path.join(trialDirectory, 'result-digest.json'), { sha256: hash(JSON.stringify(observation)) });
        options.onTrial?.(observation);
    }
    const report = { schemaVersion: 1, protocol: manifest.protocol, manifestHash: hash(JSON.stringify(manifest)), generatedAt: new Date().toISOString(),
        metrics: summarizePilot(observations, manifest.trials), observations, functionalExecution: 'not-evaluated', goldenApproval: 'not-granted' };
    write(path.join(directory, 'report.json'), report); return report;
}
function reportPilot(directory) {
    const { manifest } = verifyPilotProtocol(directory);
    const observations = manifest.trials.flatMap((trial, i) => {
        const folder = path.join(directory, 'trials', String(i + 1).padStart(3, '0'));
        if (fs.existsSync(path.join(folder, 'result.json'))) {
            const result = read(path.join(folder, 'result.json'));
            if (hash(JSON.stringify(result)) !== read(path.join(folder, 'result-digest.json')).sha256) throw new Error('La observación del piloto fue alterada.');
            if (result.responseHash) {
                const response = fs.readFileSync(path.join(result.packageDirectory, 'agent-response.json'));
                if (hash(response) !== result.responseHash) throw new Error('Los archivos generados cambiaron después de medirlos.');
            }
            if (result.preparedResponseHash && hash(fs.readFileSync(result.preparedResponseFile)) !== result.preparedResponseHash) throw new Error('El preview preparado cambió después de medirlo.');
            return [result];
        }
        return fs.existsSync(path.join(folder, 'started.json')) ? [{ ...trial, status: 'interrupted', static: 'not-evaluated', acceptance: 'not-evaluated', functional: 'not-evaluated', qaCorrected: false, modelVerified: false }] : [];
    });
    return { protocol: manifest.protocol, metrics: summarizePilot(observations, manifest.trials), observations };
}
if (require.main === module) {
    const args = process.argv.slice(2), option = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    (async () => {
        const directory = option('--directory');
        if (!directory) throw new Error('Uso: agents:pilot -- --config config.json --directory NUEVO | --directory PILOTO --execute | --directory PILOTO --report');
        if (option('--config')) {
            if (args.includes('--execute')) throw new Error('Prepara y revisa el manifest antes de ejecutar en otra invocación.');
            console.log(JSON.stringify(preparePilot(read(option('--config')), path.resolve(directory)), null, 2));
        } else if (args.includes('--report')) console.log(JSON.stringify(reportPilot(path.resolve(directory)), null, 2));
        else console.log(JSON.stringify(await executePilot(path.resolve(directory), { execute: args.includes('--execute'), onTrial: row => console.error(`${row.caseId} ${row.repetition}: ${row.status}`) }), null, 2));
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { preparePilot, executePilot, executeTrial, reportPilot, codeFingerprint, validatePilotOutput, roleExecution, verifyPilotProtocol };
