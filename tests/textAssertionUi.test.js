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
        assert.equal(el('lblStepValue').textContent, 'Valor esperado:');
        assert.equal(el('chkTextDescendants').checked, false);
        assert.equal(el('textAssertionAdvanced').open, false);
        el('txtSelector').value = '(//android.view.View)[1]';
        el('txtElementContext').value = 'contenido de movimientos';
        el('txtValue').value = ' Hoy ';
        await fire('btnPreviewTextAssertion', 'click');
        assert.deepEqual(sent.pop().textAssertion, { version: 1, source: 'element', operator: 'contains' });
        el('chkTextDescendants').checked = true;
        await fire('chkTextDescendants', 'change');
        assert.equal(el('textAssertionPreview').textContent, '');
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
        assert.equal(el('lblStepValue').textContent, 'Valor:');
        assert.equal(el('chkTextDescendants').checked, false);
        assert.equal(el('cmbTextOperator').value, 'contains');
        feature.unmount();
    } finally { browser.restore(); }
});

test('editar restaura descendientes y operador; cancelar o guardar vuelve al alcance del elemento', async () => {
    const browser = installFakeBrowserGlobals();
    let feature;
    try {
        const { createRecordingFeature } = await import('../recorder/renderer/src/features/recording/recordingFeature.js');
        const steps = [
            { action: 'VERIFICAR_TEXTO', selector: '//container', value: 'Hoy', textAssertion: { version: 1, source: 'container', operator: 'equals' } },
            { action: 'VERIFICAR_TEXTO', selector: '//label', value: 'Hoy', textAssertion: { version: 1, source: 'element', operator: 'contains' } },
            { action: 'VERIFICAR_TEXTO', selector: '//legacy', value: 'Hoy' },
        ];
        const original = JSON.stringify(steps);
        const updates = [];
        feature = createRecordingFeature({
            api: {
                updateTextAssertion: async (index, payload) => {
                    updates.push({ index, payload });
                    return { success: true, steps };
                },
                previewGherkin: async () => ({ success: true, preview: '' }),
            }, state: {}, setStatus() {}, invalidatePreview() {}, renderSelectedLocatorCoverage() {},
            clearSelectorCandidateBackups() {}, clearSelectorChips() {}, updateFinalAction() {},
        });
        const bindEvents = element => {
            const handlers = new Map();
            element.addEventListener = (type, fn) => handlers.set(type, [...handlers.get(type) || [], fn]);
            element.dispatchEvent = event => { for (const fn of handlers.get(event.type) || []) fn(); };
            element.fire = async type => { for (const fn of handlers.get(type) || []) await fn(); };
            return element;
        };
        for (const element of browser.document.elementsById.values()) bindEvents(element);
        const createElement = browser.document.createElement;
        browser.document.createElement = () => bindEvents(createElement());
        const el = id => browser.document.getElementById(id);
        feature.mount();
        feature.renderSteps(steps);
        const edit = async index => {
            await el('lstSteps').children[index].fire('click');
            await el('btnEditTextAssertion').fire('click');
        };
        await edit(0);
        assert.equal(el('chkTextDescendants').checked, true);
        assert.equal(el('textAssertionAdvanced').open, true);
        assert.equal(el('cmbTextOperator').value, 'equals');
        assert.equal(el('txtSelector').value, '//container');
        await el('btnCancelTextEdit').fire('click');
        assert.equal(el('chkTextDescendants').checked, false);
        assert.equal(el('textAssertionAdvanced').open, false);
        assert.equal(updates.length, 0);
        await edit(0);
        await el('btnUpdateTextAssertion').fire('click');
        assert.deepEqual(updates[0], { index: 0, payload: { value: 'Hoy', textAssertion: steps[0].textAssertion } });
        assert.equal(el('chkTextDescendants').checked, false);
        assert.equal(el('textAssertionAdvanced').open, false);
        for (const index of [1, 2]) {
            await edit(index);
            assert.equal(el('chkTextDescendants').checked, false);
            assert.equal(el('textAssertionAdvanced').open, false);
            assert.equal(el('cmbTextOperator').value, 'contains');
        }
        assert.equal(JSON.stringify(steps), original, 'abrir el editor no migra grabaciones');
    } finally { feature?.unmount(); browser.restore(); }
});
