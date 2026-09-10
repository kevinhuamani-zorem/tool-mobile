// Recovery owns its preview token; it never changes the recorded Appium events.
import { escapeHtml } from '../shared/domHelpers.js';
export function createFrameworkRecoveryFeature({ api, getSquad, onSaved, openGoldenReview }) {
    const el = id => document.getElementById(id);
    const modal = el('frameworkRecoveryModal');
    const status = el('lblFrameworkRecoveryStatus');
    const save = el('btnSaveFrameworkRecovery');
    const compare = el('btnPreviewFrameworkRecovery');
    const golden = el('btnRecoveryGolden');
    const cases = el('cmbFrameworkRecoveryCase');
    const fields = ['cmbFrameworkRecoveryCase', 'txtFrameworkRecoveryPr', 'txtFrameworkRecoveryNotes', 'txtFrameworkRecoveryPaths', 'txtFrameworkRecoverySymbols'];
    const bound = [];
    let token = '';
    let version = 0;
    let operation = null;
    let saved = false;
    let returnFocus = null;
    const on = (target, event, handler) => { target?.addEventListener(event, handler); bound.push([target, event, handler]); };
    const setStatus = (message, error = false) => {
        status.textContent = message;
        status.setAttribute('role', error ? 'alert' : 'status');
        status.classList.toggle('error', error);
    };
    function renderActions() {
        compare.disabled = Boolean(operation);
        save.disabled = Boolean(operation) || !token;
        golden.disabled = Boolean(operation) || !saved;
        compare.textContent = operation?.kind === 'preview' ? 'Comparando…' : 'Comparar cambios';
        save.textContent = operation?.kind === 'save' ? 'Guardando revisión…' : 'Guardar revisión QA';
        golden.textContent = operation?.kind === 'golden' ? 'Abriendo revisión…' : 'Revisar como golden →';
        fields.forEach(id => { el(id).disabled = Boolean(operation); });
        el('btnCloseFrameworkRecovery').disabled = ['save', 'golden'].includes(operation?.kind);
        modal.setAttribute('aria-busy', operation ? 'true' : 'false');
        el('frameworkRecoveryCompareHelp').textContent = operation?.kind === 'list'
            ? 'Cargando las grabaciones del squad…' : 'Lee los archivos actuales del framework para que puedas revisarlos.';
        el('frameworkRecoverySaveHelp').textContent = operation?.kind === 'save' ? 'Se está guardando la versión que comparaste.'
            : saved ? 'Revisión guardada. Vuelve a comparar si corriges el framework otra vez.'
            : token ? 'Revisa la comparación y guarda el código asociado al caso. Los pendientes se conservan.'
            : 'Se habilita después de comparar los archivos.';
        el('frameworkRecoveryGoldenHelp').textContent = saved
            ? 'Abre los archivos recuperados para dar tu aprobación explícita.'
            : 'Se habilita después de guardar la revisión QA.';
        ['Compare', 'Save', 'Golden'].forEach(step => el(`frameworkRecoveryStep${step}`).setAttribute('aria-current',
            step === (saved ? 'Golden' : token ? 'Save' : 'Compare') ? 'step' : 'false'));
    }
    function invalidate() { token = ''; saved = false; version++; renderActions(); }
    function begin(kind) { operation = { kind, version }; renderActions(); return operation; }
    function finish(request) { if (operation === request) { operation = null; renderActions(); } }
    async function open(recordingId = '') {
        if (['save', 'golden'].includes(operation?.kind)) return;
        if (modal.style.display !== 'flex') returnFocus = document.activeElement;
        invalidate();
        modal.style.display = 'flex';
        setStatus('Cargando las grabaciones del squad…');
        el('frameworkRecoveryFiles').innerHTML = '';
        el('frameworkRecoveryPending').innerHTML = '';
        fields.slice(1).forEach(id => { el(id).value = ''; });
        cases.innerHTML = '<option value="">Caso de la revisión actual</option>';
        cases.value = '';
        const request = begin('list');
        el('btnCloseFrameworkRecovery').focus();
        try {
            const result = await api.getExistingScenarios(getSquad());
            if (request.version !== version) return;
            if (!result.success) throw new Error(result.error || 'No se pudieron cargar las grabaciones.');
            for (const item of result.scenarios) {
                const option = document.createElement('option'); option.value = item.id;
                option.textContent = `${item.caseId || item.id} · ${item.name || item.feature || 'Grabación'}`;
                cases.appendChild(option);
            }
            cases.value = recordingId;
            setStatus(result.scenarios.length
                ? 'Paso 1 de 3 · Elige un caso exportado y compara los archivos actuales del framework.'
                : 'No hay grabaciones guardadas en este squad. Si tienes un caso exportado en la revisión actual, puedes compararlo.');
        } catch (error) {
            if (request.version === version) setStatus(`No se pudieron cargar las grabaciones. ${error.message || 'Cierra y vuelve a abrir para reintentar.'}`, true);
        } finally { finish(request); }
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
        if (operation) return;
        invalidate();
        const request = begin('preview');
        setStatus('Comparando la última exportación con los archivos actuales del framework…');
        el('frameworkRecoveryFiles').innerHTML = '';
        el('frameworkRecoveryPending').innerHTML = '';
        try {
            const result = await api.previewFrameworkRecovery({ recordingId: cases.value || undefined, squad: getSquad(),
                prUrl: el('txtFrameworkRecoveryPr').value.trim() || undefined, notes: el('txtFrameworkRecoveryNotes').value.trim() || undefined, ...associations() });
            if (request.version !== version) return;
            if (!result.success || !result.preview) throw new Error(result.error || 'No se pudo preparar la recuperación.');
            const p = result.preview;
            if (!el('txtFrameworkRecoveryPr').value) el('txtFrameworkRecoveryPr').value = p.context.prUrl || '';
            if (!el('txtFrameworkRecoveryNotes').value) el('txtFrameworkRecoveryNotes').value = p.context.notes || '';
            token = p.token;
            setStatus(`Paso 2 de 3 · Revisa ${p.files.length} archivo(s) y guarda la revisión QA. ${p.pending.length} asociación(es) pendiente(s). `
                + `${p.context.branch || 'Sin rama Git'}${p.context.commit ? ` · ${p.context.commit.slice(0, 8)}` : ''}${p.context.dirty ? ' · Cambios locales sin commit' : ''}`);
            el('frameworkRecoveryPending').innerHTML = p.pending.length ? `<h3>Asociaciones pendientes</h3><ul>${p.pending.map(item =>
                `<li>${escapeHtml(item.message)}${item.path ? ` <code>${escapeHtml(item.path)}</code>` : ''}${item.candidates?.length ? ` · Candidatos: ${escapeHtml(item.candidates.join(', '))}` : ''}</li>`).join('')}</ul>` : '';
            el('frameworkRecoveryFiles').innerHTML = p.files.map(file => `<details open class="framework-recovery-file"><summary>${escapeHtml(file.layer)} · ${escapeHtml(file.path)}${file.previousPath && file.previousPath !== file.path ? ` ← ${escapeHtml(file.previousPath)}` : ''}</summary>
                <p>${file.shared ? 'Módulo compartido: se guardan solo los cambios asociados al caso.' : 'Archivo del caso.'}${file.current === null ? ' Archivo eliminado o movido; asociación pendiente.' : ''}</p>
                ${file.changes.map(change => `<details><summary>${change.scope === 'case' ? 'Cambio del caso' : 'Cambio ajeno, no se guardará'} · ${escapeHtml(change.symbol)}</summary><div class="framework-recovery-diff"><section><strong>Exportado</strong><pre>${escapeHtml(change.before ?? '(no existía)')}</pre></section><section><strong>Actual</strong><pre>${escapeHtml(change.after ?? '(eliminado)')}</pre></section></div></details>`).join('') || '<p>Sin cambios de código.</p>'}
                <details><summary>Baseline previo</summary><pre>${escapeHtml(file.baseline === undefined ? 'No disponible' : file.baseline ?? '(archivo nuevo)')}</pre></details>
                <details><summary>Versión exportada</summary><pre>${escapeHtml(file.exported ?? '(no disponible)')}</pre></details>
                <details><summary>Código del caso que se guardará</summary><pre>${escapeHtml(file.content ?? '(pendiente)')}</pre></details></details>`).join('');
        } catch (error) {
            if (request.version === version) setStatus(`No se pudo comparar el caso. ${error.message || 'Intenta nuevamente.'}`, true);
        } finally { finish(request); }
    }
    async function persist() {
        if (!token || operation) return;
        const request = begin('save');
        const reviewedToken = token;
        setStatus('Guardando la revisión QA de los archivos comparados…');
        try {
            const result = await api.saveFrameworkRecovery(reviewedToken);
            if (request.version !== version) return;
            if (!result.success) throw new Error(result.error || 'No se pudo guardar la revisión QA.');
            token = '';
            saved = true;
            setStatus(`Paso 3 de 3 · Revisión QA guardada: ${result.result.files} archivo(s), ${result.result.pending} pendiente(s). Ahora puedes revisar y aprobar esta versión como golden. La grabación original se conserva.`);
            onSaved?.(result.result);
        } catch (error) {
            if (request.version === version) {
                invalidate();
                setStatus(`No se pudo guardar la revisión QA. ${error.message || 'Vuelve a comparar los archivos antes de guardar.'}`, true);
            }
        } finally { finish(request); }
    }
    async function reviewGolden() {
        if (!saved || operation) return;
        const request = begin('golden');
        try {
            if (typeof openGoldenReview !== 'function') throw new Error('La revisión golden no está disponible. Vuelve a abrir el Recorder.');
            await openGoldenReview({ recordingId: cases.value || undefined, squad: getSquad(), source: 'recovery' });
        } catch (error) {
            if (request.version === version) setStatus(`No se pudo abrir la revisión golden. ${error.message || 'Intenta nuevamente.'}`, true);
        } finally { finish(request); }
    }
    function close() {
        if (['save', 'golden'].includes(operation?.kind)) return;
        operation = null;
        invalidate();
        modal.style.display = 'none';
        returnFocus?.focus();
    }
    function keyboard(event) {
        if (modal.style.display !== 'flex') return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')]
            .filter(node => !node.disabled && node.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    function mount() {
        if (bound.length) return;
        on(golden, 'click', reviewGolden);
        on(el('btnRecoverFramework'), 'click', () => open());
        on(el('btnRecoverFrameworkCurrent'), 'click', () => open());
        on(el('btnOnboardingRecoverFramework'), 'click', () => open(el('cmbOnboardingScenario').value));
        on(el('btnCloseFrameworkRecovery'), 'click', close);
        on(modal, 'keydown', keyboard);
        on(compare, 'click', preview);
        on(save, 'click', persist);
        const edited = () => {
            const hadReview = Boolean(token) || saved;
            invalidate();
            if (hadReview) setStatus('Cambiaste los datos de la revisión. Vuelve a comparar antes de guardar o revisar como golden.');
        };
        fields.forEach(id => { on(el(id), 'input', edited); on(el(id), 'change', edited); });
        renderActions();
    }
    function unmount() {
        bound.forEach(([target, event, handler]) => target?.removeEventListener(event, handler));
        bound.length = 0; operation = null; invalidate();
    }
    return { mount, unmount, open, preview, persist };
}
