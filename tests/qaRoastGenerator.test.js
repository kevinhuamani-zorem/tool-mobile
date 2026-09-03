const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CopilotQaRoastGenerator } = require('../dist/core/automation');

function scenario(root) {
    fs.writeFileSync(path.join(root, 'scenario.json'), JSON.stringify({
        schemaVersion: 1,
        pipelineVersion: '1.0.0',
        recordingId: 'rec-roast',
        revision: 1,
        fingerprint: 'fingerprint',
        createdAt: '2026-09-02T00:00:00.000Z',
        squad: 'payment',
        platform: 'android',
        environment: 'qa',
        objective: 'filtrar movimientos',
        acceptanceCriteria: 'mostrar movimientos del periodo',
        request: {},
        actions: [
            { sequence: 1, action: 'CLICK', contextHint: 'abrir filtros', selector: 'secret-selector' },
            { sequence: 2, action: 'CLICK', contextHint: 'seleccionar Solo hoy', value: '999999999' },
            { sequence: 3, action: 'VERIFICAR_EXISTE', contextHint: 'validar opción disponible' },
        ],
    }));
}

function review() {
    return {
        status: 'qa-required',
        summary: 'Se selecciona Solo hoy, pero no se comprueban los movimientos filtrados.',
        issues: [{
            code: 'missing-business-assertion',
            severity: 'blocking',
            message: 'La opción existe, pero no se observa el resultado del filtro.',
            actionSequences: [2, 3],
            recommendation: 'Comprueba los movimientos posteriores a la selección.',
        }],
    };
}

function successfulRun() {
    return {
        success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1,
        timedOut: false, cancelled: false,
    };
}

test('genera el roast en una sesión headless separada y sin selectores', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-roast-'));
    scenario(root);
    let prompt = '';
    const provider = {
        name: 'copilot', cancel() {}, async getVersion() { return '1.0.82'; },
        async execute(input) {
            prompt = input.prompt;
            const request = JSON.parse(fs.readFileSync(path.join(root, 'qa-roast-request.json'), 'utf8'));
            assert.equal(JSON.stringify(request).includes('secret-selector'), false);
            assert.equal(JSON.stringify(request).includes('999999999'), false);
            fs.writeFileSync(path.join(root, 'qa-roast-response.json'), JSON.stringify({
                schemaVersion: 1,
                roast: 'Seleccionaste Solo hoy y no validaste una mierda del resultado. Impactante descubrimiento. Ahora comprueba los movimientos filtrados.',
            }));
            return successfulRun();
        },
    };
    const result = await new CopilotQaRoastGenerator(provider, 1000).generate(root, review());
    assert.equal(result.success, true);
    assert.equal(result.attempts, 1);
    assert.match(result.roast, /una mierda del resultado/);
    assert.equal(prompt.includes('Se selecciona Solo hoy'), false);
    assert.match(prompt, /qa-roast-request\.json/);
    const run = JSON.parse(fs.readFileSync(path.join(root, 'qa-roast-run.json'), 'utf8'));
    assert.equal(run.result, 'generated');
    assert.equal(JSON.stringify(run).includes('prompt'), false);
});

test('reintenta una vez cuando Copilot responde con tono técnico', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-roast-retry-'));
    scenario(root);
    let invocations = 0;
    const provider = {
        name: 'copilot', cancel() {}, async getVersion() { return null; },
        async execute() {
            invocations += 1;
            fs.writeFileSync(path.join(root, 'qa-roast-response.json'), JSON.stringify({
                schemaVersion: 1,
                roast: invocations === 1
                    ? 'Se recorrieron tres filtros y se comprobó que existen. Agrega una aserción.'
                    : 'Tocaste tres filtros y no validaste una mierda del resultado. Esto no es testing, es un tour guiado. Ahora valida el resultado.',
            }));
            return successfulRun();
        },
    };
    const result = await new CopilotQaRoastGenerator(provider, 1000).generate(root, review());
    assert.equal(result.success, true);
    assert.equal(result.attempts, 2);
    assert.equal(result.repairAttempts, 1);
    assert.equal(invocations, 2);
});

test('un fallo del Copilot headless no invalida el diagnóstico funcional', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-roast-failure-'));
    scenario(root);
    const provider = {
        name: 'copilot', cancel() {}, async getVersion() { return null; },
        async execute() {
            return {
                ...successfulRun(), success: false, errorCode: 'AGENT_TIMEOUT',
                errorMessage: 'timeout', timedOut: true,
            };
        },
    };
    const result = await new CopilotQaRoastGenerator(provider, 1000).generate(root, review());
    assert.equal(result.success, false);
    assert.equal(result.result, 'provider-failed');
    assert.equal(result.error, 'timeout');
    assert.equal(fs.existsSync(path.join(root, 'qa-roast-run.json')), true);
});
