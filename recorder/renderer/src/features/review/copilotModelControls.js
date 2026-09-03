const STORAGE_KEY = 'appiumRecorder.copilotModel.v1';

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
    let saved = 'auto';
    try { saved = storage?.getItem(STORAGE_KEY) || 'auto'; } catch { /* Optional preference. */ }
    if (select) select.value = saved === 'auto' ? 'auto' : 'custom';
    if (custom) { custom.value = saved === 'auto' ? '' : saved; custom.hidden = saved === 'auto'; }

    const value = () => select?.value === 'custom' ? custom?.value.trim() || '' : 'auto';
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
