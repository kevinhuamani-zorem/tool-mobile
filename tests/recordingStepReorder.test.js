const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { reorderRecordedSteps } = require('../dist/recorder/src/ipc/interactionHandlers');

test('reordena acciones conservando su contenido y renumerando la traza', () => {
    const original = [
        { action: 'CLICK', sequence: 1, contextHint: 'primero', selector: 'id=one' },
        { action: 'SCROLL_DOWN', sequence: 2, description: 'segundo' },
        { action: 'VERIFICAR_EXISTE', sequence: 3, contextHint: 'tercero', selector: 'id=three' },
    ];
    const reordered = reorderRecordedSteps(original, 2, 0);

    assert.deepEqual(reordered.map(step => step.contextHint || step.description), [
        'tercero', 'primero', 'segundo',
    ]);
    assert.deepEqual(reordered.map(step => step.sequence), [1, 2, 3]);
    assert.equal(reordered[0].selector, 'id=three');
    assert.deepEqual(original.map(step => step.sequence), [1, 2, 3], 'no muta el arreglo anterior');
});

test('rechaza posiciones inválidas sin alterar el recording', () => {
    const steps = [{ action: 'CLICK', sequence: 1 }];
    assert.throws(() => reorderRecordedSteps(steps, 0, 2), /fuera del recording/);
    assert.throws(() => reorderRecordedSteps(steps, 0.5, 0), /deben ser enteras/);
    assert.deepEqual(steps, [{ action: 'CLICK', sequence: 1 }]);
});

test('la interfaz expone controles y sincroniza preview al mover', () => {
    const workspace = fs.readFileSync(
        path.join(root, 'recorder/renderer/src/components/RecorderWorkspace.tsx'),
        'utf8',
    );
    const recording = fs.readFileSync(
        path.join(root, 'recorder/renderer/src/features/recording/recordingFeature.js'),
        'utf8',
    );
    const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf8');

    assert.match(workspace, /id="btnMoveStepUp"/);
    assert.match(workspace, /id="btnMoveStepDown"/);
    assert.match(preload, /ipcRenderer\.invoke\('move-step', from, to\)/);
    assert.match(recording, /api\.moveStep\(selectedStepIndex, targetIndex\)/);
    assert.match(recording, /await refreshGherkinPreview\(\)/);
});
