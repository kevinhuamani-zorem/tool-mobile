const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const toolRoot = path.resolve(__dirname, '..');

test('run.sh starts and validates the Appium runtime owned by visual-recorder', () => {
    const script = fs.readFileSync(path.join(toolRoot, 'run.sh'), 'utf8');

    assert.match(script, /APPIUM_HOME_ROOT="\$\{SCRIPT_DIR\}"/);
    assert.match(script, /RECORDER_APPIUM_BIN="\$\{SCRIPT_DIR\}\/node_modules\/\.bin\/appium"/);
    assert.match(script, /fs\.existsSync\(electron\)/);
    assert.match(script, /Ejecuta sin --ignore-scripts/);
    assert.match(script, /typeof baseDriver\.AppiumIpc !== 'function'/);
    assert.match(script, /appium-uiautomator2-driver/);
    assert.match(script, /appium-xcuitest-driver/);
});

test('the recorder pins an isolated and compatible Appium runtime', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(toolRoot, 'package.json'), 'utf8'),
    );

    assert.equal(packageJson.dependencies.appium, '3.5.0');
    assert.equal(packageJson.dependencies['@appium/base-driver'], '10.6.0');
    assert.equal(packageJson.dependencies['appium-uiautomator2-driver'], '8.4.0');
    assert.equal(packageJson.dependencies['appium-xcuitest-driver'], '12.3.3');
});
