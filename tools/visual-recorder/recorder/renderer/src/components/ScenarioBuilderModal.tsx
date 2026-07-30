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
            ['1', 'Acciones'],
            ['2', 'Gherkin'],
            ['3', 'Enlaces'],
            ['4', 'Revisión'],
            ['5', 'Generación']
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
              <div><span className="eyebrow">PASO 2</span><h3>Escribe el comportamiento en Gherkin</h3></div>
              <button className="btn btn-blue" id="btnNuevoStep">+ Agregar línea</button>
            </div>
            <div className="impact-legend">
              <span className="impact-safe">● Aislado</span>
              <span className="impact-warning">● Puede impactar otros escenarios</span>
            </div>
            <div id="wizardGherkinHost">
              <div id="scenarioRows" className="scenario-rows wizard-gherkin-rows">
                <div className="scenario-empty-hint">Agrega la primera línea Given, When o Then.</div>
              </div>
            </div>
          </section>

          <section className="wizard-page" data-wizard-page="3">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 3</span><h3>Enlaza cada línea con sus acciones</h3></div>
              <span className="wizard-help">Selecciona una línea y luego una o más acciones.</span>
            </div>
            <div className="wizard-link-layout">
              <div>
                <h4>Acciones disponibles</h4>
                <ul id="wizardLinkActions" className="steps-list wizard-action-list" />
              </div>
              <div>
                <h4>Líneas del escenario</h4>
                <div id="wizardLinkRows" className="scenario-rows" />
              </div>
            </div>
          </section>

          <section className="wizard-page" data-wizard-page="4">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 4</span><h3>Depura la propuesta y revisa los archivos</h3></div>
              <button className="btn btn-purple" id="btnGenerateWithAi">
                ✨ Preparar archivos con Gemini
              </button>
            </div>
            <div id="aiPlanStatus" className="ai-plan-status">
              Gemini propondrá nombres semánticos para las cuatro capas sin modificar tu Gherkin.
            </div>
            <div className="wizard-case-config">
              <div className="input-group">
                <label className="field-label">Feature:</label>
                <input type="text" id="txtFeature" className="field-input" defaultValue="Flujo mobile" />
              </div>
              <div className="input-group">
                <label className="field-label">Scenario:</label>
                <input type="text" id="txtScenario" className="field-input" defaultValue="Escenario grabado" />
              </div>
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
                <label className="field-label">Usuario data (opcional):</label>
                <input type="text" id="txtDataName" className="field-input" placeholder="name usado en Examples" />
              </div>
              <div className="input-group">
                <label className="field-label">Archivo Feature:</label>
                <input type="text" id="txtFeatureFile" className="field-input" defaultValue="flujo-mobile" />
              </div>
              <div className="input-group">
                <label className="field-label">Módulo pantalla/locators:</label>
                <input type="text" id="txtLocatorModule" className="field-input" defaultValue="nueva-pantalla" />
              </div>
            </div>
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
            <div id="lblGenerateResult" className="generate-result" />
            <button className="btn btn-navy" id="btnPreview">↻ Actualizar preview</button>
          </section>

          <section className="wizard-page" data-wizard-page="5">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 5</span><h3>Genera el caso en fwk-mobile-test</h3></div>
            </div>
            <div className="generation-summary">
              <span className="generation-icon">✓</span>
              <div><h3>Todo listo para generar</h3>
                <p id="lblGenerationFileCount">Se escribirán únicamente los archivos mostrados en la revisión.</p></div>
            </div>
            <button className="btn btn-green btn-generate-final" id="btnGenerate">💾 Generar archivos</button>
            <div id="wizardGenerationResult" className="generate-result" />
          </section>
        </main>

        <footer className="workflow-wizard-footer">
          <span className="enlazar-hint" id="enlazarHint">Paso 1 de 5 · Revisa las acciones</span>
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
