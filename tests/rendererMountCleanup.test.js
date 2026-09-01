// [visual-recorder] Prueba de composición: `initializeRecorder()` monta cada
// feature exactamente una vez y `disposeRecorder()` retira todos los
// listeners que registró, para que un remount (por ejemplo React StrictMode
// en desarrollo) no acumule handlers duplicados. Usa un DOM mínimo propio
// (`tests/helpers/fakeDom.js`) porque el proyecto no depende de jsdom.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

const controllerUrl = path.join(
    __dirname,
    '../recorder/renderer/src/controller/recorderController.js'
);

function totalListenerCount(document) {
    let total = document.listenerCount();
    for (const element of document.elementsById.values()) {
        total += element.listenerCount();
    }
    return total;
}

test('initializeRecorder monta cada feature una sola vez sin listeners duplicados', async () => {
    const fakeBrowser = installFakeBrowserGlobals();
    try {
        const { initializeRecorder, disposeRecorder } = await import(controllerUrl);

        await initializeRecorder();
        const afterFirstMount = totalListenerCount(fakeBrowser.document);
        assert.ok(afterFirstMount > 0, 'el primer mount debe registrar listeners');

        // Montar de nuevo sin desmontar antes (el bug que este test evita)
        // duplicaría cada listener; lo comprobamos aparte más abajo.
        disposeRecorder();
        const afterDispose = totalListenerCount(fakeBrowser.document);
        assert.equal(afterDispose, 0, 'disposeRecorder debe retirar todos los listeners registrados');

        // Llamar disposeRecorder() sin una inicialización activa no debe fallar.
        assert.doesNotThrow(() => disposeRecorder());

        await initializeRecorder();
        const afterRemount = totalListenerCount(fakeBrowser.document);
        assert.equal(
            afterRemount,
            afterFirstMount,
            'un remount tras dispose debe registrar exactamente los mismos listeners que el primer mount, no más'
        );
        disposeRecorder();
    } finally {
        fakeBrowser.restore();
    }
});

test('sin dispose entre mounts los listeners sí se duplican (documenta el riesgo que dispose evita)', async () => {
    const fakeBrowser = installFakeBrowserGlobals();
    try {
        const { initializeRecorder } = await import(`${controllerUrl}?case=no-dispose`);

        await initializeRecorder();
        const afterFirstMount = totalListenerCount(fakeBrowser.document);
        await initializeRecorder();
        const afterSecondMountWithoutDispose = totalListenerCount(fakeBrowser.document);
        assert.equal(
            afterSecondMountWithoutDispose,
            afterFirstMount * 2,
            'sin dispose, montar dos veces duplica cada listener: por eso App.tsx debe llamar a disposeRecorder() en la limpieza del efecto'
        );
    } finally {
        fakeBrowser.restore();
    }
});
