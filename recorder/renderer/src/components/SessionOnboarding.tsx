// @ts-nocheck -- marcado para tipado incremental.
export function SessionOnboarding() {
  return (
    <div id="sessionOnboarding" className="session-onboarding" style={{display: 'none'}}>
      <div className="session-onboarding-card">
        <div className="onboarding-header">
          <div>
            <div className="onboarding-eyebrow">DISPOSITIVO CONECTADO</div>
            <h2>¿Qué quieres hacer?</h2>
          </div>
          <span id="onboardingPlatform" className="onboarding-platform">Android</span>
        </div>
        <p className="onboarding-description">
          Elige cómo iniciar mientras conectamos el dispositivo. La plataforma queda fijada durante esta sesión.
        </p>
        <div className="onboarding-options">
          <button id="btnOnboardingNew" className="onboarding-option">
            <span className="onboarding-option-icon">✨</span>
            <span>
              <strong>Crear un caso nuevo</strong>
              <small>Graba acciones y construye un escenario desde cero.</small>
            </span>
          </button>
          <button id="btnOnboardingExisting" className="onboarding-option">
            <span className="onboarding-option-icon">🎬</span>
            <span>
              <strong>Completar una grabación</strong>
              <small>Selecciona solo los locators faltantes de esta plataforma; no vuelve a generar el caso.</small>
            </span>
          </button>
          <button id="btnOnboardingRegenerate" className="onboarding-option">
            <span className="onboarding-option-icon">♻️</span>
            <span>
              <strong>Regenerar una automatización</strong>
              <small>Refina con el agente un caso ya generado y reemplaza sus cuatro archivos administrados.</small>
            </span>
          </button>
        </div>
        <div id="onboardingExistingFlow" className="onboarding-existing-flow" style={{display: 'none'}}>
          <label className="field-label">Selecciona la grabación:</label>
          <select id="cmbOnboardingScenario" className="field-select">
            <option value>Selecciona una grabación...</option>
          </select>
          <div id="onboardingScenarioHint" className="coverage-summary">
            Se muestran únicamente recordings del ambiente y squad activos. Android/iOS ya capturado se conserva.
          </div>
          <div className="onboarding-actions">
            <button id="btnOnboardingBack" className="btn btn-dark">← Volver</button>
            <button id="btnOnboardingAnalyze" className="btn btn-green">
              Analizar y completar →
            </button>
          </div>
        </div>
        <div id="onboardingRegenerateFlow" className="onboarding-existing-flow" style={{display: 'none'}}>
          <label className="field-label">Selecciona una automatización generada:</label>
          <select id="cmbOnboardingRegeneration" className="field-select">
            <option value>Selecciona una grabación procesada...</option>
          </select>
          <label className="field-label" htmlFor="txtRegenerationRefinement">¿Qué deseas mejorar? (opcional)</label>
          <textarea id="txtRegenerationRefinement" className="field-input" rows={3}
            placeholder="Déjalo vacío para solicitar una revisión general, o indica una mejora específica" />
          <div id="onboardingRegenerationHint" className="coverage-summary">
            Solo aparecen grabaciones validadas al 100% cuyas cuatro capas ya existen en el workspace.
          </div>
          <div className="onboarding-actions">
            <button id="btnOnboardingRegenerateBack" className="btn btn-dark">← Volver</button>
            <button id="btnOnboardingRegeneratePrepare" className="btn btn-green">
              Preparar refinamiento →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
