// @ts-nocheck -- marcado para tipado incremental.
export function ConfigurationScreen() {
  return (
    <div id="screenConfig" className="screen">
      <div className="connection-shell">
        <header className="connection-header">
          <div className="connection-brand">
            <span className="logo">📱</span>
            <div><h1>Appium Visual Recorder</h1><p>Graba flujos de pruebas visualmente</p></div>
          </div>
          <button id="btnChangeFramework" className="btn btn-dark">⚙️ Ajustes</button>
        </header>

        <main className="connection-main">
          <section className="saved-context">
            <span>📁</span>
            <strong id="lblSavedEnvironment">QA</strong>
            <i>·</i>
            <strong id="lblSavedSquad">payment</strong>
            <i>·</i>
            <strong id="lblWorkspaceName">fwk-mobile-test</strong>
            <span className="saved-context-ok">✓ Usaremos la configuración guardada</span>
            <button id="btnChangeFrameworkInline" className="link-button">Cambiar</button>
          </section>

          <div className="source-cards">
            <button id="tabLocal" className="source-card active">
              <span className="source-radio" /><span className="source-icon">📱</span>
              <strong>Local</strong><small>Conecta un dispositivo físico a tu computadora.</small>
            </button>
            <button id="tabBS" className="source-card">
              <span className="source-radio" /><span className="source-icon">☁️</span>
              <strong>BrowserStack</strong><small>Usa dispositivos reales en la nube.</small>
            </button>
          </div>

          <section id="localPanel" className="connection-panel">
            <div className="device-picker">
              <label className="field-label">Dispositivo disponible</label>
              <div className="device-row">
                <select id="cmbDevices" className="field-select" />
                <button className="btn btn-dark" id="btnRefreshDevices">↻</button>
              </div>
              <div id="lblDeviceInfo" className="device-info" />
            </div>
            <div className="connected-device-card">
              <span className="device-illustration">🤖</span>
              <div className="device-card-main">
                <div><strong id="lblLocalDeviceName">Dispositivo local</strong>
                  <span className="connected-pill">Conectado</span></div>
                <span id="lblLocalPlatform">Android</span>
              </div>
              <div className="device-card-meta"><small>Paquete</small><strong id="lblLocalPackage">com.yape.qa</strong></div>
              <div className="device-card-meta"><small>Aplicación</small><strong>Yape QA</strong></div>
            </div>
            <details id="localAdvanced" className="connection-advanced">
              <summary>Configuración avanzada</summary>
              <div className="connection-advanced-body">
                {/* [visual-recorder] Android pide package + activity; el simulador
                    iOS pide el bundleId de la app ya instalada. */}
                <div id="localAndroidFields">
                  <label className="field-label">Package de la app:</label>
                  <div className="input-row">
                    <input type="text" id="txtPackage" className="field-input" defaultValue="com.yape.qa" />
                    <button className="btn btn-dark" id="btnDetectApp">🔍 Detectar</button>
                  </div>
                  <label className="field-label">Activity principal:</label>
                  <input type="text" id="txtActivity" className="field-input" defaultValue="com.yape.activity.MainActivity" />
                </div>
                <div id="localIosFields" style={{display: 'none'}}>
                  <label className="field-label">Bundle ID de la app (opcional):</label>
                  <input type="text" id="txtBundleId" className="field-input" placeholder="com.yape.qa" />
                  <small className="field-hint">
                    Déjalo vacío para conectar primero y abrir manualmente una app instalada en Simulator.
                  </small>
                </div>
                <label className="field-label" id="lblPlatformVersion">Versión Android:</label>
                <input type="text" id="txtPlatformVersion" className="field-input" defaultValue={16} />
                <label className="field-label" id="lblAppPath">APK opcional:</label>
                <select id="cmbFrameworkApp" className="field-select">
                  <option value>— Seleccionar app del framework —</option>
                </select>
                <div className="input-row">
                  <input type="text" id="txtApkPath" className="field-input" placeholder="Ruta al .apk" />
                  <button className="btn btn-dark" id="btnChooseLocalApp" type="button">📂 Seleccionar</button>
                </div>
                <small id="lblLocalAppHint" className="field-hint" />
              </div>
            </details>
            <div id="lblConfigStatus" className="config-status" />
            <button className="btn btn-green btn-full btn-start" id="btnStartSession">🚀 INICIAR SESIÓN</button>
          </section>

          <section id="bsPanel" className="connection-panel" style={{display: 'none'}}>
            <div className="bs-daily-grid">
              <div>
                <label className="field-label">Plataforma</label>
                <div className="bs-platform-toggle">
                  <button id="btnBsPlatformAndroid" className="bs-platform-btn active">🤖 Android</button>
                  <button id="btnBsPlatformIos" className="bs-platform-btn">🍎 iOS</button>
                </div>
              </div>
              <div>
                <label className="field-label" id="lblBsDevicesTitle">Dispositivo BrowserStack</label>
                <div className="device-row">
                  <select id="cmbBsDevices" className="field-select"><option value>— Lista dispositivos —</option></select>
                  <button className="btn btn-dark" id="btnBsListDevices">🔍</button>
                </div>
                <div id="lblBsDeviceInfo" className="device-info" />
              </div>
              <div>
                <label className="field-label" id="lblBsAppsTitle">Aplicación BrowserStack</label>
                <div className="device-row">
                  <select id="cmbBsApps" className="field-select"><option value>— Lista aplicaciones —</option></select>
                  <button className="btn btn-dark" id="btnBsListApps">📂</button>
                  <button id="btnOpenUploadModal" className="btn btn-dark" title="Subir app">📤</button>
                </div>
                <div id="lblBsAppsInfo" className="device-info" />
              </div>
            </div>
            <details id="bsAdvanced" className="connection-advanced">
              <summary>Credenciales y configuración avanzada</summary>
              <div className="connection-advanced-body">
                <label className="field-label">Username:</label>
                <input type="text" id="txtBsUser" className="field-input" />
                <label className="field-label">Access Key:</label>
                <div className="input-row">
                  <input type="password" id="txtBsKey" className="field-input" />
                  <button className="btn btn-dark" id="btnBsSaveCreds">💾 Guardar</button>
                </div>
                <div id="lblBsCreds" className="device-info" />
                <label className="field-label">App URL:</label>
                <input type="text" id="txtBsAppUrl" className="field-input" placeholder="bs://..." />
                <div id="bsAndroidFields">
                  <label className="field-label">Package:</label>
                  <input type="text" id="txtBsPackage" className="field-input" defaultValue="com.yape.qa" />
                  <label className="field-label">Activity:</label>
                  <input type="text" id="txtBsActivity" className="field-input" defaultValue="com.yape.activity.MainActivity" />
                </div>
                <div id="bsIosFields" style={{display: 'none'}}>
                  <label className="field-label">Bundle ID:</label>
                  <input type="text" id="txtBsBundleId" className="field-input" defaultValue="com.yape.qa" />
                </div>
              </div>
            </details>
            <div id="lblBsStatus" className="config-status" />
            <button className="btn btn-green btn-full btn-start" id="btnBsStartSession">☁️ CONECTAR CON BROWSERSTACK</button>
          </section>
        </main>
      </div>

      <div id="frameworkSetupModal" className="framework-setup-modal" style={{display: 'none'}}>
        <div className="framework-setup-card">
          <span className="setup-once-pill">SOLO LA PRIMERA VEZ</span>
          <div className="setup-icon">📁</div>
          <h2>Configura tu proyecto</h2>
          <p>Selecciona el contexto que usarás para grabar tus pruebas.</p>
          <div id="frameworkEnvironmentField">
            <label className="field-label">Ambiente</label>
            <select id="cmbFrameworkEnvironment" className="field-select"><option value>Cargando ambientes...</option></select>
          </div>
          <label className="field-label">Squad</label>
          <select id="cmbFrameworkSquad" className="field-select"><option value>Cargando squads...</option></select>
          <label className="field-label">Ruta de Features <small>(opcional)</small></label>
          <select id="cmbFrameworkFeatureScope" className="field-select">
            <option value>Todo el squad</option>
          </select>
          <small className="field-help">Solo limita el mapa de Features; Steps, Screen Objects y Locators conservan el squad seleccionado.</small>
          <div className="detected-project">
            <small id="lblDetectedProjectTitle">Proyecto detectado</small>
            <strong id="lblDetectedProject">📁 fwk-mobile-test</strong>
            <span id="lblDetectedProjectPath" />
          </div>
          <label className="remember-config"><input id="chkRememberFramework" type="checkbox" defaultChecked />
            <span>Recordar esta configuración<small>Podrás cambiarla después desde Ajustes.</small></span>
          </label>
          <div id="lblFrameworkStatus" className="device-info">Escaneando framework...</div>
          <button id="btnSaveFrameworkConfig" className="btn btn-green btn-full">Guardar y continuar</button>
        </div>
      </div>

      <div id="uploadModal" className="upload-modal" style={{display: 'none'}}>
        <div className="upload-modal-content">
          <div className="upload-modal-header"><span className="section-title">📤 Subir app a BrowserStack</span>
            <button className="btn btn-dark" id="btnCloseUploadModal">✕</button></div>
          <div className="upload-modal-body">
            <p className="upload-hint">Sube un APK, AAB, XAPK o IPA y usa el URL <code>bs://...</code>.</p>
            <label className="field-label">Custom ID opcional:</label>
            <input type="text" id="txtUploadCustomId" className="field-input" />
            <div id="uploadDropZone" className="upload-drop-zone"><div className="upload-drop-icon">📦</div>
              <div className="upload-drop-text">Haz clic para seleccionar la aplicación</div>
              <div className="upload-drop-sub">.apk · .aab · .xapk · .ipa</div></div>
            <div id="uploadProgress" className="upload-progress" style={{display: 'none'}}>
              <div className="upload-progress-bar"><div id="uploadProgressFill" className="upload-progress-fill" /></div>
              <span id="uploadProgressLabel">Subiendo...</span>
            </div>
            <div id="uploadResult" className="upload-result" style={{display: 'none'}}>
              <div id="uploadResultText" className="upload-result-text" />
              <button className="btn btn-green btn-full" id="btnCopyAppUrl">📋 Copiar URL y cerrar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
