// Recovery owns its preview token; it never changes the recorded Appium events.
import { escapeHtml } from '../shared/domHelpers.js';
export function createFrameworkRecoveryFeature({ api, getSquad, onSaved }) {
    const el = id => document.getElementById(id);
    const modal = el('frameworkRecoveryModal');
    const status = el('lblFrameworkRecoveryStatus');
    const save = el('btnSaveFrameworkRecovery');
    const cases = el('cmbFrameworkRecoveryCase');
    const bound = [];
    let token = '';
    let version = 0;
    const on = (target, event, handler) => { target?.addEventListener(event, handler); bound.push([target, event, handler]); };
    const invalidate = () => { token = ''; version++; save.disabled = true; };
    async function open(recordingId = '') {
        invalidate();
        modal.style.display = 'flex';
        status.textContent = 'Selecciona el caso y compara los archivos actuales del framework.';
        el('frameworkRecoveryFiles').innerHTML = '';
        el('frameworkRecoveryPending').innerHTML = '';
        for (const id of ['txtFrameworkRecoveryPr', 'txtFrameworkRecoveryNotes', 'txtFrameworkRecoveryPaths', 'txtFrameworkRecoverySymbols']) el(id).value = '';
        const selectedVersion = version;
        const result = await api.getExistingScenarios(getSquad());
        if (version !== selectedVersion) return;
        cases.innerHTML = '<option value="">Caso de la revisión actual</option>';
        if (!result.success) { status.textContent = result.error; return; }
        for (const item of result.scenarios) {
            const option = document.createElement('option'); option.value = item.id;
            option.textContent = `${item.caseId || item.id} · ${item.name || item.feature || 'Grabación'}`;
            cases.appendChild(option);
        }
        cases.value = recordingId;
    }
    function associations() {
        const paths = {};
        for (const line of el('txtFrameworkRecoveryPaths').value.split('\n').filter(line => line.trim())) {
            const parts = line.split(/\s*(?:→|=>)\s*/);
            if (parts.length !== 2 || !parts.every(part => part.trim())) throw new Error('Usa ruta anterior → ruta actual, una asociación por línea.');
            paths[parts[0].trim()] = parts[1].trim();
        }
        const symbols = {};
        for (const line of el('txtFrameworkRecoverySymbols').value.split('\n').filter(line => line.trim())) {
            const [file, values] = line.split('#');
            if (!file?.trim() || !values?.trim()) throw new Error('Usa ruta # símbolo1, símbolo2.');
            symbols[file.trim()] = values.split(',').map(value => value.trim()).filter(Boolean);
        }
        return { paths, symbols };
    }
    async function preview() {
        invalidate();
        const requestedVersion = version;
        status.textContent = 'Comparando exportación, baseline y archivos actuales…';
        try {
            const result = await api.previewFrameworkRecovery({ recordingId: cases.value || undefined, squad: getSquad(),
                prUrl: el('txtFrameworkRecoveryPr').value.trim() || undefined, notes: el('txtFrameworkRecoveryNotes').value.trim() || undefined, ...associations() });
            if (requestedVersion !== version) return;
            if (!result.success || !result.preview) throw new Error(result.error || 'No se pudo preparar la recuperación.');
            const p = result.preview;
            if (!el('txtFrameworkRecoveryPr').value) el('txtFrameworkRecoveryPr').value = p.context.prUrl || '';
            if (!el('txtFrameworkRecoveryNotes').value) el('txtFrameworkRecoveryNotes').value = p.context.notes || '';
            token = p.token;
            save.disabled = false;
            status.textContent = `${p.files.length} archivo(s) vinculados · ${p.pending.length} asociación(es) pendiente(s). `
                + `${p.context.branch || 'Sin rama Git'}${p.context.commit ? ` · ${p.context.commit.slice(0, 8)}` : ''}${p.context.dirty ? ' · Cambios locales sin commit' : ''}`;
            el('frameworkRecoveryPending').innerHTML = p.pending.length ? `<h3>Asociaciones pendientes</h3><ul>${p.pending.map(item =>
                `<li>${escapeHtml(item.message)}${item.path ? ` <code>${escapeHtml(item.path)}</code>` : ''}${item.candidates?.length ? ` · Candidatos: ${escapeHtml(item.candidates.join(', '))}` : ''}</li>`).join('')}</ul>` : '';
            el('frameworkRecoveryFiles').innerHTML = p.files.map(file => `<details open class="framework-recovery-file"><summary>${escapeHtml(file.layer)} · ${escapeHtml(file.path)}${file.previousPath && file.previousPath !== file.path ? ` ← ${escapeHtml(file.previousPath)}` : ''}</summary>
                <p>${file.shared ? 'Módulo compartido: se guardan solo los cambios asociados al caso.' : 'Archivo del caso.'}${file.current === null ? ' Archivo eliminado o movido; asociación pendiente.' : ''}</p>
                ${file.changes.map(change => `<details><summary>${change.scope === 'case' ? 'Cambio del caso' : 'Cambio ajeno, no se guardará'} · ${escapeHtml(change.symbol)}</summary><div class="framework-recovery-diff"><section><strong>Exportado</strong><pre>${escapeHtml(change.before ?? '(no existía)')}</pre></section><section><strong>Actual</strong><pre>${escapeHtml(change.after ?? '(eliminado)')}</pre></section></div></details>`).join('') || '<p>Sin cambios de código.</p>'}
                <details><summary>Baseline previo</summary><pre>${escapeHtml(file.baseline === undefined ? 'No disponible' : file.baseline ?? '(archivo nuevo)')}</pre></details>
                <details><summary>Versión exportada</summary><pre>${escapeHtml(file.exported ?? '(no disponible)')}</pre></details>
                <details><summary>Código del caso que se guardará</summary><pre>${escapeHtml(file.content ?? '(pendiente)')}</pre></details></details>`).join('');
        } catch (error) { if (requestedVersion === version) status.textContent = error.message; }
    }
    async function persist() {
        if (!token) return;
        save.disabled = true;
        try {
            const result = await api.saveFrameworkRecovery(token);
            if (!result.success) throw new Error(result.error);
            invalidate();
            status.textContent = `Revisión QA guardada · ${result.result.files} archivo(s) · ${result.result.pending} pendiente(s). La grabación original se conserva. Aprobación golden pendiente.`;
            onSaved?.(result.result);
        } catch (error) { invalidate(); status.textContent = error.message; }
    }
    function mount() {
        on(el('btnRecoverFramework'), 'click', () => open());
        on(el('btnRecoverFrameworkCurrent'), 'click', () => open());
        on(el('btnOnboardingRecoverFramework'), 'click', () => open(el('cmbOnboardingScenario').value));
        on(el('btnCloseFrameworkRecovery'), 'click', () => { invalidate(); modal.style.display = 'none'; });
        on(el('btnPreviewFrameworkRecovery'), 'click', preview);
        on(save, 'click', persist);
        for (const id of ['cmbFrameworkRecoveryCase', 'txtFrameworkRecoveryPr', 'txtFrameworkRecoveryNotes', 'txtFrameworkRecoveryPaths', 'txtFrameworkRecoverySymbols']) {
            on(el(id), 'input', invalidate); on(el(id), 'change', invalidate);
        }
    }
    function unmount() { bound.forEach(([target, event, handler]) => target?.removeEventListener(event, handler)); bound.length = 0; invalidate(); }
    return { mount, unmount, open, preview, persist };
}
