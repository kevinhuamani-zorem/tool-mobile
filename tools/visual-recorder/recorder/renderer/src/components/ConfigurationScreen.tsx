// @ts-nocheck -- marcado para tipado incremental.
export function ConfigurationScreen() {
  return (
  <div id="screenConfig" className="screen">
    <div className="config-container">
      <div className="config-header">
        <span className="logo">📱</span>
        <h1>Appium Visual Recorder</h1>
        <p className="subtitle">Configuracion del dispositivo</p>
      </div>
      <div className="config-section framework-section">
        <label className="field-label">Proyecto fwk-mobile-test:</label>
        <div className="framework-grid">
          <div>
            <label className="field-label">Ambiente:</label>
            <select id="cmbFrameworkEnvironment" className="field-select">
              <option value>Cargando ambientes...</option>
            </select>
          </div>
          <div>
            <label className="field-label">Squad:</label>
            <select id="cmbFrameworkSquad" className="field-select">
              <option value>Cargando squads...</option>
            </select>
          </div>
        </div>
        <div id="lblFrameworkStatus" className="device-info">Escaneando framework...</div>
      </div>
      {/* Tab switcher */}
      <div className="config-tabs">
        <button id="tabLocal" className="config-tab active">📱 Local</button>
        <button id="tabBS" className="config-tab">☁️ BrowserStack</button>
        <button id="btnOpenUploadModal" className="config-tab-upload" title="Subir APK a BrowserStack">📤</button>
      </div>
      {/* ── Panel Local ─────────────────────────────── */}
      <div id="localPanel" className="config-body">
        <div className="config-section">
          <label className="field-label">Dispositivo conectado:</label>
          <div className="device-row">
            <select id="cmbDevices" className="field-select" />
            <button className="btn btn-dark" id="btnRefreshDevices">🔄</button>
          </div>
          <div id="lblDeviceInfo" className="device-info" />
        </div>
        <div className="config-section">
          <label className="field-label">Package de la app:</label>
          <div className="input-row">
            <input type="text" id="txtPackage" className="field-input" placeholder="ej: com.example.app" defaultValue="com.yape.qa" />
            <button className="btn btn-dark" id="btnDetectApp">🔍 Detectar</button>
          </div>
          <label className="field-label">Activity principal:</label>
          <input type="text" id="txtActivity" className="field-input" placeholder="ej: .MainActivity" defaultValue="com.yape.activity.MainActivity" />
          <label className="field-label">Version Android:</label>
          <input type="text" id="txtPlatformVersion" className="field-input" defaultValue={16} />
        </div>
        <div className="config-section">
          <label className="field-label">APK (opcional):</label>
          <select id="cmbFrameworkApp" className="field-select">
            <option value>— Seleccionar app del framework —</option>
          </select>
          <input type="text" id="txtApkPath" className="field-input" placeholder="Ruta al .apk" />
        </div>
        <div id="lblConfigStatus" className="config-status" />
        <button className="btn btn-green btn-full btn-start" id="btnStartSession">🚀 INICIAR SESION</button>
      </div>
      {/* ── Panel BrowserStack ──────────────────────── */}
      <div id="bsPanel" className="config-body" style={{display: 'none'}}>
        {/* Credenciales */}
        <div className="config-section">
          <label className="field-label">Credenciales BrowserStack</label>
          <input type="text" id="txtBsUser" className="field-input" placeholder="Username (ej: kevinarnold_xxxx)" />
          <label className="field-label" style={{marginTop: 6}}>Access Key:</label>
          <div className="input-row">
            <input type="password" id="txtBsKey" className="field-input" placeholder="Tu access key..." />
            <button className="btn btn-dark" id="btnBsSaveCreds" title="Guardar credenciales localmente">💾</button>
          </div>
          <div id="lblBsCreds" className="device-info" />
        </div>
        {/* Plataforma */}
        <div className="config-section">
          <label className="field-label">Plataforma:</label>
          <div className="bs-platform-toggle">
            <button id="btnBsPlatformAndroid" className="bs-platform-btn active">🤖 Android</button>
            <button id="btnBsPlatformIos" className="bs-platform-btn">🍎 iOS</button>
          </div>
        </div>
        {/* Dispositivos BS */}
        <div className="config-section">
          <label className="field-label" id="lblBsDevicesTitle">Dispositivo Android en BrowserStack:</label>
          <div className="device-row">
            <select id="cmbBsDevices" className="field-select">
              <option value>— Primero lista los dispositivos —</option>
            </select>
            <button className="btn btn-dark" id="btnBsListDevices" title="Listar dispositivos disponibles">🔍</button>
          </div>
          <div id="lblBsDeviceInfo" className="device-info" />
        </div>
        {/* App */}
        <div className="config-section">
          <label className="field-label" id="lblBsAppsTitle">App en BrowserStack:</label>
          <div className="device-row">
            <select id="cmbBsApps" className="field-select">
              <option value>— Carga tus apps o pega la URL abajo —</option>
            </select>
            <button className="btn btn-dark" id="btnBsListApps" title="Listar apps subidas a tu cuenta">📂</button>
          </div>
          <div id="lblBsAppsInfo" className="device-info" />
          <label className="field-label" style={{marginTop: 6}}>App URL (bs://...) — se auto-llena al elegir arriba:</label>
          <input type="text" id="txtBsAppUrl" className="field-input" placeholder="bs://c8ddcb5649a8280ca800075bfd8f151115bba6b3" />
          {/* Android: Package + Activity */}
          <div id="bsAndroidFields">
            <label className="field-label" style={{marginTop: 6}}>Package de la app:</label>
            <input type="text" id="txtBsPackage" className="field-input" placeholder="com.example.app" defaultValue="com.yape.qa" />
            <label className="field-label" style={{marginTop: 6}}>Activity principal:</label>
            <input type="text" id="txtBsActivity" className="field-input" placeholder=".MainActivity" defaultValue="com.yape.activity.MainActivity" />
          </div>
          {/* iOS: Bundle ID */}
          <div id="bsIosFields" style={{display: 'none'}}>
            <label className="field-label" style={{marginTop: 6}}>Bundle ID:</label>
            <input type="text" id="txtBsBundleId" className="field-input" defaultValue="com.yape.qa" placeholder="com.example.app" />
          </div>
        </div>
        <div id="lblBsStatus" className="config-status" />
        <button className="btn btn-green btn-full btn-start" id="btnBsStartSession">☁️ CONECTAR CON BROWSERSTACK</button>
      </div>
    </div>
    {/* ── Modal: Subir APK a BrowserStack ────────────────── */}
    <div id="uploadModal" className="upload-modal" style={{display: 'none'}}>
      <div className="upload-modal-content">
        <div className="upload-modal-header">
          <span className="section-title">📤 Subir APK a BrowserStack</span>
          <button className="btn btn-dark" id="btnCloseUploadModal">✕</button>
        </div>
        <div className="upload-modal-body">
          <p className="upload-hint">
            El APK / IPA se sube a tu cuenta de BrowserStack y obtienes el URL <code>bs://...</code>
            para usarlo en las sesiones de testing.
          </p>
          <label className="field-label">Custom ID (opcional — para identificar la app):</label>
          <input type="text" id="txtUploadCustomId" className="field-input" placeholder="ej: YapeQA (solo letras, números, guiones)" />
          <div id="uploadDropZone" className="upload-drop-zone">
            <div className="upload-drop-icon">📦</div>
            <div className="upload-drop-text">Haz clic para seleccionar el APK</div>
            <div className="upload-drop-sub">.apk · .aab · .xapk · .ipa</div>
          </div>
          <div id="uploadProgress" className="upload-progress" style={{display: 'none'}}>
            <div className="upload-progress-bar">
              <div id="uploadProgressFill" className="upload-progress-fill" />
            </div>
            <span id="uploadProgressLabel">Subiendo...</span>
          </div>
          <div id="uploadResult" className="upload-result" style={{display: 'none'}}>
            <div id="uploadResultText" className="upload-result-text" />
            <button className="btn btn-green btn-full" id="btnCopyAppUrl" style={{marginTop: 8}}>
              📋 Copiar URL y cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
