const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    LayeredGenerationOrchestrator,
    validateLayeredAgentResult,
} = require('../dist/core/automation');
const { configureWorkspacePaths, projectPaths } = require('../dist/core/workspace');

const FRAMEWORK_ROOT = projectPaths.frameworkRoot;

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-generation-'));
    // El caché de agentes vive en la memoria del recorder (global entre
    // recordings): cada fixture usa un runtime propio para no heredar
    // resultados de otro test ni escribir en la memoria real.
    configureWorkspacePaths({ targetProject: FRAMEWORK_ROOT, runtimeRoot: path.join(root, 'runtime'), source: 'selected' });
    writeJson(path.join(root, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        planId: 'plan-1',
        fingerprint: 'fp-1',
        deterministicCoverage: 0,
        status: 'needs-agent',
        resolutions: [],
        files: [
            { layer: 'feature', path: 'features/payment/case.feature', operation: 'create' },
            { layer: 'steps', path: 'features/steps/payment/case.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/case.locator.json', operation: 'create' },
        ],
        unresolvedGapIds: ['gap-1'],
        budgets: {},
    });
    writeJson(path.join(root, 'scenario.json'), { recordingId: 'rec-1', request: { actions: [] } });
    writeJson(path.join(root, 'gaps.json'), { gaps: [] });
    writeJson(path.join(root, 'agent-response.schema.json'), {
        type: 'object',
        required: ['recordingId', 'planId', 'resolutions', 'actionTrace', 'files'],
    });
    return root;
}

function provider(calls, mutate) {
    return {
        name: 'fake',
        cancel() {},
        async getVersion() { return '1'; },
        async execute(input) {
            const role = {
                Lorem: 'behavior-author',
                Zorem: 'interaction-author',
                Sumrak: 'integration-reviewer',
            }[input.agentName];
            calls.push({
                role,
                agentName: input.agentName,
                sessionName: input.sessionName,
                allowValidationScripts: input.allowValidationScripts,
                timeoutMs: input.timeoutMs,
                hasBehaviorDependency: role === 'interaction-author'
                    ? fs.existsSync(path.join(input.cwd, 'behavior-result.json'))
                        && fs.existsSync(path.join(input.cwd, 'lorem-handoff.json'))
                    : undefined,
            });
            if (role === 'behavior-author') {
                writeJson(path.join(input.cwd, 'behavior-result.json'), {
                    schemaVersion: 1,
                    role,
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    files: [
                        { layer: 'feature', path: 'features/payment/case.feature', content: 'Feature: Caso' },
                        { layer: 'steps', path: 'features/steps/payment/case.steps.ts', content: 'export {}' },
                    ],
                    actionTrace: [],
                    testDesignReview: {
                        status: 'suggestion',
                        summary: 'Conviene reforzar la aserción final.',
                        issues: [],
                    },
                });
            } else if (role === 'interaction-author') {
                writeJson(path.join(input.cwd, 'interaction-result.json'), {
                    schemaVersion: 1,
                    role,
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    files: [
                        { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', content: 'export class CaseScreen {}' },
                        { layer: 'locators', path: 'resources/locators/payment/case.locator.json', content: '{}' },
                    ],
                    actionTrace: [],
                });
                if (mutate) mutate(input.cwd);
            } else {
                writeJson(path.join(input.cwd, 'agent-response.json'), {
                    schemaVersion: 1,
                    recordingId: 'rec-1',
                    planId: 'plan-1',
                    resolutions: [{ gapId: 'gap-1', decision: 'resolved' }],
                    actionTrace: [],
                    files: [
                        { layer: 'feature', path: 'features/payment/case.feature', content: 'Feature: Caso' },
                        { layer: 'steps', path: 'features/steps/payment/case.steps.ts', content: 'export {}' },
                        { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', content: 'export class CaseScreen {}' },
                        { layer: 'locators', path: 'resources/locators/payment/case.locator.json', content: '{}' },
                    ],
                });
            }
            return {
                success: true,
                exitCode: 0,
                stdout: '',
                stderr: '',
                durationMs: 2,
                timedOut: false,
                cancelled: false,
                modelUsage: { requestedModel: 'auto', actualModels: ['test-model'] },
            };
        },
    };
}

function rewritingIntegrator(calls) {
    const base = provider(calls);
    return {
        ...base,
        async execute(input) {
            const result = await base.execute(input);
            if (input.agentName === 'Sumrak') {
                const file = path.join(input.cwd, 'agent-response.json');
                const response = JSON.parse(fs.readFileSync(file, 'utf8'));
                response.files = response.files.map(item => ({
                    ...item,
                    content: `REESCRITO:${item.layer}`,
                }));
                writeJson(file, response);
            }
            return result;
        },
    };
}

test('ejecuta autores aislados y deja la revisión integrada como respuesta oficial', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
    assert.deepEqual(calls.map(call => call.role), ['behavior-author', 'interaction-author', 'integration-reviewer']);
    assert.deepEqual(calls.map(call => call.sessionName), [
        'Derek/rec-1/Lorem',
        'Derek/rec-1/Zorem',
        'Derek/rec-1/Sumrak',
    ]);
    assert.equal(fs.existsSync(path.join(root, 'agent-response.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'test-design-review.json')), true);
    const report = JSON.parse(fs.readFileSync(result.reportFile, 'utf8'));
    assert.equal(report.state, 'completed');
    assert.equal(report.owner.name, 'Derek');
    assert.deepEqual(report.owner.delegates.map(delegate => delegate.name), ['Lorem', 'Zorem', 'Sumrak']);
    assert.deepEqual(report.stages.map(stage => stage.state), ['completed', 'completed', 'completed']);
    assert.deepEqual(report.stages.map(stage => stage.assignedLayers), [
        ['feature', 'steps'],
        ['screen', 'locators'],
        ['feature', 'steps', 'screen', 'locators'],
    ]);
    assert.equal(report.stages.every(stage => stage.contextBytes > 0), true);
    for (const call of calls) {
        const directory = call.agentName.toLowerCase();
        assert.equal(fs.existsSync(path.join(root, 'agents', directory, 'agent-task.md')), true);
        assert.equal(fs.existsSync(path.join(root, 'agents', directory, '.github', 'agents', `${call.agentName}.agent.md`)), true);
        assert.equal(fs.existsSync(path.join(root, 'agents', directory, 'agent-memory.json')), true);
    }
    assert.equal(fs.existsSync(path.join(root, 'agents', 'derek', 'orchestration.json')), true);
    assert.equal(calls.find(call => call.agentName === 'Zorem').hasBehaviorDependency, true);
    const loremHandoff = JSON.parse(fs.readFileSync(
        path.join(root, 'agents', 'zorem', 'lorem-handoff.json'),
        'utf8',
    ));
    assert.equal(loremHandoff.fromAgent, 'Lorem');
    assert.equal(loremHandoff.toAgent, 'Zorem');
});

test('separa la memoria del framework según el ownership de Lorem y Zorem', async () => {
    const root = fixture();
    writeJson(path.join(root, 'reuse-context.json'), {
        schemaVersion: 1,
        recordingId: 'rec-1',
        decision: 'extend-existing',
        candidates: [{ feature: 'Caso existente', file: 'features/payment/existing.feature' }],
        elements: [{ module: 'payment/movements', elements: [{ name: 'btnFilter', locators: { android: { value: '~filter' } }, getter: '    public get btnFilter() { return "..."; }' }] }],
        updateBaselines: [
            { layer: 'steps', reference: 'baselines/steps-existing.ts' },
            { layer: 'screen', reference: 'baselines/screen-existing.ts' },
        ],
    });
    writeJson(path.join(root, 'resolved-context.json'), {
        schemaVersion: 1,
        recordingId: 'rec-1',
        planId: 'plan-1',
        reusedLocators: [{ sequence: 1, locatorName: 'btnFilter' }],
        elementDeclarations: [{ name: 'btnFilter' }],
        frameworkAwareness: { unrelatedCatalog: 'x'.repeat(5_000) },
        frameworkContract: { locatorFactory: 'LocatorProvider' },
    });
    writeJson(path.join(root, 'validation-contract.json'), {
        schemaVersion: 1,
        totalRules: 3,
        rules: [
            { code: 'assertion', minimalExample: 'Then resultado' },
            { code: 'create-locator-contract', minimalExample: 'get locator()' },
            { code: 'typescript-syntax', minimalExample: 'class Screen {}' },
            { code: 'missing-gap-resolution', minimalExample: '{ "gapId": "gap-1", "decision": "create" }' },
        ],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    // Sumrak no escribe codigo: reglas de integracion y reutilizacion sin elementos.
    const sumrakReuse = JSON.parse(fs.readFileSync(path.join(root, 'agents/sumrak/reuse-context.json')));
    const sumrakValidation = JSON.parse(fs.readFileSync(path.join(root, 'agents/sumrak/validation-contract.json')));
    assert.equal('elements' in sumrakReuse, false);
    assert.equal(Array.isArray(sumrakReuse.candidates), true);
    assert.deepEqual(sumrakValidation.rules.map(rule => rule.code), ['missing-gap-resolution']);
    assert.equal(sumrakValidation.totalRules, 1);
    const loremReuse = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/reuse-context.json')));
    const zoremReuse = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/reuse-context.json')));
    const loremValidation = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/validation-contract.json')));
    const zoremValidation = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/validation-contract.json')));
    assert.equal(Array.isArray(loremReuse.candidates), true);
    assert.equal('elements' in loremReuse, false);
    assert.equal(Array.isArray(zoremReuse.elements), true);
    assert.equal('candidates' in zoremReuse, false);
    // El codigo del getter ya viaja en baselines/: Zorem recibe identidad y locators.
    assert.equal(zoremReuse.elements[0].elements[0].name, 'btnFilter');
    assert.equal('locators' in zoremReuse.elements[0].elements[0], true);
    assert.equal('getter' in zoremReuse.elements[0].elements[0], false);
    assert.equal(fs.existsSync(path.join(root, 'agents/zorem/resolved-context.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'agents/lorem/unresolved-context.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'agents/zorem/unresolved-context.json')), false);
    assert.deepEqual(loremValidation.rules.map(rule => rule.code), ['assertion', 'typescript-syntax']);
    assert.deepEqual(zoremValidation.rules.map(rule => rule.code), ['create-locator-contract', 'typescript-syntax']);
    assert.deepEqual(loremReuse.updateBaselines.map(item => item.layer), ['steps']);
    assert.deepEqual(zoremReuse.updateBaselines.map(item => item.layer), ['screen']);
    const loremMemory = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/agent-memory.json')));
    const zoremMemory = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/agent-memory.json')));
    assert.deepEqual(loremMemory.ownership.layers, ['feature', 'steps']);
    assert.deepEqual(zoremMemory.ownership.layers, ['screen', 'locators']);
    assert.equal(loremMemory.context.savedBytes > 0, true);
});

test('proyecta a cada autor solo sus dos capas del borrador determinístico', async () => {
    const root = fixture();
    writeJson(path.join(root, 'unresolved-context.json'), {
        obsolete: 'este artefacto de compatibilidad no debe llegar a los agentes',
    });
    const draftBuilder = {
        build(packageDirectory) {
            const draft = {
                schemaVersion: 1,
                recordingId: 'rec-1',
                planId: 'plan-1',
                planFingerprint: 'fp-1',
                files: [
                    { layer: 'feature', path: 'features/payment/case.feature', content: 'Feature: Draft' },
                    { layer: 'steps', path: 'features/steps/payment/case.steps.ts', content: 'export {}' },
                    { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', content: 'export class Draft {}' },
                    { layer: 'locators', path: 'resources/locators/payment/case.locator.json', content: '{}' },
                ],
                actionTrace: [{ sequence: 1, gherkinStep: 'When acción', screenMethod: 'executeAction' }],
                assumptions: ['full draft'],
            };
            writeJson(path.join(packageDirectory, 'deterministic-draft.json'), draft);
            return draft;
        },
    };
    const calls = [];
    const fake = provider(calls);
    const result = await new LayeredGenerationOrchestrator(
        fake,
        fake,
        undefined,
        draftBuilder,
    ).run(root);

    assert.equal(result.success, true);
    const loremDraft = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/deterministic-draft.json')));
    const zoremDraft = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/deterministic-draft.json')));
    assert.deepEqual(loremDraft.files.map(file => file.layer), ['feature', 'steps']);
    assert.deepEqual(zoremDraft.files.map(file => file.layer), ['screen', 'locators']);
    assert.deepEqual(loremDraft.actionTrace.map(trace => trace.sequence), [1]);
    assert.deepEqual(zoremDraft.actionTrace.map(trace => trace.sequence), [1]);
    assert.equal(fs.existsSync(path.join(root, 'agents/lorem/unresolved-context.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'agents/zorem/unresolved-context.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'agents/sumrak/deterministic-draft.json')), false);
});

test('el recorder impone el contenido de los autores aunque el integrador intente reescribirlo', async () => {
    const root = fixture();
    const calls = [];
    const fake = rewritingIntegrator(calls);
    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.equal(response.files.find(file => file.layer === 'feature').content, 'Feature: Caso');
    assert.equal(response.files.find(file => file.layer === 'steps').content, 'export {}');
    assert.equal(response.files.find(file => file.layer === 'screen').content, 'export class CaseScreen {}');
    assert.equal(response.files.find(file => file.layer === 'locators').content, '{}');
});

test('normaliza And y But de Steps a keywords ejecutables por Cucumber', async () => {
    const root = fixture();
    const calls = [];
    const base = provider(calls);
    const fake = {
        ...base,
        async execute(input) {
            const result = await base.execute(input);
            if (input.agentName === 'Lorem') {
                const outputFile = path.join(input.cwd, 'behavior-result.json');
                const behavior = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                behavior.files.find(file => file.layer === 'steps').content = [
                    "import { Given, When, Then, And, But } from '@cucumber/cucumber';",
                    "Given(/^inicio$/, async () => {});",
                    "And(/^continúa$/, async () => {});",
                    "When(/^actúa$/, async () => {});",
                    "But(/^alternativa$/, async () => {});",
                    "Then(/^termina$/, async () => {});",
                ].join('\n');
                writeJson(outputFile, behavior);
            }
            return result;
        },
    };

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    const steps = response.files.find(file => file.layer === 'steps').content;
    assert.match(steps, /import \{ Given, When, Then \}/);
    assert.match(steps, /Given\(\/\^continúa/);
    assert.match(steps, /When\(\/\^alternativa/);
    assert.doesNotMatch(steps, /^\s*(?:And|But)\s*\(/m);
});

test('rechaza una capa fuera del ownership del autor', () => {
    const errors = validateLayeredAgentResult({
        schemaVersion: 1,
        role: 'behavior-author',
        recordingId: 'rec-1',
        planId: 'plan-1',
        files: [{ layer: 'locators', path: 'x.json', content: '{}' }],
        actionTrace: [],
    }, 'behavior-author', 'rec-1', 'plan-1');
    assert.match(errors.join(' '), /no puede producir la capa locators/);
});

test('el autor recibe baselines por referencia en su manifiesto', async () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'baselines'), { recursive: true });
    fs.writeFileSync(path.join(root, 'baselines', 'screen-case.screen.ts'), 'export class Existing {}', 'utf8');
    const calls = [];
    const fake = provider(calls);
    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    const manifest = JSON.parse(fs.readFileSync(
        path.join(root, 'agents', 'zorem', 'input-manifest.json'),
        'utf8',
    ));
    assert.equal(manifest.artifacts.some(item => item.path === 'baselines/screen-case.screen.ts'), true);
    assert.equal(manifest.artifacts.every(item => item.sha256 && item.bytes >= 0), true);
});

test('una nueva ejecución limpia solo los workspaces obsoletos de sus roles', async () => {
    const root = fixture();
    const stale = path.join(root, 'agents', 'lorem', 'stale-output.txt');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'old', 'utf8');
    const calls = [];
    const fake = provider(calls);
    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(stale), false);
});

test('detiene integración si un resultado cambia después de publicar su hash', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls, interactionDirectory => {
        const behavior = path.join(path.dirname(interactionDirectory), 'lorem', 'behavior-result.json');
        fs.appendFileSync(behavior, ' ');
    });
    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, false);
    assert.match(result.error, /cambió después de su handoff/);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem']);
});

test('somete la respuesta integrada al validador determinista inyectado', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    const result = await new LayeredGenerationOrchestrator(fake, fake, (_packageDirectory, _response) => ({
        valid: false,
        errors: [{ message: 'Steps sin trazabilidad cruzada.' }],
    })).run(root);

    assert.equal(result.success, false);
    assert.match(result.error, /Steps sin trazabilidad cruzada/);
    assert.equal(fs.existsSync(path.join(root, 'agent-response.json')), true);
});

test('Derek devuelve una observación de locator solo a Zorem y reintenta Sumrak', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    let validations = 0;
    const result = await new LayeredGenerationOrchestrator(fake, fake, () => {
        validations += 1;
        return validations === 1
            ? { valid: false, errors: [{ message: 'El locator debe conservar el selector primary.' }] }
            : { valid: true, errors: [] };
    }).run(root);

    assert.equal(result.success, true);
    assert.deepEqual(calls.map(call => call.agentName), [
        'Lorem', 'Zorem', 'Sumrak', 'Zorem', 'Sumrak',
    ]);
    assert.equal(calls[3].sessionName, 'Derek/rec-1/Zorem/repair-1');
    assert.equal(calls[4].sessionName, 'Derek/rec-1/Sumrak/repair-1');
    const report = JSON.parse(fs.readFileSync(result.reportFile, 'utf8'));
    assert.equal(report.repairAttempts, 1);
    assert.equal(report.stages[2].state, 'repairing');
    assert.equal(report.stages.at(-1).state, 'completed');
});

test('Derek valida la reparación de Zorem en vivo y mantiene la misma sesión hasta aceptarla', async () => {
    const root = fixture();
    const calls = [];
    const base = provider(calls);
    let liveChecks = 0;
    const liveRepairProvider = {
        ...base,
        async execute(input) {
            const result = await base.execute(input);
            if (input.agentName === 'Zorem' && /repair-1$/.test(input.sessionName)) {
                const outputFile = path.join(input.cwd, 'interaction-result.json');
                const candidate = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                assert.equal(input.stopOnValidatedOutput.acceptOutput(candidate), false);
                candidate.files.find(file => file.layer === 'screen').content = 'export class CaseScreen { /* FIXED */ }';
                writeJson(outputFile, candidate);
                assert.equal(input.stopOnValidatedOutput.acceptOutput(candidate), true);
                liveChecks += 2;
            }
            return result;
        },
    };
    const validator = (_packageDirectory, response) => ({
        valid: response.files.some(file => file.layer === 'screen' && file.content.includes('FIXED')),
        errors: [{ message: 'El locator debe conservar el selector primary.' }],
    });

    const result = await new LayeredGenerationOrchestrator(
        liveRepairProvider,
        liveRepairProvider,
        validator,
    ).run(root);

    assert.equal(result.success, true);
    assert.equal(liveChecks, 2);
    const feedback = JSON.parse(fs.readFileSync(
        path.join(root, 'agents', 'zorem', 'repair-feedback.json'),
        'utf8',
    ));
    assert.equal(feedback.status, 'accepted');
    assert.deepEqual(feedback.errors, []);
});

test('Derek relanza solo el autor con feedback pendiente cuando Copilot cerró antes de corregir', async () => {
    const root = fixture();
    const calls = [];
    const base = provider(calls);
    const feedbackProvider = {
        ...base,
        async execute(input) {
            const result = await base.execute(input);
            if (input.agentName === 'Lorem' && /feedback-1$/.test(input.sessionName)) {
                const outputFile = path.join(input.cwd, 'behavior-result.json');
                const candidate = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                candidate.files.find(file => file.layer === 'feature').content = [
                    'Feature: Caso',
                    'Scenario: [TC-1][Happy Path][AUTO-FRONT] Caso válido',
                ].join('\n');
                writeJson(outputFile, candidate);
            }
            return result;
        },
    };
    const validator = (_packageDirectory, response) => {
        const feature = response.files.find(file => file.layer === 'feature')?.content || '';
        return feature.includes('Scenario: [TC-1][Happy Path][AUTO-FRONT]')
            ? { valid: true, errors: [] }
            : { valid: false, errors: [{ message: 'Scenario sin formato [TC-1][Path][AUTO-FRONT]' }] };
    };

    const result = await new LayeredGenerationOrchestrator(
        feedbackProvider,
        feedbackProvider,
        validator,
    ).run(root);

    assert.equal(result.success, true);
    assert.equal(calls.some(call => call.sessionName.endsWith('/Lorem/repair-1/feedback-1')), true);
    const feedback = JSON.parse(fs.readFileSync(
        path.join(root, 'agents', 'lorem', 'repair-feedback.json'),
        'utf8',
    ));
    assert.equal(feedback.status, 'accepted');
});

test('Sumrak no puede omitir gaps abiertos aunque el JSON cumpla el schema', async () => {
    const root = fixture();
    const calls = [];
    const base = provider(calls);
    const missingGapProvider = {
        ...base,
        async execute(input) {
            const result = await base.execute(input);
            if (input.agentName === 'Sumrak') {
                const responseFile = path.join(input.cwd, 'agent-response.json');
                const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
                response.resolutions = [];
                writeJson(responseFile, response);
            }
            return result;
        },
    };
    const result = await new LayeredGenerationOrchestrator(
        missingGapProvider,
        missingGapProvider,
    ).run(root);

    assert.equal(result.success, false);
    assert.match(result.error, /Falta resolución para gap abierto: gap-1/);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak', 'Sumrak']);
});

test('Sumrak no puede cambiar create a reuse contra la resolución determinista del plan', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.resolutions = [{
        sequence: 1,
        action: 'CLICK',
        intent: 'botón principal',
        resolution: 'create',
        locatorName: 'primaryButton',
        selector: '~primary',
        confidence: 1,
        reason: 'El selector no coincide con candidatos existentes.',
        gapId: 'gap-1',
    }];
    writeJson(planFile, plan);
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, false);
    assert.match(result.error, /gap-1 debe conservar decision create del plan; recibió resolved/);
});

test('reutiliza Lorem y Zorem por fingerprint cuando sus entradas no cambiaron', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    const orchestrator = new LayeredGenerationOrchestrator(fake, fake);

    assert.equal((await orchestrator.run(root)).success, true);
    // Simula la reconstrucción del paquete automation: los workspaces se
    // eliminan, mientras el caché sibling del recording debe sobrevivir.
    fs.rmSync(path.join(root, 'agents'), { recursive: true, force: true });
    calls.length = 0;
    const second = await orchestrator.run(root);

    assert.equal(second.success, true);
    assert.deepEqual(calls.map(call => call.agentName), []);
    const report = JSON.parse(fs.readFileSync(second.reportFile, 'utf8'));
    assert.deepEqual(report.stages.map(stage => stage.execution), ['cache', 'cache', 'cache']);
    assert.deepEqual(report.stages.map(stage => stage.cacheHit), [true, true, true]);
});

// La memoria no es del recording: otro recording con las mismas acciones,
// plan y baselines (una regrabacion del mismo caso, una regeneracion desde
// otra carpeta) reutiliza el trabajo verificado de Lorem y Zorem aunque
// cambien recordingId, planId y fechas.
test('otro recording con los mismos inputs reutiliza el pipeline verificado y recibe sus propios ids', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    const orchestrator = new LayeredGenerationOrchestrator(fake, fake);
    assert.equal((await orchestrator.run(root)).success, true);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);

    // Segundo recording: misma memoria (mismo runtime), otra carpeta, otros ids.
    const other = path.join(path.dirname(root), `${path.basename(root)}-other`);
    fs.cpSync(root, other, { recursive: true });
    fs.rmSync(path.join(other, 'agents'), { recursive: true, force: true });
    fs.rmSync(path.join(other, 'agent-response.json'), { force: true });
    for (const name of ['generation-plan.json', 'scenario.json']) {
        const file = path.join(other, name);
        const document = JSON.parse(fs.readFileSync(file, 'utf8'));
        document.recordingId = 'rec-2';
        if (document.planId) document.planId = 'plan-2';
        document.createdAt = '2030-01-01T00:00:00.000Z';
        writeJson(file, document);
    }
    calls.length = 0;
    const second = await orchestrator.run(other);

    assert.equal(second.success, true);
    assert.deepEqual(calls.map(call => call.agentName), [], 'ningun agente vuelve a correr');
    const report = JSON.parse(fs.readFileSync(second.reportFile, 'utf8'));
    assert.deepEqual(report.stages.map(stage => stage.execution), ['cache', 'cache', 'cache']);
    const response = JSON.parse(fs.readFileSync(path.join(other, 'agent-response.json'), 'utf8'));
    assert.equal(response.recordingId, 'rec-2');
    assert.equal(response.planId, 'plan-2');

    // Un cambio real de contenido (otra accion) no reutiliza nada. (El
    // proveedor falso responde con los ids del fixture, asi que este tercer
    // recording conserva rec-1/plan-1 y solo cambia las acciones.)
    const changed = path.join(path.dirname(root), `${path.basename(root)}-changed`);
    fs.cpSync(root, changed, { recursive: true });
    fs.rmSync(path.join(changed, 'agents'), { recursive: true, force: true });
    fs.rmSync(path.join(changed, 'agent-response.json'), { force: true });
    fs.rmSync(path.join(changed, 'layered-generation-run.json'), { force: true });
    const scenarioFile = path.join(changed, 'scenario.json');
    const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
    scenario.request.actions = [{ action: 'CLICK', selector: '~otro', sequence: 1 }];
    writeJson(scenarioFile, scenario);
    calls.length = 0;
    const third = await orchestrator.run(changed);
    assert.equal(third.success, true, third.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
});

test('no promueve al caché una generación que falló la validación oficial', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    const orchestrator = new LayeredGenerationOrchestrator(fake, fake, () => ({
        valid: false,
        errors: [{ message: 'Feature inválido para esta prueba.' }],
    }));

    assert.equal((await orchestrator.run(root)).success, false);
    calls.length = 0;
    assert.equal((await orchestrator.run(root)).success, false);

    assert.deepEqual(calls.slice(0, 2).map(call => call.agentName), ['Lorem', 'Zorem']);
});

test('Derek integra sin Sumrak cuando el único gap ya está fijado como extend-existing', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const gapsFile = path.join(root, 'gaps.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.unresolvedGapIds = ['gap-extend-existing-artifacts'];
    writeJson(planFile, plan);
    writeJson(gapsFile, {
        gaps: [{ id: 'gap-extend-existing-artifacts', type: 'semantic-naming', blocking: false }],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem']);
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.equal(response.resolutions[0].decision, 'extend-existing');
    const report = JSON.parse(fs.readFileSync(result.reportFile, 'utf8'));
    assert.equal(report.stages.at(-1).agentName, 'Sumrak');
    assert.equal(report.stages.at(-1).execution, 'deterministic');
    assert.equal(report.stages.at(-1).durationMs, 0);
});

// Es el caso normal: el plan ya fijó create/reuse por secuencia y el integrador
// rechazaría cualquier otra decisión. Pedírsela a Sumrak era pagar una sesión
// de Copilot para que repitiera lo escrito. Derek firma esas resoluciones.
test('Derek integra sin Sumrak cuando todas las decisiones abiertas ya están fijadas por el plan', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.resolutions = [
        { sequence: 1, action: 'CLICK', intent: 'botón principal', resolution: 'create', locatorName: 'primaryButton', selector: '~primary', confidence: 1, reason: 'nuevo' },
        { sequence: 2, action: 'CLICK', intent: 'botón secundario', resolution: 'reuse', locatorName: 'secondaryButton', selector: '~secondary', confidence: 1, reason: 'ya existe' },
    ];
    plan.unresolvedGapIds = ['gap-duplicate-1', 'gap-duplicate-2', 'gap-extend-existing-artifacts'];
    writeJson(planFile, plan);
    writeJson(path.join(root, 'gaps.json'), {
        gaps: [
            { id: 'gap-duplicate-1', sequence: 1, type: 'semantic-naming', blocking: false },
            { id: 'gap-duplicate-2', sequence: 2, type: 'semantic-naming', blocking: false },
            { id: 'gap-extend-existing-artifacts', type: 'semantic-naming', blocking: false },
        ],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem'], 'Sumrak no abre sesión');
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.deepEqual(
        response.resolutions.map(resolution => [resolution.gapId, resolution.decision]),
        [['gap-duplicate-1', 'create'], ['gap-duplicate-2', 'reuse'], ['gap-extend-existing-artifacts', 'extend-existing']],
    );
    assert.match(response.resolutions[0].reason, /acción 1/);
    const report = JSON.parse(fs.readFileSync(result.reportFile, 'utf8'));
    assert.equal(report.stages.at(-1).agentName, 'Sumrak');
    assert.equal(report.stages.at(-1).execution, 'deterministic');
});

test('Sumrak sigue decidiendo cuando algún gap abierto no tiene decisión fijada por el plan', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.resolutions = [
        { sequence: 1, action: 'CLICK', intent: 'botón principal', resolution: 'create', locatorName: 'primaryButton', selector: '~primary', confidence: 1, reason: 'nuevo' },
    ];
    // gap-open no está ligado a ninguna secuencia decidida: exige juicio.
    plan.unresolvedGapIds = ['gap-duplicate-1', 'gap-open'];
    writeJson(planFile, plan);
    writeJson(path.join(root, 'gaps.json'), {
        gaps: [
            { id: 'gap-duplicate-1', sequence: 1, type: 'semantic-naming', blocking: false },
            { id: 'gap-open', type: 'verification-semantics', blocking: false },
        ],
    });
    const calls = [];
    const fake = provider(calls);

    await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.deepEqual(calls.slice(0, 3).map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
    assert.ok(calls.some(call => call.agentName === 'Sumrak'), 'Sumrak abre sesión para el gap sin decisión fijada');
});

// Los agentes solo ven los gaps que exigen juicio, sin el protocolo de queries
// que no pueden ejercer en este pipeline; las decisiones que el plan ya fijó
// las firma Derek y Sumrak no puede alterarlas ni tiene que repetirlas.
test('los agentes reciben solo los gaps abiertos y Derek firma los que el plan ya fijó', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.resolutions = [
        { sequence: 1, action: 'CLICK', intent: 'botón principal', resolution: 'create', locatorName: 'primaryButton', selector: '~primary', confidence: 1, reason: 'nuevo' },
    ];
    // gap-1 es el que responde el integrador falso; sigue exigiendo juicio.
    plan.unresolvedGapIds = ['gap-duplicate-1', 'gap-1', 'gap-extend-existing-artifacts'];
    writeJson(planFile, plan);
    const querySchema = { findExistingScreen: { squad: 'string', term: 'string' } };
    writeJson(path.join(root, 'gaps.json'), {
        gaps: [
            { id: 'gap-duplicate-1', sequence: 1, type: 'semantic-naming', blocking: false, allowedQueries: ['findExistingScreen'], allowedQueryArgsSchemas: querySchema, maxQueries: 6, expectedAnswerSchema: { type: 'object' } },
            { id: 'gap-1', type: 'verification-semantics', blocking: false, description: 'Aserción débil', allowedQueries: ['findLocator'], allowedQueryArgsSchemas: querySchema, maxQueries: 6, expectedAnswerSchema: { type: 'object' } },
            { id: 'gap-extend-existing-artifacts', type: 'semantic-naming', blocking: false },
        ],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
    for (const directory of ['lorem', 'zorem', 'sumrak']) {
        const gaps = JSON.parse(fs.readFileSync(path.join(root, 'agents', directory, 'gaps.json'), 'utf8')).gaps;
        assert.deepEqual(gaps.map(gap => gap.id), ['gap-1'], `${directory} solo ve el gap que exige juicio`);
        for (const field of ['allowedQueries', 'allowedQueryArgsSchemas', 'maxQueries', 'expectedAnswerSchema']) {
            assert.equal(field in gaps[0], false, `${directory}: ${field} no viaja al agente`);
        }
        assert.equal(gaps[0].description, 'Aserción débil', 'la descripción funcional sí viaja');
        const stagePlan = JSON.parse(fs.readFileSync(path.join(root, 'agents', directory, 'generation-plan.json'), 'utf8'));
        assert.deepEqual(stagePlan.unresolvedGapIds, ['gap-1']);
        assert.deepEqual(
            stagePlan.fixedGapResolutions.map(resolution => [resolution.gapId, resolution.decision]),
            [['gap-duplicate-1', 'create'], ['gap-extend-existing-artifacts', 'extend-existing']],
        );
    }
    // El paquete oficial conserva los gaps completos: es lo que revisa el QA.
    const packageGaps = JSON.parse(fs.readFileSync(path.join(root, 'gaps.json'), 'utf8')).gaps;
    assert.equal(packageGaps.length, 3);
    assert.ok(packageGaps[0].allowedQueries);
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.deepEqual(
        response.resolutions.map(resolution => [resolution.gapId, resolution.decision]),
        [['gap-duplicate-1', 'create'], ['gap-extend-existing-artifacts', 'extend-existing'], ['gap-1', 'resolved']],
    );
});

// El feedback se dirige por el `code` de la regla, no por palabras del mensaje.
// "La acción 5 traza btnfilter, pero el plan exige filtersDaysButton" no
// nombra locator ni screen: por texto iba a los tres agentes; por código
// (`trace-locator`) es de Zorem.
test('Derek dirige el feedback por código de regla aunque el mensaje no delate la capa', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    let validations = 0;
    const result = await new LayeredGenerationOrchestrator(fake, fake, () => {
        validations += 1;
        return validations === 1
            ? { valid: false, errors: [{ code: 'trace-locator', message: 'La acción 5 traza btnfilter, pero el plan exige filtersDaysButton.' }] }
            : { valid: true, errors: [] };
    }).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak', 'Zorem', 'Sumrak']);
    // Tras aceptar la reparación, Derek deja el feedback de Zorem en `accepted`;
    // Lorem nunca recibió el error.
    const feedback = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/repair-feedback.json'), 'utf8'));
    assert.equal(feedback.status, 'accepted');
    assert.equal(fs.existsSync(path.join(root, 'agents/lorem/repair-feedback.json')), false, 'Lorem no recibe un error de locator');
});

test('un error de Gherkin con código de comportamiento vuelve solo a Lorem', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    let validations = 0;
    const result = await new LayeredGenerationOrchestrator(fake, fake, () => {
        validations += 1;
        return validations === 1
            ? { valid: false, errors: [{ code: 'imperative-gherkin', message: 'Describe la intención de negocio.' }] }
            : { valid: true, errors: [] };
    }).run(root);

    assert.equal(result.success, true, result.error);
    // Lorem repara; Zorem no se relanza porque la interfaz actionTrace no cambió.
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak', 'Lorem', 'Sumrak']);
});

// Solo Zorem ejecuta algo (screen-object-contract.js). Con `shell(node)` abierto,
// la prohibicion de explorar el framework era solo de prompt.
test('solo Zorem recibe permiso de ejecutar scripts de validación', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);

    await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.deepEqual(
        calls.map(call => [call.agentName, call.allowValidationScripts]),
        [['Lorem', false], ['Zorem', true], ['Sumrak', false]],
    );
});

// El presupuesto del plan es una referencia de coste que se reporta; nunca
// recorta evidencia ni corta la sesion. Lo unico que corta es el hang stop.
test('el presupuesto informa por etapa y la sesión solo se corta al hang stop', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.budgets = { maxDurationMs: 1, maxContextBytes: 10 };
    writeJson(planFile, plan);
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true, result.error);
    // Nadie recibe 300 s como limite de vida: el hang stop es de una hora.
    assert.deepEqual([...new Set(calls.map(call => call.timeoutMs))], [3_600_000]);
    const report = JSON.parse(fs.readFileSync(result.reportFile, 'utf8'));
    const lorem = report.stages.find(stage => stage.agentName === 'Lorem');
    assert.deepEqual(lorem.budget, { maxDurationMs: 1, maxContextBytes: 10, hangStopMs: 3_600_000 });
    assert.ok(lorem.contextBytes > lorem.evidenceBytes, 'contextBytes cuenta tambien el protocolo de la carpeta');
    assert.equal(lorem.timedOut, false);
    assert.equal(lorem.budgetWarnings.length, 2, JSON.stringify(lorem.budgetWarnings));
    assert.match(lorem.budgetWarnings[0], /No se recortó evidencia/);
    assert.match(lorem.budgetWarnings[1], /hang stop/);
    // Con presupuesto holgado no hay avisos y la evidencia es la misma.
    const relaxed = fixture();
    const relaxedCalls = [];
    const relaxedResult = await new LayeredGenerationOrchestrator(provider(relaxedCalls), provider(relaxedCalls)).run(relaxed);
    const relaxedReport = JSON.parse(fs.readFileSync(relaxedResult.reportFile, 'utf8'));
    const relaxedLorem = relaxedReport.stages.find(stage => stage.agentName === 'Lorem');
    assert.deepEqual(relaxedLorem.budgetWarnings, []);
    // Misma evidencia con y sin presupuesto ajustado: el plan solo difiere en
    // el bloque budgets, que tambien viaja.
    assert.equal(relaxedLorem.contextFiles, lorem.contextFiles);
    assert.ok(Math.abs(relaxedLorem.evidenceBytes - lorem.evidenceBytes) < 100);
});

test('un timeoutMs explícito en las opciones sigue mandando como hang stop', async () => {
    const root = fixture();
    const calls = [];
    const fake = provider(calls);
    await new LayeredGenerationOrchestrator(fake, fake).run(root, { timeoutMs: 42_000 });
    assert.deepEqual([...new Set(calls.map(call => call.timeoutMs))], [42_000]);
});

function draftBuilderWith(actionTrace) {
    return {
        build(packageDirectory) {
            const draft = {
                schemaVersion: 1,
                recordingId: 'rec-1',
                planId: 'plan-1',
                planFingerprint: 'fp-1',
                files: [
                    { layer: 'feature', path: 'features/payment/case.feature', content: 'Feature: Draft' },
                    { layer: 'steps', path: 'features/steps/payment/case.steps.ts', content: 'export {}' },
                    { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', content: 'export class Draft {}' },
                    { layer: 'locators', path: 'resources/locators/payment/case.locator.json', content: '{}' },
                ],
                actionTrace,
                assumptions: ['draft'],
            };
            writeJson(path.join(packageDirectory, 'deterministic-draft.json'), draft);
            return draft;
        },
    };
}

// Provider que registra cuándo empieza y termina cada sesión y deja que Lorem
// entregue una interfaz concreta (la del contrato, o una distinta).
function timedProvider(calls, loremActionTrace, delayMs = 30) {
    const base = provider(calls);
    return {
        ...base,
        async execute(input) {
            const started = Date.now();
            await new Promise(resolve => setTimeout(resolve, delayMs));
            const result = await base.execute(input);
            if (input.agentName === 'Lorem') {
                const file = path.join(input.cwd, 'behavior-result.json');
                const behavior = JSON.parse(fs.readFileSync(file, 'utf8'));
                behavior.actionTrace = loremActionTrace;
                writeJson(file, behavior);
            }
            calls.at(-1).startedAt = started;
            calls.at(-1).finishedAt = Date.now();
            return result;
        },
    };
}

const DRAFT_TRACE = [{ sequence: 1, gherkinStep: 'When acción', screenMethod: 'executeAction', locatorName: 'primaryButton' }];

test('Lorem y Zorem corren en paralelo sobre el contrato del borrador y Zorem no se relanza si la interfaz coincide', async () => {
    const root = fixture();
    const calls = [];
    const fake = timedProvider(calls, DRAFT_TRACE);

    const result = await new LayeredGenerationOrchestrator(fake, fake, undefined, draftBuilderWith(DRAFT_TRACE)).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
    const lorem = calls[0];
    const zorem = calls[1];
    assert.ok(zorem.startedAt < lorem.finishedAt, 'Zorem arranca antes de que Lorem termine');
    assert.equal(zorem.hasBehaviorDependency, true, 'Zorem recibe el contrato con la forma de behavior-result.json');
    const handoff = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/lorem-handoff.json'), 'utf8'));
    assert.equal(handoff.from, 'recorder');
    assert.equal(handoff.fromAgent, 'Derek');
    assert.equal(handoff.stage, 'draft-contract-to-interaction');
    const contract = JSON.parse(fs.readFileSync(path.join(root, 'agents/derek/behavior-result.json'), 'utf8'));
    assert.deepEqual(contract.actionTrace, DRAFT_TRACE);
    assert.deepEqual(contract.files.map(file => file.layer), ['feature', 'steps']);
});

test('si Lorem cambia la interfaz del contrato, Zorem se sincroniza con el resultado real', async () => {
    const root = fixture();
    const calls = [];
    const changed = [{ sequence: 1, gherkinStep: 'When acción', screenMethod: 'tapPrimary', locatorName: 'primaryButton' }];
    const fake = timedProvider(calls, changed);

    const result = await new LayeredGenerationOrchestrator(fake, fake, undefined, draftBuilderWith(DRAFT_TRACE)).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Zorem', 'Sumrak']);
    const handoff = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/lorem-handoff.json'), 'utf8'));
    assert.equal(handoff.from, 'behavior-author', 'la segunda pasada de Zorem parte del resultado real de Lorem');
    const feedback = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/repair-feedback.json'), 'utf8'));
    assert.match(feedback.errors.join(' '), /interfaz actionTrace distinta del contrato provisional/);
});

test('parallelAuthors:false conserva la secuencia Lorem -> Zorem aunque exista borrador', async () => {
    const root = fixture();
    const calls = [];
    const fake = timedProvider(calls, DRAFT_TRACE);

    const result = await new LayeredGenerationOrchestrator(fake, fake, undefined, draftBuilderWith(DRAFT_TRACE))
        .run(root, { parallelAuthors: false });

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem', 'Sumrak']);
    assert.ok(calls[1].startedAt >= calls[0].finishedAt, 'Zorem espera a Lorem');
    const handoff = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/lorem-handoff.json'), 'utf8'));
    assert.equal(handoff.from, 'behavior-author');
    assert.equal(fs.existsSync(path.join(root, 'agents/derek/behavior-result.json')), false);
});

// El baseline ya viaja íntegro en baselines/: el borrador de un archivo
// `update` lleva a Zorem solo lo que añade sobre él.
test('Zorem recibe el borrador de un archivo update como adiciones sobre el baseline', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.files = plan.files.map(file => file.layer === 'screen' || file.layer === 'locators'
        ? { ...file, operation: 'update' }
        : file);
    writeJson(planFile, plan);
    const baselineScreen = [
        'class CaseScreen extends BaseScreen {',
        '    private get existingButton(): string {',
        '        return Locators["caseAndroid"].existingButton;',
        '    }',
        '    public async tapExisting(): Promise<void> {',
        '        await this.uiHelper.waitForDisplayed(this.existingButton);',
        '    }',
        '}',
        'export default new CaseScreen();',
        '',
    ].join('\n');
    const draftScreen = baselineScreen.replace(
        '    public async tapExisting',
        [
            '    private get newButton(): string {',
            '        return Locators["caseAndroid"].newButton;',
            '    }',
            '    public async tapNew(): Promise<void> {',
            '        await this.uiHelper.waitForDisplayed(this.newButton);',
            '    }',
            '    public async tapExisting',
        ].join('\n'),
    );
    fs.mkdirSync(path.join(root, 'baselines'), { recursive: true });
    fs.writeFileSync(path.join(root, 'baselines/screen-case.screen.ts'), baselineScreen);
    fs.writeFileSync(path.join(root, 'baselines/locators-case.locator.json'),
        JSON.stringify({ caseAndroid: { existingButton: '~existing' }, caseIos: { existingButton: '' } }, null, 4));
    const draftBuilder = {
        build(packageDirectory) {
            const draft = {
                schemaVersion: 1, recordingId: 'rec-1', planId: 'plan-1', planFingerprint: 'fp-1',
                files: [
                    { layer: 'feature', path: 'features/payment/case.feature', content: 'Feature: Draft' },
                    { layer: 'steps', path: 'features/steps/payment/case.steps.ts', content: 'export {}' },
                    { layer: 'screen', path: 'screenobjects/payment/case.screen.ts', content: draftScreen },
                    { layer: 'locators', path: 'resources/locators/payment/case.locator.json',
                        content: JSON.stringify({ caseAndroid: { existingButton: '~existing', newButton: '~new' }, caseIos: { existingButton: '', newButton: '' } }, null, 4) },
                ],
                actionTrace: [],
                assumptions: [],
            };
            writeJson(path.join(packageDirectory, 'deterministic-draft.json'), draft);
            return draft;
        },
    };
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake, undefined, draftBuilder).run(root);

    assert.equal(result.success, true, result.error);
    const zoremDraft = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/deterministic-draft.json'), 'utf8'));
    const screen = zoremDraft.files.find(file => file.layer === 'screen');
    const locators = zoremDraft.files.find(file => file.layer === 'locators');
    assert.equal(screen.operation, 'update');
    assert.equal(screen.baseline, 'baselines/screen-case.screen.ts');
    assert.equal('content' in screen, false, 'el archivo completo no se repite: ya esta en baselines/');
    assert.deepEqual(screen.additions.getters.map(item => item.name), ['newButton']);
    assert.deepEqual(screen.additions.methods.map(item => item.name), ['tapNew']);
    assert.match(screen.additions.methods[0].code, /waitForDisplayed\(this\.newButton\)/);
    assert.equal(locators.operation, 'update');
    assert.deepEqual(locators.additions.locators.map(item => item.name), ['newButton']);
    assert.match(zoremDraft.assumptions.join(' '), /solo sus adiciones/);
    // Lorem no cambia: sus capas son create y viajan completas.
    const loremDraft = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/deterministic-draft.json'), 'utf8'));
    assert.equal(loremDraft.files.find(file => file.layer === 'feature').content, 'Feature: Draft');
});

// gap-english-naming no pide una decisión: pide que los autores nombren en
// inglés. Viaja a Lorem y Zorem, Derek lo firma y Sumrak no abre sesión por él.
test('un gap de nombres en inglés llega a los autores y no exige juicio de Sumrak', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.unresolvedGapIds = ['gap-english-naming'];
    writeJson(planFile, plan);
    writeJson(path.join(root, 'gaps.json'), {
        gaps: [{ id: 'gap-english-naming', type: 'semantic-naming', blocking: false, description: 'historyEncadenadoButton (encadenado)' }],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem']);
    for (const directory of ['lorem', 'zorem']) {
        const gaps = JSON.parse(fs.readFileSync(path.join(root, 'agents', directory, 'gaps.json'), 'utf8')).gaps;
        assert.deepEqual(gaps.map(gap => gap.id), ['gap-english-naming'], `${directory} recibe el gap informativo`);
    }
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.deepEqual(response.resolutions.map(item => [item.gapId, item.decision]), [['gap-english-naming', 'renamed-by-authors']]);
});

// Una verificación con XPath genérico se avisa a los autores, no se decide: el
// selector grabado se conserva y Derek firma con la decisión que el plan fijó.
test('un gap de aserción débil llega a los autores y Derek lo firma con la decisión del plan', async () => {
    const root = fixture();
    const planFile = path.join(root, 'generation-plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.resolutions = [
        { sequence: 2, action: 'VERIFICAR_EXISTE', intent: 'titulo', resolution: 'create', locatorName: 'containerTitle', selector: '//android.view.View', confidence: 1, reason: 'nuevo' },
    ];
    plan.unresolvedGapIds = ['gap-weak-assertion-2'];
    writeJson(planFile, plan);
    writeJson(path.join(root, 'gaps.json'), {
        gaps: [{ id: 'gap-weak-assertion-2', sequence: 2, type: 'verification-semantics', blocking: false, description: 'XPath sin predicado' }],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true, result.error);
    assert.deepEqual(calls.map(call => call.agentName), ['Lorem', 'Zorem'], 'Sumrak no abre sesión por un aviso');
    for (const directory of ['lorem', 'zorem']) {
        const gaps = JSON.parse(fs.readFileSync(path.join(root, 'agents', directory, 'gaps.json'), 'utf8')).gaps;
        assert.deepEqual(gaps.map(gap => gap.id), ['gap-weak-assertion-2']);
    }
    const response = JSON.parse(fs.readFileSync(path.join(root, 'agent-response.json'), 'utf8'));
    assert.deepEqual(response.resolutions.map(item => [item.gapId, item.decision]), [['gap-weak-assertion-2', 'create']]);
});
