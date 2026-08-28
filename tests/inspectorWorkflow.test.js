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

test('exposes only explicit element-use transfer and keeps verification pending', () => {
    assert.match(preload, /onInspectorElementUsed/);
    assert.match(preload, /embedded-inspector-element-used/);
    assert.doesNotMatch(preload, /ElementSelected|element-selected/);
    assert.match(controller, /api\.onInspectorElementUsed/);
    assert.match(controller, /pendiente de verificación/);
    assert.doesNotMatch(controller, /onInspectorElementSelected/);
});

test('forwards explicit use before hiding without invoking centralized cleanup', () => {
    const transfer = between(
        main,
        'elementUsed => {',
        'error => mainWindow?.webContents.send',
    );
    assert.match(transfer, /webContents\.send\('embedded-inspector-element-used'/);
    assert.match(transfer, /returnToRecorderAfterElementUse\(embeddedInspectorWindow, mainWindow\)/);
    assert.ok(
        transfer.indexOf("webContents.send('embedded-inspector-element-used'") <
        transfer.indexOf('returnToRecorderAfterElementUse'),
    );
    assert.doesNotMatch(transfer, /destroy|proxy\.stop|sessionOwnership\.close|recorderLifecycle\.cleanup/);
    assert.match(main, /const recorderLifecycle = new RecorderRuntimeLifecycle\(\[[\s\S]*closeEmbeddedInspectorResources[\s\S]*closeOwnedSession/);
});
