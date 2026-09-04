const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    LayeredGenerationOrchestrator,
    validateLayeredAgentResult,
} = require('../dist/core/automation');

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-generation-'));
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
        elements: [{ module: 'payment/movements', elements: [{ name: 'btnFilter' }] }],
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
        ],
    });
    const calls = [];
    const fake = provider(calls);

    const result = await new LayeredGenerationOrchestrator(fake, fake).run(root);

    assert.equal(result.success, true);
    const loremReuse = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/reuse-context.json')));
    const zoremReuse = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/reuse-context.json')));
    const loremValidation = JSON.parse(fs.readFileSync(path.join(root, 'agents/lorem/validation-contract.json')));
    const zoremValidation = JSON.parse(fs.readFileSync(path.join(root, 'agents/zorem/validation-contract.json')));
    assert.equal(Array.isArray(loremReuse.candidates), true);
    assert.equal('elements' in loremReuse, false);
    assert.equal(Array.isArray(zoremReuse.elements), true);
    assert.equal('candidates' in zoremReuse, false);
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
