import { escapeHtml } from './domHelpers.js';

const states = {
    preserved: { label: 'Cobertura anterior conservada', icon: '✓', description: 'Las operaciones y comprobaciones previas mantienen sus argumentos y orden.' },
    lost: { label: 'Hay cobertura por recuperar', icon: '!', description: 'La propuesta cambia o deja fuera una operación, comprobación, dato o parte de la secuencia anterior.' },
    unverified: { label: 'Equivalencia pendiente de revisión', icon: '?', description: 'La evidencia disponible no alcanza para demostrar que esta versión conserva el comportamiento anterior.' },
};
const coverageCodes = new Set(['case-coverage-review', 'case-coverage-unverified']);
const integers = values => [...new Set((Array.isArray(values) ? values : []).filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
const text = value => escapeHtml(typeof value === 'string' ? value : '');
const array = value => Array.isArray(value) ? value : [];
const stepNumbers = values => integers(values).map(value => `<span class="coverage-step-number">Paso ${value}</span>`).join(' ') || '<span class="coverage-unmapped">Sin correspondencia demostrada</span>';
const exampleLabel = value => Number.isInteger(value) && value > 0 ? `Fila ${value} de Examples` : 'Comparación del escenario';

function comparisonRows(coverage) {
    const seen = new Set();
    return array(coverage.mappings).filter(mapping => {
        if (!mapping || typeof mapping !== 'object') return false;
        const key = JSON.stringify([integers(mapping.beforeStepIndices), integers(mapping.afterStepIndices), mapping.exampleIndex]);
        if (seen.has(key)) return false;
        seen.add(key); return true;
    }).map(mapping => `<div class="coverage-match"><span class="coverage-example">${exampleLabel(mapping.exampleIndex)}</span>
        <div><span class="coverage-column-label">Pasos anteriores</span>${stepNumbers(mapping.beforeStepIndices)}</div>
        <span class="coverage-match-arrow" aria-hidden="true">→</span>
        <div><span class="coverage-column-label">Pasos generados</span>${stepNumbers(mapping.afterStepIndices)}</div></div>`).join('');
}

function differencesMarkup(coverage) {
    const differences = array(coverage.differences).filter(item => item && typeof item === 'object');
    if (!differences.length) return '';
    return `<div class="coverage-differences"><h4>Qué necesita revisión</h4>${differences.map(item => `<article class="coverage-difference">
        <p>${text(item.message) || 'Revisa las operaciones y las comprobaciones de ambas versiones.'}</p>
        <div class="coverage-difference-steps"><div><span class="coverage-column-label">Pasos anteriores</span>${stepNumbers(item.beforeStepIndices)}</div><div><span class="coverage-column-label">Pasos generados</span>${stepNumbers(item.afterStepIndices)}</div></div>
        <small>${exampleLabel(item.exampleIndex)}</small></article>`).join('')}</div>`;
}

function normalizeDiagnostics(diagnostics) {
    const groups = new Map();
    for (const item of array(diagnostics)) {
        const entry = typeof item === 'string' ? { message: item } : item;
        if (!entry || typeof entry !== 'object') continue;
        const normalized = { code: typeof entry.code === 'string' ? entry.code : '', message: typeof entry.message === 'string' ? entry.message : '',
            file: typeof entry.file === 'string' ? entry.file : '', source: entry.source === 'recording' ? 'recording' : 'generation',
            status: entry.status === 'resolved' ? 'resolved' : 'pending', sequences: integers(entry.sequences), passes: integers(entry.passes) };
        const key = JSON.stringify([normalized.code, normalized.message, normalized.file, normalized.source, normalized.status]);
        const previous = groups.get(key);
        groups.set(key, previous ? { ...normalized, sequences: integers([...previous.sequences, ...normalized.sequences]), passes: integers([...previous.passes, ...normalized.passes]) } : normalized);
    }
    return [...groups.values()];
}

function diagnosticItem(item, hasCoverage) {
    const location = item.file ? `<span class="coverage-diagnostic-file">${text(item.file)}</span>` : '';
    const sequences = item.sequences.length ? `<span>Acciones de la grabación: ${item.sequences.join(', ')}</span>` : '';
    const passes = item.passes.length ? `<span>Detectado en pasada${item.passes.length === 1 ? '' : 's'} ${item.passes.join(', ')}</span>` : '';
    const message = hasCoverage && coverageCodes.has(item.code) && item.status === 'pending'
        ? 'La comparación de cobertura requiere la revisión indicada arriba.' : item.message || 'Revisa el diagnóstico de esta versión.';
    return `<li><p>${text(message)}</p><div class="coverage-diagnostic-meta">${location}${sequences}${passes}</div></li>`;
}

function diagnosticsMarkup(diagnostics, hasCoverage) {
    const pending = diagnostics.filter(item => item.source === 'generation' && item.status === 'pending');
    const recording = diagnostics.filter(item => item.source === 'recording' && item.status === 'pending');
    const resolved = diagnostics.filter(item => item.source === 'generation' && item.status === 'resolved');
    return `${pending.length ? `<details class="coverage-diagnostic-group" open><summary>Pendientes en los archivos <span>${pending.length}</span></summary><ul>${pending.map(item => diagnosticItem(item, hasCoverage)).join('')}</ul></details>` : ''}
        ${recording.length ? `<section class="coverage-recording-guidance"><div class="coverage-recording-heading"><strong>Grabación: revisión del QA</strong><span>${recording.length} pendiente(s)</span></div>
            <p>Revisa estas acciones en el dispositivo. Corrige la comprobación o vuelve a grabar el tramo que necesita evidencia.</p>
            <ul>${recording.map(item => diagnosticItem(item, false)).join('')}</ul>
            <p class="coverage-recording-note">Los cambios en el código no verifican el selector ni el resultado en el dispositivo. Puedes exportar el borrador y completar esta revisión después.</p></section>` : ''}
        ${resolved.length ? `<details class="coverage-diagnostic-group coverage-resolved"><summary>Ya no aparecen en la validación actual <span>${resolved.length}</span></summary><p class="coverage-details-help">El historial conserva estos diagnósticos anteriores. La validación actual ya no los presenta; esto no indica quién los corrigió ni acredita ejecución en dispositivo.</p><ul>${resolved.map(item => diagnosticItem(item, false)).join('')}</ul></details>` : ''}`;
}

/** Presentation only: no IPC, agent calls, approval or export decisions. */
export function caseCoverageMarkup({ coverage = null, diagnostics = [], stale = false } = {}) {
    const groups = normalizeDiagnostics(diagnostics);
    if (!coverage && !groups.length) return '';
    const title = coverage?.caseId ? `Revisión de ${text(coverage.caseId)}` : 'Revisión del caso';
    const state = Object.prototype.hasOwnProperty.call(states, coverage?.status) ? coverage.status : 'unverified';
    const selected = states[state];
    const rows = coverage && !stale ? comparisonRows(coverage) : '';
    const examples = Number.isInteger(coverage?.checkedExamples) && coverage.checkedExamples >= 0 ? coverage.checkedExamples : null;
    return `<div class="coverage-panel-heading"><div><span class="coverage-eyebrow">COMPARACIÓN Y DIAGNÓSTICOS</span><h3 id="caseCoverageTitle">${title}</h3></div>${coverage?.platform ? `<span class="coverage-platform">${text(coverage.platform).toUpperCase()}</span>` : ''}</div>
        ${stale ? `<div class="coverage-state coverage-state-stale" role="status"><span class="coverage-state-icon" aria-hidden="true">↻</span><div><strong>Comparación pendiente de revalidación</strong><p>Has editado los archivos. Pulsa Revalidar para comprobar esta versión; el resultado anterior ya no describe estos cambios.</p></div></div>`
        : coverage ? `<div class="coverage-state coverage-state-${state}" role="status"><span class="coverage-state-icon" aria-hidden="true">${selected.icon}</span><div><strong>${selected.label}</strong><p>${selected.description}</p></div></div>` : ''}
        ${coverage && !stale ? `<p class="coverage-scope">Compara el comportamiento con la versión anterior. Conservarlo no demuestra que el caso pase en el dispositivo.${examples !== null ? ` Se examinaron ${examples} fila(s) de Examples.` : ''}</p>
        ${differencesMarkup(coverage)}${rows ? `<details class="coverage-mappings"><summary>Ver correspondencias entre pasos</summary><p class="coverage-details-help">Los números indican el orden de los pasos del escenario en cada versión. Varias acciones pueden pertenecer al mismo paso.</p><div class="coverage-matches">${rows}</div></details>` : ''}` : ''}
        ${stale ? '<p class="coverage-scope">Los diagnósticos del código se actualizarán al revalidar. La revisión del QA en dispositivo permanece pendiente.</p>' + diagnosticsMarkup(groups.filter(item => item.source === 'recording' && item.status === 'pending'), false) : diagnosticsMarkup(groups, Boolean(coverage))}
        <p class="coverage-export-note">Puedes exportar los archivos disponibles para corregirlos en el framework.</p>`;
}

/** The owning feature invalidates this presentation when its editor changes. */
export function createCaseCoverageControls({ document: doc }) {
    const panel = doc?.getElementById('caseCoveragePanel');
    let current;
    function render(input = {}) {
        if (!panel) return;
        current = input;
        panel.innerHTML = caseCoverageMarkup(input);
        panel.style.display = panel.innerHTML ? '' : 'none';
    }
    return {
        render,
        markStale() { if (current) render({ ...current, stale: true }); },
        clear() { current = undefined; if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; } },
    };
}
