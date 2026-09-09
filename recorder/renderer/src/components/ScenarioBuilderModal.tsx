// @ts-nocheck -- el controlador se migra progresivamente a React.
export function ScenarioBuilderModal() {
  return (
    <div id="enlazarModal" className="xml-modal workflow-wizard" style={{display: 'none'}}>
      <div className="workflow-wizard-content">
        <header className="workflow-wizard-header">
          <div>
            <span className="eyebrow">FINALIZAR AUTOMATIZACIÓN</span>
            <h2>Construye el caso paso a paso</h2>
          </div>
          <button className="btn btn-dark" id="btnCloseEnlazar">✕ Cerrar</button>
        </header>

        <nav className="wizard-stepper" aria-label="Progreso">
          {[
            ['1', 'Evidencia'],
            ['2', 'Análisis'],
            ['3', 'Revisión']
          ].map(([number, label], index) => (
            <button type="button" className={`wizard-step${index === 0 ? ' active' : ''}`}
                    data-wizard-target={index + 1} key={number}>
              <span>{number}</span><small>{label}</small>
            </button>
          ))}
        </nav>

        <main className="wizard-pages">
          <section className="wizard-page active" data-wizard-page="1">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 1</span><h3>Revisa las acciones grabadas</h3></div>
              <span className="wizard-help">Estas acciones serán la materia prima del escenario.</span>
            </div>
            <ul id="enlazarStepsList" className="steps-list wizard-action-list">
              <li className="step-empty">Sin acciones grabadas</li>
            </ul>
          </section>

          <section className="wizard-page" data-wizard-page="2">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 2</span><h3>Define el objetivo y analiza la grabación</h3></div>
              <span className="wizard-help">El análisis identifica reutilización, componentes nuevos y decisiones pendientes.</span>
            </div>
            <div className="wizard-case-config automation-context-form">
              <div className="input-group">
                <label className="field-label">¿Qué debe lograr el caso?</label>
                <textarea id="txtAutomationObjective" className="field-input" rows={4}
                  placeholder="Ej.: consultar el saldo y abrir la lista de movimientos" />
              </div>
              <div className="input-group">
                <label className="field-label">Resultado esperado</label>
                <textarea id="txtAutomationAcceptance" className="field-input" rows={4}
                  placeholder="Ej.: el usuario visualiza movimientos disponibles sin validar un saldo fijo" />
              </div>
            </div>
            <section className="acceptance-editor" aria-labelledby="acceptanceChecksTitle">
              <div className="acceptance-editor-heading">
                <div><h3 id="acceptanceChecksTitle">Criterios de aceptación</h3><p id="acceptanceChecksHint" className="wizard-help">Opcional. Define resultados concretos que debe comprobar el caso.</p></div>
                <button type="button" id="btnAddAcceptanceCheck" className="btn btn-dark">+ Añadir criterio</button>
              </div>
              <div id="acceptanceChecksList" className="acceptance-checks-list" />
              <p id="acceptanceChecksError" className="acceptance-checks-error" role="status" />
            </section>
            <div className="wizard-case-config automation-metadata-form">
              <div className="input-group">
                <label className="field-label">ID de ejecución:</label>
                <input type="text" id="txtCaseId" className="field-input" defaultValue="TC-10239" />
              </div>
              <div className="input-group">
                <label className="field-label">Tipo:</label>
                <select id="cmbPathType" className="field-select">
                  <option value="Happy Path">Happy Path</option>
                  <option value="Unhappy Path">Unhappy Path</option>
                </select>
              </div>
              <div className="input-group">
                <label className="field-label">Tag:</label>
                <input type="text" id="txtFeatureTag" className="field-input" defaultValue="miflujo" />
              </div>
              <div className="input-group">
                <label className="field-label">Usuario data (si se conoce):</label>
                <input type="text" id="txtDataName" className="field-input" placeholder="Opcional: se elegirá un usuario del squad" />
              </div>
            </div>
            <div className="copilot-model-settings">
              <div className="copilot-model-field">
                <label className="field-label" htmlFor="cmbCopilotModel">Modelo de Copilot</label>
                <select id="cmbCopilotModel" className="field-select" defaultValue="claude-sonnet-5">
                  <option value="claude-sonnet-5">Claude Sonnet 5 (predeterminado)</option>
                  <option value="gpt-5.6-terra">GPT-5.6 Terra</option>
                  <option value="auto">Auto</option>
                  <option value="claude-opus-5">Claude Opus 5</option>
                  <option value="gpt-5.6-sol">GPT-5.6 Sol</option>
                  <option value="custom">Otro modelo…</option>
                </select>
                <input id="txtCopilotModel" className="field-input" hidden maxLength={100}
                  aria-label="ID del modelo de Copilot" placeholder="ID disponible en /model de Copilot" />
              </div>
              <div className="copilot-model-copy">
                <strong>Configuración de generación</strong>
                <small>Se aplicará en la próxima generación o corrección. Un modelo fijo reduce variaciones, pero no garantiza respuestas idénticas.</small>
                <span id="copilotModelUsage" data-copilot-model-usage role="status">El modelo usado aparecerá al terminar la generación.</span>
              </div>
            </div>
            <div style={{display: 'none'}}>
              <input type="text" id="txtFeature" defaultValue="Flujo mobile" />
              <input type="text" id="txtScenario" defaultValue="Escenario grabado" />
              <input type="text" id="txtFeatureFile" defaultValue="flujo-mobile" />
              <input type="text" id="txtLocatorModule" defaultValue="nueva-pantalla" />
            </div>
            <button id="btnNuevoStep" style={{display: 'none'}} />
            <div id="automationAnalysisSummary" className="generation-summary" style={{marginTop: '10px'}}>
              <span className="generation-icon">ℹ</span>
              <div>
                <h3>Resumen pendiente</h3>
                <p>Completa el objetivo y el resultado esperado para iniciar el análisis.</p>
              </div>
            </div>
            <div id="automationPipelineExecution" className="automation-background-status" style={{display: 'none'}}>
              <button className="btn btn-blue" id="btnRunAutomationPipeline" style={{display: 'none'}}>Generar borrador</button>
              <div id="automationWorkingState" className="automation-working-state is-idle" aria-live="polite">
                <div className="automation-working-heading">
                  <span className="automation-spinner" aria-hidden="true" />
                  <div className="automation-working-copy">
                    <strong id="automationWorkingTitle">Preparando la propuesta</strong>
                    <span id="automationWorkingDetail">El agente trabajará en segundo plano.</span>
                  </div>
                </div>
              </div>
              <div id="automationPipelineStatus" className="generate-result" />
              <div id="automationPipelineSummary" className="wizard-help" />
              <ul id="automationAgentStages" className="automation-agent-stages" aria-live="polite" style={{display: 'none'}} />
            </div>
            <div id="wizardGherkinHost" style={{display: 'none'}}>
              <div id="scenarioRows" className="scenario-rows wizard-gherkin-rows">
                <div className="scenario-empty-hint" />
              </div>
            </div>
          </section>

          <section className="wizard-page" data-wizard-page="3">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 3</span><h3>Revisa y trabaja sobre la propuesta</h3></div>
              <span className="wizard-help">El borrador siempre se puede revisar, editar y reimportar; las observaciones no bloquean esta pantalla.</span>
            </div>
            <div id="automationAgentSummary" className="generation-summary automation-agent-summary">
              <span id="automationAgentSummaryIcon" className="generation-icon">↗</span>
              <div className="automation-agent-summary-content">
                <h3 id="automationAgentSummaryTitle">Propuesta generada por el agente</h3>
                <p id="automationAgentSummaryDescription">Revisa los archivos y corrige manualmente o con Copilot lo que consideres necesario.</p>
                <p className="copilot-model-usage-inline" data-copilot-model-usage>El modelo usado aparecerá al terminar la generación.</p>
              </div>
            </div>
            <div id="automationQaRequired" className="generation-summary" style={{display: 'none', marginTop: '10px'}}>
              <span className="generation-icon">⚠</span>
              <div>
                <h3>Necesitamos confirmar una decisión</h3>
                <ul id="automationQaDecisionList" className="steps-list wizard-action-list" />
                <button className="btn btn-green" id="btnConfirmQaDecision" style={{marginTop: '8px'}}>
                  Confirmar y continuar
                </button>
              </div>
            </div>
            <div id="automationPackageStatus" className="generate-result" />
            <div id="automationCorrectionReimport" className="automation-correction-reimport" style={{display: 'none'}}>
              <div>
                <strong id="automationCorrectionTitle">El recorder detectó errores. ¿Deseas corregirlos con Copilot?</strong>
                <small id="automationCorrectionHint">
                  Puedes editar el borrador, corregirlo con Copilot y reimportarlo cuantas veces necesites.
                </small>
              </div>
              <div className="automation-correction-actions">
                <button className="btn btn-dark" id="btnUsePreviousAutomation" style={{display: 'none'}}>
                  Usar generación anterior
                </button>
                <button className="btn btn-dark" id="btnDeferAutomationCorrection">
                  Dejar pendiente
                </button>
                <button className="btn btn-green" id="btnStartAutomationCorrection">
                  Corregir con Copilot
                </button>
                <button className="btn btn-blue" id="btnReimportAutomationCorrection">
                  ↻ Reimportar corrección del agente
                </button>
              </div>
            </div>
            <div className="wizard-link-layout" style={{display: 'none'}}>
              <ul id="wizardLinkActions" /><div id="wizardLinkRows" />
            </div>
            <p className="wizard-help">Los nombres propuestos, el TC y el contenido final se editan directamente en los archivos del preview.</p>
            <section id="testDesignSuggestionsPanel" className="qa-observations-panel" style={{display: 'none'}}>
              <div className="qa-observations-heading">
                <div>
                  <strong>💡 Sugerencias de diseño del caso</strong>
                  <small>Son recomendaciones de Copilot. No bloquean la generación ni la aplicación de la automatización.</small>
                </div>
                <button type="button" className="btn btn-dark" id="btnImproveTestDesign">
                  Volver y mejorar la grabación
                </button>
              </div>
              <div id="testDesignSuggestionSummary" className="wizard-help" />
              <ul id="testDesignSuggestionIssues" />
            </section>
            <section id="automationReuseSummary" className="qa-observations-panel" aria-label="Reutilización del framework" style={{display: 'none'}} />
            <section id="qaObservationsPanel" className="qa-observations-panel" style={{display: 'none'}}>
              <div className="qa-observations-heading">
                <div>
                  <strong>⚠ Observaciones para QA</strong>
                  <small>Son hallazgos informativos de la aplicación; no bloquean ni modifican los locators.</small>
                </div>
                <button type="button" className="btn btn-dark" id="btnCopyQaReport">Copiar reporte</button>
              </div>
              <ul id="qaObservationsList" />
              <span id="qaReportCopyStatus" className="wizard-help" />
            </section>
            <select id="cmbPreviewFile" className="field-select wizard-file-tabs" style={{display: 'none'}} />
            <div id="codeReviewWorkspace" className="code-review-workspace" style={{display: 'none'}}>
              <aside className="code-file-explorer">
                <div className="code-file-explorer-title">ARCHIVOS PROPUESTOS</div>
                <div id="codeFileTree" className="code-file-tree" />
              </aside>
              <section className="code-editor-panel">
                <header className="code-editor-header">
                  <div>
                    <strong id="lblCodeFileName">Selecciona un archivo</strong>
                    <small id="lblCodeFilePath" />
                  </div>
                  <span id="lblCodeFileState" className="code-file-state">Sin cambios</span>
                </header>
                <textarea id="txtGherkin" className="gherkin-preview wizard-preview code-editor"
                  spellCheck={false} aria-label="Contenido del archivo seleccionado" />
                <details id="preparedDiffPanel" style={{ display: 'none', minWidth: 0, padding: '8px 16px' }}>
                  <summary>Ver cambios respecto al framework</summary>
                  <pre id="preparedDiffContent" style={{ maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre-wrap' }} />
                </details>
                <footer className="code-editor-toolbar">
                  <span id="lblCodeValidation">Selecciona un archivo para revisarlo.</span>
                  <div>
                    <button type="button" className="btn btn-dark" id="btnCopyCode">Copiar contenido</button>
                    <button type="button" className="btn btn-dark" id="btnCopyCodePath">Copiar ruta</button>
                    <button type="button" className="btn btn-dark" id="btnResetCode">Descartar cambios</button>
                  </div>
                </footer>
              </section>
            </div>
            <div className="review-approval-panel">
              <div className="review-validation-status">
                <span className="review-validation-icon" id="reviewValidationIcon">✓</span>
                <div>
                  <h3 id="reviewValidationTitle">Propuesta lista para revisar</h3>
                  <p id="lblGenerationFileCount">Se escribirán únicamente los archivos mostrados en la revisión.</p>
                </div>
              </div>
              <div className="review-primary-actions">
                <button className="btn btn-dark" id="btnRecoverFrameworkCurrent">Recuperar cambios del framework</button>
                <button className="btn btn-navy" id="btnPreview">↻ Revalidar</button>
                <button className="btn btn-green btn-generate-final" id="btnGenerate">Aplicar automatización</button>
              </div>
            </div>
            <section id="acceptanceAssessment" className="acceptance-assessment" aria-label="Evaluación de criterios" aria-live="polite" style={{display: 'none'}} />
            <div id="lblGenerateResult" className="generate-result review-generation-result" />
            <section id="goldenDatasetPanel" className="golden-dataset-panel" style={{display: 'none'}}>
              <div className="golden-dataset-heading">
                <span className="golden-bookmark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" /><path d="m9 10 2 2 4-4" /></svg></span>
                <div><span className="eyebrow">GOLDEN DATASET</span><h3>Guarda este caso como ejemplo para el equipo</h3>
                  <p>Un golden es una versión revisada por QA que los agentes pueden consultar para generar otros casos.</p></div>
                <button type="button" className="btn btn-navy" id="btnSaveGolden">Revisar y guardar golden →</button>
              </div>
              <div className="golden-dataset-next"><span>1. Revisa los archivos</span><span aria-hidden="true">→</span><span>2. Aprueba la versión</span><span aria-hidden="true">→</span><span>3. Comparte por PR</span></div>
              <details className="golden-dataset-options"><summary>Añadir resultado de ejecución y notas <span>(opcional)</span></summary>
                <div className="golden-dataset-fields">
                  <label className="golden-dataset-field"><span>Resultado en dispositivo</span>
                    <select id="cmbGoldenExecution" className="field-select"><option value="not-run">Todavía no ejecutado</option><option value="passed">Ejecutado correctamente</option><option value="failed">La ejecución falló</option></select>
                  </label>
                  <label className="golden-dataset-field golden-dataset-notes"><span>Notas del QA</span>
                    <input id="txtGoldenNotes" className="field-input" type="text" placeholder="Qué corregiste o verificaste en este caso…" />
                  </label>
                </div>
              </details>
              <div id="lblGoldenStatus" className="wizard-help golden-dataset-status" role="status" />
            </section>
          </section>
        </main>

        <footer className="workflow-wizard-footer">
          <span className="enlazar-hint" id="enlazarHint">Paso 1 de 3 · Revisa las acciones</span>
          <div>
            <button className="btn btn-dark" id="btnWizardBack" disabled>← Atrás</button>
            <button className="btn btn-green" id="btnWizardNext">Continuar →</button>
            <button className="btn btn-green" id="btnConfirmarEscenario" style={{display: 'none'}}>Preparar revisión →</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
