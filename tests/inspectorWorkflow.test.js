const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(
    path.join(root, 'recorder/renderer/src/controller/recorderController.js'),
    'utf8',
);
const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf8');
const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
const scenarioPackage = fs.readFileSync(
    path.join(root, 'core/automationScenarioPackage.ts'),
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
    assert.match(controller, /btnXmlInspector\.addEventListener\('click', openAppiumInspector\)/);
    assert.match(controller, /btnOpenAssignmentInspector\.addEventListener\('click', openAppiumInspector\)/);
    assert.doesNotMatch(controller, /btnOpenAssignmentInspector[\s\S]{0,100}btnInspect\.click/);

    const launcher = between(
        controller,
        'async function openAppiumInspector()',
        "btnXmlInspector.addEventListener('click', openAppiumInspector)",
    );
    assert.match(launcher, /api\.openInspector\(\)/);
    assert.match(launcher, /openLegacyHierarchyInspector/);
    assert.doesNotMatch(launcher, /currentAssignment\s*=/);
});

test('keeps the lower inspect button in recorder-local screenshot and XML mode', () => {
    const localInspector = between(
        controller,
        "btnInspect.addEventListener('click'",
        "btnExecute.addEventListener('click'",
    );
    assert.match(localInspector, /api\.getScreenshot\(\)/);
    assert.match(localInspector, /api\.getPageSource\(\)/);
    assert.doesNotMatch(localInspector, /api\.openInspector\(\)/);
});

test('exposes only explicit element-use transfer after recorder revalidation', () => {
    assert.match(preload, /onInspectorElementUsed/);
    assert.match(preload, /embedded-inspector-element-used/);
    assert.doesNotMatch(preload, /ElementSelected|element-selected/);
    assert.match(controller, /api\.onInspectorElementUsed/);
    assert.match(controller, /Selector y backups revalidados contra la sesión activa/);
    assert.match(controller, /selectorCandidateToken/);
    assert.match(controller, /clearInspectorCandidates/);
    assert.doesNotMatch(controller, /onInspectorElementSelected/);
});

test('revalidates explicit use before forwarding and hiding without centralized cleanup', () => {
    const transfer = between(
        main,
        'elementUsed => {',
        'error => mainWindow?.webContents.send',
    );
    assert.match(transfer, /validateEmbeddedInspectorElementUse\(elementUsed\)/);
    assert.doesNotMatch(transfer, /destroy|proxy\.stop|sessionOwnership\.close|recorderLifecycle\.cleanup/);
    const validation = between(
        main,
        'async function validateEmbeddedInspectorElementUse(',
        'const recorderLifecycle = new RecorderRuntimeLifecycle',
    );
    assert.match(validation, /independentlyVerifySelectorCandidates/);
    assert.match(validation, /generation !== inspectorValidationGeneration/);
    assert.match(validation, /webContents\.send\('embedded-inspector-element-used'/);
    assert.ok(validation.indexOf("webContents.send('embedded-inspector-element-used'") <
        validation.indexOf('returnToRecorderAfterElementUse'));
    assert.match(main, /const recorderLifecycle = new RecorderRuntimeLifecycle\(\[[\s\S]*closeEmbeddedInspectorResources[\s\S]*closeOwnedSession/);
});

test('clears stale backups on edits or alternative selection and persists only the trusted token', () => {
    const inputHandler = between(
        controller,
        "txtSelector.addEventListener('input'",
        "cmbAction.addEventListener('change'",
    );
    assert.match(inputHandler, /clearSelectorCandidateBackups\(\)/);

    const chips = between(controller, 'function renderSelectorChips(', 'function buildCandidatesFromEl(');
    assert.match(chips, /chip\.addEventListener\('click'[\s\S]*clearSelectorCandidateBackups\(\)/);

    const execute = between(
        controller,
        "btnExecute.addEventListener('click'",
        "btnDelete.addEventListener('click'",
    );
    assert.match(execute, /selectorVerified:\s*verifiedSelector === selector/);
    assert.match(execute, /selectorCandidateToken/);
    assert.match(execute, /try\s*\{[\s\S]*api\.executeStep\(step\)[\s\S]*catch \(error\)[\s\S]*finally\s*\{[\s\S]*enableBtn\(btnExecute\)/);
    assert.match(execute, /catch \(error\) \{[\s\S]*setStatus\('✗ '/);
    assert.match(main, /selectorCandidateToken === pendingInspectorCandidates\.token/);
    assert.match(main, /selectorCandidates:\s*_untrustedCandidates/);
    assert.match(main, /preparedStep\.selectorVerified === true[\s\S]*Boolean\(trustedCandidates\)/);
    const executeHandler = between(
        main,
        "ipcMain.handle('execute-step'",
        "ipcMain.handle('delete-step'",
    );
    assert.ok(executeHandler.indexOf('prepareRecordedStep(') < executeHandler.indexOf('executor.execute('));
    assert.ok(executeHandler.indexOf('executor.execute(') < executeHandler.indexOf('recordedSteps.push('));
    assert.match(executeHandler, /catch \(error\) \{[\s\S]*recordedSteps\.pop\(\)/);
    assert.match(main, /requireTrustedScenarioPackage/);
    assert.match(
        scenarioPackage,
        /ya no corresponde a la grabación/
    );
});

test('aplica completions externos aunque el plan no tenga capas update', () => {
    const additiveUpdates = between(
        main,
        'function applyAdditiveUpdates(',
        "ipcMain.handle('generate-automation-response'",
    );
    assert.doesNotMatch(additiveUpdates, /if \(!updates\.size\) return/);
    assert.match(additiveUpdates, /for \(const \[file, completions\] of completionsByFile\)/);
    assert.match(additiveUpdates, /automationPatchWriter\.apply\([\s\S]*additions: \[\], completions/);
    assert.match(additiveUpdates, /No existe el archivo externo autorizado para completion/);
});
