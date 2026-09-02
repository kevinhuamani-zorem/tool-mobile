const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const toolRoot = path.resolve(__dirname, '..');

test('the embedded server starts Appium with the runtime owned by visual-recorder', () => {
    const server = fs.readFileSync(
        path.join(toolRoot, 'core', 'mobile-session', 'infrastructure', 'embeddedAppiumServer.ts'),
        'utf8',
    );
    const main = fs.readFileSync(path.join(toolRoot, 'recorder', 'src', 'main.ts'), 'utf8');

    assert.match(server, /node_modules', 'appium', 'index\.js'/);
    assert.match(server, /appium-uiautomator2-driver/);
    assert.match(server, /appium-xcuitest-driver/);
    assert.match(server, /APPIUM_HOME: appiumHome/);
    assert.match(server, /'--address', '127\.0\.0\.1'/);
    assert.match(server, /'--port', '4723'/);
    assert.match(main, /const appiumServer = new EmbeddedAppiumServer\(\)/);
    assert.match(main, /await appiumServer\.start\(\)/);
    assert.match(main, /\(\) => appiumServer\.stop\(\)/);
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
