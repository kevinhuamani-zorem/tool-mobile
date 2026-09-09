const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RecordingCoverageAnalyzer } = require('../dist/core/coverage');

function fixture(t, scenarioName, objective, preparedName) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-display-name-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, 'recordings', 'recording-one');
    fs.mkdirSync(directory, { recursive: true });
    const scenario = {
        recordingId: 'rec-one', createdAt: '2026-09-08T12:00:00.000Z',
        squad: 'payment', environment: 'qa', platform: 'android', objective,
        request: { scenarioName, featureName: 'Flujo mobile', caseId: 'TC-10251' },
        actions: [{ action: 'VERIFICAR_EXISTE', selector: '~Confirmación', sequence: 1 }],
    };
    const rawPath = path.join(directory, 'scenario.json');
    fs.writeFileSync(rawPath, JSON.stringify(scenario));
    const originals = new Map([[rawPath, fs.readFileSync(rawPath)]]);
    if (preparedName !== undefined) {
        const preparedPath = path.join(directory, 'generation/automation/scenario.json');
        fs.mkdirSync(path.dirname(preparedPath), { recursive: true });
        fs.writeFileSync(preparedPath, JSON.stringify({ ...scenario, request: { ...scenario.request, scenarioName: preparedName } }));
        originals.set(preparedPath, fs.readFileSync(preparedPath));
    }
    return { directory, scenario, originals, analyzer: new RecordingCoverageAnalyzer(path.join(root, 'recordings'), root, root) };
}

for (const preparedName of [undefined, 'Escenario grabado']) {
    test(`listing uses the objective for default names ${preparedName === undefined ? 'without a generated package' : 'with a generated package'}`, t => {
        const f = fixture(t, 'Escenario grabado', 'Enviar un correo de reporte de movimientos', preparedName);
        const [listed] = f.analyzer.listRecordings('payment', 'qa');
        assert.equal(listed.name, 'Enviar un correo de reporte de movimientos');
        assert.equal(listed.caseId, 'TC-10251');
        assert.equal(listed.actionCount, 1);
        assert.equal(f.analyzer.getRecordingInfo('payment', 'rec-one', 'qa').name, listed.name);
        assert.equal(f.analyzer.findRecordingDirectory('payment', 'rec-one', 'qa'), f.directory);
        assert.deepEqual(f.analyzer.listRecordings('payment', 'staging'), []);
        for (const [file, bytes] of f.originals) assert.deepEqual(fs.readFileSync(file), bytes, 'listing must not rewrite recording evidence');
    });
}

for (const preparedName of [undefined, '[TC-10251][Happy Path][AUTO-FRONT] Confirmación del reporte']) {
    test(`listing preserves a descriptive ${preparedName === undefined ? 'QA' : 'prepared'} scenario name`, t => {
        const customName = 'Consultar mis movimientos';
        const f = fixture(t, customName, 'Un objetivo diferente', preparedName);
        assert.equal(f.analyzer.listRecordings('payment', 'qa')[0].name, preparedName || customName);
    });
}

test('listing ignores empty or tagged default names and has a fallback for recordings without an objective', t => {
    const f = fixture(t, '   [TC-10251] [Happy Path] Escenario grabado   ', '  Ver confirmación del envío  ');
    assert.equal(f.analyzer.listRecordings('payment', 'qa')[0].name, 'Ver confirmación del envío');
    const file = path.join(f.directory, 'scenario.json');
    fs.writeFileSync(file, JSON.stringify({ ...f.scenario, request: { ...f.scenario.request, scenarioName: '  ' } }));
    assert.equal(f.analyzer.listRecordings('payment', 'qa')[0].name, 'Ver confirmación del envío');
    fs.writeFileSync(file, JSON.stringify({ ...f.scenario, objective: '   ' }));
    assert.equal(f.analyzer.listRecordings('payment', 'qa')[0].name, 'Grabación sin nombre');
});
