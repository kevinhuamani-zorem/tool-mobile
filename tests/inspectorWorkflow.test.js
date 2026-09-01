const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/controller/recorderController.js'),
    'utf8',
);
const inspector = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/features/inspector/inspectorFeature.js'),
    'utf8',
);
const recording = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/features/recording/recordingFeature.js'),
    'utf8',
);
const platformCompletion = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/features/platform-completion/platformCompletionFeature.js'),
    'utf8',
);
const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf8');
const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
const inspectorHandlers = fs.readFileSync(
    path.join(root, 'recorder/src/ipc/inspectorHandlers.ts'),
    'utf8',
);
const interactionHandlers = fs.readFileSync(
    path.join(root, 'recorder/src/ipc/interactionHandlers.ts'),
    'utf8',
);
const automationHandlers = fs.readFileSync(
    path.join(root, 'recorder/src/ipc/automationHandlers.ts'),
    'utf8',
);
const scenarioPackage = fs.readFileSync(
    path.join(root, 'core/automation/domain/automationScenarioPackage.ts'),
    'utf8',
);

function between(source, start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
    assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
    return source.slice(startIndex, endIndex);
}

test('routes header and assignment launchers to Appium Inspector only', () => {
    assert.match(inspector, /on\(btnXmlInspector, 'click', openAppiumInspector\)/);
    assert.match(platformCompletion, /on\(btnOpenAssignmentInspector, 'click', openAppiumInspector\)/);
    assert.doesNotMatch(platformCompletion, /btnOpenAssignmentInspector[\s\S]{0,100}btnInspect\.click/);
    assert.doesNotMatch(platformCompletion, /btnInspect\.click/);

    const launcher = between(
        inspector,
        'async function openAppiumInspector()',
        "on(btnXmlInspector, 'click', openAppiumInspector)",
    );
    assert.match(launcher, /api\.openInspector\(\)/);
    assert.match(launcher, /openLegacyHierarchyInspector/);
    assert.doesNotMatch(launcher, /currentAssignment\s*=/);
});

test('keeps the lower inspect button in recorder-local screenshot and XML mode', () => {
    const localInspector = between(
        inspector,
        "on(btnInspect, 'click'",
        "on(btnCopy, 'click'",
    );
    assert.match(localInspector, /api\.getScreenshot\(\)/);
    assert.match(localInspector, /api\.getPageSource\(\)/);
    assert.doesNotMatch(localInspector, /api\.openInspector\(\)/);
});

test('exposes only explicit element-use transfer after recorder revalidation', () => {
    assert.match(preload, /onInspectorElementUsed/);
    assert.match(preload, /embedded-inspector-element-used/);
    assert.doesNotMatch(preload, /ElementSelected|element-selected/);
    assert.match(inspector, /api\.onInspectorElementUsed/);
    assert.match(inspector, /Selector y backups revalidados contra la sesión activa/);
    assert.match(inspector, /selectorCandidateToken/);
    assert.match(inspector, /clearInspectorCandidates/);
    assert.doesNotMatch(inspector, /onInspectorElementSelected/);
});

test('revalidates explicit use before forwarding and hiding without centralized cleanup', () => {
    const transfer = between(
        inspectorHandlers,
        'elementUsed => {',
        'error => state.mainWindow?.webContents.send',
    );
    assert.match(transfer, /validateEmbeddedInspectorElementUse\(state, elementUsed\)/);
    assert.doesNotMatch(transfer, /destroy|proxy\.stop|sessionOwnership\.close|recorderLifecycle\.cleanup/);
    const validation = between(
        inspectorHandlers,
        'async function validateEmbeddedInspectorElementUse(',
        'export async function closeEmbeddedInspectorResources(',
    );
    assert.match(validation, /independentlyVerifySelectorCandidates/);
    assert.match(validation, /generation !== state\.inspectorValidationGeneration/);
    assert.match(validation, /webContents\.send\('embedded-inspector-element-used'/);
    assert.ok(validation.indexOf("webContents.send('embedded-inspector-element-used'") <
        validation.indexOf('returnToRecorderAfterElementUse'));
    // main.ts es el composition root: arma la limpieza en el mismo orden
    // (Inspector embebido primero, sesión propia después), pero cada tarea
    // vive en la familia de handlers dueña de ese recurso.
    assert.match(main, /const recorderLifecycle = new RecorderRuntimeLifecycle\(\[[\s\S]*closeEmbeddedInspectorResources[\s\S]*closeOwnedSession/);
    assert.match(main, /import \{ closeEmbeddedInspectorResources, registerInspectorHandlers \} from '\.\/ipc\/inspectorHandlers'/);
    assert.match(main, /import \{ closeOwnedSession, registerSessionHandlers \} from '\.\/ipc\/sessionHandlers'/);
});

test('clears stale backups on edits or alternative selection and persists only the trusted token', () => {
    const inputHandler = between(
        inspector,
        "on(txtSelector, 'input'",
        'ipcUnsubscribers.push(api.onInspectorConnected',
    );
    assert.match(inputHandler, /clearSelectorCandidateBackups\(\)/);

    const chips = between(inspector, 'function renderSelectorChips(', 'function getAttrVal(');
    assert.match(chips, /chip\.addEventListener\('click'[\s\S]*clearSelectorCandidateBackups\(\)/);

    const execute = between(
        recording,
        "on(btnExecute, 'click'",
        "on(btnDelete, 'click'",
    );
    assert.match(execute, /selectorVerified:\s*state\.verifiedSelector === selector/);
    assert.match(execute, /selectorCandidateToken/);
    assert.match(execute, /try\s*\{[\s\S]*api\.executeStep\(step\)[\s\S]*catch \(error\)[\s\S]*finally\s*\{[\s\S]*enableBtn\(btnExecute\)/);
    assert.match(execute, /catch \(error\) \{[\s\S]*setStatus\('✗ '/);
    assert.match(interactionHandlers, /selectorCandidateToken === state\.pendingInspectorCandidates\.token/);
    assert.match(interactionHandlers, /selectorCandidates:\s*_untrustedCandidates/);
    assert.match(interactionHandlers, /preparedStep\.selectorVerified === true[\s\S]*Boolean\(trustedCandidates\)/);
    const executeHandler = between(
        interactionHandlers,
        "ipcMain.handle('execute-step'",
        "ipcMain.handle('delete-step'",
    );
    assert.ok(executeHandler.indexOf('prepareRecordedStep(') < executeHandler.indexOf('executor.execute('));
    assert.ok(executeHandler.indexOf('executor.execute(') < executeHandler.indexOf('recordedSteps.push('));
    assert.match(executeHandler, /catch \(error\) \{[\s\S]*recordedSteps\.pop\(\)/);
    assert.match(automationHandlers, /requireTrustedScenarioPackage/);
    assert.match(
        scenarioPackage,
        /ya no corresponde a la grabación/
    );
});

test('aplica completions externos aunque el plan no tenga capas update', () => {
    const additiveUpdates = between(
        automationHandlers,
        'function applyAdditiveUpdates(',
        'async function importAutomationResponseFromPackage(',
    );
    assert.doesNotMatch(additiveUpdates, /if \(!updates\.size\) return/);
    assert.match(additiveUpdates, /for \(const \[file, completions\] of completionsByFile\)/);
    assert.match(additiveUpdates, /automationPatchWriter\.apply\([\s\S]*additions: \[\], completions/);
    assert.match(additiveUpdates, /No existe el archivo externo autorizado para completion/);
});
