import { escapeHtml } from '../shared/domHelpers.js';

/** Assessment belongs to exact validated bytes, never to unvalidated editor changes. */
export function renderAcceptanceAssessment(panel, assessment, edited = false) {
    if (!panel) return;
    panel.style.display = '';
    if (edited) {
        panel.innerHTML = '<strong>Criterios pendientes de revalidación</strong><p>Hay archivos editados. Pulsa Revalidar para comprobar esta versión.</p><p>Ejecución funcional: pendiente de verificar en el framework.</p>';
        return;
    }
    const acceptance = assessment?.acceptance;
    if (!acceptance || !acceptance.total) {
        panel.innerHTML = '<strong>Criterios de aceptación: sin evaluar</strong><p>No hay criterios detallados evaluados para esta versión. Puedes añadirlos en Análisis.</p><p>Ejecución funcional: pendiente de verificar en el framework.</p>';
        return;
    }
    const counts = `${acceptance.passed} implementado(s) · ${acceptance.failed} con fallos · ${acceptance.notEvaluated} sin evaluar`;
    const rate = Number.isFinite(acceptance.rate) ? ` · ${Math.round(acceptance.rate * 100)}% de criterios implementados` : '';
    const statuses = { passed: 'Implementado', failed: 'Requiere corrección', 'not-evaluated': 'Sin evaluar' };
    panel.innerHTML = `<div class="assessment-heading"><strong>Implementación de los criterios</strong><span>${escapeHtml(counts + rate)}</span></div>
        ${acceptance.criticalFailures ? `<p class="assessment-critical">${escapeHtml(acceptance.criticalFailures)} criterio(s) indispensable(s) requieren corrección.</p>` : ''}
        <ul class="assessment-criteria">${(acceptance.criteria || []).map(criterion => `<li class="assessment-${statuses[criterion.status] ? criterion.status : 'not-evaluated'}"><div><strong>${escapeHtml(criterion.description)}</strong>${criterion.critical ? ' <span class="assessment-critical-label">Indispensable</span>' : ''}</div><span>${statuses[criterion.status] || 'Sin evaluar'}</span><p>${escapeHtml(criterion.message || '')}</p></li>`).join('')}</ul>
        <p class="assessment-execution"><strong>Ejecución funcional: pendiente</strong> · La comprobación del código no demuestra que el caso pase en el dispositivo. Registra el resultado verificado por el QA al revisar el golden.</p>`;
}
