const test = require('node:test');
const assert = require('node:assert/strict');
const { GeminiClient } = require('../dist/ai/geminiClient');

const actions = [{ action: 'CLICK', variableName: 'btnLogin' }];
const context = {
    squad: 'payment',
    platform: 'android',
    caseId: 'TC-10239',
    featureHint: '',
    scenarioHint: '',
    actions: [{ index: 0, action: 'CLICK', logicalLocator: 'btnLogin' }],
    existingDefinitions: [],
    rules: []
};

test('interpreta la respuesta JSON estructurada de Gemini', async () => {
    const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
            candidates: [{
                content: {
                    parts: [{
                        text: JSON.stringify({
                            featureName: 'Login',
                            scenarioName: 'Ingreso',
                            fileName: 'login',
                            locatorModule: 'login',
                            rows: [{
                                keyword: 'Given',
                                text: 'el usuario abre el login',
                                actionIndices: [0],
                                methodName: 'abrirLogin'
                            }],
                            actionNames: [{ actionIndex: 0, locatorName: 'btnLogin' }],
                            assumptions: [],
                            warnings: []
                        })
                    }]
                }
            }]
        })
    });
    const client = new GeminiClient({ apiKey: 'test-key', fetchImpl });
    const plan = await client.generatePlan(context, actions);
    assert.equal(plan.rows[0].actionIndices[0], 0);
});

test('no ejecuta una solicitud sin GEMINI_API_KEY', async () => {
    const client = new GeminiClient({ apiKey: '' });
    await assert.rejects(client.generatePlan(context, actions), /GEMINI_API_KEY/);
});
