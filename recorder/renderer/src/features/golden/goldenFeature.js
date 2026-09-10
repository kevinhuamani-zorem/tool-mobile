import { escapeHtml } from '../shared/domHelpers.js';

const layerNames = { feature: 'Feature', steps: 'Steps', screen: 'Screen Object', locators: 'Locators', dependency: 'Dependencia' };
const sourceNames = { 'framework-recovery': 'Cambios recuperados del framework', 'legacy-review': 'Caso anterior pendiente de aprobación', review: 'Archivos de la revisión actual' };
const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export function createGoldenFeature({ api }) {
    const el = id => document.getElementById(id);
    const bound = [];
    let token = '', version = 0, busy = false, currentInput, returnFocus;
    let entries = [];
    const on = (target, event, handler) => { target?.addEventListener(event, handler); bound.push([target, event, handler]); };
    const show = (id, visible, display = 'block') => { el(id).style.display = visible ? display : 'none'; };
    function invalidate() { version++; token = ''; el('goldenApproved').checked = false; el('btnApproveGolden').disabled = true; }
    const status = (text, kind = '') => {
        el('goldenStatus').textContent = text; el('goldenStatus').className = 'golden-status' + (kind ? ' ' + kind : '');
        if (kind) el('goldenStatus').scrollIntoView({ block: 'nearest' });
    };
    function setBusy(value, operation = 'save') {
        busy = value;
        for (const id of ['btnCloseGolden', 'btnSelectGoldenRepository', 'btnRebuildGolden', 'btnSeedGoldenReferences', 'goldenApproved', 'goldenExecution', 'goldenUsage', 'goldenNotes']) el(id).disabled = value;
        el('btnApproveGolden').disabled = value || !token || !el('goldenApproved').checked;
        el('btnApproveGolden').textContent = value && operation === 'save' ? 'Guardando…' : 'Aprobar y guardar golden';
        el('btnRebuildGolden').textContent = value && operation === 'refresh' ? 'Actualizando referencias…' : '↻ Actualizar referencias';
        el('btnSeedGoldenReferences').textContent = value && operation === 'refresh' ? 'Actualizando referencias…' : 'Actualizar referencias';
        el('goldenModal').setAttribute('aria-busy', String(value));
    }
    function usageHelp() {
        el('goldenUsageHelp').textContent = el('goldenUsage').value === 'evaluation'
            ? 'Se usará para medir resultados. Los agentes no lo recibirán como ejemplo.'
            : 'Los agentes podrán consultarlo al generar otros casos.';
    }
    function renderCases() {
        const query = el('goldenSearch').value.trim().toLocaleLowerCase();
        const usage = el('goldenFilter').value || 'all';
        const filtered = entries.filter(entry => (usage === 'all' || (entry.usage || 'reference') === usage)
            && [entry.caseId, entry.recordingId, entry.squad, entry.platform, entry.approval.actor].some(value => String(value || '').toLocaleLowerCase().includes(query)));
        if (!filtered.length) {
            el('goldenList').innerHTML = `<div class="golden-empty"><h3>${entries.length ? 'No hay coincidencias' : 'Tu primer caso golden empieza en una revisión'}</h3><p>${entries.length ? 'Prueba otro caso, squad o QA, o cambia el filtro.' : 'Abre un caso, revisa sus archivos y elige «Revisar y guardar golden».'}</p></div>`;
            return;
        }
        el('goldenList').innerHTML = filtered.map(entry => `<article class="golden-case">
            <div class="golden-case-top"><div class="golden-case-name"><strong>${escapeHtml(entry.caseId || entry.recordingId)}</strong><span class="golden-platform">${escapeHtml(entry.platform === 'android' ? 'Android' : entry.platform === 'ios' ? 'iOS' : entry.platform)}</span><span class="golden-squad">${escapeHtml(entry.squad)}</span></div>
                <span class="golden-badge ${entry.usage === 'evaluation' ? 'evaluation' : 'reference'}">${entry.usage === 'evaluation' ? 'Reservado para evaluación' : 'Referencia para agentes'}</span></div>
            <p class="golden-case-meta">Aprobado por <strong>${escapeHtml(entry.approval.actor)}</strong><span aria-hidden="true">·</span><time datetime="${escapeHtml(entry.approval.at)}" title="${escapeHtml(entry.approval.at)}">${escapeHtml(dateLabel(entry.approval.at))}</time></p>
            <details class="golden-case-details"><summary>Detalles de la versión</summary><div><span>Versión <code title="${escapeHtml(entry.versionHash)}">${escapeHtml(entry.versionHash.slice(0, 12))}</code></span>
                <button type="button" class="btn golden-withdraw" data-golden-revoke="${escapeHtml(entry.goldenId)}">${entry.usage === 'evaluation' ? 'Retirar de evaluación' : 'Dejar de usar como referencia'}</button></div><small>Al retirarlo, se conserva su historial en el repositorio.</small></details>
        </article>`).join('');
    }
    function renderLibrary(result) {
        entries = result.index.entries;
        el('goldenCount').textContent = String(entries.length);
        const references = entries.filter(entry => entry.usage !== 'evaluation').length;
        const reserved = entries.length - references;
        el('goldenLibrarySummary').textContent = `${references} ${references === 1 ? 'referencia para agentes' : 'referencias para agentes'}${reserved ? ` · ${reserved} para evaluación` : ''} · ${result.index.versions} ${result.index.versions === 1 ? 'versión guardada' : 'versiones guardadas'}`;
        renderCases();
        el('goldenLegacy').innerHTML = (result.legacy || []).length ? '<h4>Casos anteriores por revisar</h4>' + result.legacy.map(legacy => `<button type="button" class="btn btn-dark" data-golden-legacy="${escapeHtml(legacy.legacyId)}">Revisar ${escapeHtml(legacy.caseId || legacy.legacyId)}</button>`).join('') : '';
        el('goldenIssues').innerHTML = result.index.issues.length ? '<details class="golden-details golden-issues"><summary>Hay casos que necesitan revisión</summary><p>No están disponibles como referencia hasta resolver estas observaciones.</p><ul>' + result.index.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('') + '</ul></details>' : '';
    }
    function renderReview(p) {
        token = p.token;
        show('goldenReview', true); show('goldenReviewActions', true, 'flex'); show('goldenLibraryHint', false);
        el('goldenTitle').textContent = p.caseId ? `Guardar ${p.caseId} como golden` : 'Guardar caso golden';
        el('goldenReviewSummary').textContent = sourceNames[p.source] || 'Archivos de esta versión';
        const own = p.files.filter(file => file.layer !== 'dependency'), dependencies = p.files.filter(file => file.layer === 'dependency');
        el('goldenFileCount').textContent = `${own.length} ${own.length === 1 ? 'archivo' : 'archivos'}`;
        const fileMarkup = (file, open = false) => `<details ${open ? 'open' : ''} class="golden-file"><summary><span class="golden-file-layer">${escapeHtml(layerNames[file.layer] || file.layer)}</span><span class="golden-file-name">${escapeHtml(file.path.split('/').pop())}</span></summary><div class="golden-file-path">${escapeHtml(file.path)}</div><pre>${escapeHtml(file.content)}</pre></details>`;
        el('goldenFiles').innerHTML = own.map((file, index) => fileMarkup(file, index === 0)).join('')
            + (dependencies.length ? `<details class="golden-details golden-dependencies"><summary>Dependencias reutilizadas <span class="golden-count">${dependencies.length}</span></summary><p>Archivos compartidos que acompañan al caso como contexto.</p>${dependencies.map(file => fileMarkup(file)).join('')}</details>` : '');
        const observations = [...(p.diagnostics.errors || []), ...(p.diagnostics.warnings || []), ...(p.pending || [])];
        el('goldenDiagnosticsSummary').textContent = `Comprobaciones del Recorder · ${observations.length ? `${observations.length} observaciones` : p.diagnostics.valid ? 'Sin observaciones' : 'Revisar resultado'}`;
        el('goldenDiagnosticsDetails').open = false;
        el('goldenDiagnostics').textContent = `Estructura: ${p.diagnostics.valid ? 'válida' : 'con observaciones'} · Diagnóstico técnico ${p.diagnostics.qualityScore} (no mide ejecución funcional)\n`
            + observations.map(item => item.message || String(item)).join('\n') + '\nVerificación funcional automática: no reportada. El resultado en dispositivo lo declara el QA.';
        el('goldenExecution').value = p.executionDeclaration || 'not-run'; el('goldenNotes').value = p.notes || ''; el('goldenUsage').value = p.usage || 'reference'; usageHelp();
    }
    function prepareOpen(input) {
        if (el('goldenModal').style.display !== 'flex') returnFocus = document.activeElement;
        currentInput = input; invalidate(); const requested = version;
        entries = []; el('goldenDatasetPath').textContent = ''; el('goldenList').innerHTML = ''; el('goldenLegacy').innerHTML = ''; el('goldenIssues').innerHTML = '';
        show('goldenModal', true, 'flex'); show('goldenFooter', true, 'flex'); show('goldenReview', false); show('goldenReviewActions', false); show('goldenSaved', false); show('btnRetryGolden', false);
        show('goldenLibrary', !input); show('goldenLibraryHint', !input);
        el('goldenTitle').textContent = input ? 'Guardar caso golden' : 'Casos golden';
        el('goldenSubtitle').textContent = input ? 'Revisa esta versión antes de incorporarla a la biblioteca del equipo.' : 'Casos revisados por QA que sirven de ejemplo a los agentes.';
        el('goldenRepositoryDetails').open = false; el('goldenCount').textContent = '…';
        el('btnCloseGolden').focus(); status(input ? 'Preparando los archivos para revisión…' : 'Cargando casos aprobados…');
        return requested;
    }
    async function open(input) {
        if (busy) return;
        const requested = prepareOpen(input);
        try {
            const result = input ? await api.previewGoldenCase(input) : await api.listGoldenCases();
            if (requested !== version) return;
            if (!result.success) throw new Error(result.error);
            el('goldenDatasetPath').textContent = result.datasetRoot || result.preview?.datasetRoot || '';
            status('');
            if (input) renderReview(result.preview); else renderLibrary(result);
        } catch (error) {
            if (requested === version) { status(error.message, 'err'); show('btnRetryGolden', true); el('goldenRepositoryDetails').open = true; }
        }
    }
    async function approve() {
        if (!token || !el('goldenApproved').checked || busy) return;
        setBusy(true);
        try {
            const result = await api.saveGoldenCase({ token, approved: true, usage: el('goldenUsage').value || 'reference', executed: el('goldenExecution').value, notes: el('goldenNotes').value });
            if (!result.success) throw new Error(result.error);
            invalidate(); show('goldenReview', false); show('goldenReviewActions', false); show('goldenSaved', true, 'grid');
            el('goldenTitle').textContent = 'Golden guardado';
            el('goldenSubtitle').textContent = 'Tu aprobación quedó guardada en el repositorio local.';
            show('goldenFooter', false);
            status(`Golden aprobado${result.duplicate ? ' · Esta versión ya estaba publicada' : ''}. Incluye tests/golden en un commit y PR para compartirlo.${result.indexWarning ? ' ' + result.indexWarning : ''}${result.historyWarning ? ' ' + result.historyWarning : ''}`, 'ok');
            el('btnViewGoldenLibrary').focus();
        } catch (error) { status(error.message, 'err'); invalidate(); show('btnRetryGolden', true); }
        finally { setBusy(false); }
    }
    async function selectRepository() {
        if (busy) return;
        setBusy(true, 'repository'); let changed = false; const requested = version;
        try {
            const result = await api.selectGoldenRepository();
            if (requested !== version || result.canceled) return;
            if (!result.success) throw new Error(result.error);
            invalidate(); changed = true;
        } catch (error) { status(error.message, 'err'); }
        finally { setBusy(false); }
        if (changed) await open(currentInput);
    }
    async function refresh() {
        if (busy) return;
        const requested = prepareOpen();
        setBusy(true, 'refresh');
        status('Comprobando los golden aprobados y actualizando las referencias locales…');
        try {
            const result = await api.rebuildGoldenIndex();
            if (requested !== version) return;
            if (!result.success) throw new Error(result.error || 'No se pudieron actualizar las referencias.');
            const library = await api.listGoldenCases();
            if (requested !== version) return;
            if (!library.success) throw new Error(library.error || 'No se pudo cargar la biblioteca actualizada.');
            el('goldenDatasetPath').textContent = library.datasetRoot || result.datasetRoot || '';
            const issues = [...new Set([...(result.issues || result.index?.issues || []), ...(library.index.issues || [])])];
            renderLibrary({ ...library, index: { ...library.index, issues } });
            if (issues.length) {
                status('Actualización completada con observaciones. Algunas referencias necesitan revisión; consulta el detalle al final de la lista.', 'warn');
                el('goldenIssues').querySelector('details')?.setAttribute('open', '');
            } else {
                const references = library.index.entries.filter(entry => entry.usage !== 'evaluation').length;
                const reserved = library.index.entries.length - references;
                const counts = `${references} ${references === 1 ? 'caso aprobado para agentes' : 'casos aprobados para agentes'}${reserved ? ` · ${reserved} para evaluación` : ''}`;
                status(`Referencias actualizadas · ${counts}. ${references ? 'Se consultarán en las próximas generaciones según su compatibilidad con el caso.' : 'Todavía no hay ejemplos para agentes; puedes añadirlos desde la revisión de un caso.'}`, 'ok');
            }
        } catch (error) {
            if (requested === version) { status(error.message, 'err'); el('goldenRepositoryDetails').open = true; }
        } finally {
            if (requested === version) { setBusy(false); el('btnRebuildGolden').focus(); }
        }
    }
    async function withdraw(event) {
        const id = event.target.closest('[data-golden-revoke]')?.dataset.goldenRevoke;
        const entry = entries.find(item => item.goldenId === id);
        if (!entry || busy) return;
        setBusy(true); let withdrawn = false;
        try { const result = await api.revokeGoldenCase({ goldenId: entry.goldenId, versionHash: entry.versionHash }); if (!result.success) throw new Error(result.error); withdrawn = true; }
        catch (error) { status(error.message, 'err'); }
        finally { setBusy(false); }
        if (withdrawn) await open();
    }
    function close() { if (!busy) { invalidate(); show('goldenModal', false); returnFocus?.focus(); } }
    function keyboard(event) {
        if (el('goldenModal').style.display !== 'flex') return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key !== 'Tab') return;
        const controls = [...el('goldenModal').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')].filter(node => node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    function mount() {
        on(el('btnSelectGoldenRepository'), 'click', selectRepository);
        on(el('btnGoldenCases'), 'click', () => open()); on(el('btnViewGoldenLibrary'), 'click', () => open());
        on(el('btnRetryGolden'), 'click', () => open(currentInput));
        on(el('btnCloseGolden'), 'click', close); on(el('goldenModal'), 'keydown', keyboard);
        on(el('goldenApproved'), 'change', () => { el('btnApproveGolden').disabled = !token || !el('goldenApproved').checked || busy; });
        on(el('goldenUsage'), 'change', usageHelp); on(el('btnApproveGolden'), 'click', approve);
        on(el('btnRebuildGolden'), 'click', refresh); on(el('btnSeedGoldenReferences'), 'click', refresh); on(el('goldenSearch'), 'input', renderCases); on(el('goldenFilter'), 'change', renderCases);
        on(el('goldenList'), 'click', withdraw);
        on(el('goldenLegacy'), 'click', event => { const id = event.target.closest('[data-golden-legacy]')?.dataset.goldenLegacy; if (id) void open({ legacyId: id }); });
    }
    function unmount() { setBusy(false); bound.forEach(([target, event, handler]) => target?.removeEventListener(event, handler)); bound.length = 0; invalidate(); }
    return { mount, unmount, open, approve, selectRepository };
}
