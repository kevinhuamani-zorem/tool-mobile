const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const recorderRoot = path.resolve(__dirname, '..');

test('project settings expose a validated framework root switch', () => {
    const screen = fs.readFileSync(path.join(
        recorderRoot, 'recorder/renderer/src/components/ConfigurationScreen.tsx'
    ), 'utf8');
    const feature = fs.readFileSync(path.join(
        recorderRoot, 'recorder/renderer/src/features/configuration/configurationFeature.js'
    ), 'utf8');
    const bootstrap = fs.readFileSync(path.join(recorderRoot, 'recorder/src/workspaceBootstrap.ts'), 'utf8');
    assert.match(screen, /id="btnSelectFrameworkRoot"/);
    assert.match(feature, /api\.selectFrameworkRoot\(\)/);
    assert.match(feature, /Reiniciando el recorder/);
    assert.match(bootstrap, /isFrameworkRoot\(selectedRoot\)/);
    assert.match(bootstrap, /saveWorkspace\(selectedRoot\)/);
});

test('workspace paths can target a selected framework and writable runtime', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-macos-workspace-'));
    for (const relative of [
        'features/yape-features',
        'features/yape-steps-definitions',
        'resources/locators',
        'screenobjects',
        'support',
    ]) fs.mkdirSync(path.join(root, relative), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
    const runtimeRoot = path.join(root, '.recorder-state');
    const script = `
      const {configureWorkspacePaths,projectPaths,workspaceConfiguration}=require('./dist/core/workspace');
      configureWorkspacePaths({targetProject:${JSON.stringify(root)},runtimeRoot:${JSON.stringify(runtimeRoot)},source:'selected'});
      process.stdout.write(JSON.stringify({projectPaths,workspaceConfiguration}));
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: recorderRoot,
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const configured = JSON.parse(result.stdout);
    assert.equal(configured.projectPaths.frameworkRoot, root);
    assert.equal(configured.projectPaths.recordings, path.join(runtimeRoot, 'runtime', 'recordings'));
    assert.equal(configured.projectPaths.toolConfig, path.join(runtimeRoot, 'config'));
    assert.equal(configured.workspaceConfiguration.source, 'selected');
});

test('packaging config produces a mac app with the isolated mobile runtime', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(recorderRoot, 'package.json'), 'utf8'));
    assert.match(packageJson.scripts['package:mac'], /electron-builder --mac dir/);
    assert.match(packageJson.scripts['package:mac'], /runtime-origin:write/);
    assert.match(packageJson.scripts['package:mac'], /node scripts\/reveal-macos-app\.js/);
    assert.equal(fs.existsSync(path.join(recorderRoot, 'scripts', 'reveal-macos-app.js')), true);
    assert.equal(fs.existsSync(path.join(recorderRoot, 'scripts', 'write-runtime-origin.js')), true);
    assert.equal(fs.existsSync(path.join(recorderRoot, 'build', 'icon.png')), true);
    assert.match(packageJson.scripts['dmg:mac'], /electron-builder --mac dmg/);
    assert.equal(packageJson.build.mac.icon, 'build/icon.png');
    assert.equal(packageJson.build.asar, false);
    assert.equal(packageJson.build.mac.identity, null);
    assert.ok(Number(packageJson.devDependencies.electron.match(/\d+/)[0]) >= 37);
    assert.ok(packageJson.build.extraResources.some(resource =>
        resource.to.includes('appium-inspector/c495991c37c28d166a2bd825554759978dd7ad72')));
    assert.ok(packageJson.build.extraResources.some(resource => resource.to === 'runtime-origin.json'));
});

test('bundled Appium manifest points to both recorder-owned drivers', () => {
    const { buildBundledDriverManifest } = require('../dist/core/mobile-session');
    const manifest = buildBundledDriverManifest(recorderRoot);
    assert.equal(manifest.schemaRev, 4);
    assert.equal(manifest.drivers.uiautomator2.automationName, 'UiAutomator2');
    assert.equal(manifest.drivers.xcuitest.automationName, 'XCUITest');
    assert.equal(manifest.drivers.uiautomator2.installPath,
        path.join(recorderRoot, 'node_modules', 'appium-uiautomator2-driver'));
    assert.equal(manifest.drivers.xcuitest.installPath,
        path.join(recorderRoot, 'node_modules', 'appium-xcuitest-driver'));
});
