// [visual-recorder] Feature "review": el wizard "Enlazar" (constructor de
// escenario Gherkin), el pipeline de automatización con agente (progreso,
// decisiones de QA) y la revisión/revalidación de una propuesta antes de
// aplicarla. Ver docs/ARCHITECTURE.md — flujo "Caso nuevo con agente de
// automatización" y docs/DEVELOPMENT.md — "Wizard de finalización".
//
// Consume la API de `generation` para mostrar/leer el preview de las cuatro
// capas (`state.previewDocuments` sigue siendo propiedad única de esa
// feature); nunca copia ese estado.

import { disableBtn, enableBtn, escapeHtml } from '../shared/domHelpers.js';
import { isQaRoastModeEnabled } from '../shared/recorderPreferences.js';
import { createCopilotModelControls } from './copilotModelControls.js';

const GHERKIN_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'];

const PRODUCT_STAGES = [
    'ANALYZING',
    'RESOLVING_CONTEXT',
    'RESOLVING_DECISIONS',
    'GENERATING',
    'VALIDATING',
    'READY_FOR_REVIEW'
];
const PRODUCT_STAGE_ALIASES = {
    WAITING_FOR_QA: 'RESOLVING_DECISIONS',
    APPLYING: 'READY_FOR_REVIEW',
    COMPLETED: 'READY_FOR_REVIEW',
    FAILED: 'ANALYZING'
};

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {ReturnType<import('../generation/generationFeature.js').createGenerationFeature>} deps.generation
 * @param {(step: object) => string} deps.stepSummary dueño: recording.
 */
export function createReviewFeature(deps) {
    const { api, state, setStatus, generation, stepSummary } = deps;
    const copilotModel = createCopilotModelControls(document, api);

    const enlazarModal         = document.getElementById('enlazarModal');
    const enlazarStepsList     = document.getElementById('enlazarStepsList');
    const scenarioRowsContainer= document.getElementById('scenarioRows');
    const btnNuevoStep         = document.getElementById('btnNuevoStep');
    const btnCloseEnlazar      = document.getElementById('btnCloseEnlazar');
    const btnConfirmarEscenario= document.getElementById('btnConfirmarEscenario');
    const btnEnlazar           = document.getElementById('btnEnlazar');
    const enlazarHint          = document.getElementById('enlazarHint');
    const wizardPages          = [...document.querySelectorAll('.wizard-page')];
    const wizardSteps          = [...document.querySelectorAll('.wizard-step')];
    const btnWizardBack        = document.getElementById('btnWizardBack');
    const btnWizardNext        = document.getElementById('btnWizardNext');
    const txtAutomationObjective = document.getElementById('txtAutomationObjective');
    const txtAutomationAcceptance = document.getElementById('txtAutomationAcceptance');
    const automationAnalysisSummary = document.getElementById('automationAnalysisSummary');
    const automationAgentSummary = document.getElementById('automationAgentSummary');
    const automationAgentSummaryIcon = document.getElementById('automationAgentSummaryIcon');
    const automationAgentSummaryTitle = document.getElementById('automationAgentSummaryTitle');
    const automationAgentSummaryDescription = document.getElementById('automationAgentSummaryDescription');
    const testDesignSuggestionsPanel = document.getElementById('testDesignSuggestionsPanel');
    const testDesignSuggestionSummary = document.getElementById('testDesignSuggestionSummary');
    const testDesignSuggestionRoast = document.getElementById('testDesignSuggestionRoast');
    const testDesignSuggestionIssues = document.getElementById('testDesignSuggestionIssues');
    const btnImproveTestDesign = document.getElementById('btnImproveTestDesign');
    const automationPipelineExecution = document.getElementById('automationPipelineExecution');
    const btnRunAutomationPipeline = document.getElementById('btnRunAutomationPipeline');
    const automationPipelineStatus = document.getElementById('automationPipelineStatus');
    const automationPipelineSummary = document.getElementById('automationPipelineSummary');
    const automationPipelineStages = document.getElementById('automationPipelineStages');
    const automationAgentStages = document.getElementById('automationAgentStages');
    const automationWorkingState = document.getElementById('automationWorkingState');
    const automationWorkingTitle = document.getElementById('automationWorkingTitle');
    const automationWorkingDetail = document.getElementById('automationWorkingDetail');
    const automationCorrectionReimport = document.getElementById('automationCorrectionReimport');
    const automationCorrectionTitle = document.getElementById('automationCorrectionTitle');
    const automationCorrectionHint = document.getElementById('automationCorrectionHint');
    const btnStartAutomationCorrection = document.getElementById('btnStartAutomationCorrection');
    const btnDeferAutomationCorrection = document.getElementById('btnDeferAutomationCorrection');
    const btnReimportAutomationCorrection = document.getElementById('btnReimportAutomationCorrection');
    const btnUsePreviousAutomation = document.getElementById('btnUsePreviousAutomation');
    const automationQaRequired = document.getElementById('automationQaRequired');
    const automationQaDecisionList = document.getElementById('automationQaDecisionList');
    const btnConfirmQaDecision = document.getElementById('btnConfirmQaDecision');
    const automationPackageStatus = document.getElementById('automationPackageStatus');
    const btnGenerate = document.getElementById('btnGenerate');
    const btnPreview = document.getElementById('btnPreview');
    const qaObservationsPanel = document.getElementById('qaObservationsPanel');
    const qaObservationsList = document.getElementById('qaObservationsList');
    const btnCopyQaReport = document.getElementById('btnCopyQaReport');
    const qaReportCopyStatus = document.getElementById('qaReportCopyStatus');

    let wizardPage = 1;
    let automationPipelineRunning = false;
    let pendingQaDecisionPrompts = [];
    let qaObservations = [];
    /** Estado por agente del pipeline por capas; Lorem y Zorem pueden coincidir en curso. */
    const agentStages = new Map();

    // Estado del constructor de escenario
    let enlazarSteps   = [];   // copia de recordedSteps al abrir el modal
    let scenarioRows   = [];   // [{ text: string, stepIndices: number[] }]
    let activeRowIndex = -1;   // fila seleccionada en el constructor

    const bound = [];
    const ipcUnsubscribers = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    function isAutomationWorkflow() { return state.automationWorkflow; }
    function hasInvalidAutomationDraft() { return Boolean(state.invalidAutomationDraft); }

    function qaReportText() {
        return qaObservations.map(observation => observation.type === 'weak-assertion' ? [
            'Título: Verificación con selector genérico',
            `Plataforma: ${String(observation.platform || '').toUpperCase()}`,
            `Selector: ${observation.selector}`,
            `Evidencia: acción ${observation.actionSequence}`,
            `Detalle: ${observation.message}`,
            'Nota: el selector grabado se conserva; la automatización puede refinarlo en el Screen Object.',
        ].join('\n') : [
            'Título: Texto incorrecto en la aplicación',
            `Plataforma: ${String(observation.platform || '').toUpperCase()}`,
            `Actual: “${observation.actual}”`,
            `Esperado: “${observation.expected}”`,
            `Evidencia: acción ${observation.actionSequence}`,
            `Detalle: ${observation.message}`,
            'Nota: la automatización conserva temporalmente el texto real para localizar el elemento.',
        ].join('\n')).join('\n\n---\n\n');
    }

    const AGENT_LAYERS = {
        Lorem: 'Feature y Steps',
        Zorem: 'Screen Object y Locators',
        Sumrak: 'Integración',
    };

    function formatKilobytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    }

    function resetAgentStages() {
        agentStages.clear();
        renderAgentStages();
    }

    function renderAgentStages() {
        if (!automationAgentStages) return;
        if (!agentStages.size) {
            automationAgentStages.style.display = 'none';
            automationAgentStages.innerHTML = '';
            return;
        }
        const running = [...agentStages.values()].filter(stage => stage.roleState === 'running').map(stage => stage.agentName);
        automationAgentStages.style.display = '';
        automationAgentStages.innerHTML = [...agentStages.values()].map(stage => {
            const layers = AGENT_LAYERS[stage.agentName] || (stage.assignedLayers || []).join(', ');
            const execution = stage.execution === 'cache'
                ? 'reutilizó una salida verificada'
                : stage.execution === 'deterministic'
                    ? 'Derek lo resolvió sin Copilot'
                    : stage.roleState === 'running'
                        ? (running.length > 1 ? 'en curso, en paralelo' : 'en curso')
                        : stage.roleState === 'repairing'
                            ? 'reparando'
                            : stage.roleState === 'failed'
                                ? 'falló'
                                : 'completado';
            const context = formatKilobytes(stage.evidenceBytes ?? stage.contextBytes);
            const details = [
                execution,
                context ? `${context} de evidencia` : '',
                stage.timedOut ? 'se cortó por el hang stop' : '',
            ].filter(Boolean).join(' · ');
            const warnings = (stage.budgetWarnings || []).map(warning =>
                `<span class="agent-budget-warning">⚠ ${escapeHtml(warning)}</span>`
            ).join('');
            const error = stage.error ? `<small>${escapeHtml(stage.error)}</small>` : '';
            return `<li data-agent="${escapeHtml(stage.agentName)}" class="is-${escapeHtml(stage.roleState || 'running')}">` +
                `<div class="agent-stage-body"><strong>${escapeHtml(stage.agentName)}</strong> · ${escapeHtml(layers)}` +
                `<small>${escapeHtml(details)}</small>${warnings}${error}</div></li>`;
        }).join('');
    }

    function trackAgentStage(progress) {
        if (!progress?.agentName) return;
        agentStages.set(progress.agentName, {
            ...(agentStages.get(progress.agentName) || {}),
            agentName: progress.agentName,
            roleState: progress.roleState,
            execution: progress.execution,
            contextBytes: progress.contextBytes,
            evidenceBytes: progress.evidenceBytes,
            budgetWarnings: progress.budgetWarnings || [],
            timedOut: Boolean(progress.timedOut),
            assignedLayers: progress.assignedLayers || [],
            error: progress.roleState === 'failed' ? (progress.error || progress.detail || '') : '',
        });
        renderAgentStages();
    }

    function renderQaObservations(observations = []) {
        qaObservations = Array.isArray(observations) ? observations : [];
        if (!qaObservationsPanel || !qaObservationsList) return;
        qaObservationsPanel.style.display = qaObservations.length ? 'block' : 'none';
        qaObservationsList.innerHTML = qaObservations.map(observation => {
            const where = `${escapeHtml(String(observation.platform || '').toUpperCase())} · acción ` +
                `${escapeHtml(String(observation.actionSequence))}`;
            if (observation.type === 'weak-assertion') {
                return `<li><strong>Verificación con XPath genérico:</strong> ` +
                    `<code>${escapeHtml(observation.selector || '')}</code>` +
                    `<small>${where}. El selector se conserva tal cual; si buscas un elemento concreto, ` +
                    'refínalo o pide al agente que lo haga en código.</small></li>';
            }
            return `<li><strong>${escapeHtml(observation.actual)}</strong> debería decir ` +
                `<strong>${escapeHtml(observation.expected)}</strong>` +
                `<small>${where}. El locator conserva el texto real.</small></li>`;
        }).join('');
        if (qaReportCopyStatus) qaReportCopyStatus.textContent = '';
    }

    function renderTestDesignSuggestions(review = null) {
        const visible = review?.status === 'suggestion' && Array.isArray(review.issues) && review.issues.length > 0;
        if (!testDesignSuggestionsPanel || !testDesignSuggestionIssues) return;
        testDesignSuggestionsPanel.style.display = visible ? 'block' : 'none';
        if (!visible) {
            testDesignSuggestionIssues.innerHTML = '';
            if (testDesignSuggestionSummary) testDesignSuggestionSummary.textContent = '';
            if (testDesignSuggestionRoast) testDesignSuggestionRoast.style.display = 'none';
            return;
        }
        if (testDesignSuggestionSummary) {
            testDesignSuggestionSummary.textContent = review.summary || 'Copilot encontró oportunidades de mejora.';
        }
        if (testDesignSuggestionRoast && isQaRoastModeEnabled() && review.roast) {
            testDesignSuggestionRoast.style.display = '';
            testDesignSuggestionRoast.textContent = review.roast;
        } else if (testDesignSuggestionRoast) {
            testDesignSuggestionRoast.style.display = 'none';
        }
        testDesignSuggestionIssues.innerHTML = review.issues.map(issue => {
            const sequences = Array.isArray(issue.actionSequences) && issue.actionSequences.length
                ? `Acciones ${issue.actionSequences.join(', ')}. `
                : '';
            return `<li><strong>${escapeHtml(issue.message || 'Sugerencia de diseño.')}</strong>` +
                `<small>${escapeHtml(sequences + (issue.recommendation || 'Revisa si conviene mejorar la evidencia del caso.'))}</small></li>`;
        }).join('');
    }

    function updateAutomationProgress(normalizedStage, summary, detail, error) {
        if (!automationWorkingState) return;
        const stateClass = error
            ? 'is-error'
            : normalizedStage === 'READY_FOR_REVIEW'
                ? 'is-complete'
                : automationPipelineRunning
                    ? 'is-running'
                    : 'is-idle';
        automationWorkingState.className = `automation-working-state ${stateClass}`;
        if (automationWorkingTitle) automationWorkingTitle.textContent = summary;
        if (automationWorkingDetail) automationWorkingDetail.textContent = detail || 'Procesando la automatización.';
    }

    function updateProductStage(stage, summary, detail, error = false) {
        const normalizedStage = PRODUCT_STAGE_ALIASES[stage] || stage;
        updateAutomationProgress(normalizedStage, summary, detail, error);
        if (automationPipelineStatus) {
            automationPipelineStatus.textContent = summary;
            automationPipelineStatus.className = `generate-result ${error ? 'err' : 'ok'}`.trim();
        }
        if (automationPipelineSummary) {
            automationPipelineSummary.textContent = detail || '';
        }
        if (!automationPipelineStages) return;
        const currentIndex = PRODUCT_STAGES.indexOf(normalizedStage);
        automationPipelineStages.querySelectorAll('[data-product-stage]').forEach(node => {
            const itemStage = node.dataset.productStage;
            const itemIndex = PRODUCT_STAGES.indexOf(itemStage);
            if (itemIndex < 0) return;
            if (error && itemIndex === currentIndex) {
                node.textContent = node.textContent.replace(/^./, '✗');
                node.classList.add('step-used');
                return;
            }
            if (itemIndex < currentIndex) {
                node.textContent = node.textContent.replace(/^./, '✓');
                node.classList.add('step-used');
            } else if (itemIndex === currentIndex) {
                node.textContent = node.textContent.replace(/^./, '●');
                node.classList.remove('step-used');
            } else {
                node.textContent = node.textContent.replace(/^./, '○');
                node.classList.remove('step-used');
            }
        });
    }

    function setCorrectionReimportVisible(visible, hint = '', title = '') {
        if (!automationCorrectionReimport) return;
        automationCorrectionReimport.style.display = visible ? 'flex' : 'none';
        if (btnUsePreviousAutomation) {
            btnUsePreviousAutomation.style.display = visible && state.invalidAutomationDraft ? '' : 'none';
        }
        if (visible && automationCorrectionHint && hint) {
            automationCorrectionHint.textContent = hint;
        }
        if (visible && automationCorrectionTitle) {
            automationCorrectionTitle.textContent = title ||
                'El recorder detectó errores. ¿Deseas corregirlos con Copilot?';
        }
    }

    function showQaRequiredDecisions(items) {
        if (!automationQaRequired || !automationQaDecisionList) return;
        const title = automationQaRequired.querySelector('h3');
        if (title) title.textContent = 'Sugerencias para completar la propuesta';
        if (btnConfirmQaDecision) btnConfirmQaDecision.textContent = 'Usar esta sugerencia';
        pendingQaDecisionPrompts = Array.isArray(items) ? items : [];
        automationQaDecisionList.innerHTML = '';
        if (!pendingQaDecisionPrompts.length) {
            automationQaDecisionList.innerHTML =
                '<li class="step-empty">No se recibieron opciones automáticas. Puedes continuar trabajando sobre el borrador.</li>';
        } else {
            pendingQaDecisionPrompts.forEach(item => {
                const option = document.createElement('li');
                const options = (item.options || []).map((candidate, index) => {
                    const gapId = escapeHtml(item.gapId);
                    const optionId = escapeHtml(candidate.optionId);
                    const title = escapeHtml(candidate.title);
                    const reason = escapeHtml(candidate.reason);
                    return `<label class="qa-decision-option" style="display:block; margin-top:6px;">
                        <input type="radio" name="qa-decision-${gapId}" value="${optionId}" ${index === 0 ? 'checked' : ''}/>
                        <strong>${title}</strong><br/><small>${reason}</small>
                    </label>`;
                }).join('');
                option.innerHTML = `<strong>${escapeHtml(item.title)}</strong><br/>
                    <small>${escapeHtml(item.description || '')}</small>
                    ${options || '<div class="step-empty">Sin opciones disponibles.</div>'}`;
                automationQaDecisionList.appendChild(option);
            });
        }
        if (btnConfirmQaDecision) btnConfirmQaDecision.disabled = !pendingQaDecisionPrompts.length;
        automationQaRequired.style.display = '';
    }

    function resetTestDesignReviewSummary() {
        if (automationAgentSummaryIcon) automationAgentSummaryIcon.textContent = '↗';
        if (automationAgentSummaryTitle) {
            automationAgentSummaryTitle.textContent = 'Propuesta generada por el agente';
        }
        if (automationAgentSummaryDescription) {
            automationAgentSummaryDescription.textContent =
                'Revisa los archivos y corrige manualmente o con Copilot lo que consideres necesario.';
            automationAgentSummaryDescription.style.display = '';
        }
        if (automationPipelineExecution) automationPipelineExecution.style.display = 'none';
        if (automationPackageStatus) automationPackageStatus.style.display = '';
    }

    function collectQaDecisions() {
        return pendingQaDecisionPrompts.map(prompt => {
            const selected = [...automationQaDecisionList.querySelectorAll('input[type="radio"]:checked')]
                .find(input => input.name === `qa-decision-${prompt.gapId}`);
            return {
                gapId: prompt.gapId,
                optionId: selected?.value || '',
            };
        });
    }

    function summarizeAutomationAnalysis(result) {
        if (!automationAnalysisSummary) return;
        const processed = enlazarSteps.length;
        const unresolved = Number(result?.unresolvedGaps || 0);
        const reusable = Math.max(0, processed - unresolved);
        // Memoria entre recordings: steps y decisiones heredados de otros
        // casos validados a 100. El QA ve de dónde vienen; el agente no los
        // vuelve a redactar ni a juzgar.
        const recall = result?.memoryRecall;
        const recallText = recall && (recall.steps || recall.gaps)
            ? ` · ${recall.steps} step(s) y ${recall.gaps} decisión(es) heredados de memoria` +
              (recall.cases?.length ? ` (${recall.cases.join(', ')})` : '')
            : '';
        automationAnalysisSummary.innerHTML = `<span class="generation-icon">✓</span><div>
            <h3>Análisis completado</h3>
            <p>${processed} acciones procesadas · ${reusable} componentes reutilizables · ${unresolved} decisión(es) pendiente(s)${recallText}</p>
        </div>`;
    }

    function setWizardPage(page) {
        wizardPage = Math.max(1, Math.min(3, page));
        wizardPages.forEach(element => {
            element.classList.toggle('active', Number(element.dataset.wizardPage) === wizardPage);
        });
        wizardSteps.forEach((element, index) => {
            element.classList.toggle('active', index + 1 === wizardPage);
            element.classList.toggle('complete', index + 1 < wizardPage);
        });
        btnWizardBack.disabled = wizardPage === 1;
        btnWizardNext.style.display = wizardPage >= 3 ? 'none' : '';
        btnConfirmarEscenario.style.display = 'none';
        const labels = [
            'Revisa la evidencia grabada',
            'Analiza el caso a generar',
            'Revisa, corrige y aplica cambios'
        ];
        enlazarHint.textContent = `Paso ${wizardPage} de 3 · ${labels[wizardPage - 1]}`;
        if (btnWizardNext) {
            btnWizardNext.textContent = wizardPage === 1
                ? 'Analizar grabación →'
                : 'Iniciar generación →';
        }
    }

    async function validateStepImpacts() {
        const texts = scenarioRows.map(row => row.text.trim());
        if (!texts.length || texts.some(text => !text)) return false;
        const squad = document.getElementById('cmbFrameworkSquad').value;
        const response = await api.analyzeStepImpact(texts, squad);
        if (!response.success) {
            enlazarHint.textContent = '✗ No se pudo validar el impacto: ' + response.error;
            return false;
        }
        const txtFeature = document.getElementById('txtFeature');
        response.steps.forEach((impact, index) => {
            const duplicateRows = texts
                .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(candidate => candidate.candidate === texts[index] && candidate.candidateIndex !== index);
            scenarioRows[index].impact = duplicateRows.length
                ? {
                    ...impact,
                    safe: false,
                    references: [
                        ...impact.references,
                        {
                            squad,
                            file: 'Escenario actual',
                            keyword: scenarioRows[index].keyword,
                            expression: texts[index],
                            matchType: 'exact',
                            scenarios: duplicateRows.map(candidate => ({
                                feature: txtFeature.value.trim() || 'Feature actual',
                                scenario: `Línea ${candidate.candidateIndex + 1}`,
                                file: 'Borrador sin generar'
                            }))
                        }
                    ]
                }
                : impact;
        });
        renderScenarioRows();
        return scenarioRows.every(row => row.impact?.safe);
    }

    function renderLinkActions() {
        const wizardLinkActions = document.getElementById('wizardLinkActions');
        if (!wizardLinkActions) return;
        wizardLinkActions.innerHTML = '';
        if (!enlazarSteps.length) {
            wizardLinkActions.innerHTML = '<li class="step-empty">Sin acciones grabadas</li>';
            return;
        }
        const usedIndices = new Set(scenarioRows.flatMap(row => row.stepIndices));
        enlazarSteps.forEach((step, index) => {
            const item = document.createElement('li');
            item.className = `assignable${usedIndices.has(index) ? ' step-used' : ''}`;
            item.textContent = `${index + 1}. ${stepSummary(step)}`;
            item.addEventListener('click', () => {
                if (activeRowIndex < 0) {
                    enlazarHint.textContent = 'Selecciona primero una línea Gherkin de la derecha.';
                    return;
                }
                if (!scenarioRows[activeRowIndex].stepIndices.includes(index)) {
                    scenarioRows[activeRowIndex].stepIndices.push(index);
                }
                renderScenarioRows();
                renderLinkActions();
            });
            wizardLinkActions.appendChild(item);
        });
    }

    function scenarioRowHtml(row, rowIdx) {
        row.examples ||= {};
        row.bindings ||= {};
        const parameters = [...new Set(
            [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])
        )];
        const assignedHtml = row.stepIndices.length === 0
            ? '<span class="assigned-empty-hint">← Haz click en un step de la izquierda para asignarlo</span>'
            : row.stepIndices.map(si => {
                const s = enlazarSteps[si];
                const label = s ? stepSummary(s) : 'Step #' + si;
                const supportsValue = s && ['ESCRIBIR', 'VERIFICAR_TEXTO'].includes(s.action);
                const options = [
                    `<option value="">Literal grabado: ${String(s?.value || '').replace(/</g, '&lt;')}</option>`,
                    ...parameters.map(parameter =>
                        `<option value="${parameter}"${row.bindings[si] === parameter ? ' selected' : ''}>Parámetro: &lt;${parameter}&gt;</option>`
                    )
                ].join('');
                return `<div class="assigned-action-config">
                    <span class="assigned-chip" data-row="${rowIdx}" data-si="${si}">
                        ${label.slice(0, 50)}${label.length > 50 ? '…' : ''}
                        <span class="chip-remove" data-row="${rowIdx}" data-si="${si}">✕</span>
                    </span>
                    ${supportsValue && parameters.length
                        ? `<select class="action-param-select" data-row="${rowIdx}" data-si="${si}">${options}</select>`
                        : ''}
                </div>`;
            }).join('');

        const kwOptions = GHERKIN_KEYWORDS.map(kw =>
            `<option value="${kw}"${row.keyword === kw ? ' selected' : ''}>${kw}</option>`
        ).join('');
        const impact = row.impact;
        const impactHtml = !row.text.trim()
            ? '<div class="step-impact neutral">Escribe la definición para validar su alcance.</div>'
            : !impact
                ? '<div class="step-impact neutral">La definición se validará al presionar Continuar.</div>'
                : impact.safe
                    ? '<div class="step-impact safe">✓ Step aislado: no intercepta definiciones existentes.</div>'
                    : `<div class="step-impact warning">
                        <strong>⚠ Puede impactar ${impact.references.length} definición(es)</strong>
                        ${impact.references.map(reference =>
                            `<span>${reference.squad} · ${reference.file}<small>${reference.keyword} /${reference.expression}/</small></span>
                             ${(reference.scenarios || []).map(usage =>
                                `<span class="impact-scenario">↳ ${usage.feature} · ${usage.scenario}<small>${usage.file}</small></span>`
                             ).join('')}`
                        ).join('')}
                        <em>Cambia la redacción para crear un step nuevo y seguro.</em>
                    </div>`;

        return `<div class="scenario-row${rowIdx === activeRowIndex ? ' active' : ''}" data-row="${rowIdx}">
            <div class="scenario-row-header">
                <span class="row-number">${rowIdx + 1}</span>
                <select class="scenario-kw-select" data-row="${rowIdx}">${kwOptions}</select>
                <input type="text" class="scenario-step-input" placeholder="descripción del step..." value="${row.text.replace(/"/g, '&quot;')}" data-row="${rowIdx}"/>
                <button class="btn-remove-row" data-row="${rowIdx}">✕</button>
            </div>
            ${impactHtml}
            ${parameters.length ? `<div class="scenario-params">
                <span class="scenario-params-title">Parámetros:</span>
                ${parameters.map(parameter =>
                    `<label>&lt;${parameter}&gt;
                        <input class="parameter-example-input" data-row="${rowIdx}" data-param="${parameter}"
                               value="${String(row.examples[parameter] || '').replace(/"/g, '&quot;')}"
                               placeholder="valor de ejemplo"/>
                    </label>`
                ).join('')}
            </div>` : ''}
            <div class="assigned-steps-area${row.stepIndices.length === 0 ? ' empty-area' : ''}" data-row="${rowIdx}">
                ${assignedHtml}
            </div>
        </div>`;
    }

    function renderScenarioRows() {
        if (scenarioRows.length === 0) {
            scenarioRowsContainer.innerHTML =
                '<div class="scenario-empty-hint">Agrega un step con el botón "+ Nuevo Step"<br/>o haz click en un step grabado de la izquierda</div>';
            return;
        }
        scenarioRowsContainer.innerHTML = scenarioRows.map((r, i) => scenarioRowHtml(r, i)).join('');

        scenarioRowsContainer.querySelectorAll('.scenario-row').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.classList.contains('scenario-step-input')) return;
                if (e.target.classList.contains('btn-remove-row')) return;
                if (e.target.classList.contains('chip-remove')) return;
                const ri = parseInt(el.dataset.row);
                activeRowIndex = (activeRowIndex === ri) ? -1 : ri;
                updateEnlazarHint();
                renderScenarioRows();
            });
        });

        scenarioRowsContainer.querySelectorAll('.scenario-kw-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const ri = parseInt(sel.dataset.row);
                scenarioRows[ri].keyword = e.target.value;
            });
            sel.addEventListener('click', e => e.stopPropagation());
        });

        scenarioRowsContainer.querySelectorAll('.scenario-step-input').forEach(inp => {
            inp.addEventListener('input', e => {
                const ri = parseInt(inp.dataset.row);
                scenarioRows[ri].text = e.target.value;
                scenarioRows[ri].impact = null;
            });
            inp.addEventListener('blur', () => renderScenarioRows());
            inp.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(inp.dataset.row);
                activeRowIndex = ri;
                updateEnlazarHint();
                scenarioRowsContainer.querySelectorAll('.scenario-row').forEach(rowElement => {
                    rowElement.classList.toggle(
                        'active',
                        parseInt(rowElement.dataset.row) === ri
                    );
                });
            });
        });

        scenarioRowsContainer.querySelectorAll('.parameter-example-input').forEach(input => {
            input.addEventListener('input', e => {
                e.stopPropagation();
                const ri = parseInt(input.dataset.row);
                scenarioRows[ri].examples ||= {};
                scenarioRows[ri].examples[input.dataset.param] = e.target.value;
            });
            input.addEventListener('click', e => e.stopPropagation());
        });

        scenarioRowsContainer.querySelectorAll('.action-param-select').forEach(select => {
            select.addEventListener('change', e => {
                e.stopPropagation();
                const ri = parseInt(select.dataset.row);
                const si = parseInt(select.dataset.si);
                scenarioRows[ri].bindings ||= {};
                if (select.value) {
                    scenarioRows[ri].bindings[si] = select.value;
                    scenarioRows[ri].examples ||= {};
                    if (!scenarioRows[ri].examples[select.value]) {
                        scenarioRows[ri].examples[select.value] = enlazarSteps[si]?.value || '';
                    }
                } else {
                    delete scenarioRows[ri].bindings[si];
                }
                renderScenarioRows();
            });
            select.addEventListener('click', e => e.stopPropagation());
        });

        scenarioRowsContainer.querySelectorAll('.btn-remove-row').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(btn.dataset.row);
                scenarioRows.splice(ri, 1);
                if (activeRowIndex >= scenarioRows.length) activeRowIndex = scenarioRows.length - 1;
                renderScenarioRows();
                renderEnlazarSteps();
                renderLinkActions();
            });
        });

        scenarioRowsContainer.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(btn.dataset.row);
                const si = parseInt(btn.dataset.si);
                scenarioRows[ri].stepIndices = scenarioRows[ri].stepIndices.filter(x => x !== si);
                renderScenarioRows();
                renderEnlazarSteps();
                renderLinkActions();
            });
        });
    }

    function renderEnlazarSteps() {
        enlazarStepsList.innerHTML = '';
        if (!enlazarSteps || enlazarSteps.length === 0) {
            enlazarStepsList.innerHTML = '<li class="step-empty">Sin steps grabados</li>';
            return;
        }
        const usedIndices = new Set(scenarioRows.flatMap(r => r.stepIndices));
        enlazarSteps.forEach((s, i) => {
            const li = document.createElement('li');
            li.textContent = (i + 1) + '. ' + stepSummary(s);
            li.dataset.index = i;
            li.classList.add('recorded-action');
            if (usedIndices.has(i)) li.classList.add('step-used');
            enlazarStepsList.appendChild(li);
        });
    }

    function updateEnlazarHint() {
        if (activeRowIndex >= 0) {
            enlazarHint.textContent = '🔗 Modo Enlazar — fila ' + (activeRowIndex + 1) + ' activa, haz click en steps de la izquierda';
        } else {
            enlazarHint.textContent = '🔗 Modo Enlazar — asigna steps a cada fila del escenario';
        }
    }

    async function importAutomationResponse(preserveReviewed = false, manualCorrection = false) {
        const result = await api.importAutomationResponse({ manualCorrection, reviewOnly: true });
        await copilotModel.refresh();
        if (!result.success) {
            state.invalidAutomationDraft = result.draft || null;
            state.automationWorkflow = true;
            if (result.draft) {
                generation.showPreviewDocuments(result.draft, preserveReviewed, false);
            }
            automationPackageStatus.textContent = '⚠ Borrador importado con observaciones: ' +
                (result.error || 'requiere revisión manual');
            automationPackageStatus.className = 'generate-result err';
            setCorrectionReimportVisible(
                true,
                manualCorrection
                    ? 'La corrección fue importada como borrador. Puedes seguir editando y reimportar todas las veces necesarias.'
                    : 'La propuesta está disponible para revisión. Edítala aquí o pide al agente que corrija gap-resolutions.json y vuelve a importar.'
            );
            setWizardPage(3);
            return { ...result, reviewAvailable: Boolean(result.draft) };
        }
        state.invalidAutomationDraft = null;
        setCorrectionReimportVisible(false);
        state.automationWorkflow = true;
        renderQaObservations(result.qaObservations || []);
        generation.showPreviewDocuments(result, preserveReviewed);
        automationPackageStatus.textContent = '✓ Automatización validada y lista para revisión';
        automationPackageStatus.className = 'generate-result ok';
        setWizardPage(3);
        return { ...result, reviewAvailable: true };
    }

    async function revalidateReviewedAutomation() {
        const reviewedContents = generation.getReviewedContents();
        disableBtn(btnPreview, '⏳ Revalidando...');
        const result = await api.revalidateAutomationResponse(reviewedContents);
        await copilotModel.refresh();
        enableBtn(btnPreview);
        if (!result.success) {
            state.invalidAutomationDraft = result.draft || state.invalidAutomationDraft;
            if (result.draft) generation.showPreviewDocuments(result.draft, false, false);
            generation.setGenerate('✗ ' + (result.error || 'La propuesta editada todavía no es válida.'), 'err');
            return result;
        }
        state.invalidAutomationDraft = null;
        setCorrectionReimportVisible(false);
        generation.showPreviewDocuments(result, false, true);
        updateProductStage('READY_FOR_REVIEW', 'Automatización validada.', 'La propuesta editada ya puede aplicarse.');
        return result;
    }

    async function runAutomationPipeline() {
        if (automationPipelineRunning) return;
        let model;
        try { model = copilotModel.selected(); }
        catch (error) { setStatus(error.message, 'red'); return; }
        resetAgentStages();
        const objective = txtAutomationObjective.value.trim();
        const acceptanceCriteria = txtAutomationAcceptance.value.trim();
        if (!objective || !acceptanceCriteria) {
            enlazarHint.textContent = '⚠ Completa el objetivo y el resultado esperado.';
            setWizardPage(2);
            return;
        }
        automationPipelineRunning = true;
        copilotModel.busy(true);
        copilotModel.reset();
        try {
        resetTestDesignReviewSummary();
        if (automationPipelineExecution) automationPipelineExecution.style.display = '';
        automationQaRequired && (automationQaRequired.style.display = 'none');
        setCorrectionReimportVisible(false);
        if (btnRunAutomationPipeline) disableBtn(btnRunAutomationPipeline, '⏳ Generando...');
        updateProductStage(
            'ANALYZING',
            'Analizando grabación...',
            `Analizando ${enlazarSteps.length} acciones grabadas.`
        );
        const prepare = await api.prepareAutomationPackage({
            request: generation.buildGenerationRequest(),
            objective,
            acceptanceCriteria
        });
        if (!prepare.success) {
            updateProductStage('ANALYZING', 'No pudimos completar el análisis.', prepare.error || 'Error desconocido', true);
            automationPackageStatus.textContent = `✗ ${prepare.error || 'No se pudo analizar el caso.'}`;
            automationPackageStatus.className = 'generate-result err';
            if (btnRunAutomationPipeline) enableBtn(btnRunAutomationPipeline);
            automationPipelineRunning = false;
            return;
        }
        state.automationWorkflow = true;
        summarizeAutomationAnalysis(prepare.result);
        updateProductStage(
            'RESOLVING_CONTEXT',
            'Preparando estructura de automatización...',
            `${Math.round(prepare.result.deterministicCoverage * 100)}% resuelto automáticamente.`
        );
        if (!prepare.result.responseAvailable) {
            const unresolved = Number(prepare.result.unresolvedGaps || 0);
            updateProductStage(
                'RESOLVING_DECISIONS',
                prepare.result.testDesignReviewRequired
                    ? 'Revisando la calidad funcional del caso...'
                    : `Resolviendo ${unresolved} decisión${unresolved === 1 ? '' : 'es'}...`,
                prepare.result.testDesignReviewRequired
                    ? 'Copilot contrastará el objetivo y el resultado esperado con las verificaciones grabadas.'
                    : 'Buscando resolución automática para las decisiones pendientes.'
            );
            const launched = await api.launchAutomationAgent({
                mode: 'automatic',
                model,
                qaRoastMode: isQaRoastModeEnabled()
            });
            await copilotModel.refresh();
            if (!launched.success) {
                state.invalidAutomationDraft = launched.draft || null;
                const code = String(launched.run?.errorCode || launched.errorCode || '');
                if (code === 'PLANNER_REGENERATION_REQUIRED') {
                    if (launched.draft) {
                        generation.showPreviewDocuments(launched.draft, false, false);
                        setWizardPage(3);
                    }
                    setCorrectionReimportVisible(
                        true,
                        'El borrador quedó disponible para revisión. Puedes editar el Gherkin y usar Revalidar, o volver a iniciar la generación para reconstruir el paquete con las reglas actuales.',
                        'El plan contiene Gherkin que Copilot no puede corregir desde sus gaps.'
                    );
                    updateProductStage(
                        'VALIDATING',
                        'El plan necesita regenerarse o revisarse.',
                        launched.error || 'Revisa el borrador generado o vuelve a generar el paquete.',
                        true
                    );
                } else if (code === 'GAP_BLOCKED') {
                    const qa = await api.getAutomationQaDecisions();
                    if (qa?.success) {
                        showQaRequiredDecisions(qa.decisions || []);
                    } else {
                        showQaRequiredDecisions([{
                            title: 'Sugerencia para QA',
                            description: qa?.error || 'Existe una decisión que el agente no pudo resolver automáticamente.',
                            options: [],
                        }]);
                    }
                    updateProductStage(
                        'WAITING_FOR_QA',
                        'El agente dejó una decisión pendiente.',
                        'Puedes usar una sugerencia o continuar trabajando sobre cualquier borrador disponible.',
                        true
                    );
                } else if (launched.fallbackSuggested) {
                    setCorrectionReimportVisible(
                        true,
                        'Cuando Copilot termine de corregir gap-resolutions.json, reimporta sin reiniciar el flujo.'
                    );
                    updateProductStage(
                        'FAILED',
                        'No pudimos completar la resolución automática.',
                        'Verifica que Copilot esté disponible e inténtalo nuevamente.',
                        true
                    );
                } else {
                    setCorrectionReimportVisible(
                        true,
                        'Si Copilot continúa abierto, pídele corregir gap-resolutions.json y luego reimporta.'
                    );
                    const validationFailure = launched.failureKind === 'generated-output-validation';
                    const materializationFailure = launched.failureKind === 'generation-materialization';
                    updateProductStage(
                        validationFailure ? 'VALIDATING' : 'RESOLVING_DECISIONS',
                        validationFailure
                            ? 'La automatización generada necesita corrección.'
                            : materializationFailure
                                ? 'No pudimos materializar la automatización.'
                                : 'No pudimos resolver las decisiones automáticamente.',
                        launched.error || 'El proveedor no está disponible en este momento.',
                        true
                    );
                }
                automationPackageStatus.textContent = `✗ ${launched.error || 'No se pudo continuar con la generación automática.'}`;
                automationPackageStatus.className = 'generate-result err';
                if (!launched.draft) {
                    const recovered = await importAutomationResponse(true, true);
                    if (!recovered.reviewAvailable) setWizardPage(3);
                } else {
                    setCorrectionReimportVisible(
                        true,
                        'El borrador está disponible. Puedes editarlo o pedir una corrección al agente y reimportarla.'
                    );
                    setWizardPage(3);
                }
                if (btnRunAutomationPipeline) enableBtn(btnRunAutomationPipeline);
                automationPipelineRunning = false;
                return;
            }
            renderTestDesignSuggestions(launched.testDesignReview || null);
        }

        updateProductStage('GENERATING', 'Generando automatización...', 'Materializando las cuatro capas del caso.');
        const imported = await importAutomationResponse(true);
        if (!imported.success) {
            updateProductStage(
                'VALIDATING',
                'No pudimos validar la automatización.',
                imported.error || 'Valida los detalles e inténtalo de nuevo.',
                true
            );
            if (!imported.reviewAvailable) setWizardPage(3);
            if (btnRunAutomationPipeline) enableBtn(btnRunAutomationPipeline);
            automationPipelineRunning = false;
            return;
        }
        updateProductStage('VALIDATING', 'Validando resultado...', 'La validación contractual finalizó correctamente.');
        updateProductStage('READY_FOR_REVIEW', 'Automatización generada.', 'Revisa los cambios antes de aplicarlos.');
        setWizardPage(3);
        if (btnRunAutomationPipeline) enableBtn(btnRunAutomationPipeline);
        automationPipelineRunning = false;
        } catch (error) {
            updateProductStage('FAILED', 'No pudimos completar la generación.', error.message, true);
        } finally {
            copilotModel.busy(false);
            automationPipelineRunning = false;
            if (btnRunAutomationPipeline) enableBtn(btnRunAutomationPipeline);
        }
    }

    function mount() {
        ipcUnsubscribers.push(api.onAutomationProgress?.(progress => {
            if (!progress || !progress.stage) return;
            trackAgentStage(progress);
            const running = [...agentStages.values()]
                .filter(stage => stage.roleState === 'running')
                .map(stage => stage.agentName);
            const parallel = running.length > 1 && progress.roleState === 'running';
            const detail = progress.error
                ? progress.error
                : (progress.detail || (progress.total ? `${progress.completed}/${progress.total}` : ''));
            updateProductStage(
                progress.stage,
                parallel
                    ? `${running.join(' y ')} trabajan en paralelo`
                    : (progress.message || 'Actualizando progreso...'),
                detail,
                progress.stage === 'FAILED',
            );
        }));

        [txtAutomationObjective, txtAutomationAcceptance].filter(Boolean).forEach(field => {
            on(field, 'input', generation.invalidatePreview);
        });

        on(btnEnlazar, 'click', async () => {
            copilotModel.reset();
            const sr = await api.getSteps();
            enlazarSteps = sr.steps || [];
            state.automationWorkflow = false;
            state.invalidAutomationDraft = null;
            renderQaObservations([]);
            renderTestDesignSuggestions(null);
            resetAgentStages();
            generation.invalidatePreview();
            if (automationPackageStatus) {
                automationPackageStatus.textContent = '';
                automationPackageStatus.className = 'generate-result';
            }
            if (automationQaRequired) automationQaRequired.style.display = 'none';
            resetTestDesignReviewSummary();
            setCorrectionReimportVisible(false);
            updateProductStage(
                'ANALYZING',
                'Listo para iniciar.',
                'Inicia la generación automática para ver el progreso del caso.'
            );
            activeRowIndex = -1;
            updateEnlazarHint();
            renderEnlazarSteps();
            renderScenarioRows();
            enlazarModal.style.display = 'flex';
            setWizardPage(1);
        });

        on(btnCloseEnlazar, 'click', () => {
            enlazarModal.style.display = 'none';
        });

        on(btnNuevoStep, 'click', () => {
            const defaultKw = scenarioRows.length === 0 ? 'Given' : 'And';
            scenarioRows.push({ text: '', keyword: defaultKw, stepIndices: [] });
            activeRowIndex = scenarioRows.length - 1;
            updateEnlazarHint();
            renderScenarioRows();
            setTimeout(() => {
                const inputs = scenarioRowsContainer.querySelectorAll('.scenario-step-input');
                if (inputs.length > 0) inputs[inputs.length - 1].focus();
            }, 0);
        });

        on(btnRunAutomationPipeline, 'click', async () => {
            await runAutomationPipeline();
        });

        on(btnCopyQaReport, 'click', async () => {
            if (!qaObservations.length) return;
            try {
                await navigator.clipboard.writeText(qaReportText());
                if (qaReportCopyStatus) {
                    qaReportCopyStatus.textContent = '✓ Reporte copiado para compartir con QA.';
                }
            } catch {
                if (qaReportCopyStatus) {
                    qaReportCopyStatus.textContent =
                        'No se pudo copiar automáticamente; revisa los permisos del portapapeles.';
                }
            }
        });

        on(btnReimportAutomationCorrection, 'click', async () => {
            if (automationPipelineRunning) return;
            automationPipelineRunning = true;
            disableBtn(btnReimportAutomationCorrection, '⏳ Reimportando...');
            updateProductStage(
                'VALIDATING',
                'Reimportando la corrección del agente...',
                'Procesando gap-resolutions.json, regenerando la propuesta y validando los cambios.'
            );
            const imported = await importAutomationResponse(false, true);
            if (!imported.success) {
                updateProductStage(
                    'VALIDATING',
                    'Corrección importada con observaciones.',
                    (imported.error || 'Pide al agente que continúe corrigiendo la propuesta.') +
                        ' El borrador sigue disponible para editar y reimportar.',
                    false
                );
                enableBtn(btnReimportAutomationCorrection);
                automationPipelineRunning = false;
                return;
            }
            updateProductStage('VALIDATING', 'Corrección validada.', 'La propuesta actual cumple el contrato del recorder.');
            updateProductStage('READY_FOR_REVIEW', 'Automatización corregida.', 'Revisa los cambios antes de aplicarlos.');
            enableBtn(btnReimportAutomationCorrection);
            automationPipelineRunning = false;
            setWizardPage(3);
        });

        on(btnStartAutomationCorrection, 'click', async () => {
            if (automationPipelineRunning) return;
            automationPipelineRunning = true;
            disableBtn(btnStartAutomationCorrection, '⏳ Abriendo Copilot...');
            let model;
            try { model = copilotModel.selected(); }
            catch (error) {
                setStatus(error.message, 'red');
                enableBtn(btnStartAutomationCorrection);
                automationPipelineRunning = false;
                return;
            }
            const launched = await api.launchAutomationAgent({ mode: 'manual', autorun: true, model });
            if (!launched.success) {
                updateProductStage(
                    'FAILED',
                    'No pudimos abrir Copilot.',
                    launched.error || 'Puedes dejar la corrección pendiente e intentarlo más tarde.',
                    true
                );
                enableBtn(btnStartAutomationCorrection);
                automationPipelineRunning = false;
                return;
            }
            if (automationCorrectionHint) {
                automationCorrectionHint.textContent =
                    'Copilot recibió los errores detectados. Cuando termine, usa “Reimportar corrección del agente”.';
            }
            updateProductStage(
                'RESOLVING_DECISIONS',
                'Copilot está corrigiendo la propuesta.',
                'El recorder no aplicará cambios hasta que vuelvas a importar y la validación sea correcta.'
            );
            enableBtn(btnStartAutomationCorrection);
            automationPipelineRunning = false;
        });

        on(btnDeferAutomationCorrection, 'click', () => {
            setCorrectionReimportVisible(false);
            updateProductStage(
                'FAILED',
                'Corrección pendiente.',
                'La grabación y la propuesta se conservaron para continuar después.',
                true
            );
        });

        on(btnUsePreviousAutomation, 'click', () => {
            if (!state.invalidAutomationDraft) return;
            state.automationWorkflow = true;
            generation.showPreviewDocuments(state.invalidAutomationDraft, false, false);
            setWizardPage(3);
        });

        on(btnImproveTestDesign, 'click', () => {
            setWizardPage(1);
            updateProductStage(
                'ANALYZING',
                'Puedes mejorar la grabación o continuar con la propuesta actual.',
                'Las sugerencias de Copilot son informativas y no invalidan la automatización.'
            );
        });

        on(btnConfirmQaDecision, 'click', async () => {
            const decisions = collectQaDecisions();
            if (decisions.some(item => !item.optionId)) {
                automationPackageStatus.textContent = '⚠ Completa todas las decisiones de QA para continuar.';
                automationPackageStatus.className = 'generate-result err';
                return;
            }
            disableBtn(btnConfirmQaDecision, '⏳ Confirmando...');
            updateProductStage(
                'RESOLVING_DECISIONS',
                'Aplicando decisiones de QA...',
                'El recorder validará las decisiones y continuará automáticamente.'
            );
            const result = await api.resolveAutomationQaDecisions({ decisions });
            enableBtn(btnConfirmQaDecision);
            if (!result.success) {
                updateProductStage(
                    'RESOLVING_DECISIONS',
                    'No pudimos aplicar la decisión de QA.',
                    result.error || 'Revisa las opciones e inténtalo nuevamente.',
                    true
                );
                automationPackageStatus.textContent = `✗ ${result.error || 'No se pudo aplicar la decisión de QA.'}`;
                automationPackageStatus.className = 'generate-result err';
                return;
            }
            automationQaRequired.style.display = 'none';
            pendingQaDecisionPrompts = [];
            if (result.imported?.success) {
                state.automationWorkflow = true;
                generation.showPreviewDocuments(result.imported, true);
                updateProductStage('READY_FOR_REVIEW', 'Automatización generada.', 'Revisa los cambios antes de aplicarlos.');
                setWizardPage(3);
                return;
            }
            updateProductStage(
                'VALIDATING',
                'No pudimos validar la automatización.',
                result.error || 'Valida los detalles e inténtalo de nuevo.',
                true
            );
        });

        on(btnWizardBack, 'click', () => setWizardPage(wizardPage - 1));
        on(btnWizardNext, 'click', async () => {
            if (wizardPage === 1) {
                if (!enlazarSteps.length) {
                    enlazarHint.textContent = '⚠ Graba al menos una acción antes de continuar.';
                    return;
                }
                setWizardPage(2);
                return;
            }
            if (wizardPage === 2) {
                if (!txtAutomationObjective.value.trim() || !txtAutomationAcceptance.value.trim()) {
                    enlazarHint.textContent = '⚠ Completa el objetivo y el resultado esperado.';
                    return;
                }
                await runAutomationPipeline();
                return;
            }
        });

        wizardSteps.forEach((step, index) => {
            on(step, 'click', () => {
                if (index + 1 < wizardPage) setWizardPage(index + 1);
            });
        });

        on(btnConfirmarEscenario, 'click', async () => {
            if (scenarioRows.length === 0) {
                enlazarHint.textContent = '⚠ Agrega al menos un step al escenario';
                enlazarHint.style.color = '#CC0000';
                return;
            }
            if (scenarioRows.some(row => row.stepIndices.length === 0)) {
                enlazarHint.textContent = '⚠ Cada línea Gherkin debe tener al menos una acción enlazada.';
                enlazarHint.style.color = '#FFB020';
                return;
            }
            const linked = {};
            const stepTexts = [];
            const stepRows  = [];
            const examples = {};
            const parameterErrors = [];
            scenarioRows.forEach(row => {
                const key = row.text.trim() || 'step sin nombre';
                const locatorReference = key.match(/\{([^{}]+)\}/)?.[1]?.trim();
                if (locatorReference) {
                    parameterErrors.push(
                        `No uses {${locatorReference}} en Gherkin; enlaza la acción o usa ` +
                        `<${locatorReference.replace(/\s+/g, '_')}>`
                    );
                }
                stepTexts.push(key);
                stepRows.push({
                    keyword: row.keyword || 'And',
                    text: key,
                    status: 'missing',
                    ...(row.methodName ? { methodName: row.methodName } : {})
                });
                const parameters = [...new Set(
                    [...key.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])
                )];
                parameters.forEach(parameter => {
                    const value = String(row.examples?.[parameter] || '').trim();
                    if (!value) parameterErrors.push(`Falta ejemplo para <${parameter}>`);
                    if (examples[parameter] && examples[parameter] !== value) {
                        parameterErrors.push(`El parámetro <${parameter}> tiene valores diferentes`);
                    }
                    examples[parameter] = value;
                });
                linked[key] = row.stepIndices.map(si => {
                    const s = enlazarSteps[si];
                    const binding = row.bindings?.[si];
                    return {
                        action:       s.action        || '',
                        variableName: s.variableName  || '',
                        selector:     s.selector      || '',
                        value:        binding ? `<${binding}>` : (s.value || ''),
                        description:  s.description   || '',
                        ...(s.locatorSource ? { locatorSource: s.locatorSource } : {})
                    };
                });
            });
            if (parameterErrors.length > 0) {
                enlazarHint.textContent = '⚠ ' + [...new Set(parameterErrors)].join(' · ');
                enlazarHint.style.color = '#CC0000';
                return;
            }

            // Guardar en memoria para cuando el usuario haga click en GENERAR
            state.linkedScenarioData = {
                linked,
                stepTexts,
                stepRows,
                examples,
                reuse: stepTexts.map(text => ({ text, status: 'missing' })),
                screenMethods: []
            };

            const txtFeature = document.getElementById('txtFeature');
            const txtScenario = document.getElementById('txtScenario');
            const txtGherkin = document.getElementById('txtGherkin');
            const featureName  = (txtFeature  && txtFeature.value.trim())  || 'Flujo mobile';
            const scenarioName = (txtScenario && txtScenario.value.trim()) || 'Escenario';
            const date = new Date().toLocaleString('es-PE');
            const gherkinLines = [
                `# Generado por Appium Recorder`,
                `# Fecha: ${date}`,
                `# locator-module: global`,
                `# Locators: ./resources/locators/global.locator.json`,
                '',
                `Feature: ${featureName}`,
                '',
                `  Scenario: ${scenarioName}`,
                ...scenarioRows.map(r => `    ${r.keyword} ${r.text.trim() || 'step sin nombre'}`),
                ''
            ];
            if (txtGherkin) txtGherkin.value = gherkinLines.join('\n');

            setStatus(`✓ ${stepTexts.length} steps nuevos validados sin impacto`, '#00CC00');
            setWizardPage(3);
            generation.setGenerate(
                'Revisa los nombres sugeridos, completa el TC y presiona Actualizar preview.',
                ''
            );
        });
    }

    function unmount() {
        copilotModel.dispose();
        bound.forEach(({ target, type, handler, options }) => target?.removeEventListener?.(type, handler, options));
        bound.length = 0;
        ipcUnsubscribers.forEach(unsubscribe => unsubscribe?.());
        ipcUnsubscribers.length = 0;
    }

    /** Arranca el flujo del wizard con un paquete de regeneración ya preparado (dueño: platform-completion). */
    function startRegeneratedAutomationWorkflow(result) {
        state.automationWorkflow = true;
        generation.invalidatePreview();
        if (automationPackageStatus) {
            automationPackageStatus.textContent =
                result.mode === 'refinement'
                    ? '✓ Iteración preparada. Abre el agente, refina la propuesta e impórtala nuevamente.'
                    : '✓ Paquete reconstruido desde la grabación. Abre el agente e importa su propuesta.';
            automationPackageStatus.className = 'generate-result ok';
        }
        enlazarModal.style.display = 'flex';
        setWizardPage(3);
    }

    return {
        mount,
        unmount,
        isAutomationWorkflow,
        hasInvalidAutomationDraft,
        importAutomationResponse,
        revalidateReviewedAutomation,
        updateProductStage,
        updateAutomationProgress,
        setWizardPage,
        startRegeneratedAutomationWorkflow,
    };
}
