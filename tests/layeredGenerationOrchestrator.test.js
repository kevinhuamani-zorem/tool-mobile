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
    for (const call of calls) {
        const directory = call.agentName.toLowerCase();
        assert.equal(fs.existsSync(path.join(root, 'agents', directory, 'agent-task.md')), true);
        assert.equal(fs.existsSync(path.join(root, 'agents', directory, '.github', 'agents', `${call.agentName}.agent.md`)), true);
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
