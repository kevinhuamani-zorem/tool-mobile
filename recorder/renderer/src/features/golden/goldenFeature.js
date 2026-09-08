import { escapeHtml } from '../shared/domHelpers.js';
export function createGoldenFeature({ api }) {
    const el = id => document.getElementById(id);
    const bound = [];
    let token = '';
    let version = 0;
    let busy = false;
    let currentInput;
    const on = (target, event, handler) => { target?.addEventListener(event, handler); bound.push([target, event, handler]); };
    function invalidate() { version++; token = ''; el('goldenApproved').checked = false; el('btnApproveGolden').disabled = true; }
    const status = text => { el('goldenStatus').textContent = text; };
    async function open(input) {
        if (busy) return;
        currentInput = input;
        invalidate(); const requested = version;
        el('goldenDatasetPath').textContent = '';
        el('goldenModal').style.display = 'flex'; el('goldenReview').style.display = 'none'; el('goldenList').innerHTML = '';
        status(input ? 'Preparando la versión para revisión…' : 'Leyendo versiones aprobadas…');
        try {
            const result = input ? await api.previewGoldenCase(input) : await api.listGoldenCases();
            if (requested !== version) return;
            if (!result.success) throw new Error(result.error);
            el('goldenDatasetPath').textContent = result.datasetRoot || result.preview?.datasetRoot || '';
            if (input) {
                const p = result.preview; token = p.token;
                el('goldenReview').style.display = 'block';
                status(`${p.caseId || p.recordingId} · ${p.revisionId} · ${p.source}`);
                el('goldenFiles').innerHTML = p.files.map(file => `<details open class="framework-recovery-file"><summary>${escapeHtml(file.layer)} · ${escapeHtml(file.path)}</summary><pre>${escapeHtml(file.content)}</pre></details>`).join('');
                el('goldenDiagnostics').textContent = `Diagnósticos: ${p.diagnostics.valid ? 'válido' : 'con observaciones'} · score ${p.diagnostics.qualityScore}\n` +
                    [...(p.diagnostics.errors || []), ...(p.diagnostics.warnings || []), ...(p.pending || [])].map(item => item.message || String(item)).join('\n') +
                    '\nVerificación funcional automática: no reportada.';
                el('goldenExecution').value = p.executionDeclaration;
                el('goldenNotes').value = p.notes;
                el('goldenUsage').value = p.usage || 'reference';
            } else {
                status(`${result.index.entries.length} golden activo(s) · ${result.index.versions} versión(es) · ${result.index.issues.length} problema(s) de integridad.`);
                el('goldenList').innerHTML = '';
                for (const entry of result.index.entries) {
                    const row = document.createElement('p');
                    row.textContent = `${entry.caseId || entry.recordingId} · ${entry.platform} · ${entry.versionHash.slice(0, 12)} · ${entry.usage === 'evaluation' ? 'reservado para evaluación' : 'referencia'} · QA: ${entry.approval.actor} · ${entry.approval.at} `;
                    const button = document.createElement('button'); button.className = 'btn btn-dark'; button.textContent = 'Retirar del índice';
                    button.onclick = async () => { button.disabled = true; try { const r = await api.revokeGoldenCase({ goldenId: entry.goldenId, versionHash: entry.versionHash }); if (!r.success) throw new Error(r.error); await open(); } catch (e) { status(e.message); button.disabled = false; } };
                    row.appendChild(button); el('goldenList').appendChild(row);
                }
                for (const legacy of result.legacy) {
                    const button = document.createElement('button'); button.className = 'btn btn-dark'; button.textContent = `Revisar legacy: ${legacy.caseId || legacy.legacyId}`;
                    button.onclick = () => open({ legacyId: legacy.legacyId }); el('goldenList').appendChild(button);
                }
                for (const issue of result.index.issues) { const row = document.createElement('p'); row.textContent = issue; el('goldenList').appendChild(row); }
            }
        } catch (error) { if (requested === version) status(error.message); }
    }
    async function approve() {
        if (!token || !el('goldenApproved').checked || busy) return;
        busy = true; el('btnApproveGolden').disabled = true;
        try {
            const result = await api.saveGoldenCase({ token, approved: true, usage: el('goldenUsage').value || 'reference', executed: el('goldenExecution').value, notes: el('goldenNotes').value });
            if (!result.success) throw new Error(result.error);
            invalidate();
            status(`Golden aprobado · ${result.manifest.versionHash.slice(0, 12)}${result.duplicate ? ' · Versión ya publicada' : ''}. Guardado en el repositorio local; incluye tests/golden en un commit y PR para compartirlo. ${result.indexWarning || ''} ${result.historyWarning || ''}`);
        } catch (error) { status(error.message); invalidate(); }
        finally { busy = false; }
    }
    async function selectRepository() {
        if (busy) return;
        busy = true; el('btnSelectGoldenRepository').disabled = true; el('btnApproveGolden').disabled = true;
        let changed = false; const requested = version;
        try {
            const result = await api.selectGoldenRepository();
            if (requested !== version || result.canceled) return;
            if (!result.success) throw new Error(result.error);
            invalidate(); changed = true;
        } catch (error) { status(error.message); }
        finally {
            busy = false; el('btnSelectGoldenRepository').disabled = false;
            el('btnApproveGolden').disabled = !token || !el('goldenApproved').checked;
        }
        if (changed) await open(currentInput);
    }
    function mount() {
        on(el('btnSelectGoldenRepository'), 'click', selectRepository);
        on(el('btnGoldenCases'), 'click', () => open());
        on(el('btnCloseGolden'), 'click', () => { if (!busy) { invalidate(); el('goldenModal').style.display = 'none'; } });
        on(el('goldenApproved'), 'change', () => { el('btnApproveGolden').disabled = !token || !el('goldenApproved').checked || busy; });
        on(el('btnApproveGolden'), 'click', approve);
        on(el('btnRebuildGolden'), 'click', async () => { try { const result = await api.rebuildGoldenIndex(); if (!result.success) throw new Error(result.error); status(`Índice reconstruido: ${result.index.entries.length} activo(s), ${result.index.issues.length} problema(s).`); } catch (error) { status(error.message); } });
    }
    function unmount() { bound.forEach(([target, event, handler]) => target?.removeEventListener(event, handler)); bound.length = 0; invalidate(); }
    return { mount, unmount, open, approve, selectRepository };
}
