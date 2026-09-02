const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveAndroidTooling } = require('../dist/core/mobile-session');

test('ADB_PATH explícito tiene prioridad y se añade al PATH del app', () => {
    const adb = '/custom/android/adb';
    const tooling = resolveAndroidTooling({
        ADB_PATH: adb,
        PATH: '/usr/bin',
    }, candidate => candidate === adb);
    assert.equal(tooling.adb, adb);
    assert.equal(tooling.environment.PATH.split(path.delimiter)[0], path.dirname(adb));
});

test('detecta platform-tools del SDK estándar de macOS sin depender del PATH de Finder', () => {
    const home = '/Users/qa';
    const sdk = path.join(home, 'Library', 'Android', 'sdk');
    const adb = path.join(sdk, 'platform-tools', 'adb');
    const existing = new Set([sdk, adb]);
    const tooling = resolveAndroidTooling({ HOME: home, PATH: '/usr/bin:/bin' }, candidate => existing.has(candidate));
    assert.equal(tooling.adb, adb);
    assert.equal(tooling.sdkRoot, sdk);
    assert.equal(tooling.environment.ANDROID_HOME, sdk);
    assert.equal(tooling.environment.ANDROID_SDK_ROOT, sdk);
});

test('detecta ADB instalado por Homebrew en Apple Silicon', () => {
    const adb = '/opt/homebrew/bin/adb';
    const tooling = resolveAndroidTooling({ PATH: '/usr/bin:/bin' }, candidate => candidate === adb);
    assert.equal(tooling.adb, adb);
    assert.ok(tooling.environment.PATH.split(path.delimiter).includes('/opt/homebrew/bin'));
});
