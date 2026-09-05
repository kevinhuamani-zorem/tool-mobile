// @ts-nocheck -- marcado para tipado incremental.
export function RecorderWorkspace() {
  return (
    <>
    <header className="header">
      <div className="header-left">
        <span className="logo">📱</span>
        <span className="title">Appium Recorder</span>
        <span id="lblDevice" className="device-badge">Sin dispositivo</span>
      </div>
      <div className="header-right">
        <button className="btn btn-dark-sm" id="btnRefreshScreen">🔄</button>
        <button className="btn btn-blue" id="btnXmlInspector">🔍 Inspector</button>
        <button className="btn btn-red-sm" id="btnCloseSession">⏹ Cerrar</button>
      </div>
    </header>
    <main className="main">
      <section className="panel panel-device">
        <div className="workflow-step">
          <span className="workflow-step-number">1</span>
          <span><strong>Dispositivo</strong><small>Inspecciona o navega la app.</small></span>
        </div>
        <div className="device-screen-container">
          <img id="imgDevice" className="device-screen" src alt style={{display: 'none'}} />
          <div id="devicePlaceholder" className="device-placeholder">Sin captura</div>
        </div>
        <div className="device-mode-actions">
          <button className="btn btn-purple" id="btnInspect">🔍 Inspeccionar</button>
          <button className="btn btn-dark" id="btnInteract">👆 Interactuar</button>
        </div>
        <div id="lblInspectStatus" className="inspect-status">— Presiona y toca en el dispositivo</div>
      </section>
      <section className="panel panel-left panel-element">
        <div className="workflow-step">
          <span className="workflow-step-number">2</span>
          <span><strong>Elemento seleccionado</strong><small>Captura, verifica y define la acción.</small></span>
        </div>
        <div id="assignmentTarget" className="assignment-target" style={{display: 'none'}}>
          <div>
            <span className="assignment-target-label">LOCATOR OBJETIVO</span>
            <strong id="assignmentTargetName" />
            <small id="assignmentTargetPath" />
          </div>
          <div className="assignment-target-actions">
            <button className="btn btn-purple" id="btnOpenAssignmentInspector">
              🔍 Abrir inspector
            </button>
            <button className="btn btn-dark" id="btnCancelAssignment" title="Cancelar asignación">✕</button>
          </div>
        </div>
        <label className="field-label">Selector detectado:</label>
        <div className="input-row">
          <input type="text" id="txtSelector" className="field-input" placeholder="XPath..." />
          <button className="btn btn-dark" id="btnCopy">📋</button>
        </div>
        <label className="field-label" htmlFor="txtElementContext">¿Qué función cumple este elemento?</label>
        <input
          type="text"
          id="txtElementContext"
          className="field-input"
          autoComplete="off"
          placeholder="Ej.: abre el historial donde el usuario consulta sus operaciones"
        />
        <div className="field-help">
          Es una pista de contexto para comprender el elemento. No se copiará como Step ni como nombre fijo del locator.
        </div>
        <div id="locatorCombobox" className="catalog-combobox compatibility-only" aria-hidden="true">
          <input type="hidden" id="txtVarName" />
          <div id="locatorCatalogDropdown" className="catalog-dropdown" role="listbox" />
        </div>
        <div id="lblLocatorCatalog" className="catalog-hint compatibility-only">Cargando locators del squad...</div>
        <div id="locatorCoverage" className="locator-coverage compatibility-only" style={{display: 'none'}}>
          <div className="locator-coverage-title">
            <span id="lblLogicalLocator" />
            <span id="lblActivePlatform" className="platform-pill" />
          </div>
          <div className="locator-coverage-row">
            <span>🤖 Android</span><span id="lblAndroidCoverage" />
          </div>
          <div className="locator-coverage-row">
            <span>🍎 iOS</span><span id="lblIosCoverage" />
          </div>
          <button className="btn btn-green btn-full" id="btnAssignLocator">
            Asignar a plataforma
          </button>
        </div>
        <button className="btn btn-navy btn-full" id="btnVerify">✅ Verificar selector</button>
        <div id="lblVerifyResult" className="verify-result">— Ingresa un selector</div>
        <div className="step-action-editor">
          <div className="guided-divider"><span>Acción del paso</span></div>
          <label className="field-label">¿Qué debe hacer el usuario?</label>
          <select id="cmbAction" className="field-select">
          <option value="ABRIR_APP">📱 ABRIR APP</option>
          <option value="CLICK" selected>👆 CLICK</option>
          <option value="ESCRIBIR">✏️ ESCRIBIR</option>
          <option value="LIMPIAR">🧹 LIMPIAR</option>
          <option value="SCROLL_DOWN">⬇️ SCROLL DOWN</option>
          <option value="SCROLL_UP">⬆️ SCROLL UP</option>
          <option value="SCROLL_HASTA">🔍 SCROLL HASTA</option>
          <option value="SWIPE">👉 SWIPE</option>
          <option value="PRESION_LARGA">👇 PRESION LARGA</option>
          <option value="VERIFICAR_TEXTO">✅ VERIFICAR TEXTO</option>
          <option value="VERIFICAR_EXISTE">👁️ VERIFICAR EXISTE</option>
          <option value="VERIFICAR_NO_EXISTE">🚫 VERIFICAR NO EXISTE</option>
          <option value="VOLVER">◀️ VOLVER</option>
          <option value="ESPERAR">⏳ ESPERAR</option>
          <option value="SCREENSHOT">📸 SCREENSHOT</option>
          </select>
          <label className="field-label">Valor:</label>
          <input type="text" id="txtValue" className="field-input" placeholder="texto, segundos..." />
          <div id="textAssertionEditor" hidden>
            <label className="field-label" htmlFor="cmbTextSource">¿Qué texto se lee?</label>
            <select id="cmbTextSource" className="field-select">
              <option value="element">Texto del elemento seleccionado</option>
              <option value="container">Contenido del contenedor y sus descendientes</option>
            </select>
            <small>El selector debe apuntar al elemento o contenedor elegido. No se buscará un padre automáticamente.</small>
            <label className="field-label" htmlFor="cmbTextOperator">Comparar con el valor esperado</label>
            <select id="cmbTextOperator" className="field-select">
              <option value="contains">Contiene</option>
              <option value="equals">Es igual a (texto completo)</option>
            </select>
            <small>Comparación exacta de caracteres: conserva mayúsculas, tildes y espacios. El contenido une texto propio y descendientes con saltos de línea.</small>
            <button className="btn btn-navy btn-full" id="btnPreviewTextAssertion">Leer y probar sin guardar</button>
            <pre id="textAssertionPreview" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 200, overflow: 'auto' }} aria-live="polite" />
            <button className="btn btn-blue btn-full" id="btnUpdateTextAssertion" hidden>Comprobar y actualizar acción seleccionada</button>
            <button className="btn btn-dark-sm" id="btnCancelTextEdit" hidden>Cancelar edición</button>
          </div>
          <label className="field-label">Descripcion (opcional):</label>
          <input type="text" id="txtDesc" className="field-input" placeholder="describe el step..." />
          <button className="btn btn-green btn-full btn-execute" id="btnExecute">Guardar paso y continuar →</button>
        </div>
      </section>
      <section className="panel panel-right">
        <div className="workflow-step">
          <span className="workflow-step-number">3</span>
          <span><strong>Avance del caso</strong><small>Completa los pasos y revisa al finalizar.</small></span>
        </div>
        <section className="scenario-coverage-panel" id="scenarioCoveragePanel">
          <div className="coverage-panel-title">🎬 Cobertura de la grabación</div>
          <label className="field-label">Grabación:</label>
          <select id="cmbExistingScenario" className="field-select">
            <option value>Selecciona una grabación...</option>
          </select>
          <button className="btn btn-blue btn-full" id="btnAnalyzeScenario">
            Analizar cobertura
          </button>
          <div id="scenarioCoverageSummary" className="coverage-summary">
            Selecciona una grabación para detectar sus locators.
          </div>
          <div id="scenarioLocatorQueue" className="scenario-locator-queue" />
        </section>
        <div className="steps-header">
          <span className="section-title">PASOS DEL ESCENARIO</span>
          <div className="steps-actions">
            <button className="btn btn-dark-sm" id="btnEditTextAssertion" title="Editar fuente y comparación de la verificación de texto seleccionada" disabled>✎ Texto</button>
            <button className="btn btn-dark-sm" id="btnMoveStepUp" title="Subir acción" aria-label="Subir acción seleccionada" disabled>↑</button>
            <button className="btn btn-dark-sm" id="btnMoveStepDown" title="Bajar acción" aria-label="Bajar acción seleccionada" disabled>↓</button>
            <button className="btn btn-red-sm" id="btnDeleteStep" title="Eliminar acción" aria-label="Eliminar acción seleccionada">🗑️</button>
            <button className="btn btn-dark-sm" id="btnClearSteps" title="Limpiar acciones" aria-label="Limpiar todas las acciones">🧹</button>
          </div>
        </div>
        <ul id="lstSteps" className="steps-list">
          <li className="step-empty">Sin steps grabados...</li>
        </ul>
        <button className="btn btn-green btn-full final-review-trigger" id="btnOpenFinalReview">
          Construir Gherkin y finalizar →
        </button>
        <button className="hidden-trigger" id="btnEnlazar" aria-hidden="true" tabIndex={-1}>Abrir constructor</button>
      </section>
    </main>
    </>
  );
}
