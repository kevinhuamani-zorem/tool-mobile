import { escapeHtml } from '../shared/domHelpers.js';

const VERIFICATIONS = new Set(['VERIFICAR_EXISTE', 'VERIFICAR_TEXTO']);

/** QA-owned criteria. Editing them invalidates the preview, never grants execution success. */
export function createAcceptanceControls({ document: doc, state, invalidatePreview }) {
    const list = doc.getElementById('acceptanceChecksList');
    const add = doc.getElementById('btnAddAcceptanceCheck');
    const hint = doc.getElementById('acceptanceChecksHint');
    const listeners = [];
    let actions = [];
    let nextId = 0;
    state.acceptanceChecks ||= [];
    const on = (node, event, listener) => {
        node?.addEventListener(event, listener);
        listeners.push(() => node?.removeEventListener(event, listener));
    };
    function verificationOptions(selected) {
        const entries = actions.map((action, index) => ({ action, sequence: action.sequence || index + 1 }))
            .filter(({ action }) => VERIFICATIONS.has(action.action));
        const options = ['<option value="">Selecciona una comprobación</option>'];
        if (selected && !entries.some(entry => entry.sequence === selected)) {
            options.push(`<option selected value="${escapeHtml(selected)}">Acción ${escapeHtml(selected)} · no disponible en esta grabación</option>`);
        }
        for (const { action, sequence } of entries) {
            const label = action.contextHint || action.elementIntent || action.variableName || (action.action === 'VERIFICAR_TEXTO' ? 'Comprobar texto' : 'Comprobar elemento');
            options.push(`<option value="${escapeHtml(sequence)}"${sequence === selected ? ' selected' : ''}>Acción ${escapeHtml(sequence)} · ${escapeHtml(label)}</option>`);
        }
        return options.join('');
    }
    function render() {
        if (!list) return;
        list.innerHTML = state.acceptanceChecks.map((check, index) => `<article class="acceptance-check" data-check-index="${index}">
            <div class="acceptance-check-heading"><strong>Criterio ${index + 1}</strong><button type="button" class="btn btn-dark" data-remove-check="${index}" aria-label="Quitar criterio ${index + 1}">Quitar</button></div>
            <label class="input-group"><span class="field-label">¿Qué resultado debe cumplirse?</span><input class="field-input" data-check-field="description" value="${escapeHtml(check.description)}" placeholder="Ej.: las fechas corresponden a los últimos 30 días" /></label>
            <div class="acceptance-check-fields"><label class="input-group"><span class="field-label">Cómo se comprueba</span><select class="field-select" data-check-field="kind">
                <option value="manual"${check.kind === 'manual' ? ' selected' : ''}>Resultado de negocio · revisión del QA</option>
                <option value="recorded-assertion"${check.kind === 'recorded-assertion' ? ' selected' : ''}>Comprobación grabada</option>
                <option value="date-range"${check.kind === 'date-range' ? ' selected' : ''}>Fecha de movimientos dentro del rango</option>
            </select></label>${check.kind !== 'manual' ? `<label class="input-group"><span class="field-label">Comprobación de la grabación</span><select class="field-select" data-check-field="sequence">${verificationOptions(check.sequence)}</select></label>` : ''}
            ${check.kind === 'date-range' ? `<label class="input-group acceptance-days"><span class="field-label">Últimos días</span><input type="number" min="1" step="1" class="field-input" data-check-field="days" value="${Number.isInteger(check.days) ? check.days : ''}" placeholder="30" /></label>` : ''}</div>
            <label class="acceptance-critical"><input type="checkbox" data-check-field="critical"${check.critical ? ' checked' : ''} /> Es indispensable para considerar correcto el caso</label>
            <p class="wizard-help">${check.kind === 'manual' ? 'Quedará pendiente de revisión del QA; el agente no puede darlo por cumplido.' : check.kind === 'date-range' ? 'Comprueba la fecha más antigua mediante una aserción reconocida del framework. Mostrar una fecha no basta.' : 'El Recorder comprobará que la verificación grabada esté implementada. El resultado en el dispositivo se verifica por separado.'}</p>
        </article>`).join('');
        if (hint) hint.textContent = state.acceptanceChecks.length
            ? 'Los criterios se guardan con esta grabación al iniciar la generación. Se revisan sobre los archivos generados.'
            : 'Opcional. Añade resultados concretos para distinguir lo implementado de lo que falta comprobar.';
    }
    function change(event) {
        const field = event.target?.dataset?.checkField;
        if (!field) return;
        const index = Number(event.target.closest('[data-check-index]')?.dataset.checkIndex);
        const check = state.acceptanceChecks[index];
        if (!check) return;
        if (field === 'critical') check.critical = Boolean(event.target.checked);
        else if (field === 'sequence' || field === 'days') {
            if (event.target.value === '') delete check[field];
            else check[field] = Number(event.target.value);
        } else check[field] = event.target.value;
        if (field === 'kind') {
            if (check.kind === 'manual') delete check.sequence;
            if (check.kind !== 'date-range') delete check.days;
            render();
            list?.querySelector(`[data-check-index="${index}"] [data-check-field="kind"]`)?.focus();
        }
        invalidatePreview();
    }
    return {
        mount() {
            on(add, 'click', () => {
                const id = `criterion-${Date.now()}-${++nextId}`;
                state.acceptanceChecks.push({ id, description: '', critical: true, kind: 'manual' });
                render(); invalidatePreview();
                list?.querySelector('[data-check-index="' + (state.acceptanceChecks.length - 1) + '"] input')?.focus();
            });
            on(list, 'input', event => {
                if (event.target?.dataset?.checkField === 'description' || event.target?.dataset?.checkField === 'days') change(event);
            });
            on(list, 'change', event => {
                if (!['description', 'days'].includes(event.target?.dataset?.checkField)) change(event);
            });
            on(list, 'click', event => {
                const button = event.target?.closest('[data-remove-check]');
                if (button?.dataset?.removeCheck === undefined) return;
                const index = Number(button.dataset.removeCheck);
                if (!Number.isInteger(index) || !state.acceptanceChecks[index]) return;
                state.acceptanceChecks.splice(index, 1); render(); invalidatePreview();
            });
            render();
        },
        unmount() { listeners.splice(0).forEach(remove => remove()); },
        restore(request, recordedActions = []) {
            state.acceptanceChecks = (request?.acceptanceChecks || []).map(check => ({ ...check }));
            actions = recordedActions;
            render();
        },
        setActions(recordedActions) { actions = recordedActions || []; render(); },
        validate() {
            for (const [index, check] of state.acceptanceChecks.entries()) {
                if (!check.description.trim()) return `Describe el resultado del criterio ${index + 1} o quita ese criterio.`;
                if (check.kind !== 'manual' && !actions.some((action, n) => (action.sequence || n + 1) === check.sequence && VERIFICATIONS.has(action.action))) return `Selecciona una comprobación grabada para el criterio ${index + 1}.`;
                if (check.kind === 'date-range' && (!Number.isInteger(check.days) || check.days < 1)) return `Indica un número entero de días mayor que cero para el criterio ${index + 1}.`;
            }
            return '';
        },
    };
}
