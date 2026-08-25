const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSimulators, runtimeVersion } = require('../dist/core/iosSimulators');

// Salida real de `xcrun simctl list devices available --json`, recortada.
const SALIDA = JSON.stringify({
    devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
            { udid: 'AAA', name: 'iPhone 16 Pro', state: 'Booted', isAvailable: true },
            { udid: 'BBB', name: 'iPhone 16', state: 'Shutdown', isAvailable: true },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
            { udid: 'CCC', name: 'iPhone 15', state: 'Shutdown', isAvailable: true },
        ],
        'com.apple.CoreSimulator.SimRuntime.watchOS-11-2': [
            { udid: 'DDD', name: 'Apple Watch Series 10', state: 'Shutdown', isAvailable: true },
        ],
    },
});

test('extrae la versión del identificador del runtime', () => {
    assert.equal(runtimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-18-2'), '18.2');
    assert.equal(runtimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-16-4-1'), '16.4.1');
    assert.equal(runtimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-18'), '18');
    // watchOS y tvOS no sirven para grabar la app.
    assert.equal(runtimeVersion('com.apple.CoreSimulator.SimRuntime.watchOS-11-2'), '');
});

test('lista solo simuladores iOS y pone los arrancados primero', () => {
    const simuladores = parseSimulators(SALIDA);

    assert.deepEqual(simuladores.map(item => item.udid), ['AAA', 'BBB', 'CCC']);
    assert.equal(simuladores[0].booted, true);
    assert.equal(simuladores[0].version, '18.2');
    assert.equal(simuladores[0].name, 'iPhone 16 Pro');
    assert.equal(simuladores.some(item => item.name.includes('Watch')), false);
});

// Una salida rara no puede tumbar la pantalla de conexión.
test('tolera salidas inválidas o incompletas', () => {
    assert.deepEqual(parseSimulators('no es json'), []);
    assert.deepEqual(parseSimulators('{}'), []);
    assert.deepEqual(parseSimulators(JSON.stringify({ devices: null })), []);
    // Sin udid no se puede conectar; se descarta.
    assert.deepEqual(parseSimulators(JSON.stringify({
        devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [{ name: 'sin udid' }] },
    })), []);
    // `isAvailable: false` se descarta aunque el comando diga `available`.
    assert.deepEqual(parseSimulators(JSON.stringify({
        devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
                { udid: 'X', name: 'no disponible', state: 'Shutdown', isAvailable: false },
            ],
        },
    })), []);
});

test('un simulador apagado sigue siendo elegible', () => {
    const [simulador] = parseSimulators(JSON.stringify({
        devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
                { udid: 'ZZZ', name: 'iPhone 16', state: 'Shutdown', isAvailable: true },
            ],
        },
    }));
    assert.equal(simulador.booted, false);
    assert.equal(simulador.state, 'Shutdown');
});

// La sesión local dejó de asumir Android en toda la cadena.
test('la cadena local resuelve la plataforma en vez de fijarla', () => {
    const driver = fs.readFileSync(path.join(__dirname, '../core/appiumDriverManager.ts'), 'utf8');
    assert.match(driver, /platformName:\s*'iOS'/);
    assert.match(driver, /'appium:automationName':\s*'XCUITest'/);
    assert.match(driver, /config\.platform === 'ios'/);

    const main = fs.readFileSync(path.join(__dirname, '../recorder/src/main.ts'), 'utf8');
    const startSession = main.slice(main.indexOf("ipcMain.handle('start-session'"));
    const cuerpo = startSession.slice(0, startSession.indexOf('ipcMain.handle', 10));
    assert.doesNotMatch(cuerpo, /recordingPlatform = 'android';/);
    assert.match(cuerpo, /config\.platform === 'ios' \? 'ios' : 'android'/);
    assert.match(cuerpo, /new LocatorManager\(projectPaths\.locators, 'global', recordingPlatform\)/);
});

test('la configuración local permite seleccionar IPA por un IPC acotado', () => {
    const root = path.join(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'recorder/src/preload.ts'), 'utf8');
    const component = fs.readFileSync(
        path.join(root, 'recorder/renderer/src/components/ConfigurationScreen.tsx'),
        'utf8'
    );
    const controller = fs.readFileSync(
        path.join(root, 'recorder/renderer/src/controller/recorderController.js'),
        'utf8'
    );

    assert.match(main, /ipcMain\.handle\('select-local-app'/);
    assert.match(main, /extensions: \['app', 'ipa'\]/);
    assert.match(main, /new Set\(\['\.app', '\.ipa'\]\)/);
    assert.match(preload, /selectLocalApp:[\s\S]*select-local-app/);
    assert.match(component, /id="btnChooseLocalApp"/);
    assert.match(controller, /api\.selectLocalApp\(selectedLocalPlatform\(\)\)/);
    assert.match(controller, /result\.simulatorWarning/);
});

test('iOS local puede iniciar sin app ni bundleId para apertura manual', () => {
    const root = path.join(__dirname, '..');
    const driver = fs.readFileSync(path.join(root, 'core/appiumDriverManager.ts'), 'utf8');
    const controller = fs.readFileSync(
        path.join(root, 'recorder/renderer/src/controller/recorderController.js'),
        'utf8'
    );
    const iosValidation = controller.slice(
        controller.indexOf("if (platform === 'ios')"),
        controller.indexOf('const deviceName', controller.indexOf("if (platform === 'ios')"))
    );

    assert.doesNotMatch(iosValidation, /!bundleId\s*&&\s*!apk/);
    assert.match(controller, /abre la app manualmente en Simulator y refresca la captura/);
    assert.match(driver, /if \(config\.appPath\)[\s\S]*else if \(config\.bundleId\)/);
});
