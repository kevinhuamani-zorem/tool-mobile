// [visual-recorder] Feature "recording": lista de steps grabados y ejecución
// de la acción actual (build + `api.executeStep`). Ver docs/ARCHITECTURE.md.
//
// Los campos de captura (`txtSelector`, `txtVarName`, `txtElementContext`) y su
// estado de verificación (`state.verifiedSelector`, `state.selectorCandidateToken`,
// `state.currentAssignment`, `state.selectedCatalogLocator`) son contexto
// compartido con `inspector` y `platform-completion`; esta feature solo los
// lee para construir el step, nunca los duplica.

import { disableBtn, enableBtn, updateDeviceScreen as updateDeviceScreenHelper } from '../shared/domHelpers.js';

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {() => void} deps.invalidatePreview dueño: generation.
 * @param {() => void} deps.renderSelectedLocatorCoverage dueño: platform-completion.
 * @param {() => void} deps.clearSelectorCandidateBackups dueño: inspector.
 * @param {() => void} deps.clearSelectorChips dueño: inspector.
 * @param {() => void} deps.updateFinalAction dueño: platform-completion.
 */
export function createRecordingFeature(deps) {
    const {
        api, state, setStatus, invalidatePreview,
        renderSelectedLocatorCoverage, clearSelectorCandidateBackups, clearSelectorChips, updateFinalAction,
    } = deps;

    const imgDevice = document.getElementById('imgDevice');
    const devicePH  = document.getElementById('devicePlaceholder');
    const txtSelector = document.getElementById('txtSelector');
    const txtVarName  = document.getElementById('txtVarName');
    const txtElementContext = document.getElementById('txtElementContext');
    const cmbAction   = document.getElementById('cmbAction');
    const txtValue    = document.getElementById('txtValue');
    const txtDesc     = document.getElementById('txtDesc');
    const btnExecute  = document.getElementById('btnExecute');
    const lstSteps    = document.getElementById('lstSteps');
    const txtGherkin  = document.getElementById('txtGherkin');
    const txtFeature  = document.getElementById('txtFeature');
    const txtScenario = document.getElementById('txtScenario');
    const btnDelete   = document.getElementById('btnDeleteStep');
    const btnClear    = document.getElementById('btnClearSteps');
    const lblVerify   = document.getElementById('lblVerifyResult');

    let selectedStepIndex = -1;

    const bound = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    function setVerify(msg, type) {
        if (!lblVerify) return;
        lblVerify.textContent = msg;
        lblVerify.className = 'verify-result' + (type ? ' ' + type : '');
    }

    function updateDeviceScreen(base64) {
        updateDeviceScreenHelper(imgDevice, devicePH, base64);
    }

    function stepSummary(step) {
        const loc = step.contextHint || step.elementIntent || (step.variableName ? '{' + step.variableName + '}' : (step.selector || ''));
        const map = {
            ABRIR_APP:           '📱 ABRIR APP → ' + step.value,
            CLICK:               '👆 CLICK → ' + loc,
            ESCRIBIR:            '✏️ ESCRIBIR "' + step.value + '" → ' + loc,
            LIMPIAR:             '🧹 LIMPIAR → ' + loc,
            SCROLL_DOWN:         '⬇️ SCROLL DOWN',
            SCROLL_UP:           '⬆️ SCROLL UP',
            SCROLL_HASTA:        '🔍 SCROLL HASTA → ' + loc,
            SWIPE:               '👉 SWIPE ' + step.value,
            PRESION_LARGA:       '👇 PRESION LARGA → ' + loc,
            VERIFICAR_TEXTO:     '✅ VERIFICAR TEXTO "' + step.value + '" → ' + loc,
            VERIFICAR_EXISTE:    '👁️ VERIFICAR EXISTE → ' + loc,
            VERIFICAR_NO_EXISTE: '🚫 VERIFICAR NO EXISTE → ' + loc,
            VOLVER:              '◀️ VOLVER',
            ESPERAR:             '⏳ ESPERAR ' + step.value + 's',
            SCREENSHOT:          '📸 SCREENSHOT',
        };
        return map[step.action] || step.description || step.action;
    }

    function renderSteps(steps) {
        if (!lstSteps) return;
        lstSteps.innerHTML = '';
        if (!steps || steps.length === 0) {
            lstSteps.innerHTML = '<li class="step-empty">Sin steps grabados...</li>';
            updateFinalAction();
            return;
        }
        steps.forEach((s, i) => {
            const li = document.createElement('li');
            li.textContent = (i + 1) + '. ' + stepSummary(s);
            li.dataset.index = i;
            if (i === selectedStepIndex) li.classList.add('selected');
            li.addEventListener('click', () => {
                selectedStepIndex = i;
                document.querySelectorAll('#lstSteps li').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
            });
            lstSteps.appendChild(li);
        });
        updateFinalAction();
    }

    function clearStepFields() {
        clearSelectorChips();
        clearSelectorCandidateBackups();
        if (txtSelector) txtSelector.value = '';
        if (txtVarName)  txtVarName.value  = '';
        if (txtElementContext) txtElementContext.value = '';
        state.selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
        if (txtValue)    txtValue.value    = '';
        if (txtDesc)     txtDesc.value     = '';
        setVerify('— Ingresa un selector');
    }

    function mount() {
        on(cmbAction, 'change', () => {
            const action  = cmbAction.value;
            const noSel   = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];
            txtSelector.disabled = noSel.includes(action);
            txtVarName.disabled  = noSel.includes(action);
            if (txtElementContext) txtElementContext.disabled = noSel.includes(action);
            const ph = {
                ABRIR_APP: 'com.example.app', ESCRIBIR: 'texto...',
                SWIPE: 'left/right/up/down', VERIFICAR_TEXTO: 'texto esperado',
                ESPERAR: 'segundos', SCREENSHOT: 'nombre'
            };
            txtValue.placeholder = ph[action] || '';
        });

        on(btnExecute, 'click', async () => {
            const action   = cmbAction.value;
            const selector = txtSelector.value.trim();
            const varName  = state.currentAssignment?.name || state.selectedCatalogLocator?.name || '';
            const contextHint = txtElementContext?.value.trim() || '';
            const value    = txtValue.value.trim();
            const desc     = txtDesc.value.trim();
            const noSel    = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];

            if (!noSel.includes(action) && !selector) {
                setStatus('⚠ Ingresa un selector', '#FF6600'); return;
            }
            if (!noSel.includes(action) && !contextHint) {
                setStatus('⚠ Agrega una pista sobre la función del elemento', '#FF6600');
                txtElementContext?.focus();
                return;
            }

            const step = {
                action,
                variableName: varName,
                contextHint,
                selector,
                selectorVerified: state.verifiedSelector === selector,
                selectorCandidateToken: state.selectorCandidateToken,
                value,
                description: desc,
                ...(state.selectedCatalogLocator ? {
                    locatorSource: {
                        file: state.selectedCatalogLocator.file,
                        module: state.selectedCatalogLocator.module,
                        scope: state.selectedCatalogLocator.scope
                    }
                } : {})
            };
            invalidatePreview();
            disableBtn(btnExecute, '⏳ Ejecutando...');
            setStatus('⚡ Ejecutando...', '#FF6600');

            try {
                const result = await api.executeStep(step);
                if (result.success) {
                    if (result.screenshot) updateDeviceScreen(result.screenshot);
                    setStatus('✓ Step ' + result.totalSteps + ' guardado', '#00CC00');
                    clearStepFields();
                    const sr = await api.getSteps();
                    renderSteps(sr.steps);
                    const pr = await api.previewGherkin(
                        txtFeature.value.trim() || 'Flujo mobile',
                        txtScenario.value.trim() || 'Escenario'
                    );
                    if (pr.success && txtGherkin) txtGherkin.value = pr.preview;
                } else {
                    setStatus('✗ ' + (result.message || 'No se pudo ejecutar el step'), '#CC0000');
                }
            } catch (error) {
                setStatus('✗ ' + (error?.message || 'No se pudo ejecutar el step'), '#CC0000');
            } finally {
                enableBtn(btnExecute);
            }
        });

        on(btnDelete, 'click', async () => {
            if (selectedStepIndex < 0) { setStatus('⚠ Selecciona un step', '#FF6600'); return; }
            await api.deleteStep(selectedStepIndex);
            invalidatePreview();
            selectedStepIndex = -1;
            const r = await api.getSteps();
            renderSteps(r.steps);
            setStatus('🗑️ Eliminado', '#FF6600');
        });

        on(btnClear, 'click', async () => {
            await api.clearSteps();
            invalidatePreview();
            selectedStepIndex = -1;
            renderSteps([]);
            if (txtGherkin) txtGherkin.value = '';
            setStatus('🧹 Limpiado', '#666888');
        });
    }

    function unmount() {
        bound.forEach(({ target, type, handler, options }) => target?.removeEventListener?.(type, handler, options));
        bound.length = 0;
    }

    return {
        mount,
        unmount,
        renderSteps,
        stepSummary,
        clearStepFields,
        updateDeviceScreen,
    };
}
