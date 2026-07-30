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
            <span className="onboarding-option-icon">🧭</span>
            <span>
              <strong>Completar un caso existente</strong>
              <small>Detecta y rellena los locators faltantes de esta plataforma.</small>
            </span>
          </button>
        </div>
        <div id="onboardingExistingFlow" className="onboarding-existing-flow" style={{display: 'none'}}>
          <label className="field-label">Selecciona el escenario:</label>
          <select id="cmbOnboardingScenario" className="field-select">
            <option value>Selecciona un escenario...</option>
          </select>
          <div id="onboardingScenarioHint" className="coverage-summary">
            Los escenarios se cargan desde el squad activo.
          </div>
          <div className="onboarding-actions">
            <button id="btnOnboardingBack" className="btn btn-dark">← Volver</button>
            <button id="btnOnboardingAnalyze" className="btn btn-green">
              Analizar y completar →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
