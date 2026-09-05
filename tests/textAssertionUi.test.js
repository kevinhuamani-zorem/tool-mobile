const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

test('UI envía fuente/operador explícitos, conserva espacios y muestra lectura como texto seguro', async () => {
    const browser = installFakeBrowserGlobals();
    try {
        const { createRecordingFeature } = await import('../recorder/renderer/src/features/recording/recordingFeature.js');
        const sent = [];
        const feature = createRecordingFeature({
            api: {
                previewTextAssertion: async step => {
                    sent.push(step);
                    return { success: true, textPreview: { actual: '<b>Hoy</b>', expected: step.value, ...step.textAssertion, matched: true } };
                },
                executeStep: async step => { sent.push(step); return { success: false, message: 'no guardado' }; },
            }, state: {}, setStatus() {}, invalidatePreview() {}, renderSelectedLocatorCoverage() {},
            clearSelectorCandidateBackups() {}, clearSelectorChips() {}, updateFinalAction() {},
        });
        const listeners = new Map();
        for (const [id, element] of browser.document.elementsById) {
            element.addEventListener = (type, fn) => { const key = `${id}:${type}`; listeners.set(key, [...listeners.get(key) || [], fn]); };
        }
        feature.mount();
        const el = id => browser.document.getElementById(id);
        const fire = async (id, event) => { for (const fn of listeners.get(`${id}:${event}`) || []) await fn(); };
        el('cmbAction').value = 'VERIFICAR_TEXTO';
        await fire('cmbAction', 'change');
        assert.equal(el('textAssertionEditor').hidden, false);
        el('txtSelector').value = '(//android.view.View)[1]';
        el('txtElementContext').value = 'contenido de movimientos';
        el('txtValue').value = ' Hoy ';
        el('cmbTextSource').value = 'container';
        el('cmbTextOperator').value = 'equals';
        await fire('btnPreviewTextAssertion', 'click');
        assert.equal(sent[0].value, ' Hoy ');
        assert.deepEqual(sent[0].textAssertion, { version: 1, source: 'container', operator: 'equals' });
        assert.match(el('textAssertionPreview').textContent, /<b>Hoy<\/b>/);
        assert.equal(el('textAssertionPreview').innerHTML, '');
        await fire('btnExecute', 'click');
        assert.deepEqual(sent[1].textAssertion, sent[0].textAssertion);
        assert.equal(sent[1].value, sent[0].value);
        el('cmbAction').value = 'CLICK';
        await fire('cmbAction', 'change');
        assert.equal(el('textAssertionEditor').hidden, true);
        feature.unmount();
    } finally { browser.restore(); }
});
