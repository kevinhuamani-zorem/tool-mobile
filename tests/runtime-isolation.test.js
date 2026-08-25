const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const toolRoot = path.resolve(__dirname, '..');

test('run.sh always starts the Appium runtime owned by the recorder', () => {
    const script = fs.readFileSync(path.join(toolRoot, 'run.sh'), 'utf8');

    assert.match(script, /APPIUM_HOME_ROOT="\$\{SCRIPT_DIR\}"/);
    assert.match(script, /node_modules\/\.bin\/appium/);
    assert.match(script, /typeof baseDriver\.AppiumIpc === "function"/);
    assert.doesNotMatch(script, /FRAMEWORK_ROOT.*node_modules\/\.bin\/appium/);
});

test('the recorder pins a compatible Appium server and local drivers', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(toolRoot, 'package.json'), 'utf8'),
    );

    assert.equal(packageJson.dependencies.appium, '3.5.0');
    assert.equal(packageJson.dependencies['appium-uiautomator2-driver'], '8.4.0');
    assert.equal(packageJson.dependencies['appium-xcuitest-driver'], '12.3.3');
});
