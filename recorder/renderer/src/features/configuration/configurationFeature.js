// [visual-recorder] Feature "configuration": catálogo del framework (ambiente,
// squad, feature scope), configuración de sesión local y BrowserStack, subida
// de apps y arranque/cierre de sesión. Ver docs/ARCHITECTURE.md.
//
// Esta feature es dueña de `state.sessionPlatform`, `state.activeWorkspace`,
// `state.frameworkCatalog` y `state.squadCatalog` (los produce), y de
// `state.sessionReady`/`state.markSessionReady` (el resto de features solo los
// leen para esperar a que la sesión conecte).

import { disableBtn, enableBtn } from '../shared/domHelpers.js';

const FRAMEWORK_PREFERENCES_STORAGE_KEY = 'appiumVisualRecorder.frameworkPreferences.v1';

/**
 * @param {object} deps
 * @param {Window['api']} deps.api
 * @param {object} deps.state
 * @param {(msg: string, color?: string) => void} deps.setStatus
 * @param {(msg: string, type?: string) => void} deps.setConfigStatus
 * @param {(base64: string) => void} deps.updateDeviceScreen dueño: recording.
 * @param {() => void} deps.exitInspectorMode dueño: inspector.
 * @param {() => void} deps.exitInteractionMode dueño: inspector.
 * @param {() => Promise<void>} deps.loadExistingScenarios dueño: platform-completion.
 * @param {() => void} deps.showSessionOnboarding dueño: platform-completion.
 * @param {() => void} deps.onSquadCatalogUpdated notifica que `state.squadCatalog` cambió.
 * @param {() => void} deps.onFeatureScopeOrSquadChanged limpia estado de escenario/asignación al cambiar squad/scope.
 */
export function createConfigurationFeature(deps) {
    const {
        api, state, setStatus, setConfigStatus, updateDeviceScreen,
        exitInspectorMode, exitInteractionMode, loadExistingScenarios, showSessionOnboarding,
        onSquadCatalogUpdated, onFeatureScopeOrSquadChanged,
    } = deps;

    const screenConfig    = document.getElementById('screenConfig');
    const screenRecorder  = document.getElementById('screenRecorder');
    const cmbFrameworkEnv = document.getElementById('cmbFrameworkEnvironment');
    const cmbFrameworkSquad = document.getElementById('cmbFrameworkSquad');
    const cmbFrameworkFeatureScope = document.getElementById('cmbFrameworkFeatureScope');
    const cmbFrameworkApp = document.getElementById('cmbFrameworkApp');
    const lblFrameworkStatus = document.getElementById('lblFrameworkStatus');
    const frameworkSetupModal = document.getElementById('frameworkSetupModal');
    const btnSaveFrameworkConfig = document.getElementById('btnSaveFrameworkConfig');
    const btnChangeFramework = document.getElementById('btnChangeFramework');
    const btnChangeFrameworkInline = document.getElementById('btnChangeFrameworkInline');
    const chkRememberFramework = document.getElementById('chkRememberFramework');
    const lblSavedEnvironment = document.getElementById('lblSavedEnvironment');
    const lblSavedSquad = document.getElementById('lblSavedSquad');
    const frameworkEnvironmentField = document.getElementById('frameworkEnvironmentField');
    const lblDetectedProjectTitle = document.getElementById('lblDetectedProjectTitle');
    const lblDetectedProject = document.getElementById('lblDetectedProject');
    const lblDetectedProjectPath = document.getElementById('lblDetectedProjectPath');

    const localPanel      = document.getElementById('localPanel');
    const cmbDevices      = document.getElementById('cmbDevices');
    const lblDeviceInfo   = document.getElementById('lblDeviceInfo');
    const localAndroidFields = document.getElementById('localAndroidFields');
    const localIosFields     = document.getElementById('localIosFields');
    const txtBundleId        = document.getElementById('txtBundleId');
    const lblPlatformVersion = document.getElementById('lblPlatformVersion');
    const lblAppPath         = document.getElementById('lblAppPath');
    const btnRefreshDev   = document.getElementById('btnRefreshDevices');
    const txtPackage      = document.getElementById('txtPackage');
    const txtActivity     = document.getElementById('txtActivity');
    const txtPlatformV    = document.getElementById('txtPlatformVersion');
    const txtApkPath      = document.getElementById('txtApkPath');
    const btnChooseLocalApp = document.getElementById('btnChooseLocalApp');
    const lblLocalAppHint = document.getElementById('lblLocalAppHint');
    const btnDetectApp    = document.getElementById('btnDetectApp');
    const btnStart        = document.getElementById('btnStartSession');
    const lblConfigSt     = document.getElementById('lblConfigStatus');
    const lblLocalDeviceName = document.getElementById('lblLocalDeviceName');
    const lblLocalPlatform = document.getElementById('lblLocalPlatform');
    const lblLocalPackage = document.getElementById('lblLocalPackage');

    const bsPanel         = document.getElementById('bsPanel');
    const tabLocal        = document.getElementById('tabLocal');
    const tabBS           = document.getElementById('tabBS');
    const txtBsUser       = document.getElementById('txtBsUser');
    const txtBsKey        = document.getElementById('txtBsKey');
    const btnBsSaveCreds  = document.getElementById('btnBsSaveCreds');
    const lblBsCreds      = document.getElementById('lblBsCreds');
    const cmbBsDevices    = document.getElementById('cmbBsDevices');
    const btnBsListDevices= document.getElementById('btnBsListDevices');
    const lblBsDeviceInfo = document.getElementById('lblBsDeviceInfo');
    const cmbBsApps       = document.getElementById('cmbBsApps');
    const btnBsListApps   = document.getElementById('btnBsListApps');
    const lblBsAppsInfo   = document.getElementById('lblBsAppsInfo');
    const txtBsAppUrl     = document.getElementById('txtBsAppUrl');
    const txtBsPackage       = document.getElementById('txtBsPackage');
    const txtBsActivity      = document.getElementById('txtBsActivity');
    const txtBsBundleId      = document.getElementById('txtBsBundleId');
    const bsAndroidFields    = document.getElementById('bsAndroidFields');
    const bsIosFields        = document.getElementById('bsIosFields');
    const lblBsDevicesTitle  = document.getElementById('lblBsDevicesTitle');
    const lblBsAppsTitle     = document.getElementById('lblBsAppsTitle');
    const btnBsPlatAndroid   = document.getElementById('btnBsPlatformAndroid');
    const btnBsPlatIos       = document.getElementById('btnBsPlatformIos');
    const lblBsStatus        = document.getElementById('lblBsStatus');
    const btnBsStart         = document.getElementById('btnBsStartSession');

    const uploadModal         = document.getElementById('uploadModal');
    const btnOpenUploadModal  = document.getElementById('btnOpenUploadModal');
    const btnCloseUploadModal = document.getElementById('btnCloseUploadModal');
    const txtUploadCustomId   = document.getElementById('txtUploadCustomId');
    const uploadDropZone      = document.getElementById('uploadDropZone');
    const uploadProgress      = document.getElementById('uploadProgress');
    const uploadProgressFill  = document.getElementById('uploadProgressFill');
    const uploadProgressLabel = document.getElementById('uploadProgressLabel');
    const uploadResult        = document.getElementById('uploadResult');
    const uploadResultText    = document.getElementById('uploadResultText');
    const btnCopyAppUrl       = document.getElementById('btnCopyAppUrl');

    const lblDevice       = document.getElementById('lblDevice');
    const btnRefreshScr   = document.getElementById('btnRefreshScreen');
    const btnCloseSession = document.getElementById('btnCloseSession');
    const imgDevice       = document.getElementById('imgDevice');
    const devicePH        = document.getElementById('devicePlaceholder');
    const sessionOnboarding = document.getElementById('sessionOnboarding');

    let bsPlatform = 'android'; // 'android' | 'ios'
    let currentUdid = '';
    let lastUploadedUrl = '';

    const bound = [];
    function on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        bound.push({ target, type, handler, options });
    }

    function readFrameworkPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem(FRAMEWORK_PREFERENCES_STORAGE_KEY) || 'null');
            return stored &&
                stored.mode === state.activeWorkspace.mode &&
                typeof stored.environment === 'string' &&
                typeof stored.squad === 'string'
                ? stored
                : null;
        } catch {
            return null;
        }
    }

    function updateSavedFrameworkSummary() {
        if (lblSavedEnvironment) lblSavedEnvironment.textContent =
            state.activeWorkspace.mode === 'fwk-mobile'
                ? (cmbFrameworkEnv.value || 'Sin ambiente').toUpperCase()
                : state.activeWorkspace.label;
        if (lblSavedSquad) lblSavedSquad.textContent = [
            cmbFrameworkSquad.value || 'default',
            cmbFrameworkFeatureScope?.value || ''
        ].filter(Boolean).join('/');
    }

    function openFrameworkSetup() {
        frameworkSetupModal.style.display = 'flex';
    }

    function closeFrameworkSetup() {
        frameworkSetupModal.style.display = 'none';
        updateSavedFrameworkSummary();
    }

    /** Plataforma del dispositivo elegido; el listado la trae en `data-platform`. */
    function selectedLocalPlatform() {
        return cmbDevices.options[cmbDevices.selectedIndex]?.dataset?.platform === 'ios'
            ? 'ios' : 'android';
    }

    function syncLocalPlatformFields() {
        const ios = selectedLocalPlatform() === 'ios';
        if (localAndroidFields) localAndroidFields.style.display = ios ? 'none' : '';
        if (localIosFields) localIosFields.style.display = ios ? '' : 'none';
        if (lblPlatformVersion) lblPlatformVersion.textContent = ios ? 'Versión iOS:' : 'Versión Android:';
        if (lblAppPath) lblAppPath.textContent = ios ? 'Aplicación iOS opcional:' : 'APK opcional:';
        if (txtApkPath) txtApkPath.placeholder = ios ? 'Ruta al .app o .ipa' : 'Ruta al .apk';
        if (lblLocalAppHint && !txtApkPath?.value) lblLocalAppHint.textContent = '';
    }

    function syncLocalDeviceSummary() {
        syncLocalPlatformFields();
        const selected = cmbDevices.options[cmbDevices.selectedIndex];
        if (lblLocalDeviceName) {
            lblLocalDeviceName.textContent = selected?.textContent?.replace(/\s+\((?:Android|iOS).*$/, '') ||
                'Dispositivo local';
        }
        if (lblLocalPlatform) {
            const match = selected?.textContent?.match(/\(((?:Android|iOS)[^)]*)\)/);
            const etiqueta = selectedLocalPlatform() === 'ios' ? 'iOS' : 'Android';
            lblLocalPlatform.textContent = match?.[1] || `${etiqueta} ${txtPlatformV.value || ''}`.trim();
        }
        if (lblLocalPackage) {
            const identificador = selectedLocalPlatform() === 'ios'
                ? (txtBundleId?.value || '').trim()
                : txtPackage.value.trim();
            lblLocalPackage.textContent = identificador || 'Sin paquete';
        }
    }

    async function loadFrameworkCatalog() {
        if (!api.scanFramework) return;
        const result = await api.scanFramework();

        if (!result.success) {
            lblFrameworkStatus.textContent = '✗ ' + result.error;
            lblFrameworkStatus.className = 'device-info err';
            return;
        }

        const catalog = result.catalog;
        state.frameworkCatalog = catalog;
        state.activeWorkspace = catalog.workspace || state.activeWorkspace;
        const workspaceName = document.getElementById('lblWorkspaceName');
        if (workspaceName && catalog.workspace) {
            workspaceName.textContent = catalog.workspace.label;
            workspaceName.title = catalog.workspace.root;
        }
        const requiresEnvironment = state.activeWorkspace.mode === 'fwk-mobile';
        if (frameworkEnvironmentField) {
            frameworkEnvironmentField.style.display = requiresEnvironment ? '' : 'none';
        }
        if (lblDetectedProjectTitle) {
            lblDetectedProjectTitle.textContent = state.activeWorkspace.integrated
                ? 'Proyecto integrado detectado'
                : 'Workspace de salida';
        }
        if (lblDetectedProject) {
            lblDetectedProject.textContent = `📁 ${state.activeWorkspace.label}`;
        }
        if (lblDetectedProjectPath) {
            lblDetectedProjectPath.textContent = state.activeWorkspace.root || '';
            lblDetectedProjectPath.title = state.activeWorkspace.root || '';
        }
        cmbFrameworkEnv.innerHTML = '';
        catalog.environments.forEach(environment => {
            const option = document.createElement('option');
            const missing = environment.variables.filter(variable => !variable.configured).length;
            option.value = environment.name;
            option.textContent = environment.name.toUpperCase() +
                ` (${environment.variables.length} variables${missing ? `, ${missing} vacías` : ''})`;
            cmbFrameworkEnv.appendChild(option);
        });
        if (catalog.environments.length === 0) {
            cmbFrameworkEnv.innerHTML = '<option value="">Sin ambientes</option>';
        }

        cmbFrameworkSquad.innerHTML = '';
        if (!state.activeWorkspace.integrated) {
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.textContent = 'default';
            cmbFrameworkSquad.appendChild(defaultOption);
        }
        catalog.squads.forEach(squad => {
            if ([...cmbFrameworkSquad.options].some(option => option.value === squad.name)) return;
            const option = document.createElement('option');
            option.value = squad.name;
            option.textContent = squad.name;
            option.dataset.layers = JSON.stringify(squad.layers);
            cmbFrameworkSquad.appendChild(option);
        });
        if (cmbFrameworkSquad.options.length === 0) {
            cmbFrameworkSquad.innerHTML = '<option value="">Sin squads</option>';
        } else {
            const availableSquads = [...cmbFrameworkSquad.options].map(option => option.value);
            const defaultSquad = availableSquads.includes('payment')
                ? 'payment'
                : availableSquads.includes('default')
                    ? 'default'
                    : availableSquads[0];
            cmbFrameworkSquad.value = defaultSquad;
        }

        const savedPreferences = readFrameworkPreferences();
        const hasSavedEnvironment = !requiresEnvironment || Boolean(savedPreferences &&
            [...cmbFrameworkEnv.options].some(option => option.value === savedPreferences.environment));
        const hasSavedSquad = savedPreferences &&
            [...cmbFrameworkSquad.options].some(option => option.value === savedPreferences.squad);
        if (hasSavedEnvironment) cmbFrameworkEnv.value = savedPreferences.environment;
        if (hasSavedSquad) cmbFrameworkSquad.value = savedPreferences.squad;
        updateFeatureScopeOptions(savedPreferences?.featureScope || '');

        cmbFrameworkApp.innerHTML = '<option value="">— Seleccionar app del framework —</option>';
        catalog.apps.forEach(app => {
            const option = document.createElement('option');
            option.value = app.absolutePath;
            option.textContent = app.relativePath;
            cmbFrameworkApp.appendChild(option);
        });

        const totals = catalog.totals;
        lblFrameworkStatus.textContent =
            `✓ ${catalog.environments.length} ambientes · ${catalog.squads.length} squads · ` +
            `${catalog.apps.length} apps · ${catalog.dataSets.length} datasets · ` +
            `${totals.features} features · ${catalog.reusable.stepDefinitions} definiciones indexadas · ` +
            `${catalog.reusable.screenMethods} métodos disponibles`;
        lblFrameworkStatus.className = 'device-info ok';
        updateSavedFrameworkSummary();
        if (hasSavedEnvironment && hasSavedSquad) closeFrameworkSetup();
        else openFrameworkSetup();
        await loadSquadCatalog();
        await loadExistingScenarios();
    }

    async function loadSquadCatalog(platform = state.sessionPlatform) {
        const squad = cmbFrameworkSquad.value || 'payment';
        if (!api.getSquadCatalog || !squad) return;
        const result = await api.getSquadCatalog(squad, platform, cmbFrameworkFeatureScope?.value || '');
        if (!result.success) {
            state.squadCatalog = { stepDefinitions: [], screenMethods: [], locators: [], features: [] };
            onSquadCatalogUpdated(result.error);
            return;
        }
        state.squadCatalog = result.catalog;
        onSquadCatalogUpdated();
    }

    function updateFeatureScopeOptions(preferred = '') {
        if (!cmbFrameworkFeatureScope) return;
        const squad = state.frameworkCatalog?.squads?.find(item => item.name === cmbFrameworkSquad.value);
        const scopes = squad?.featureScopes || [];
        cmbFrameworkFeatureScope.innerHTML = '<option value="">Todo el squad</option>';
        scopes.filter(scope => scope.path).forEach(scope => {
            const option = document.createElement('option');
            option.value = scope.path;
            option.textContent = `${scope.path} (${scope.featureCount} feature${scope.featureCount === 1 ? '' : 's'})`;
            cmbFrameworkFeatureScope.appendChild(option);
        });
        if ([...cmbFrameworkFeatureScope.options].some(option => option.value === preferred)) {
            cmbFrameworkFeatureScope.value = preferred;
        }
    }

    function setRecorderConnecting(connecting) {
        deps.setRecorderConnecting(connecting);
    }

    async function loadDevices() {
        lblDeviceInfo.textContent = 'Buscando...';
        const result = await api.getDevices();
        cmbDevices.innerHTML = '';
        if (!result.devices || result.devices.length === 0) {
            cmbDevices.innerHTML = '<option value="">Sin dispositivos</option>';
            lblDeviceInfo.textContent = 'Conecta un dispositivo via USB';
            return;
        }
        result.devices.forEach(d => {
            const opt = document.createElement('option');
            const ios = d.platform === 'ios';
            opt.value = d.udid;
            opt.dataset.platform = ios ? 'ios' : 'android';
            opt.dataset.version = d.version || '';
            const estado = ios && d.status !== 'booted' ? ' · apagado' : '';
            opt.textContent = (d.model || d.udid) +
                ' (' + (ios ? 'iOS ' : 'Android ') + (d.version || '?') + estado + ')';
            cmbDevices.appendChild(opt);
        });
        currentUdid = result.devices[0].udid;
        txtPlatformV.value = result.devices[0].version || txtPlatformV.value;
        lblDeviceInfo.textContent = '✓ ' + result.devices.length + ' dispositivo(s)';
        lblDeviceInfo.className = 'device-info ok';
        syncLocalDeviceSummary();
    }

    async function loadBsCredentials() {
        const r = await api.bsLoadCredentials();
        if (r.username) txtBsUser.value = r.username;
        if (r.accessKey) txtBsKey.value = r.accessKey;
        if (r.username && r.accessKey) {
            lblBsCreds.textContent = '✓ Credenciales guardadas y cargadas';
        } else {
            document.getElementById('bsAdvanced').open = true;
            lblBsCreds.textContent = 'Configura tus credenciales una sola vez.';
        }
    }

    function switchTab(mode) {
        if (mode === 'local') {
            // La local ya no es Android por definición: la fija el dispositivo elegido.
            state.sessionPlatform = selectedLocalPlatform();
            tabLocal.classList.add('active');
            tabBS.classList.remove('active');
            localPanel.style.display = 'flex';
            bsPanel.style.display    = 'none';
        } else {
            state.sessionPlatform = bsPlatform;
            tabBS.classList.add('active');
            tabLocal.classList.remove('active');
            bsPanel.style.display    = 'flex';
            localPanel.style.display = 'none';
        }
    }

    function switchBsPlatform(platform) {
        bsPlatform = platform;
        state.sessionPlatform = platform;
        const isIos = platform === 'ios';

        btnBsPlatAndroid.classList.toggle('active', !isIos);
        btnBsPlatIos.classList.toggle('active',  isIos);

        bsAndroidFields.style.display = isIos ? 'none' : 'block';
        bsIosFields.style.display     = isIos ? 'block' : 'none';

        if (lblBsDevicesTitle) lblBsDevicesTitle.textContent =
            isIos ? 'Dispositivo iOS en BrowserStack:' : 'Dispositivo Android en BrowserStack:';
        if (lblBsAppsTitle) lblBsAppsTitle.textContent =
            isIos ? 'App iOS en BrowserStack:' : 'App Android en BrowserStack:';

        // Limpiar dispositivos y apps al cambiar plataforma (lista es diferente)
        cmbBsDevices.innerHTML = '<option value="">— Primero lista los dispositivos —</option>';
        cmbBsApps.innerHTML    = '<option value="">— Carga tus apps o pega la URL abajo —</option>';
        if (lblBsDeviceInfo) { lblBsDeviceInfo.textContent = ''; }
        if (lblBsAppsInfo)   { lblBsAppsInfo.textContent   = ''; }
        loadSquadCatalog(platform);
    }

    function openUploadModal() {
        uploadProgress.style.display    = 'none';
        uploadResult.style.display      = 'none';
        uploadDropZone.style.display    = 'flex';
        uploadProgressFill.style.width  = '0%';
        uploadProgressLabel.textContent = 'Subiendo...';
        uploadResultText.textContent    = '';
        uploadResultText.className      = 'upload-result-text';
        lastUploadedUrl                 = '';
        uploadModal.style.display       = 'flex';
    }

    function closeUploadModal() {
        uploadModal.style.display = 'none';
    }

    async function startUpload() {
        const u = txtBsUser.value.trim();
        const k = txtBsKey.value.trim();
        if (!u || !k) {
            uploadResultText.textContent  = '⚠ Primero ingresa tus credenciales de BrowserStack en el panel.';
            uploadResultText.className    = 'upload-result-text err';
            uploadResult.style.display    = 'block';
            uploadDropZone.style.display  = 'none';
            return;
        }

        const customId = txtUploadCustomId.value.trim();

        uploadDropZone.style.display   = 'none';
        uploadResult.style.display     = 'none';
        uploadProgress.style.display   = 'flex';
        uploadProgressLabel.textContent = 'Abriendo selector de archivo...';
        uploadProgressFill.style.width  = '10%';

        let pct = 10;
        const progressTimer = setInterval(() => {
            if (pct < 85) { pct += 3; uploadProgressFill.style.width = pct + '%'; }
        }, 600);

        uploadProgressLabel.textContent = 'Subiendo a BrowserStack...';

        const r = await api.bsUploadApp(u, k, customId, bsPlatform);
        clearInterval(progressTimer);

        uploadProgress.style.display  = 'none';
        uploadResult.style.display    = 'block';

        if (r.canceled) {
            uploadResult.style.display   = 'none';
            uploadDropZone.style.display = 'flex';
            return;
        }

        if (r.success) {
            lastUploadedUrl = r.appUrl;
            uploadProgressFill.style.width = '100%';
            uploadResultText.className = 'upload-result-text ok';
            uploadResultText.innerHTML =
                `✓ <strong>${r.filename}</strong> (${r.sizeMB} MB) subido correctamente.<br/>` +
                `<br/>App URL:<br/><code style="font-size:11px;word-break:break-all">${r.appUrl}</code>` +
                (r.customId ? `<br/>Custom ID: <code>${r.customId}</code>` : '');
            btnCopyAppUrl.style.display = 'block';
        } else {
            uploadResultText.className   = 'upload-result-text err';
            uploadResultText.textContent = '✗ ' + r.error;
            btnCopyAppUrl.style.display  = 'none';
            setTimeout(() => {
                uploadDropZone.style.display = 'flex';
                uploadResult.style.display   = 'none';
            }, 3000);
        }
    }

    function mount() {
        on(cmbFrameworkSquad, 'change', () => {
            updateFeatureScopeOptions();
            onFeatureScopeOrSquadChanged();
            loadSquadCatalog(state.sessionPlatform);
            loadExistingScenarios();
            updateSavedFrameworkSummary();
        });
        on(cmbFrameworkFeatureScope, 'change', () => {
            state.linkedScenarioData = null;
            state.activeScenarioCoverage = null;
            loadSquadCatalog(state.sessionPlatform);
            updateSavedFrameworkSummary();
        });
        on(cmbFrameworkEnv, 'change', updateSavedFrameworkSummary);

        on(btnSaveFrameworkConfig, 'click', async () => {
            const requiresEnvironment = state.activeWorkspace.mode === 'fwk-mobile';
            if ((requiresEnvironment && !cmbFrameworkEnv.value) || !cmbFrameworkSquad.value) {
                lblFrameworkStatus.textContent = requiresEnvironment
                    ? '⚠ Selecciona ambiente y squad'
                    : '⚠ Selecciona un squad de salida';
                lblFrameworkStatus.className = 'device-info err';
                return;
            }
            if (chkRememberFramework.checked) {
                localStorage.setItem(FRAMEWORK_PREFERENCES_STORAGE_KEY, JSON.stringify({
                    mode: state.activeWorkspace.mode,
                    environment: cmbFrameworkEnv.value,
                    squad: cmbFrameworkSquad.value,
                    featureScope: cmbFrameworkFeatureScope?.value || '',
                    savedAt: new Date().toISOString()
                }));
            } else {
                localStorage.removeItem(FRAMEWORK_PREFERENCES_STORAGE_KEY);
            }
            state.linkedScenarioData = null;
            state.activeScenarioCoverage = null;
            await Promise.all([loadSquadCatalog(state.sessionPlatform), loadExistingScenarios()]);
            closeFrameworkSetup();
        });

        const showFrameworkSetup = () => {
            chkRememberFramework.checked = Boolean(readFrameworkPreferences());
            openFrameworkSetup();
        };
        on(btnChangeFramework, 'click', showFrameworkSetup);
        on(btnChangeFrameworkInline, 'click', showFrameworkSetup);

        on(cmbFrameworkApp, 'change', () => {
            if (!cmbFrameworkApp.value) return;
            txtApkPath.value = cmbFrameworkApp.value;
            if (lblLocalAppHint) {
                lblLocalAppHint.textContent = selectedLocalPlatform() === 'ios' && /\.ipa$/i.test(txtApkPath.value)
                    ? '⚠ Un .ipa de dispositivo no funciona en Simulator; debe contener una build compatible con iOS Simulator.'
                    : `✓ ${cmbFrameworkApp.options[cmbFrameworkApp.selectedIndex]?.textContent || 'Aplicación seleccionada'}`;
            }
        });

        on(tabLocal, 'click', () => switchTab('local'));
        on(tabBS, 'click', () => switchTab('bs'));
        on(btnBsPlatAndroid, 'click', () => switchBsPlatform('android'));
        on(btnBsPlatIos, 'click', () => switchBsPlatform('ios'));

        on(btnOpenUploadModal, 'click', () => {
            switchTab('bs'); // asegurar que el tab BS está activo
            openUploadModal();
        });
        on(btnCloseUploadModal, 'click', closeUploadModal);
        on(uploadModal, 'click', e => { if (e.target === uploadModal) closeUploadModal(); });
        on(uploadDropZone, 'dragover', e => {
            e.preventDefault();
            uploadDropZone.classList.add('dragging');
        });
        on(uploadDropZone, 'dragleave', () => uploadDropZone.classList.remove('dragging'));
        on(uploadDropZone, 'drop', e => {
            e.preventDefault();
            uploadDropZone.classList.remove('dragging');
            startUpload();
        });
        on(uploadDropZone, 'click', startUpload);

        on(btnCopyAppUrl, 'click', () => {
            if (!lastUploadedUrl) return;
            txtBsAppUrl.value = lastUploadedUrl;
            const u = txtBsUser.value.trim();
            const k = txtBsKey.value.trim();
            if (u && k) {
                api.bsGetApps(u, k, bsPlatform).then(r => {
                    const appExt = bsPlatform === 'ios' ? 'IPA' : 'APK';
                    if (r.success && Array.isArray(r.apps)) {
                        cmbBsApps.innerHTML = `<option value="">— Elige un ${appExt} —</option>`;
                        r.apps.forEach(a => {
                            const opt = document.createElement('option');
                            opt.value = a.app_url;
                            opt.textContent = a.app_name + (a.app_version ? ' v' + a.app_version : '');
                            if (a.app_url === lastUploadedUrl) opt.selected = true;
                            cmbBsApps.appendChild(opt);
                        });
                        lblBsAppsInfo.textContent = '✓ ' + r.apps.length + ` ${appExt}(s)`;
                        lblBsAppsInfo.style.color = '#00CC00';
                    }
                });
            }
            closeUploadModal();
            setConfigStatus && setConfigStatus('✓ App URL cargada: ' + lastUploadedUrl.slice(0, 30) + '...', 'ok');
        });

        on(btnBsSaveCreds, 'click', async () => {
            const u = txtBsUser.value.trim();
            const k = txtBsKey.value.trim();
            if (!u || !k) { lblBsCreds.textContent = '⚠ Completa usuario y key'; return; }
            const r = await api.bsSaveCredentials(u, k);
            lblBsCreds.textContent = r.success ? '✓ Guardadas correctamente' : ('✗ ' + r.error);
            lblBsCreds.style.color = r.success ? '#00CC00' : '#CC0000';
        });

        on(btnBsListDevices, 'click', async () => {
            const u = txtBsUser.value.trim();
            const k = txtBsKey.value.trim();
            if (!u || !k) {
                lblBsDeviceInfo.textContent = '⚠ Ingresa usuario y access key primero';
                return;
            }
            lblBsDeviceInfo.textContent = '⏳ Consultando API de BrowserStack...';
            disableBtn(btnBsListDevices, '⏳');

            const r = await api.bsGetDevices(u, k, bsPlatform);
            enableBtn(btnBsListDevices);

            if (!r.success) {
                lblBsDeviceInfo.textContent = '✗ ' + r.error;
                lblBsDeviceInfo.style.color = '#CC0000';
                return;
            }

            const platLabel = bsPlatform === 'ios' ? 'iOS' : 'Android';
            cmbBsDevices.innerHTML = '';
            if (r.devices.length === 0) {
                cmbBsDevices.innerHTML = `<option value="">Sin dispositivos ${platLabel} disponibles</option>`;
                lblBsDeviceInfo.textContent = `⚠ 0 dispositivos ${platLabel} (total: ` + (r.total || 0) + ') — revisa logs del terminal';
                lblBsDeviceInfo.style.color = '#FF9900';
                return;
            }
            r.devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ deviceName: d.device, platformVersion: d.os_version });
                opt.textContent = d.device + ' (' + platLabel + ' ' + d.os_version + ')';
                cmbBsDevices.appendChild(opt);
            });
            lblBsDeviceInfo.textContent = '✓ ' + r.devices.length + ` dispositivos ${platLabel}`;
            lblBsDeviceInfo.style.color = '#00CC00';
        });

        on(btnBsListApps, 'click', async () => {
            const u = txtBsUser.value.trim();
            const k = txtBsKey.value.trim();
            if (!u || !k) {
                lblBsAppsInfo.textContent = '⚠ Ingresa credenciales primero';
                return;
            }
            lblBsAppsInfo.textContent = '⏳ Cargando apps subidas...';
            disableBtn(btnBsListApps, '⏳');

            const r = await api.bsGetApps(u, k, bsPlatform);
            enableBtn(btnBsListApps);

            const appExt = bsPlatform === 'ios' ? 'IPA' : 'APK';
            if (!r.success) {
                lblBsAppsInfo.textContent = '✗ ' + r.error;
                lblBsAppsInfo.style.color = '#CC0000';
                return;
            }
            if (r.apps.length === 0) {
                lblBsAppsInfo.textContent = `⚠ No hay ${appExt}s subidos en los últimos 30 días`;
                lblBsAppsInfo.style.color = '#FF9900';
                return;
            }

            cmbBsApps.innerHTML = `<option value="">— Elige un ${appExt} —</option>`;
            r.apps.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.app_url;
                const date = a.uploaded_at ? ' · ' + a.uploaded_at.slice(0, 10) : '';
                opt.textContent = a.app_name + (a.app_version ? ' v' + a.app_version : '') + date;
                cmbBsApps.appendChild(opt);
            });
            lblBsAppsInfo.textContent = '✓ ' + r.apps.length + ` ${appExt}(s) disponibles`;
            lblBsAppsInfo.style.color = '#00CC00';
        });

        on(cmbBsApps, 'change', () => {
            if (cmbBsApps.value) {
                txtBsAppUrl.value = cmbBsApps.value;
            }
        });

        on(btnBsStart, 'click', async () => {
            const u       = txtBsUser.value.trim();
            const k       = txtBsKey.value.trim();
            const app_url = txtBsAppUrl.value.trim();
            const isIos   = bsPlatform === 'ios';

            if (!u || !k) { lblBsStatus.textContent = '⚠ Ingresa credenciales'; lblBsStatus.className = 'config-status err'; return; }
            if (!cmbBsDevices.value || cmbBsDevices.value === '') {
                lblBsStatus.textContent = '⚠ Lista y elige un dispositivo';
                lblBsStatus.className = 'config-status err'; return;
            }

            if (isIos) {
                const bid = txtBsBundleId ? txtBsBundleId.value.trim() : '';
                if (!app_url && !bid) {
                    lblBsStatus.textContent = '⚠ Ingresa el Bundle ID o la App URL';
                    lblBsStatus.className = 'config-status err'; return;
                }
            } else {
                const pkg = txtBsPackage ? txtBsPackage.value.trim() : '';
                if (!pkg) { lblBsStatus.textContent = '⚠ Ingresa el package'; lblBsStatus.className = 'config-status err'; return; }
            }

            const deviceData    = JSON.parse(cmbBsDevices.value);
            const deviceLabel   = cmbBsDevices.options[cmbBsDevices.selectedIndex].text;

            screenConfig.style.cssText   = 'display:none !important';
            screenRecorder.style.cssText = 'display:flex !important; flex-direction:column';
            lblDevice.textContent        = '☁️ ' + deviceLabel + ' — conectando...';
            setStatus('🔄 Conectando con BrowserStack...', '#FF6600');
            state.resetSessionReady();
            setRecorderConnecting(true);
            state.sessionPlatform = bsPlatform;
            await loadExistingScenarios();
            showSessionOnboarding();

            await new Promise(r => setTimeout(r, 50));

            const config = {
                platform:        bsPlatform,
                squad:           cmbFrameworkSquad.value || 'payment',
                featureScope:     cmbFrameworkFeatureScope?.value || '',
                environment:     cmbFrameworkEnv.value,
                username:        u,
                accessKey:       k,
                deviceName:      deviceData.deviceName,
                platformVersion: deviceData.platformVersion,
                appUrl:          app_url,
                appPackage:      txtBsPackage  ? txtBsPackage.value.trim()  : '',
                appActivity:     txtBsActivity ? txtBsActivity.value.trim() : '.MainActivity',
                bundleId:        txtBsBundleId ? txtBsBundleId.value.trim() : '',
                projectName:     'Appium Visual Recorder',
            };

            try {
                const result = await api.bsStartSession(config);
                if (result.success) {
                    state.markSessionReady();
                    setRecorderConnecting(false);
                    state.sessionPlatform = bsPlatform;
                    cmbFrameworkSquad.disabled = true;
                    if (cmbFrameworkFeatureScope) cmbFrameworkFeatureScope.disabled = true;
                    lblDevice.textContent = '☁️ ' + deviceLabel;
                    setStatus('✓ Sesion BrowserStack — ' + deviceLabel, '#00CC00');
                    if (result.screenshot) updateDeviceScreen(result.screenshot);
                    await loadSquadCatalog(state.sessionPlatform);
                } else {
                    setRecorderConnecting(false);
                    sessionOnboarding.style.display = 'none';
                    screenRecorder.style.cssText = 'display:none !important';
                    screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                    switchTab('bs');
                    lblBsStatus.textContent = '✗ ' + result.error;
                    lblBsStatus.className   = 'config-status err';
                }
            } catch (e) {
                setRecorderConnecting(false);
                sessionOnboarding.style.display = 'none';
                screenRecorder.style.cssText = 'display:none !important';
                screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                switchTab('bs');
                lblBsStatus.textContent = '✗ Error: ' + e.message;
                lblBsStatus.className   = 'config-status err';
            }
        });

        on(cmbDevices, 'change', () => {
            currentUdid = cmbDevices.value;
            const option = cmbDevices.options[cmbDevices.selectedIndex];
            if (option?.dataset?.version) txtPlatformV.value = option.dataset.version;
            syncLocalDeviceSummary();
        });
        on(txtPackage, 'input', syncLocalDeviceSummary);
        on(txtPlatformV, 'input', syncLocalDeviceSummary);
        on(btnRefreshDev, 'click', loadDevices);

        on(btnChooseLocalApp, 'click', async () => {
            disableBtn(btnChooseLocalApp, '⏳');
            const result = await api.selectLocalApp(selectedLocalPlatform());
            enableBtn(btnChooseLocalApp);
            if (result?.canceled) return;
            if (!result?.success) {
                setConfigStatus('✗ ' + (result?.error || 'No se pudo seleccionar la aplicación'), 'err');
                return;
            }
            txtApkPath.value = result.path;
            if (lblLocalAppHint) {
                lblLocalAppHint.textContent = result.simulatorWarning
                    ? '⚠ Un .ipa de dispositivo no funciona en Simulator; debe contener una build compatible con iOS Simulator.'
                    : `✓ ${result.filename}`;
            }
            setConfigStatus('✓ Aplicación seleccionada: ' + result.filename, 'ok');
        });

        on(btnDetectApp, 'click', async () => {
            if (!currentUdid) return;
            disableBtn(btnDetectApp, '⏳');
            const app = await api.getForegroundApp(currentUdid);
            enableBtn(btnDetectApp);
            if (app.package) {
                txtPackage.value  = app.package;
                txtActivity.value = app.activity;
                syncLocalDeviceSummary();
                setConfigStatus('✓ App: ' + app.package, 'ok');
            } else {
                setConfigStatus('⚠ No se detecto app', 'err');
            }
        });

        on(btnStart, 'click', async () => {
            const udid    = cmbDevices.value;
            const pkg     = txtPackage.value.trim();
            const act     = txtActivity.value.trim();
            const version = txtPlatformV.value.trim();
            const apk     = txtApkPath.value.trim();

            const platform = selectedLocalPlatform();
            const bundleId = (txtBundleId?.value || '').trim();
            if (!udid) { setConfigStatus('⚠ Selecciona dispositivo', 'err'); return; }
            if (platform === 'ios') {
                if (apk && !/\.(app|ipa)$/i.test(apk)) {
                    setConfigStatus('⚠ Para iOS selecciona un archivo .app o .ipa', 'err');
                    return;
                }
            } else if (!pkg) {
                setConfigStatus('⚠ Ingresa el package', 'err');
                return;
            } else if (apk && !/\.(apk|aab|xapk)$/i.test(apk)) {
                setConfigStatus('⚠ Para Android selecciona un archivo .apk, .aab o .xapk', 'err');
                return;
            }

            const deviceName = cmbDevices.options[cmbDevices.selectedIndex].text;

            screenConfig.style.cssText   = 'display:none !important';
            screenRecorder.style.cssText = 'display:flex !important; flex-direction:column';
            lblDevice.textContent        = deviceName + ' — conectando...';
            setStatus('🔄 Conectando con Appium...', '#FF6600');
            state.resetSessionReady();
            setRecorderConnecting(true);
            state.sessionPlatform = platform;
            await loadExistingScenarios();
            showSessionOnboarding();

            await new Promise(r => setTimeout(r, 50));

            const config = {
                deviceName, udid, platformVersion: version, platform,
                appPackage: pkg, appActivity: act || '.MainActivity',
                squad: cmbFrameworkSquad.value || 'payment',
                featureScope: cmbFrameworkFeatureScope?.value || '',
                environment: cmbFrameworkEnv.value,
                ...(platform === 'ios' && bundleId ? { bundleId } : {}),
                ...(apk ? { appPath: apk } : {})
            };

            try {
                const result = await api.startSession(config);
                if (result.success) {
                    state.markSessionReady();
                    setRecorderConnecting(false);
                    state.sessionPlatform = platform;
                    cmbFrameworkSquad.disabled = true;
                    if (cmbFrameworkFeatureScope) cmbFrameworkFeatureScope.disabled = true;
                    lblDevice.textContent = deviceName;
                    const manualIosApp = platform === 'ios' && !bundleId && !apk;
                    setStatus(
                        manualIosApp
                            ? '✓ Sesion iOS activa — abre la app manualmente en Simulator y refresca la captura'
                            : '✓ Sesion activa — ' + deviceName,
                        '#00CC00'
                    );
                    if (result.screenshot) updateDeviceScreen(result.screenshot);
                    await loadSquadCatalog(state.sessionPlatform);
                } else {
                    setRecorderConnecting(false);
                    sessionOnboarding.style.display = 'none';
                    screenRecorder.style.cssText = 'display:none !important';
                    screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                    setConfigStatus('✗ ' + result.error, 'err');
                }
            } catch (e) {
                setRecorderConnecting(false);
                sessionOnboarding.style.display = 'none';
                screenRecorder.style.cssText = 'display:none !important';
                screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                setConfigStatus('✗ Error: ' + e.message, 'err');
            }
        });

        on(btnRefreshScr, 'click', async () => {
            const r = await api.getScreenshot();
            if (r.success) updateDeviceScreen(r.screenshot);
        });

        on(btnCloseSession, 'click', async () => {
            exitInspectorMode();
            exitInteractionMode();
            sessionOnboarding.style.display = 'none';
            await api.closeSession();
            cmbFrameworkSquad.disabled = false;
            if (cmbFrameworkFeatureScope) cmbFrameworkFeatureScope.disabled = false;
            screenRecorder.style.cssText = 'display:none !important';
            screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
            if (imgDevice) imgDevice.src = '';
            if (devicePH)  devicePH.style.display = 'block';
            setConfigStatus('Sesion cerrada', '');
        });
    }

    function unmount() {
        bound.forEach(({ target, type, handler, options }) => target?.removeEventListener?.(type, handler, options));
        bound.length = 0;
    }

    return {
        mount,
        unmount,
        loadFrameworkCatalog,
        loadDevices,
        loadBsCredentials,
        loadSquadCatalog,
        selectedLocalPlatform,
    };
}
