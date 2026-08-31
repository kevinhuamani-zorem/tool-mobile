const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DeterministicGenerator } = require('../dist/core/deterministicGenerator');
const { projectPaths } = require('../dist/core/projectPaths');

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test('deterministic generator conserva el step definido por el plan del caso', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-generator-'));
    writeJson(path.join(dir, 'scenario.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-1',
        revision: 1,
        fingerprint: 'fp-1',
        createdAt: new Date(0).toISOString(),
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'Consultar movimientos',
        acceptanceCriteria: 'Se muestran movimientos',
        request: {
            squad: 'payment',
            featureName: 'Flujo',
            scenarioName: 'Escenario',
            fileName: 'sample',
            locatorModule: 'sample',
            caseId: 'TC-10239',
            pathType: 'Happy Path',
            tag: 'sample',
            platform: 'android',
            scenarioRows: [{
                keyword: 'When',
                text: 'el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro',
                status: 'missing',
                actions: [{ sequence: 1 }],
            }],
        },
        actions: [{
            sequence: 1,
            action: 'CLICK',
            selector: '~Movimientos',
            variableName: 'movementsButton',
        }],
    });
    writeJson(path.join(dir, 'generation-plan.json'), {
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        planId: 'plan-1',
        recordingId: 'rec-1',
        fingerprint: 'fp-1',
        deterministicCoverage: 1,
        status: 'needs-agent',
        resolutions: [{
            sequence: 1,
            action: 'CLICK',
            intent: 'consulta',
            resolution: 'create',
            locatorName: 'movementsButton',
            selector: '~Movimientos',
            confidence: 1,
            reason: 'create',
        }],
        files: [
            { layer: 'feature', path: 'features/yape-features/payment/sample.feature', operation: 'create' },
            { layer: 'steps', path: 'features/yape-steps-definitions/payment/sample.steps.ts', operation: 'create' },
            { layer: 'screen', path: 'screenobjects/payment/sample.screen.ts', operation: 'create' },
            { layer: 'locators', path: 'resources/locators/payment/sample.locator.json', operation: 'create' },
        ],
        unresolvedGapIds: [],
        budgets: {
            maxDurationMs: 300000,
            maxContextBytes: 20000,
            maxResponseBytes: 400000,
            maxAgentInvocations: 2,
            maxTotalQueries: 24,
            maxQueriesPerGap: 6,
            maxRepairAttempts: 1,
        },
    });

    const preview = {
        featurePath: path.join(projectPaths.frameworkRoot, 'features/yape-features/payment/sample.feature'),
        featureContent: 'Feature: Sample',
        stepPath: path.join(projectPaths.frameworkRoot, 'features/yape-steps-definitions/payment/sample.steps.ts'),
        stepContent: [
            "import { When } from '@wdio/cucumber-framework';",
            '',
            'When(/^el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro$/, async () => {',
            '    await sampleScreen.userViewAllMovements();',
            '});',
            '',
        ].join('\n'),
        screenPath: path.join(projectPaths.frameworkRoot, 'screenobjects/payment/sample.screen.ts'),
        screenContent: 'class SampleScreen {}',
        locatorPath: path.join(projectPaths.frameworkRoot, 'resources/locators/payment/sample.locator.json'),
        locatorContent: '{ "sampleAndroid": {}, "sampleIos": {} }',
        files: [],
    };
    const generator = new DeterministicGenerator({ preview: () => ({ ...preview }) });
    const response = generator.generate(dir, []);
    const steps = response.files.find(file => file.layer === 'steps').content;

    assert.equal(
        steps.includes('When(/^el usuario consulta todos sus movimientos en contenedor movimientos casuisticas filtro$/'),
        true,
    );
});
