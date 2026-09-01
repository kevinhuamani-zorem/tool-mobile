// [visual-recorder] Feature "platform-completion": cobertura de una grabación
// existente, cola de asignación de locators y el onboarding de sesión (caso
// nuevo / completar grabación / reprocesar-refinar). Ver docs/ARCHITECTURE.md
// y el flujo "Completar plataforma de un caso existente".
//
// Consume `state`, el contexto compartido dueño de la sesión (poseído por el
// composition root en recorderController.js). No duplica ese estado: lee y
// escribe directamente sobre las mismas propiedades que usan las demás
// features (inspector, recording, configuration).

import { disableBtn, enableBtn } from '../shared/domHelpers.js';

const COVERAGE_PROGRESS_STORAGE_KEY = 'appiumVisualRecorder.coverageProgress.v1';

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state estado compartido dueño del composition root.
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {() => string} deps.getSquad squad activo (dueño: configuration).
 * @param {() => void} deps.setVerify actualiza el label de verificación (dueño: inspector).
 * @param {() => void} deps.updateAssignmentButton (dueño de esta feature, expuesto igual).
 * @param {() => Promise<void>} deps.openAppiumInspector abre el inspector embebido (dueño: inspector).
 * @param {() => void} deps.clearSelectorCapture limpia txtSelector/chips/candidatos (dueño: inspector).
 * @param {() => void} deps.invalidatePreview invalida el preview de generación (dueño: generation).
 * @param {() => Promise<void>} deps.sessionReady promesa resuelta cuando la sesión conectó.
 */
export function createPlatformCompletionFeature(deps) {
    const {
        api, state, setStatus, getSquad,
        setVerify, openAppiumInspector, clearSelectorCapture, invalidatePreview,
    } = deps;

    const scenarioCoveragePanel = document.getElementById('scenarioCoveragePanel');
    const cmbExistingScenario = document.getElementById('cmbExistingScenario');
    const btnAnalyzeScenario = document.getElementById('btnAnalyzeScenario');
    const scenarioCoverageSummary = document.getElementById('scenarioCoverageSummary');
    const scenarioLocatorQueue = document.getElementById('scenarioLocatorQueue');
    const sessionOnboarding = document.getElementById('sessionOnboarding');
    const onboardingPlatform = document.getElementById('onboardingPlatform');
    const btnOnboardingNew = document.getElementById('btnOnboardingNew');
    const btnOnboardingExisting = document.getElementById('btnOnboardingExisting');
    const btnOnboardingRegenerate = document.getElementById('btnOnboardingRegenerate');
    const onboardingExistingFlow = document.getElementById('onboardingExistingFlow');
    const onboardingRegenerateFlow = document.getElementById('onboardingRegenerateFlow');
    const cmbOnboardingScenario = document.getElementById('cmbOnboardingScenario');
    const cmbOnboardingRegeneration = document.getElementById('cmbOnboardingRegeneration');
    const txtRegenerationRefinement = document.getElementById('txtRegenerationRefinement');
    const chkRegenerationClean = document.getElementById('chkRegenerationClean');
    const onboardingScenarioHint = document.getElementById('onboardingScenarioHint');
    const onboardingRegenerationHint = document.getElementById('onboardingRegenerationHint');
    const btnOnboardingBack = document.getElementById('btnOnboardingBack');
    const btnOnboardingAnalyze = document.getElementById('btnOnboardingAnalyze');
    const rdbCompleteSteps = document.getElementById('rdbCompleteSteps');
    const rdbCompleteLocators = document.getElementById('rdbCompleteLocators');
    const onboardingStepsHint = document.getElementById('onboardingStepsHint');
    const onboardingLocatorsHint = document.getElementById('onboardingLocatorsHint');
    const btnOnboardingRegenerateBack = document.getElementById('btnOnboardingRegenerateBack');
    const btnOnboardingRegeneratePrepare = document.getElementById('btnOnboardingRegeneratePrepare');
    const assignmentTarget = document.getElementById('assignmentTarget');
    const assignmentTargetName = document.getElementById('assignmentTargetName');
    const assignmentTargetPath = document.getElementById('assignmentTargetPath');
    const btnOpenAssignmentInspector = document.getElementById('btnOpenAssignmentInspector');
    const btnCancelAssignment = document.getElementById('btnCancelAssignment');
    const xmlAssignmentTarget = document.getElementById('xmlAssignmentTarget');
    const locatorCombobox = document.getElementById('locatorCombobox');
    const locatorCatalogDropdown = document.getElementById('locatorCatalogDropdown');
    const lblLocatorCatalog = document.getElementById('lblLocatorCatalog');
    const locatorCoverage = document.getElementById('locatorCoverage');
    const lblLogicalLocator = document.getElementById('lblLogicalLocator');
    const lblActivePlatform = document.getElementById('lblActivePlatform');
    const lblAndroidCoverage = document.getElementById('lblAndroidCoverage');
    const lblIosCoverage = document.getElementById('lblIosCoverage');
    const btnAssignLocator = document.getElementById('btnAssignLocator');
    const txtSelector = document.getElementById('txtSelector');
    const txtVarName = document.getElementById('txtVarName');
    const screenRecorder = document.getElementById('screenRecorder');
    const lstSteps = document.getElementById('lstSteps');
    const btnOpenFinalReview = document.getElementById('btnOpenFinalReview');

    const collapsedLocatorGroups = new Set([
        'Botones', 'Campos', 'Textos', 'Imágenes e íconos', 'Listas y contenedores', 'Otros'
    ]);
    let locatorActiveIndex = -1;

    scenarioLocatorQueue.tabIndex = 0;

    const bound = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    async function loadExistingScenarios() {
        const squad = getSquad();
        const result = await api.getExistingScenarios(squad);
        // La consulta puede terminar después de que el usuario ya eligió y analizó
        // un escenario durante la conexión. Lee la selección al recibir la respuesta,
        // no antes de esperar el IPC, para que una respuesta tardía no la borre.
        const selectedScenarioId =
            state.activeScenarioCoverage?.scenario?.id ||
            cmbExistingScenario.value ||
            cmbOnboardingScenario.value ||
            '';
        const selectedRegenerationId = cmbOnboardingRegeneration.value || '';
        // Ignora respuestas pertenecientes a un squad que dejó de estar activo.
        if (squad !== getSquad()) return;
        cmbExistingScenario.innerHTML = '<option value="">Selecciona una grabación...</option>';
        cmbOnboardingScenario.innerHTML = '<option value="">Selecciona una grabación...</option>';
        cmbOnboardingRegeneration.innerHTML = '<option value="">Selecciona una grabación...</option>';
        if (!result.success) {
            scenarioCoverageSummary.textContent = '✗ ' + result.error;
            return;
        }
        state.recordingScenarioCatalog = result.scenarios;
        result.scenarios.forEach(scenario => {
            const option = document.createElement('option');
            const recordedAt = scenario.recordedAt
                ? new Date(scenario.recordedAt).toLocaleString('es-PE')
                : 'fecha desconocida';
            option.value = scenario.id;
            option.textContent =
                `${scenario.caseId ? scenario.caseId + ' · ' : ''}` +
                `${scenario.name.replace(/^(\[[^\]]+\])+/, '').trim()} · ` +
                `${String(scenario.platform || '').toUpperCase()} · ${recordedAt}`;
            option.title = `${scenario.recordingId || scenario.id} · ${scenario.actionCount || 0} acciones`;
            cmbExistingScenario.appendChild(option);
            cmbOnboardingScenario.appendChild(option.cloneNode(true));
            const regenerationOption = option.cloneNode(true);
            regenerationOption.textContent += scenario.canRegenerate
                ? (scenario.regenerationIteration
                    ? ` · refinamiento v${scenario.regenerationIteration}`
                    : ' · generado')
                : ' · pendiente de agente';
            cmbOnboardingRegeneration.appendChild(regenerationOption);
        });
        const scenarioStillExists = result.scenarios.some(
            scenario => scenario.id === selectedScenarioId
        );
        if (scenarioStillExists) {
            cmbExistingScenario.value = selectedScenarioId;
            cmbOnboardingScenario.value = selectedScenarioId;
        } else if (state.activeScenarioCoverage) {
            state.activeScenarioCoverage = null;
            state.currentAssignment = null;
            scenarioLocatorQueue.innerHTML = '';
            renderAssignmentTarget();
        }
        if (result.scenarios.some(scenario => scenario.id === selectedRegenerationId)) {
            cmbOnboardingRegeneration.value = selectedRegenerationId;
        }
        scenarioCoverageSummary.textContent =
            state.activeScenarioCoverage && scenarioStillExists
                ? scenarioCoverageSummary.textContent
                : `${result.scenarios.length} grabación(es) encontradas en ${squad}`;
        onboardingScenarioHint.textContent =
            `${result.scenarios.length} grabación(es) del ambiente activo en ${squad}`;
        updateCompleteModeControls();
        updateRegenerationControls();
    }

    /**
     * [visual-recorder] Habilita/deshabilita las dos casuisticas de "Completar
     * una grabacion" segun lo que la grabacion elegida permite realmente:
     *
     *  - Seguir grabando pasos: siempre se puede, pero solo tiene sentido en la
     *    plataforma con la que se grabo (los pasos nuevos se suman a esas).
     *  - Completar locators: necesita un plan de generacion. Una grabacion sin
     *    Then nunca llega a tenerlo, y ahi la unica salida es grabar el Then.
     */
    function updateCompleteModeControls() {
        if (!rdbCompleteSteps || !rdbCompleteLocators) return;
        const selected = state.recordingScenarioCatalog.find(
            scenario => scenario.id === cmbOnboardingScenario.value
        );
        const samePlatform = !selected || selected.platform === state.sessionPlatform;

        rdbCompleteSteps.disabled = Boolean(selected && !samePlatform);
        rdbCompleteLocators.disabled = Boolean(selected && !selected.hasPlan);
        if (rdbCompleteSteps.disabled && !rdbCompleteLocators.disabled) rdbCompleteLocators.checked = true;
        if (rdbCompleteLocators.disabled && !rdbCompleteSteps.disabled) rdbCompleteSteps.checked = true;

        onboardingStepsHint.textContent = !selected
            ? 'Recupera las acciones ya grabadas y continúa sobre la misma grabación.'
            : samePlatform
                ? `Continúa sobre las ${selected.actionCount} acción(es) ya grabadas` +
                  (selected.hasAssertion ? '.' : '; esta grabación aún no tiene Then.')
                : `Solo desde un dispositivo ${String(selected.platform).toUpperCase()}: así se grabó el caso.`;

        onboardingLocatorsHint.textContent = !selected
            ? 'Asigna solo los locators de esta plataforma; no vuelve a generar el caso.'
            : selected.hasPlan
                ? `Asigna los locators ${state.sessionPlatform.toUpperCase()} pendientes; no vuelve a generar el caso.`
                : selected.hasAssertion
                    ? 'Todavía no hay plan de generación: prepara el paquete del agente antes.'
                    : 'Sin Then no hay plan de generación (ISTQB): graba primero la verificación.';

        btnOnboardingAnalyze.textContent = rdbCompleteLocators.checked
            ? 'Analizar y completar →'
            : 'Continuar la grabación →';
    }

    function updateRegenerationControls() {
        const selected = state.recordingScenarioCatalog.find(
            scenario => scenario.id === cmbOnboardingRegeneration.value
        );
        const clean = Boolean(chkRegenerationClean?.checked);
        const refining = Boolean(selected?.canRegenerate && !clean);
        txtRegenerationRefinement.disabled = !refining;
        btnOnboardingRegeneratePrepare.textContent = refining
            ? 'Preparar refinamiento →'
            : 'Recrear paquete para el agente →';
        if (!selected) {
            onboardingRegenerationHint.textContent = state.recordingScenarioCatalog.length
                ? `${state.recordingScenarioCatalog.length} grabación(es) disponibles para reprocesar o refinar.`
                : 'No hay grabaciones disponibles en el ambiente y squad activos.';
        } else if (refining) {
            onboardingRegenerationHint.textContent =
                'Automatización validada al 100%: puedes indicar una mejora y conservar su historial.';
        } else {
            onboardingRegenerationHint.textContent = clean
                ? 'Se eliminará solo el paquete anterior; acciones, XML y capturas se conservarán.'
                : 'Se reconstruirá el paquete Cowork desde las acciones ya grabadas.';
        }
    }

    async function analyzeSelectedScenario() {
        const scenarioId = cmbExistingScenario.value;
        if (!scenarioId) {
            scenarioCoverageSummary.textContent = '⚠ Selecciona una grabación';
            return false;
        }
        if (
            state.activeScenarioCoverage &&
            state.activeScenarioCoverage.scenario.id !== scenarioId
        ) {
            state.currentAssignment = null;
            state.verifiedSelector = '';
            txtSelector.value = '';
            txtVarName.value = '';
        }
        disableBtn(btnAnalyzeScenario, '⏳ Analizando...');
        const result = await api.getScenarioCoverage(scenarioId, getSquad());
        enableBtn(btnAnalyzeScenario);
        if (!result.success) {
            scenarioCoverageSummary.textContent = '✗ ' + result.error;
            return false;
        }
        state.activeScenarioCoverage = result.coverage;
        if (state.advanceAssignmentAfterSave) {
            state.advanceAssignmentAfterSave = false;
            selectNextPendingAssignment();
        } else {
            restoreCoverageAssignment();
        }
        renderScenarioCoverage();
        renderAssignmentTarget();
        return true;
    }

    function selectNextPendingAssignment() {
        if (!state.activeScenarioCoverage) return;
        const activeKey = state.sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
        const orderedLocators = state.activeScenarioCoverage.steps
            .flatMap(step => step.locators || [])
            .filter((locator, index, items) =>
                items.findIndex(item =>
                    item.file === locator.file && item.name === locator.name
                ) === index
            );
        const next = orderedLocators.find(locator => !locator[activeKey]);
        if (!next) {
            state.currentAssignment = null;
            persistCoverageProgress();
            return;
        }
        state.currentAssignment = {
            ...next,
            selector: next[activeKey],
            platform: state.sessionPlatform,
            scope: 'scenario',
            squad: getSquad()
        };
        state.verifiedSelector = '';
        txtSelector.value = '';
        txtVarName.value = next.name;
        state.selectedCatalogLocator = null;
        setVerify('— Inspecciona y verifica un selector');
        persistCoverageProgress();
    }

    function restoreCoverageAssignment() {
        if (!state.activeScenarioCoverage || state.currentAssignment) return;
        try {
            const stored = JSON.parse(
                localStorage.getItem(COVERAGE_PROGRESS_STORAGE_KEY) || '{}'
            );
            if (
                stored.scenarioId !== state.activeScenarioCoverage.scenario.id ||
                stored.platform !== state.sessionPlatform
            ) return;
            const locator = state.activeScenarioCoverage.locators.find(item =>
                item.name === stored.currentLocator && item.file === stored.currentFile
            );
            if (!locator) return;
            const activeKey = state.sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
            state.currentAssignment = {
                ...locator,
                selector: locator[activeKey],
                platform: state.sessionPlatform,
                scope: 'scenario',
                squad: getSquad()
            };
        } catch {
            // El progreso es auxiliar; un valor corrupto no bloquea el análisis.
        }
    }

    function renderScenarioCoverage() {
        scenarioLocatorQueue.innerHTML = '';
        if (!state.activeScenarioCoverage) return;
        const coverage = state.activeScenarioCoverage;
        const activeKey = state.sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
        const complete = coverage.locators.filter(locator => Boolean(locator[activeKey])).length;
        const pending = coverage.locators.length - complete;
        scenarioCoverageSummary.innerHTML =
            `<strong>${coverage.scenario.caseId || 'Caso'}</strong> · ` +
            `${state.sessionPlatform.toUpperCase()}: ${complete}/${coverage.locators.length} locators` +
            (pending ? ` · <span class="coverage-missing">${pending} pendientes</span>` : ' · ✓ completo') +
            (coverage.unresolvedSteps.length
                ? `<br>⚠ ${coverage.unresolvedSteps.length} steps sin resolver`
                : '');

        coverage.steps.forEach((gherkinStep, stepIndex) => {
            const branch = document.createElement('section');
            branch.className = 'scenario-step-branch' +
                (!gherkinStep.definition ? ' unresolved' : '');

            const header = document.createElement('div');
            header.className = 'scenario-step-node';
            const order = document.createElement('span');
            order.className = 'scenario-step-order';
            order.textContent = String(stepIndex + 1);
            const keyword = document.createElement('span');
            keyword.className = 'scenario-step-keyword';
            keyword.textContent = gherkinStep.keyword;
            const text = document.createElement('span');
            text.className = 'scenario-step-text';
            text.textContent = gherkinStep.text;
            text.title = gherkinStep.text;
            header.append(order, keyword, text);
            branch.appendChild(header);

            const stepLocators = Array.isArray(gherkinStep.locators)
                ? gherkinStep.locators
                : [];
            const children = document.createElement('div');
            children.className = 'scenario-step-locators';
            if (stepLocators.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'scenario-step-empty';
                empty.textContent = gherkinStep.definition
                    ? '└ Sin locator requerido'
                    : '└ Step sin definición encontrada';
                children.appendChild(empty);
            }
            stepLocators.forEach((locator, locatorIndex) => {
                const ready = Boolean(locator[activeKey]);
                const item = document.createElement('div');
                const selected = state.currentAssignment &&
                    state.currentAssignment.file === locator.file &&
                    state.currentAssignment.name === locator.name;
                item.className = 'scenario-locator-item' +
                    (ready ? ' ready' : '') +
                    (selected ? ' selected' : '');
                const name = document.createElement('span');
                name.className = 'scenario-locator-name';
                name.textContent =
                    `${locatorIndex === stepLocators.length - 1 ? '└' : '├'} ` +
                    `${ready ? '✓' : '⚠'} ${locator.name}`;
                const module = document.createElement('span');
                module.className = 'scenario-locator-module';
                module.textContent =
                    `${locator.module} · A:${locator.androidSelector ? '✓' : '—'} ` +
                    `I:${locator.iosSelector ? '✓' : '—'}`;
                item.append(name, module);
                item.addEventListener('click', () => selectCoverageAssignment(locator));
                children.appendChild(item);
            });
            branch.appendChild(children);
            scenarioLocatorQueue.appendChild(branch);
        });
        updateFinalAction();
    }

    function selectCoverageAssignment(locator) {
        state.currentAssignment = {
            ...locator,
            selector: state.sessionPlatform === 'ios'
                ? locator.iosSelector
                : locator.androidSelector,
            platform: state.sessionPlatform,
            scope: 'scenario',
            squad: getSquad()
        };
        state.verifiedSelector = '';
        persistCoverageProgress();
        txtSelector.value = '';
        txtVarName.value = locator.name;
        state.selectedCatalogLocator = null;
        setVerify('— Inspecciona y verifica un selector');
        scenarioCoveragePanel.classList.add('is-open');
        renderAssignmentTarget();
        renderScenarioCoverage();
    }

    function renderAssignmentTarget() {
        if (!state.currentAssignment) {
            assignmentTarget.style.display = 'none';
            xmlAssignmentTarget.textContent = '';
            txtVarName.readOnly = false;
            renderSelectedLocatorCoverage();
            return;
        }
        assignmentTarget.style.display = 'flex';
        assignmentTargetName.textContent = state.currentAssignment.name;
        assignmentTargetPath.textContent =
            `${state.currentAssignment.module} · completando ${state.sessionPlatform.toUpperCase()}`;
        xmlAssignmentTarget.textContent = `🎯 Asignando a: ${state.currentAssignment.name}`;
        txtVarName.value = state.currentAssignment.name;
        txtVarName.readOnly = true;
        renderSelectedLocatorCoverage();
        updateAssignmentButton();
    }

    function updateAssignmentButton() {
        const selector = txtSelector.value.trim();
        const assignment = state.currentAssignment || state.selectedCatalogLocator;
        if (!btnAssignLocator) return;
        btnAssignLocator.disabled = !assignment || !selector;
        if (assignment) {
            const operation = assignment.selector ? 'actualizar' : 'asignar';
            btnAssignLocator.textContent =
                state.verifiedSelector === selector
                    ? `${assignment.selector ? 'Actualizar' : 'Asignar'} valor ${state.sessionPlatform.toUpperCase()}`
                    : `Verificar y ${operation} ${state.sessionPlatform.toUpperCase()}`;
        }
    }

    function persistCoverageProgress() {
        if (!state.activeScenarioCoverage) return;
        localStorage.setItem(COVERAGE_PROGRESS_STORAGE_KEY, JSON.stringify({
            scenarioId: state.activeScenarioCoverage.scenario.id,
            squad: getSquad(),
            platform: state.sessionPlatform,
            currentLocator: state.currentAssignment?.name || '',
            currentFile: state.currentAssignment?.file || ''
        }));
    }

    function showSessionOnboarding() {
        onboardingPlatform.textContent =
            state.sessionPlatform === 'ios' ? '🍎 iOS' : '🤖 Android';
        onboardingExistingFlow.style.display = 'none';
        onboardingRegenerateFlow.style.display = 'none';
        document.querySelector('.onboarding-options').style.display = 'grid';
        if (!state.activeScenarioCoverage) cmbOnboardingScenario.value = '';
        sessionOnboarding.style.display = 'flex';
    }

    /**
     * [visual-recorder] Reengancha la grabacion elegida y devuelve el recorder a
     * modo "grabando", con las acciones previas ya cargadas y la metadata del
     * caso rellenada. El QA sigue grabando (tipicamente el Then que falta) y
     * finaliza por el flujo normal, que reescribe la misma grabacion.
     */
    async function resumeSelectedRecording() {
        const recordingId = cmbOnboardingScenario.value;
        // start-session crea una grabacion nueva al conectar; si reenganchamos
        // antes de eso, el arranque nos la pisa.
        disableBtn(btnOnboardingAnalyze, '⏳ Esperando el dispositivo...');
        await state.sessionReady;
        disableBtn(btnOnboardingAnalyze, '⏳ Cargando acciones...');
        const result = await api.resumeRecording({ recordingId, squad: getSquad() });
        enableBtn(btnOnboardingAnalyze);
        updateCompleteModeControls();
        if (!result.success) {
            onboardingScenarioHint.textContent = '✗ ' + result.error;
            return;
        }

        state.workflowMode = 'new';
        state.activeScenarioCoverage = null;
        state.currentAssignment = null;
        state.selectedCatalogLocator = null;
        state.verifiedSelector = '';
        scenarioLocatorQueue.innerHTML = '';
        txtSelector.value = '';
        txtVarName.value = '';
        txtVarName.readOnly = false;
        setVerify('— Ingresa un selector');
        renderAssignmentTarget();
        screenRecorder.classList.remove('existing-workflow');
        scenarioCoveragePanel.classList.remove('is-open');
        deps.renderSteps(result.steps || []);

        // Rellena la metadata del caso para que el QA no la reescriba distinta:
        // si cambia, el fingerprint cambia y el paquete deja de ser el mismo.
        deps.applyResumedScenarioMetadata(result.scenario);

        sessionOnboarding.style.display = 'none';
        updateFinalAction();
        setStatus(
            result.hasAssertion
                ? `🎬 Grabación retomada · ${(result.steps || []).length} acción(es) · sigue grabando`
                : `🎬 Grabación retomada · falta el Then: graba la verificación del resultado`,
            result.hasAssertion ? '#00CC00' : '#FF9900'
        );
    }

    function updateFinalAction() {
        if (!btnOpenFinalReview) return;
        if (state.workflowMode === 'existing') {
            const activeKey = state.sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
            const pending = state.activeScenarioCoverage
                ? state.activeScenarioCoverage.locators.filter(locator => !locator[activeKey]).length
                : 1;
            btnOpenFinalReview.textContent = pending
                ? `Completa ${pending} locator${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}`
                : '✓ Finalizar cobertura';
            btnOpenFinalReview.disabled = pending > 0;
            return;
        }
        const hasSteps = lstSteps && lstSteps.querySelectorAll('li:not(.step-empty)').length > 0;
        btnOpenFinalReview.textContent = 'Revisar y finalizar caso →';
        btnOpenFinalReview.disabled = !hasSteps;
    }

    function locatorTypeGroup(locator) {
        const value =
            `${locator.name} ${locator.androidSelector || ''} ${locator.iosSelector || ''}`.toLowerCase();
        if (/(^|\\W)(btn|button)|widget\\.button|xcuielementtypebutton/.test(value)) return 'Botones';
        if (/(^|\\W)(input|textfield|search|field)|edittext|xcuielementtypetextfield/.test(value)) return 'Campos';
        if (/(^|\\W)(lbl|label|title|text)|textview|statictext/.test(value)) return 'Textos';
        if (/(^|\\W)(img|image|icon)|imageview/.test(value)) return 'Imágenes e íconos';
        if (/(^|\\W)(list|item|card|container)|recyclerview|collectionview|cell/.test(value)) {
            return 'Listas y contenedores';
        }
        return 'Otros';
    }

    function renderLocatorCatalog() {
        if (!locatorCatalogDropdown) return;
        const query = txtVarName.value.trim().toLowerCase();
        const filtered = state.squadCatalog.locators.filter(locator =>
            !query || `${locator.name} ${locator.module} ${locator.scope}`.toLowerCase().includes(query)
        );
        const typeOrder = ['Botones', 'Campos', 'Textos', 'Imágenes e íconos', 'Listas y contenedores', 'Otros'];
        const grouped = new Map(typeOrder.map(type => [type, new Map()]));
        filtered.forEach(locator => {
            const type = locatorTypeGroup(locator);
            const moduleName = locator.module.split('/').pop() || locator.module;
            const modules = grouped.get(type);
            if (!modules.has(moduleName)) modules.set(moduleName, []);
            modules.get(moduleName).push(locator);
        });

        locatorCatalogDropdown.innerHTML = '';
        typeOrder.forEach(type => {
            const modules = grouped.get(type);
            const count = [...modules.values()].reduce((sum, entries) => sum + entries.length, 0);
            if (!count) return;
            const collapsed = !query && collapsedLocatorGroups.has(type);
            const header = document.createElement('div');
            header.className = 'catalog-group-header';
            header.innerHTML = `<span>${collapsed ? '▸' : '▾'} ${type}</span><span>${count}</span>`;
            header.addEventListener('mousedown', event => {
                event.preventDefault();
                collapsedLocatorGroups.has(type)
                    ? collapsedLocatorGroups.delete(type)
                    : collapsedLocatorGroups.add(type);
                renderLocatorCatalog();
            });
            locatorCatalogDropdown.appendChild(header);
            if (collapsed) return;

            [...modules.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([moduleName, locators]) => {
                const moduleHeader = document.createElement('div');
                moduleHeader.className = 'catalog-module-header';
                moduleHeader.textContent = `${moduleName} (${locators.length})`;
                locatorCatalogDropdown.appendChild(moduleHeader);
                locators.sort((a, b) => a.name.localeCompare(b.name)).forEach(locator => {
                    const option = document.createElement('div');
                    option.className = 'catalog-option';
                    option.dataset.locatorName = locator.name;
                    option.dataset.locatorFile = locator.file;
                    option.innerHTML =
                        `<span class="catalog-option-name">${locator.name}</span>` +
                        `<span class="catalog-option-source">` +
                        `${locator.selector ? '✓' : '⚠'} ${locator.scope} · ` +
                        `A:${locator.androidSelector ? '✓' : '—'} I:${locator.iosSelector ? '✓' : '—'}` +
                        `</span>`;
                    option.title = locator.file;
                    option.addEventListener('mousedown', event => {
                        event.preventDefault();
                        selectCatalogLocator(locator);
                    });
                    locatorCatalogDropdown.appendChild(option);
                });
            });
        });
        if (!filtered.length) {
            locatorCatalogDropdown.innerHTML =
                '<div class="catalog-empty">Sin coincidencias. El nombre escrito se usará como locator nuevo.</div>';
        }
        locatorActiveIndex = -1;
        if (lblLocatorCatalog) {
            lblLocatorCatalog.textContent =
                `${state.squadCatalog.locators.length} locators indexados · ` +
                `${getSquad()} → commons → home → global`;
        }
    }

    function executableCatalogSelector(locator) {
        const selector = String(locator.selector || '').trim();
        if (
            locator.platform === 'android' &&
            (selector.startsWith('new UiSelector(') || selector.startsWith('new UiScrollable('))
        ) {
            return `android=${selector}`;
        }
        if (locator.platform === 'ios' && selector.startsWith('**/')) {
            return `iosClassChain=${selector}`;
        }
        return selector;
    }

    function selectCatalogLocator(locator) {
        if (state.currentAssignment) return;
        clearSelectorCapture();
        const capturedSelector = txtSelector.value.trim();
        txtVarName.value = locator.name;
        if (!capturedSelector && locator.selector) {
            txtSelector.value = executableCatalogSelector(locator);
        }
        state.selectedCatalogLocator = locator;
        locatorCatalogDropdown.classList.remove('open');
        txtVarName.setAttribute('aria-expanded', 'false');
        renderSelectedLocatorCoverage();
        if (lblLocatorCatalog) lblLocatorCatalog.textContent = `🔗 ${locator.scope}: ${locator.file}`;
        setStatus(
            locator.selector
                ? `✓ Locator encontrado en ${locator.file}`
                : `⚠ ${locator.name} no tiene valor ${state.sessionPlatform.toUpperCase()}`,
            locator.selector ? '#00CC00' : '#FF9900'
        );
    }

    function renderSelectedLocatorCoverage() {
        if (!locatorCoverage) return;
        const locator = state.currentAssignment || state.selectedCatalogLocator;
        if (!locator) {
            locatorCoverage.style.display = 'none';
            return;
        }
        locatorCoverage.style.display = 'flex';
        lblLogicalLocator.textContent = locator.name;
        lblActivePlatform.textContent = state.sessionPlatform;
        const renderState = (element, value) => {
            element.textContent = value ? '✓ Configurado' : '⚠ Sin valor';
            element.className = value ? 'coverage-ready' : 'coverage-missing';
            element.title = value || '';
        };
        renderState(lblAndroidCoverage, locator.androidSelector);
        renderState(lblIosCoverage, locator.iosSelector);
        updateAssignmentButton();
    }

    function mount() {
        on(btnAnalyzeScenario, 'click', analyzeSelectedScenario);
        on(btnOpenAssignmentInspector, 'click', openAppiumInspector);
        on(btnCancelAssignment, 'click', () => {
            state.currentAssignment = null;
            state.verifiedSelector = '';
            txtSelector.value = '';
            txtVarName.value = '';
            persistCoverageProgress();
            renderAssignmentTarget();
            renderScenarioCoverage();
            setVerify('— Selecciona un locator de la cola');
        });

        on(scenarioLocatorQueue, 'wheel', event => {
            if (scenarioLocatorQueue.scrollHeight <= scenarioLocatorQueue.clientHeight) return;
            event.preventDefault();
            event.stopPropagation();
            scenarioLocatorQueue.scrollTop += event.deltaY;
        }, { passive: false });
        on(scenarioLocatorQueue, 'keydown', event => {
            const page = Math.max(120, scenarioLocatorQueue.clientHeight * 0.8);
            if (event.key === 'PageDown') scenarioLocatorQueue.scrollTop += page;
            else if (event.key === 'PageUp') scenarioLocatorQueue.scrollTop -= page;
            else if (event.key === 'Home') scenarioLocatorQueue.scrollTop = 0;
            else if (event.key === 'End') {
                scenarioLocatorQueue.scrollTop = scenarioLocatorQueue.scrollHeight;
            } else {
                return;
            }
            event.preventDefault();
        });

        on(btnOnboardingNew, 'click', () => {
            state.workflowMode = 'new';
            state.activeScenarioCoverage = null;
            state.currentAssignment = null;
            state.selectedCatalogLocator = null;
            state.verifiedSelector = '';
            scenarioLocatorQueue.innerHTML = '';
            cmbExistingScenario.value = '';
            cmbOnboardingScenario.value = '';
            cmbOnboardingRegeneration.value = '';
            scenarioCoverageSummary.textContent =
                'Selecciona una grabación para detectar sus locators.';
            txtSelector.value = '';
            txtVarName.value = '';
            txtVarName.readOnly = false;
            setVerify('— Ingresa un selector');
            renderAssignmentTarget();
            screenRecorder.classList.remove('existing-workflow');
            sessionOnboarding.style.display = 'none';
            scenarioCoveragePanel.classList.remove('is-open');
            updateFinalAction();
            setStatus(
                `✨ Caso nuevo · graba las acciones · ${state.sessionPlatform.toUpperCase()}`,
                '#00CC00'
            );
        });

        on(btnOnboardingExisting, 'click', () => {
            document.querySelector('.onboarding-options').style.display = 'none';
            onboardingRegenerateFlow.style.display = 'none';
            onboardingExistingFlow.style.display = 'flex';
            updateCompleteModeControls();
            cmbOnboardingScenario.focus();
        });

        on(btnOnboardingRegenerate, 'click', () => {
            document.querySelector('.onboarding-options').style.display = 'none';
            onboardingExistingFlow.style.display = 'none';
            onboardingRegenerateFlow.style.display = 'flex';
            cmbOnboardingRegeneration.focus();
            updateRegenerationControls();
        });

        on(cmbOnboardingScenario, 'change', updateCompleteModeControls);
        on(rdbCompleteSteps, 'change', updateCompleteModeControls);
        on(rdbCompleteLocators, 'change', updateCompleteModeControls);
        on(cmbOnboardingRegeneration, 'change', updateRegenerationControls);
        on(chkRegenerationClean, 'change', updateRegenerationControls);

        on(btnOnboardingBack, 'click', () => {
            onboardingExistingFlow.style.display = 'none';
            document.querySelector('.onboarding-options').style.display = 'grid';
        });

        on(btnOnboardingRegenerateBack, 'click', () => {
            onboardingRegenerateFlow.style.display = 'none';
            document.querySelector('.onboarding-options').style.display = 'grid';
        });

        on(btnOnboardingRegeneratePrepare, 'click', async () => {
            const recordingId = cmbOnboardingRegeneration.value;
            const refinement = txtRegenerationRefinement.value.trim();
            const cleanPackage = Boolean(chkRegenerationClean.checked);
            if (!recordingId) {
                onboardingRegenerationHint.textContent = '⚠ Selecciona una grabación.';
                return;
            }
            disableBtn(btnOnboardingRegeneratePrepare, '⏳ Preparando...');
            const result = await api.prepareAutomationRegeneration({
                recordingId,
                squad: getSquad(),
                refinement,
                cleanPackage
            });
            enableBtn(btnOnboardingRegeneratePrepare);
            if (!result.success) {
                onboardingRegenerationHint.textContent = '✗ ' + result.error;
                return;
            }
            state.workflowMode = result.mode === 'refinement' ? 'regenerate' : 'reprocess';
            deps.startRegeneratedAutomationWorkflow(result);
            sessionOnboarding.style.display = 'none';
            setStatus(
                result.mode === 'refinement'
                    ? '♻️ Refinando una automatización existente'
                    : '♻️ Reprocesando una grabación existente',
                '#00CC00'
            );
        });

        on(btnOnboardingAnalyze, 'click', async () => {
            if (!cmbOnboardingScenario.value) {
                onboardingScenarioHint.textContent = '⚠ Selecciona una grabación';
                return;
            }
            if (rdbCompleteSteps?.checked) {
                await resumeSelectedRecording();
                return;
            }
            cmbExistingScenario.value = cmbOnboardingScenario.value;
            disableBtn(btnOnboardingAnalyze, '⏳ Analizando...');
            const success = await analyzeSelectedScenario();
            enableBtn(btnOnboardingAnalyze);
            if (!success) {
                onboardingScenarioHint.textContent = scenarioCoverageSummary.textContent;
                return;
            }
            state.workflowMode = 'existing';
            screenRecorder.classList.add('existing-workflow');
            sessionOnboarding.style.display = 'none';
            scenarioCoveragePanel.classList.add('is-open');
            scenarioCoveragePanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
            setStatus(
                `🧭 Caso cargado · completando ${state.sessionPlatform.toUpperCase()}`,
                '#00CC00'
            );
            updateFinalAction();
        });

        on(btnOpenFinalReview, 'click', () => {
            if (state.workflowMode === 'existing') {
                setStatus(
                    `✓ Cobertura ${state.sessionPlatform.toUpperCase()} completa para el caso seleccionado`,
                    '#00CC00'
                );
                return;
            }
            document.getElementById('btnEnlazar')?.click();
        });

        on(btnAssignLocator, 'click', async () => {
            const assignment = state.currentAssignment || state.selectedCatalogLocator;
            if (!assignment) return;
            const selector = txtSelector.value.trim();
            if (!selector) {
                setStatus('⚠ Captura o ingresa un selector', '#FF9900');
                return;
            }
            if (state.verifiedSelector !== selector) {
                disableBtn(btnAssignLocator, '⏳ Verificando...');
                const verification = await api.verifySelector(selector);
                if (!verification.success) {
                    state.verifiedSelector = '';
                    setVerify(verification.summary, 'err');
                    setStatus('✗ No se actualizó: selector no encontrado', '#CC0000');
                    updateAssignmentButton();
                    return;
                }
                deps.onVerificationScreenshot(verification.screenshot);
                state.verifiedSelector = selector;
                setVerify(verification.summary, 'ok');
                setStatus('✓ Selector verificado', '#00CC00');
                updateAssignmentButton();
            }
            const selectedFile = assignment.file;
            const selectedName = assignment.name;
            const currentValue = assignment.selector || '';
            if (
                currentValue && currentValue !== selector &&
                !window.confirm(
                    `Se reemplazará el valor ${state.sessionPlatform.toUpperCase()} de ` +
                    `${selectedName}.\n\nActual: ${currentValue}\nNuevo: ${selector}`
                )
            ) {
                updateAssignmentButton();
                return;
            }

            disableBtn(btnAssignLocator, '⏳ Guardando...');
            const result = await api.assignLocatorValue({
                recordingId: state.activeScenarioCoverage?.scenario?.recordingId || undefined,
                file: selectedFile,
                name: selectedName,
                selector,
                platform: state.sessionPlatform,
                androidBlock: assignment.androidBlock,
                iosBlock: assignment.iosBlock
            });
            enableBtn(btnAssignLocator);
            if (!result.success) {
                setStatus('✗ ' + result.error, '#CC0000');
                updateAssignmentButton();
                return;
            }
            state.squadCatalog = result.catalog;
            const updatedCatalogLocator = state.squadCatalog.locators.find(locator =>
                locator.file === selectedFile && locator.name === selectedName
            );
            renderLocatorCatalog();
            setStatus(
                result.coverageComplete
                    ? `✓ Cobertura ${state.sessionPlatform.toUpperCase()} completa; archivos del framework actualizados`
                    : `✓ ${selectedName} actualizado en ${result.block}`,
                '#00CC00'
            );
            state.verifiedSelector = '';
            if (state.currentAssignment && state.activeScenarioCoverage) {
                state.advanceAssignmentAfterSave = true;
                await analyzeSelectedScenario();
            } else {
                state.selectedCatalogLocator = updatedCatalogLocator || {
                    ...assignment,
                    selector: result.selector,
                    ...(state.sessionPlatform === 'ios'
                        ? { iosSelector: result.selector, iosBlock: result.block }
                        : { androidSelector: result.selector, androidBlock: result.block })
                };
                renderSelectedLocatorCoverage();
            }
        });

        on(txtVarName, 'focus', () => {
            if (txtVarName.readOnly) return;
            renderLocatorCatalog();
            locatorCatalogDropdown.classList.add('open');
            txtVarName.setAttribute('aria-expanded', 'true');
        });
        on(txtVarName, 'input', () => {
            if (txtVarName.readOnly) return;
            state.selectedCatalogLocator = null;
            renderSelectedLocatorCoverage();
            renderLocatorCatalog();
            locatorCatalogDropdown.classList.add('open');
        });
        on(txtVarName, 'keydown', event => {
            const options = [...locatorCatalogDropdown.querySelectorAll('.catalog-option')];
            if (event.key === 'Escape') {
                locatorCatalogDropdown.classList.remove('open');
                txtVarName.setAttribute('aria-expanded', 'false');
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || options.length === 0) return;
            event.preventDefault();
            if (event.key === 'Enter' && locatorActiveIndex >= 0) {
                const locator = state.squadCatalog.locators.find(
                    item =>
                        item.name === options[locatorActiveIndex].dataset.locatorName &&
                        item.file === options[locatorActiveIndex].dataset.locatorFile
                );
                if (locator) selectCatalogLocator(locator);
                return;
            }
            locatorActiveIndex = event.key === 'ArrowDown'
                ? Math.min(locatorActiveIndex + 1, options.length - 1)
                : Math.max(locatorActiveIndex - 1, 0);
            options.forEach((option, index) => option.classList.toggle('active', index === locatorActiveIndex));
            options[locatorActiveIndex]?.scrollIntoView({ block: 'nearest' });
        });
        on(document, 'mousedown', event => {
            if (locatorCombobox && !locatorCombobox.contains(event.target)) {
                locatorCatalogDropdown.classList.remove('open');
                txtVarName.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function unmount() {
        bound.forEach(({ target, type, handler, options }) => target.removeEventListener(type, handler, options));
        bound.length = 0;
    }

    /** Limpia la selección de escenario/asignación al cambiar squad o feature scope. */
    function resetForSquadChange() {
        state.linkedScenarioData = null;
        state.activeScenarioCoverage = null;
        state.currentAssignment = null;
        state.verifiedSelector = '';
        scenarioLocatorQueue.innerHTML = '';
        cmbExistingScenario.value = '';
        cmbOnboardingScenario.value = '';
        renderAssignmentTarget();
    }

    return {
        mount,
        unmount,
        loadExistingScenarios,
        showSessionOnboarding,
        resetForSquadChange,
        renderAssignmentTarget,
        updateAssignmentButton,
        renderSelectedLocatorCoverage,
        renderLocatorCatalog,
        updateFinalAction,
        invalidatePreview,
    };
}
