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
            ['2', 'Contexto'],
            ['3', 'Agente'],
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
              <div><span className="eyebrow">PASO 2</span><h3>Define el objetivo funcional</h3></div>
              <span className="wizard-help">El resolver construirá el plan; el agente solo resolverá brechas.</span>
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
                <input type="text" id="txtDataName" className="field-input" placeholder="El agente lo marcará como gap si falta" />
              </div>
            </div>
            <div style={{display: 'none'}}>
              <input type="text" id="txtFeature" defaultValue="Flujo mobile" />
              <input type="text" id="txtScenario" defaultValue="Escenario grabado" />
              <input type="text" id="txtFeatureFile" defaultValue="flujo-mobile" />
              <input type="text" id="txtLocatorModule" defaultValue="nueva-pantalla" />
            </div>
            <button id="btnNuevoStep" style={{display: 'none'}} />
            <div id="wizardGherkinHost" style={{display: 'none'}}>
              <div id="scenarioRows" className="scenario-rows wizard-gherkin-rows">
                <div className="scenario-empty-hint" />
              </div>
            </div>
          </section>

          <section className="wizard-page" data-wizard-page="3">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 3</span><h3>Genera la propuesta de automatización</h3></div>
              <span className="wizard-help">Tiempo objetivo: menos de 5 minutos y contexto máximo de 20 KB.</span>
            </div>
            <div className="generation-summary automation-agent-summary">
              <span className="generation-icon">↗</span>
              <div>
                <h3>Preprocesamiento determinista</h3>
                <p>Reutiliza locators de squad/Home, normaliza selectores y prepara solo los gaps.</p>
              </div>
            </div>
            <div className="automation-agent-actions">
              <button className="btn btn-navy" id="btnPrepareAutomation">Preparar paquete mínimo</button>
              <button className="btn btn-dark" id="btnLaunchAutomation" disabled>Abrir Terminal del agente</button>
              <button className="btn btn-blue" id="btnImportAutomation">Importar y validar respuesta</button>
            </div>
            <div id="automationAgentHandoff" className="automation-agent-handoff" style={{display: 'none'}}>
              <div className="automation-agent-handoff-header">
                <div>
                  <strong>Carpeta de trabajo del agente</strong>
                  <code id="automationAgentPath" />
                </div>
                <button className="btn btn-dark" id="btnCopyAgentPrompt">Copiar prompt</button>
              </div>
              <label htmlFor="automationAgentPrompt">Prompt inicial</label>
              <textarea id="automationAgentPrompt" readOnly />
              <small>Abre Copilot o Claude en la Terminal y pega este prompt.</small>
            </div>
            <div id="automationPackageStatus" className="generate-result" />
            <div className="wizard-link-layout" style={{display: 'none'}}>
              <ul id="wizardLinkActions" /><div id="wizardLinkRows" />
            </div>
          </section>

          <section className="wizard-page" data-wizard-page="4">
            <div className="wizard-page-heading">
              <div><span className="eyebrow">PASO 4</span><h3>Depura la propuesta y revisa los archivos</h3></div>
            </div>
            <p className="wizard-help">Los nombres propuestos, el TC y el contenido final se editan directamente en los archivos del preview.</p>
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
            <button className="btn btn-navy" id="btnPreview">↻ Reimportar y validar</button>
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
