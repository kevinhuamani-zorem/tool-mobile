const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Fase "Electron IPC architecture": `main.ts` deja de registrar handlers IPC
// directamente y pasa a ser un composition root que arma servicios/estado y
// delega el registro a módulos cohesivos por familia bajo `recorder/src/ipc/`.
// Estas pruebas leen el código fuente (no el compilado) porque su objetivo es
// el contrato estructural del composition root, no el comportamiento en
// tiempo de ejecución de cada handler — eso ya lo cubren
// `automationPipeline.test.js`, `inspectorWorkflow.test.js`,
// `iosSimulators.test.js`, etc. sobre el JS compilado.

const root = path.resolve(__dirname, '..');
const ipcDir = path.join(root, 'recorder/src/ipc');
const main = fs.readFileSync(path.join(root, 'recorder/src/main.ts'), 'utf8');

const HANDLER_FAMILIES = [
    'workspaceHandlers',
    'sessionHandlers',
    'inspectorHandlers',
    'interactionHandlers',
    'automationHandlers',
    'generationHandlers',
];

const REGISTER_FUNCTIONS = {
    workspaceHandlers: 'registerWorkspaceHandlers',
    sessionHandlers: 'registerSessionHandlers',
    inspectorHandlers: 'registerInspectorHandlers',
    interactionHandlers: 'registerInteractionHandlers',
    automationHandlers: 'registerAutomationHandlers',
    generationHandlers: 'registerGenerationHandlers',
};

const familySource = {};
for (const family of HANDLER_FAMILIES) {
    familySource[family] = fs.readFileSync(path.join(ipcDir, `${family}.ts`), 'utf8');
}

function allIpcChannels(source) {
    const channels = [];
    const regex = /ipcMain\.(?:handle|on)\('([a-zA-Z0-9-]+)'/g;
    let match;
    while ((match = regex.exec(source)) !== null) channels.push(match[1]);
    return channels;
}

test('main.ts no registra ningún canal IPC directamente', () => {
    assert.doesNotMatch(main, /ipcMain\.(handle|on)\(/);
    // Sí puede (y debe) importar `ipcMain`-consumers indirectamente a través
    // de los módulos de familia, pero nunca el símbolo `ipcMain` en sí mismo.
    assert.doesNotMatch(main, /from 'electron'[^;]*ipcMain/s);
});

test('cada familia de handlers exporta su función de registro y un contexto de dependencias propio', () => {
    for (const family of HANDLER_FAMILIES) {
        const source = familySource[family];
        const fn = REGISTER_FUNCTIONS[family];
        assert.match(
            source,
            new RegExp(`export function ${fn}\\(context: \\w+HandlersContext\\): void`),
            `${family}.ts debe exportar ${fn} con un contexto propio`,
        );
        assert.match(
            source,
            /export interface \w+HandlersContext \{/,
            `${family}.ts debe declarar su propio contexto de dependencias`,
        );
    }
});

test('main.ts construye servicios/estado y registra cada familia exactamente una vez', () => {
    for (const family of HANDLER_FAMILIES) {
        const fn = REGISTER_FUNCTIONS[family];
        assert.match(
            main,
            new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '\\./ipc/${family}'`),
            `main.ts debe importar ${fn} desde ipc/${family}`,
        );
        const occurrences = main.match(new RegExp(`${fn}\\(\\{`, 'g')) || [];
        assert.equal(occurrences.length, 1, `${fn} debe registrarse una única vez desde main.ts`);
    }
    // El estado compartido se construye una sola vez y se inyecta por
    // referencia; ninguna familia crea su propia copia de `RecorderRuntimeState`.
    assert.match(main, /const state = new RecorderRuntimeState\(/);
    for (const family of HANDLER_FAMILIES) {
        assert.doesNotMatch(
            familySource[family],
            /new RecorderRuntimeState\(/,
            `${family}.ts no debe construir su propia copia del estado compartido`,
        );
    }
});

test('ningún módulo de ipc/ importa de vuelta a main.ts (sin ciclos)', () => {
    for (const family of HANDLER_FAMILIES) {
        assert.doesNotMatch(
            familySource[family],
            /from '\.\.\/main'/,
            `${family}.ts no debe importar main.ts`,
        );
    }
    const supportFiles = ['runtimeState.ts', 'recordingSync.ts'];
    for (const file of supportFiles) {
        const source = fs.readFileSync(path.join(ipcDir, file), 'utf8');
        assert.doesNotMatch(source, /from '\.\.\/main'/, `${file} no debe importar main.ts`);
    }
});

test('los 52 canales IPC existentes se reparten sin duplicarse entre las familias', () => {
    const seen = new Map();
    let total = 0;
    for (const family of HANDLER_FAMILIES) {
        for (const channel of allIpcChannels(familySource[family])) {
            total += 1;
            assert.ok(
                !seen.has(channel),
                `El canal '${channel}' está registrado en ${family}.ts y también en ${seen.get(channel)}.ts`,
            );
            seen.set(channel, family);
        }
    }
    assert.equal(total, 52);
    assert.equal(allIpcChannels(main).length, 0);

    // Contrato de familias tal como las describe docs/ARCHITECTURE.md: cada
    // canal público conocido debe seguir existiendo, aunque haya cambiado de
    // archivo.
    const expectedByFamily = {
        workspaceHandlers: [
            'scan-framework', 'analyze-step-reuse', 'analyze-step-impact', 'get-workspace-info',
            'select-framework-root', 'get-squad-catalog', 'get-existing-scenarios',
            'get-scenario-coverage', 'assign-locator-value',
        ],
        sessionHandlers: [
            'get-devices', 'select-local-app', 'get-foreground-app', 'start-session',
            'bs-load-credentials', 'bs-save-credentials', 'bs-get-devices', 'bs-get-apps',
            'bs-upload-app', 'bs-start-session', 'close-session',
        ],
        inspectorHandlers: ['embedded-inspector-message', 'open-inspector', 'activate-inspector'],
        interactionHandlers: [
            'preview-text-assertion', 'update-text-assertion',
            'get-screenshot', 'tap-at', 'swipe-from-to', 'verify-selector', 'execute-step',
            'delete-step', 'move-step', 'clear-steps', 'get-steps', 'get-page-source', 'find-element-at',
        ],
        automationHandlers: [
            'resume-recording', 'prepare-automation-package', 'prepare-automation-regeneration',
            'launch-automation-agent', 'import-automation-response', 'revalidate-automation-response',
            'get-automation-qa-decisions', 'resolve-automation-qa-decisions', 'generate-automation-response',
            'get-automation-memory-stats', 'get-automation-model-usage',
        ],
        generationHandlers: [
            'preview-gherkin', 'preview-fwk-files', 'generate-fwk-files', 'generate-files',
            'generate-linked-files',
        ],
    };
    for (const [family, channels] of Object.entries(expectedByFamily)) {
        const actual = allIpcChannels(familySource[family]).sort();
        assert.deepEqual(actual, [...channels].sort(), `canales inesperados en ${family}.ts`);
    }
});

test('main.ts conserva la ventana, el ciclo de vida de la app y el registro del protocolo del Inspector', () => {
    assert.match(main, /new BrowserWindow\(\{/);
    assert.match(main, /nodeIntegration:\s*false/);
    assert.match(main, /contextIsolation:\s*true/);
    assert.match(main, /app\.whenReady\(\)\.then/);
    assert.match(main, /app\.on\('window-all-closed', quitAfterCleanup\)/);
    assert.match(main, /registerEmbeddedInspectorScheme\(\)/);
    assert.match(main, /registerEmbeddedInspectorProtocol\(\)/);
    // Esas responsabilidades no viven en ninguna familia de handlers.
    for (const family of HANDLER_FAMILIES) {
        assert.doesNotMatch(familySource[family], /new BrowserWindow\(/);
        assert.doesNotMatch(familySource[family], /app\.whenReady/);
    }
});

test('la limpieza de ciclo de vida sigue siendo Inspector embebido primero y sesión propia después', () => {
    assert.match(
        main,
        /const recorderLifecycle = new RecorderRuntimeLifecycle\(\[\s*\(\) => closeEmbeddedInspectorResources\([\s\S]*?\(\) => closeOwnedSession\(/,
    );
    // El servidor Appium integrado es un recurso de proceso: se apaga solo
    // al cerrar la app, nunca al cerrar una sesion para elegir otro caso.
    assert.match(main, /\], \[[\s\S]*?\(\) => appiumServer\.stop\(\),\s*\]\);/);
    assert.match(familySource.sessionHandlers, /ipcMain\.handle\('close-session'[\s\S]*?recorderLifecycle\.closeSession\(\)/);
    assert.doesNotMatch(familySource.sessionHandlers, /ipcMain\.handle\('close-session'[\s\S]*?recorderLifecycle\.cleanup\(\)/);
    assert.match(familySource.sessionHandlers, /appiumServer\.ensureRunning\(\)/);
});
