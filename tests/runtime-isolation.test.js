const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const toolRoot = path.resolve(__dirname, '..');

test('run.sh starts and validates the Appium runtime owned by fwk-mobile-test', () => {
    const script = fs.readFileSync(path.join(toolRoot, 'run.sh'), 'utf8');

    assert.match(script, /APPIUM_HOME_ROOT="\$\{FRAMEWORK_ROOT\}"/);
    assert.match(script, /FRAMEWORK_APPIUM_BIN="\$\{FRAMEWORK_ROOT\}\/node_modules\/\.bin\/appium"/);
    assert.match(script, /typeof baseDriver\.AppiumIpc !== 'function'/);
    assert.match(script, /appium-uiautomator2-driver/);
    assert.match(script, /appium-xcuitest-driver/);
});

test('the recorder does not duplicate the Appium server or mobile drivers', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(toolRoot, 'package.json'), 'utf8'),
    );

    assert.equal(packageJson.dependencies.appium, undefined);
    assert.equal(packageJson.dependencies['appium-uiautomator2-driver'], undefined);
    assert.equal(packageJson.dependencies['appium-xcuitest-driver'], undefined);
});
