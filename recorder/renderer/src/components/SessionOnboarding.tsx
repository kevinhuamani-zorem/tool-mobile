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
        <div id="onboardingNewFlow" className="onboarding-existing-flow" style={{display: 'none'}}>
          <div className="onboarding-form-title">Configura el caso antes de comenzar</div>
          <div className="onboarding-form-grid">
            <div className="input-group">
              <label className="field-label">Feature:</label>
              <input id="onboardingFeature" className="field-input" defaultValue="Flujo mobile" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">Scenario:</label>
              <input id="onboardingScenario" className="field-input" defaultValue="Escenario grabado" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">ID:</label>
              <input id="onboardingCaseId" className="field-input" defaultValue="CP_01" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">Tipo:</label>
              <select id="onboardingPathType" className="field-select">
                <option value="Happy Path">Happy Path</option>
                <option value="Unhappy Path">Unhappy Path</option>
              </select>
            </div>
            <div className="input-group">
              <label className="field-label">Tag:</label>
              <input id="onboardingTag" className="field-input" defaultValue="miflujo" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">Usuario data (opcional):</label>
              <input id="onboardingDataName" className="field-input" placeholder="name usado en Examples" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">Archivo feature:</label>
              <input id="onboardingFeatureFile" className="field-input" defaultValue="flujo-mobile" spellCheck={false} />
            </div>
            <div className="input-group">
              <label className="field-label">Módulo pantalla/locators:</label>
              <input id="onboardingLocatorModule" className="field-input" defaultValue="nueva-pantalla" spellCheck={false} />
            </div>
          </div>
          <div id="onboardingNewHint" className="coverage-summary">
            Estos datos definirán los archivos y el escenario que se generarán.
          </div>
          <div className="onboarding-actions">
            <button id="btnOnboardingNewBack" className="btn btn-dark">← Volver</button>
            <button id="btnOnboardingStartNew" className="btn btn-green">
              Comenzar a grabar →
            </button>
          </div>
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
