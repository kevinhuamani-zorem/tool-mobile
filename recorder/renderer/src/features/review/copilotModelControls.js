const STORAGE_KEY = 'appiumRecorder.copilotModel.v1';
const DEFAULT_MODEL = 'claude-sonnet-5';
const PRESET_MODELS = new Set(['auto', 'gpt-5.6-terra', 'claude-opus-5', 'gpt-5.6-sol', DEFAULT_MODEL]);

export function modelUsageLabel(usage) {
    if (!usage) return 'Modelo usado: sin invocación registrada.';
    const models = usage.actualModels || [];
    return `Solicitado: ${usage.requestedModel} · Usado: ${models.length ? models.join(', ') : 'no informado por Copilot'}`;
}

export function createCopilotModelControls(doc, api, storage = globalThis.localStorage) {
    const select = doc.getElementById('cmbCopilotModel');
    const custom = doc.getElementById('txtCopilotModel');
    const statuses = [...(doc.querySelectorAll?.('[data-copilot-model-usage]') || [])];
    const show = text => statuses.forEach(status => { status.textContent = text; });
    let saved = DEFAULT_MODEL;
    try { saved = storage?.getItem(STORAGE_KEY) || DEFAULT_MODEL; } catch { /* Optional preference. */ }
    if (select) select.value = PRESET_MODELS.has(saved) ? saved : 'custom';
    if (custom) { custom.value = PRESET_MODELS.has(saved) ? '' : saved; custom.hidden = PRESET_MODELS.has(saved); }

    const value = () => select?.value === 'custom' ? custom?.value.trim() || '' : select?.value || DEFAULT_MODEL;
    const persist = () => {
        if (custom) custom.hidden = select?.value !== 'custom';
        try { storage?.setItem(STORAGE_KEY, value()); } catch { /* Optional preference. */ }
    };
    select?.addEventListener('change', persist);
    custom?.addEventListener('input', persist);
    return {
        selected() {
            const model = value();
            if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model)) {
                custom?.focus();
                throw new Error('Indica un ID de modelo válido de Copilot o selecciona Auto.');
            }
            return model;
        },
        busy(busy) { if (select) select.disabled = busy; if (custom) custom.disabled = busy; },
        dispose() { select?.removeEventListener('change', persist); custom?.removeEventListener('input', persist); },
        reset() { show('El modelo usado aparecerá al terminar la generación.'); },
        async refresh() {
            try { show(modelUsageLabel(await api.getAutomationModelUsage())); }
            catch { show('Modelo usado: no informado por Copilot.'); }
        },
    };
}
