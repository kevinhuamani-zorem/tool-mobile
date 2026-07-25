window.addEventListener('DOMContentLoaded', async () => {

    const api = window.api;

    let selectedStepIndex = -1;
    let currentUdid = '';

    // ─── ELEMENTOS CONFIG ────────────────────────────────────────────────────
    const screenConfig    = document.getElementById('screenConfig');
    const screenRecorder  = document.getElementById('screenRecorder');
    const cmbFrameworkEnv = document.getElementById('cmbFrameworkEnvironment');
    const cmbFrameworkSquad = document.getElementById('cmbFrameworkSquad');
    const cmbFrameworkApp = document.getElementById('cmbFrameworkApp');
    const lblFrameworkStatus = document.getElementById('lblFrameworkStatus');

    // Local
    const localPanel      = document.getElementById('localPanel');
    const cmbDevices      = document.getElementById('cmbDevices');
    const lblDeviceInfo   = document.getElementById('lblDeviceInfo');
    const btnRefreshDev   = document.getElementById('btnRefreshDevices');
    const txtPackage      = document.getElementById('txtPackage');
    const txtActivity     = document.getElementById('txtActivity');
    const txtPlatformV    = document.getElementById('txtPlatformVersion');
    const txtApkPath      = document.getElementById('txtApkPath');
    const btnDetectApp    = document.getElementById('btnDetectApp');
    const btnStart        = document.getElementById('btnStartSession');
    const lblConfigSt     = document.getElementById('lblConfigStatus');

    // BrowserStack
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

    let activeMode    = 'local'; // 'local' | 'bs'
    let bsPlatform    = 'android'; // 'android' | 'ios'

    // Upload modal
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

    // ─── ELEMENTOS RECORDER ──────────────────────────────────────────────────
    const lblDevice       = document.getElementById('lblDevice');
    const btnRefreshScr   = document.getElementById('btnRefreshScreen');
    const btnCloseSession = document.getElementById('btnCloseSession');
    const imgDevice       = document.getElementById('imgDevice');
    const devicePH        = document.getElementById('devicePlaceholder');
    const btnInspect      = document.getElementById('btnInspect');
    const lblInspect      = document.getElementById('lblInspectStatus');
    const txtSelector     = document.getElementById('txtSelector');
    const txtVarName      = document.getElementById('txtVarName');
    const btnCopy         = document.getElementById('btnCopy');
    const btnVerify       = document.getElementById('btnVerify');
    const lblVerify       = document.getElementById('lblVerifyResult');
    const cmbAction       = document.getElementById('cmbAction');
    const txtValue        = document.getElementById('txtValue');
    const txtDesc         = document.getElementById('txtDesc');
    const btnExecute      = document.getElementById('btnExecute');
    const lstSteps        = document.getElementById('lstSteps');
    const txtGherkin      = document.getElementById('txtGherkin');
    const txtFeature      = document.getElementById('txtFeature');
    const txtScenario     = document.getElementById('txtScenario');
    const txtCaseId       = document.getElementById('txtCaseId');
    const cmbPathType     = document.getElementById('cmbPathType');
    const txtFeatureTag   = document.getElementById('txtFeatureTag');
    const txtFeatureFile  = document.getElementById('txtFeatureFile');
    const txtLocatorModule = document.getElementById('txtLocatorModule');
    const txtDataName     = document.getElementById('txtDataName');
    const btnPreview      = document.getElementById('btnPreview');
    const btnGenerate     = document.getElementById('btnGenerate');
    const btnDelete       = document.getElementById('btnDeleteStep');
    const btnClear        = document.getElementById('btnClearSteps');
    const lblStatus       = document.getElementById('lblStatus');
    const lblGenerate     = document.getElementById('lblGenerateResult');

    // ─── ELEMENTOS HIERARCHY VIEWER ──────────────────────────────────────────
    const xmlModal        = document.getElementById('xmlModal');
    const hierImg         = document.getElementById('hierImg');
    const hierCanvas      = document.getElementById('hierCanvas');
    const hierScreenWrap  = document.getElementById('hierScreenWrap');
    const hierTree        = document.getElementById('hierTree');
    const hierAttrs       = document.getElementById('hierAttrs');
    const hierXpathSug    = document.getElementById('hierXpathSuggestions');
    const lblHierarchyMode= document.getElementById('lblHierarchyMode');
    const cmbLocatorStrategy = document.getElementById('cmbLocatorStrategy');
    const txtLocatorValue = document.getElementById('txtLocatorValue');
    const btnVerifyXpathM = document.getElementById('btnVerifyXpathManual');
    const btnUseXpath     = document.getElementById('btnUseXpath');
    const lblXmlVerify    = document.getElementById('lblXmlVerify');
    const btnCopyXml      = document.getElementById('btnCopyXml');
    const btnCopyTree     = document.getElementById('btnCopyTree');
    const btnCopyHierarchy = document.getElementById('btnCopyHierarchy');
    const btnRefreshXml   = document.getElementById('btnRefreshXml');
    const btnCloseXml     = document.getElementById('btnCloseXml');
    const btnXmlInspector = document.getElementById('btnXmlInspector');

    // ─── ESTADO HIERARCHY ────────────────────────────────────────────────────
    let currentXml     = '';
    let parsedElements = [];
    let selectedHierarchyElement = null;
    let hierarchyMode = 'tree';
    let hierarchyRoots = [];
    let hierarchyNodeByElement = new Map();
    let activeIosAlert = null;
    let activeAndroidPermissionButtons = [];
    let xmlExpandedNodes = new Map();
    let deviceW        = 1080;
    let deviceH        = 2340;

    // ─── HELPERS GENERALES ───────────────────────────────────────────────────
    function setStatus(msg, color) {
        if (!lblStatus) return;
        lblStatus.textContent = msg;
        lblStatus.style.color = color || '#888AAA';
    }

    function setConfigStatus(msg, type) {
        if (!lblConfigSt) return;
        lblConfigSt.textContent = msg;
        lblConfigSt.className = 'config-status' + (type ? ' ' + type : '');
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
        catalog.squads.forEach(squad => {
            const option = document.createElement('option');
            option.value = squad.name;
            option.textContent = squad.name;
            option.dataset.layers = JSON.stringify(squad.layers);
            cmbFrameworkSquad.appendChild(option);
        });
        if (catalog.squads.length === 0) {
            cmbFrameworkSquad.innerHTML = '<option value="">Sin squads</option>';
        }

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
            `${totals.features} features · ${totals.steps} steps`;
        lblFrameworkStatus.className = 'device-info ok';
    }

    cmbFrameworkApp.addEventListener('change', () => {
        if (cmbFrameworkApp.value) txtApkPath.value = cmbFrameworkApp.value;
    });

    function setVerify(msg, type) {
        if (!lblVerify) return;
        lblVerify.textContent = msg;
        lblVerify.className = 'verify-result' + (type ? ' ' + type : '');
    }

    function setInspect(msg, type) {
        if (!lblInspect) return;
        lblInspect.textContent = msg;
        lblInspect.className = 'inspect-status' + (type ? ' ' + type : '');
    }

    function setGenerate(msg, type) {
        if (!lblGenerate) return;
        lblGenerate.textContent = msg;
        lblGenerate.className = 'generate-result' + (type ? ' ' + type : '');
    }

    function buildGenerationRequest() {
        return {
            squad: cmbFrameworkSquad.value,
            featureName: txtFeature.value.trim(),
            scenarioName: txtScenario.value.trim(),
            fileName: txtFeatureFile.value.trim(),
            locatorModule: txtLocatorModule.value.trim(),
            caseId: txtCaseId.value.trim(),
            pathType: cmbPathType.value,
            tag: txtFeatureTag.value.trim(),
            dataName: txtDataName.value.trim()
        };
    }

    function disableBtn(btn, text) {
        if (!btn) return;
        btn.disabled = true;
        btn.dataset.original = btn.textContent;
        btn.textContent = text;
    }

    function enableBtn(btn) {
        if (!btn) return;
        btn.disabled = false;
        btn.textContent = btn.dataset.original || btn.textContent;
    }

    function updateDeviceScreen(base64) {
        if (!base64 || !imgDevice) return;
        imgDevice.src = base64;
        imgDevice.style.display = 'block';
        if (devicePH) devicePH.style.display = 'none';
    }

    function renderSteps(steps) {
        if (!lstSteps) return;
        lstSteps.innerHTML = '';
        if (!steps || steps.length === 0) {
            lstSteps.innerHTML = '<li class="step-empty">Sin steps grabados...</li>';
            return;
        }
        steps.forEach((s, i) => {
            const li = document.createElement('li');
            li.textContent = (i + 1) + '. ' + stepSummary(s);
            li.dataset.index = i;
            if (i === selectedStepIndex) li.classList.add('selected');
            li.addEventListener('click', () => {
                selectedStepIndex = i;
                document.querySelectorAll('#lstSteps li').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
            });
            lstSteps.appendChild(li);
        });
    }

    function stepSummary(step) {
        const loc = step.variableName ? '{' + step.variableName + '}' : (step.selector || '');
        const map = {
            ABRIR_APP:           '📱 ABRIR APP → ' + step.value,
            CLICK:               '👆 CLICK → ' + loc,
            ESCRIBIR:            '✏️ ESCRIBIR "' + step.value + '" → ' + loc,
            LIMPIAR:             '🧹 LIMPIAR → ' + loc,
            SCROLL_DOWN:         '⬇️ SCROLL DOWN',
            SCROLL_UP:           '⬆️ SCROLL UP',
            SCROLL_HASTA:        '🔍 SCROLL HASTA → ' + loc,
            SWIPE:               '👉 SWIPE ' + step.value,
            PRESION_LARGA:       '👇 PRESION LARGA → ' + loc,
            VERIFICAR_TEXTO:     '✅ VERIFICAR TEXTO "' + step.value + '" → ' + loc,
            VERIFICAR_EXISTE:    '👁️ VERIFICAR EXISTE → ' + loc,
            VERIFICAR_NO_EXISTE: '🚫 VERIFICAR NO EXISTE → ' + loc,
            VOLVER:              '◀️ VOLVER',
            ESPERAR:             '⏳ ESPERAR ' + step.value + 's',
            SCREENSHOT:          '📸 SCREENSHOT',
        };
        return map[step.action] || step.description || step.action;
    }

    function clearStepFields() {
        if (txtSelector) txtSelector.value = '';
        if (txtVarName)  txtVarName.value  = '';
        if (txtValue)    txtValue.value    = '';
        if (txtDesc)     txtDesc.value     = '';
        setVerify('— Ingresa un selector');
    }

    // ─── TAB SWITCHER ────────────────────────────────────────────────────────
    function switchTab(mode) {
        activeMode = mode;
        if (mode === 'local') {
            tabLocal.classList.add('active');
            tabBS.classList.remove('active');
            localPanel.style.display = 'flex';
            bsPanel.style.display    = 'none';
        } else {
            tabBS.classList.add('active');
            tabLocal.classList.remove('active');
            bsPanel.style.display    = 'flex';
            localPanel.style.display = 'none';
        }
    }

    tabLocal.addEventListener('click', () => switchTab('local'));
    tabBS.addEventListener('click',    () => switchTab('bs'));

    // ─── PLATFORM TOGGLE (Android / iOS) ────────────────────────────────────
    function switchBsPlatform(platform) {
        bsPlatform = platform;
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
    }

    btnBsPlatAndroid.addEventListener('click', () => switchBsPlatform('android'));
    btnBsPlatIos.addEventListener('click',     () => switchBsPlatform('ios'));

    // ─── MODAL DE UPLOAD ──────────────────────────────────────────────────────
    let lastUploadedUrl = '';

    function openUploadModal() {
        // Resetear estado
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

    btnOpenUploadModal.addEventListener('click', () => {
        switchTab('bs'); // asegurar que el tab BS está activo
        openUploadModal();
    });
    btnCloseUploadModal.addEventListener('click', closeUploadModal);
    uploadModal.addEventListener('click', e => { if (e.target === uploadModal) closeUploadModal(); });

    // Drag & drop visual
    uploadDropZone.addEventListener('dragover', e => {
        e.preventDefault();
        uploadDropZone.classList.add('dragging');
    });
    uploadDropZone.addEventListener('dragleave', () => uploadDropZone.classList.remove('dragging'));
    uploadDropZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadDropZone.classList.remove('dragging');
        // Electron drag-drop: el archivo viene en e.dataTransfer.files
        // Pero el path real solo lo tenemos si el usuario lo arrastra desde Finder
        // Lo gestionamos igual que el clic (abrimos diálogo)
        startUpload();
    });

    uploadDropZone.addEventListener('click', startUpload);

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

        // Mostrar progreso
        uploadDropZone.style.display   = 'none';
        uploadResult.style.display     = 'none';
        uploadProgress.style.display   = 'flex';
        uploadProgressLabel.textContent = 'Abriendo selector de archivo...';
        uploadProgressFill.style.width  = '10%';

        // Simular progreso visual mientras esperamos
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
            // Usuario canceló el diálogo — volver a mostrar la zona de drop
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
            // Permitir reintentar
            setTimeout(() => {
                uploadDropZone.style.display = 'flex';
                uploadResult.style.display   = 'none';
            }, 3000);
        }
    }

    btnCopyAppUrl.addEventListener('click', () => {
        if (!lastUploadedUrl) return;
        // Auto-llenar el campo de App URL en el panel BS y cerrar
        txtBsAppUrl.value = lastUploadedUrl;
        // Refrescar lista de apps
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

    // ─── BROWSERSTACK ─────────────────────────────────────────────────────────

    // Pre-cargar credenciales guardadas
    async function loadBsCredentials() {
        const r = await api.bsLoadCredentials();
        if (r.username) txtBsUser.value = r.username;
        if (r.accessKey) txtBsKey.value = r.accessKey;
        if (r.username) lblBsCreds.textContent = '✓ Credenciales cargadas';
    }

    btnBsSaveCreds.addEventListener('click', async () => {
        const u = txtBsUser.value.trim();
        const k = txtBsKey.value.trim();
        if (!u || !k) { lblBsCreds.textContent = '⚠ Completa usuario y key'; return; }
        const r = await api.bsSaveCredentials(u, k);
        lblBsCreds.textContent = r.success ? '✓ Guardadas correctamente' : ('✗ ' + r.error);
        lblBsCreds.style.color = r.success ? '#00CC00' : '#CC0000';
    });

    btnBsListDevices.addEventListener('click', async () => {
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

    btnBsListApps.addEventListener('click', async () => {
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

    // Al elegir una app del dropdown, auto-llenar el campo URL
    cmbBsApps.addEventListener('change', () => {
        if (cmbBsApps.value) {
            txtBsAppUrl.value = cmbBsApps.value;
        }
    });

    btnBsStart.addEventListener('click', async () => {
        const u       = txtBsUser.value.trim();
        const k       = txtBsKey.value.trim();
        const app_url = txtBsAppUrl.value.trim();
        const isIos   = bsPlatform === 'ios';

        if (!u || !k) { lblBsStatus.textContent = '⚠ Ingresa credenciales'; lblBsStatus.className = 'config-status err'; return; }
        if (!cmbBsDevices.value || cmbBsDevices.value === '') {
            lblBsStatus.textContent = '⚠ Lista y elige un dispositivo';
            lblBsStatus.className = 'config-status err'; return;
        }

        // Validación por plataforma
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

        await new Promise(r => setTimeout(r, 50));

        const config = {
            platform:        bsPlatform,
            username:        u,
            accessKey:       k,
            deviceName:      deviceData.deviceName,
            platformVersion: deviceData.platformVersion,
            appUrl:          app_url,
            // Android
            appPackage:      txtBsPackage  ? txtBsPackage.value.trim()  : '',
            appActivity:     txtBsActivity ? txtBsActivity.value.trim() : '.MainActivity',
            // iOS
            bundleId:        txtBsBundleId ? txtBsBundleId.value.trim() : '',
            projectName:     'Appium Visual Recorder',
        };

        try {
            const result = await api.bsStartSession(config);
            if (result.success) {
                lblDevice.textContent = '☁️ ' + deviceLabel;
                setStatus('✓ Sesion BrowserStack — ' + deviceLabel, '#00CC00');
                if (result.screenshot) updateDeviceScreen(result.screenshot);
            } else {
                screenRecorder.style.cssText = 'display:none !important';
                screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                switchTab('bs');
                lblBsStatus.textContent = '✗ ' + result.error;
                lblBsStatus.className   = 'config-status err';
            }
        } catch (e) {
            screenRecorder.style.cssText = 'display:none !important';
            screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
            switchTab('bs');
            lblBsStatus.textContent = '✗ Error: ' + e.message;
            lblBsStatus.className   = 'config-status err';
        }
    });

    // ─── CONFIG ──────────────────────────────────────────────────────────────
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
            opt.value = d.udid;
            opt.textContent = (d.model || d.udid) + ' (Android ' + (d.version || '?') + ')';
            cmbDevices.appendChild(opt);
        });
        currentUdid = result.devices[0].udid;
        lblDeviceInfo.textContent = '✓ ' + result.devices.length + ' dispositivo(s)';
        lblDeviceInfo.className = 'device-info ok';
    }

    cmbDevices.addEventListener('change', () => { currentUdid = cmbDevices.value; });
    btnRefreshDev.addEventListener('click', loadDevices);

    btnDetectApp.addEventListener('click', async () => {
        if (!currentUdid) return;
        disableBtn(btnDetectApp, '⏳');
        const app = await api.getForegroundApp(currentUdid);
        enableBtn(btnDetectApp);
        if (app.package) {
            txtPackage.value  = app.package;
            txtActivity.value = app.activity;
            setConfigStatus('✓ App: ' + app.package, 'ok');
        } else {
            setConfigStatus('⚠ No se detecto app', 'err');
        }
    });

    btnStart.addEventListener('click', async () => {
        const udid    = cmbDevices.value;
        const pkg     = txtPackage.value.trim();
        const act     = txtActivity.value.trim();
        const version = txtPlatformV.value.trim();
        const apk     = txtApkPath.value.trim();

        if (!udid) { setConfigStatus('⚠ Selecciona dispositivo', 'err'); return; }
        if (!pkg)  { setConfigStatus('⚠ Ingresa el package', 'err');     return; }

        const deviceName = cmbDevices.options[cmbDevices.selectedIndex].text;

        // Mostrar recorder ANTES de conectar
        screenConfig.style.cssText   = 'display:none !important';
        screenRecorder.style.cssText = 'display:flex !important; flex-direction:column';
        lblDevice.textContent        = deviceName + ' — conectando...';
        setStatus('🔄 Conectando con Appium...', '#FF6600');

        await new Promise(r => setTimeout(r, 50));

        const config = {
            deviceName, udid, platformVersion: version,
            appPackage: pkg, appActivity: act || '.MainActivity',
            ...(apk ? { appPath: apk } : {})
        };

        try {
            const result = await api.startSession(config);
            if (result.success) {
                lblDevice.textContent = deviceName;
                setStatus('✓ Sesion activa — ' + deviceName, '#00CC00');
                if (result.screenshot) updateDeviceScreen(result.screenshot);
            } else {
                screenRecorder.style.cssText = 'display:none !important';
                screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
                setConfigStatus('✗ ' + result.error, 'err');
            }
        } catch (e) {
            screenRecorder.style.cssText = 'display:none !important';
            screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
            setConfigStatus('✗ Error: ' + e.message, 'err');
        }
    });

    // ─── RECORDER ────────────────────────────────────────────────────────────
    btnRefreshScr.addEventListener('click', async () => {
        const r = await api.getScreenshot();
        if (r.success) updateDeviceScreen(r.screenshot);
    });

    btnCloseSession.addEventListener('click', async () => {
        await api.closeSession();
        screenRecorder.style.cssText = 'display:none !important';
        screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
        if (imgDevice) imgDevice.src = '';
        if (devicePH)  devicePH.style.display = 'block';
        setConfigStatus('Sesion cerrada', '');
    });

    // ── Chips de selector (inspector físico) ─────────────────────────────────
    function renderSelectorChips(candidates, suggested) {
        let chipsWrap = document.getElementById('selectorChips');
        if (!chipsWrap) {
            chipsWrap = document.createElement('div');
            chipsWrap.id = 'selectorChips';
            chipsWrap.style.cssText =
                'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:4px 0';
            txtSelector.parentNode.insertBefore(chipsWrap, txtSelector.nextSibling);
        }
        chipsWrap.innerHTML = '';

        candidates.forEach((c, idx) => {
            const chip = document.createElement('div');
            chip.style.cssText =
                'display:inline-flex;flex-direction:column;gap:2px;padding:5px 9px;' +
                'border-radius:5px;border:1.5px solid ' + (idx === 0 ? '#7030A0' : '#444') + ';' +
                'cursor:pointer;background:' + (idx === 0 ? '#3a2a4e' : '#2a2a3e') + ';' +
                'max-width:320px;';

            const priorityColors = ['#3a9a3a','#4a80d9','#c09040','#888','#666','#555'];
            const labelEl = document.createElement('span');
            labelEl.style.cssText = 'font-size:9px;font-weight:700;color:' +
                (priorityColors[idx] || '#888');
            labelEl.textContent = (idx === 0 ? '⭐ ' : '') + c.label;

            const valEl = document.createElement('span');
            valEl.style.cssText =
                'font-family:monospace;font-size:9.5px;color:' +
                (idx === 0 ? '#e0b0ff' : '#ccc') +
                ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px';
            valEl.textContent = c.selector;
            valEl.title = c.selector;

            chip.appendChild(labelEl);
            chip.appendChild(valEl);

            chip.addEventListener('click', () => {
                // Actualizar selector y variable name
                txtSelector.value = c.selector;
                const patterns = [
                    /^id=[^/]+\/(.+)$/,
                    /^id=(.+)$/,
                    /^~(.+)$/,
                    /@resource-id="[^"]*\/([^"]+)"/,
                    /@resource-id="([^"]+)"/,
                    /@content-desc="([^"]+)"/,
                    /@text="([^"]+)"/,
                ];
                for (const re of patterns) {
                    const m = c.selector.match(re);
                    if (m) {
                        txtVarName.value = m[1].toLowerCase()
                            .replace(/[^a-z0-9]/g, '_')
                            .replace(/_+/g, '_')
                            .replace(/^_|_$/g, '');
                        break;
                    }
                }
                // Resaltar chip activo
                chipsWrap.querySelectorAll('div').forEach(ch => {
                    ch.style.borderColor = '#444';
                    ch.style.background  = '#2a2a3e';
                    ch.querySelector('span').style.color = '#888';
                });
                chip.style.borderColor = '#7030A0';
                chip.style.background  = '#3a2a4e';
                labelEl.style.color    = priorityColors[idx] || '#888';
            });

            chipsWrap.appendChild(chip);
        });
    }

    // ── Inspector por coordenadas ──────────────────────────────────────────────
    let inspectorActive      = false;
    let inspectorClickFn     = null;
    let inspectorElems       = [];
    let inspectorDimW        = 0;
    let inspectorDimH        = 0;

    /** Genera candidatos explícitos de Appium a partir de un elemento parseado. */
    function buildCandidatesFromEl(el) {
        const IGNORED = ['android:id/content','android:id/navigationBarBackground','android:id/statusBarBackground'];
        const cands = [];
        let p = 1;

        // Android
        if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            cands.push({ label: 'ID', selector: 'id=' + el.resourceId, priority: p++ });
            const idPart = el.resourceId.split('/')[1];
            if (idPart) cands.push({ label: 'resource-id contains', selector: '//*[contains(@resource-id,"' + idPart + '")]', priority: p++ });
        }
        if (el.contentDesc && el.contentDesc.length > 0 && el.contentDesc.length < 80)
            cands.push({ label: 'Accessibility ID', selector: '~' + el.contentDesc, priority: p++ });
        if (el.text && el.text.length > 0 && el.text.length < 80) {
            cands.push({ label: 'text', selector: '//*[@text="' + el.text + '"]', priority: p++ });
            if (el.text.length > 10)
                cands.push({ label: 'text contains', selector: '//*[contains(@text,"' + el.text.slice(0,20) + '")]', priority: p++ });
        }

        // iOS (XCUITest)
        const iosName  = getAttrVal(el.attrs, 'name');
        const iosLabel = getAttrVal(el.attrs, 'label');
        const iosValue = getAttrVal(el.attrs, 'value');
        if (iosName  && iosName.length  > 0 && iosName.length  < 80 && !el.resourceId) {
            cands.push({ label: 'Accessibility ID', selector: '~' + iosName, priority: p++ });
            cands.push({ label: 'iOS Predicate', selector: "iosPredicate=name == '" + iosName.replace(/'/g, "\\'") + "'", priority: p++ });
        }
        if (iosLabel && iosLabel.length > 0 && iosLabel.length < 80 && !el.contentDesc) {
            cands.push({ label: 'iOS Predicate label', selector: "iosPredicate=label == '" + iosLabel.replace(/'/g, "\\'") + "'", priority: p++ });
            cands.push({ label: 'XPath label', selector: '//*[@label="' + iosLabel + '"]', priority: p++ });
        }
        if (iosValue && iosValue.length > 0 && iosValue.length < 80 && !el.text)
            cands.push({ label: 'iOS Predicate value', selector: "iosPredicate=value == '" + iosValue.replace(/'/g, "\\'") + "'", priority: p++ });

        // Fallback XPath por clase
        const tagName = el.className || el.tag;
        if (tagName && tagName !== 'hierarchy' && tagName !== 'AppiumAUT')
            cands.push({ label: 'xpath', selector: '//' + tagName, priority: p });

        return cands;
    }

    /** Sugiere nombre de variable desde un selector explícito. */
    function inferVarName(selector, tag) {
        const patterns = [
            /^id=[^/]+\/(.+)$/,
            /^id=(.+)$/,
            /^~(.+)$/,
            /@resource-id="[^"]*\/([^"]+)"/,
            /@resource-id="([^"]+)"/,
            /@content-desc="([^"]+)"/,
            /@text="([^"]+)"/,
            /@name="([^"]+)"/,
            /@label="([^"]+)"/,
        ];
        const shortTag = (tag || 'element').split('.').pop().toLowerCase()
            .replace('xcuielementtype','');
        for (const re of patterns) {
            const m = selector.match(re);
            if (m) {
                const name = m[1].toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
                return shortTag + '_' + name;
            }
        }
        return shortTag + '_' + (Date.now() % 1000);
    }

    function exitInspectorMode() {
        inspectorActive = false;
        imgDevice.style.cursor = '';
        imgDevice.style.outline = '';
        if (inspectorClickFn) {
            imgDevice.removeEventListener('click', inspectorClickFn);
            inspectorClickFn = null;
        }
        btnInspect.textContent = '🖱️ Inspeccionar elemento';
        btnInspect.disabled    = false;
    }

    btnInspect.addEventListener('click', async () => {
        // Si ya está activo → cancelar
        if (inspectorActive) {
            exitInspectorMode();
            setInspect('— Inspección cancelada', '');
            setStatus('—', '#888AAA');
            return;
        }

        // Activar modo inspección
        inspectorActive        = true;
        btnInspect.textContent = '✕ Cancelar';
        setInspect('⏳ Cargando pantalla...', 'active');
        setStatus('📡 Obteniendo XML de la app...', '#FF6600');

        // Obtener screenshot + XML simultáneamente
        const [scrR, xmlR] = await Promise.all([
            api.getScreenshot(),
            api.getPageSource()
        ]);

        if (!inspectorActive) return; // fue cancelado durante el await

        if (!xmlR.success) {
            exitInspectorMode();
            setInspect('✗ Error al obtener XML: ' + (xmlR.error || 'desconocido'), 'err');
            setStatus('✗ Error', '#CC0000');
            return;
        }

        if (scrR.success) updateDeviceScreen(scrR.screenshot);

        // Parsear elementos y dimensiones del dispositivo
        inspectorElems = parseElements(xmlR.xml);
        const wm = xmlR.xml.match(/width="(\d+)"/);
        const hm = xmlR.xml.match(/height="(\d+)"/);
        inspectorDimW = wm ? parseInt(wm[1]) : (deviceW || 1080);
        inspectorDimH = hm ? parseInt(hm[1]) : (deviceH || 2340);

        if (inspectorElems.length === 0) {
            exitInspectorMode();
            setInspect('⚠ No se encontraron elementos con bounds en el XML', 'err');
            setStatus('⚠ Sin elementos', '#FF9900');
            return;
        }

        // Indicador visual: cursor crosshair + borde naranja
        imgDevice.style.cursor  = 'crosshair';
        imgDevice.style.outline = '2px solid #FF9900';
        setInspect('🎯 Haz click en el elemento que quieres inspeccionar (' + inspectorElems.length + ' elementos detectados)', 'active');
        setStatus('🎯 Modo inspección — click en la imagen', '#FF9900');

        // Handler de clic sobre la imagen del dispositivo
        inspectorClickFn = (e) => {
            if (!inspectorActive) return;

            const rect = imgDevice.getBoundingClientRect();
            const px   = Math.round(((e.clientX - rect.left) / rect.width)  * inspectorDimW);
            const py   = Math.round(((e.clientY - rect.top)  / rect.height) * inspectorDimH);

            // Elemento más pequeño que contiene el punto clickeado
            let best = null, bestArea = Infinity;
            inspectorElems.forEach(el => {
                if (px >= el.x1 && px <= el.x2 && py >= el.y1 && py <= el.y2) {
                    const area = (el.x2 - el.x1) * (el.y2 - el.y1);
                    if (area < bestArea) { bestArea = area; best = el; }
                }
            });

            exitInspectorMode();

            if (!best) {
                setInspect('⚠ Sin elemento en esa zona — intenta en otra área', 'err');
                setStatus('⚠ Sin elemento', '#FF9900');
                return;
            }

            const candidates = buildCandidatesFromEl(best);
            if (candidates.length === 0) {
                setInspect('⚠ Elemento sin identificadores útiles — elige otro', 'err');
                setStatus('⚠ Sin identificadores', '#FF9900');
                return;
            }

            txtSelector.value = candidates[0].selector;
            txtVarName.value  = inferVarName(candidates[0].selector, best.tag);
            if (candidates.length > 1) renderSelectorChips(candidates, txtVarName.value);

            setInspect('✓ ' + candidates.length + ' identificador(es) — elige el mejor', 'ok');
            setStatus('✓ Elemento capturado', '#00CC00');
        };

        imgDevice.addEventListener('click', inspectorClickFn);
    });

    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(txtSelector.value);
        setStatus('📋 Copiado', '#2E75B6');
    });

    btnVerify.addEventListener('click', async () => {
        const selector = txtSelector.value.trim();
        if (!selector) { setVerify('⚠ Ingresa un selector', 'err'); return; }
        disableBtn(btnVerify, '⏳ Verificando...');
        const result = await api.verifySelector(selector);
        enableBtn(btnVerify);
        if (result.success) {
            if (result.screenshot) updateDeviceScreen(result.screenshot);
            setVerify(result.summary, 'ok');
            setStatus('✓ Verificado', '#00CC00');
        } else {
            setVerify(result.summary, 'err');
            setStatus('✗ No encontrado', '#CC0000');
        }
    });

    cmbAction.addEventListener('change', () => {
        const action  = cmbAction.value;
        const noSel   = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];
        txtSelector.disabled = noSel.includes(action);
        txtVarName.disabled  = noSel.includes(action);
        const ph = {
            ABRIR_APP: 'com.example.app', ESCRIBIR: 'texto...',
            SWIPE: 'left/right/up/down', VERIFICAR_TEXTO: 'texto esperado',
            ESPERAR: 'segundos', SCREENSHOT: 'nombre'
        };
        txtValue.placeholder = ph[action] || '';
    });

    btnExecute.addEventListener('click', async () => {
        const action   = cmbAction.value;
        const selector = txtSelector.value.trim();
        const varName  = txtVarName.value.trim();
        const value    = txtValue.value.trim();
        const desc     = txtDesc.value.trim();
        const noSel    = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];

        if (!noSel.includes(action) && !selector) {
            setStatus('⚠ Ingresa un selector', '#FF6600'); return;
        }

        const step = { action, variableName: varName, selector, value, description: desc };
        disableBtn(btnExecute, '⏳ Ejecutando...');
        setStatus('⚡ Ejecutando...', '#FF6600');

        const result = await api.executeStep(step);
        enableBtn(btnExecute);

        if (result.success) {
            if (result.screenshot) updateDeviceScreen(result.screenshot);
            setStatus('✓ Step ' + result.totalSteps + ' guardado', '#00CC00');
            clearStepFields();
            const sr = await api.getSteps();
            renderSteps(sr.steps);
            const pr = await api.previewFwkFiles(buildGenerationRequest());
            if (pr.success && txtGherkin) txtGherkin.value = pr.preview.featureContent;
        } else {
            setStatus('✗ ' + result.message, '#CC0000');
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (selectedStepIndex < 0) { setStatus('⚠ Selecciona un step', '#FF6600'); return; }
        await api.deleteStep(selectedStepIndex);
        selectedStepIndex = -1;
        const r = await api.getSteps();
        renderSteps(r.steps);
        setStatus('🗑️ Eliminado', '#FF6600');
    });

    btnClear.addEventListener('click', async () => {
        await api.clearSteps();
        selectedStepIndex = -1;
        renderSteps([]);
        if (txtGherkin) txtGherkin.value = '';
        setStatus('🧹 Limpiado', '#666888');
    });

    btnPreview.addEventListener('click', async () => {
        const r = await api.previewFwkFiles(buildGenerationRequest());
        if (r.success && txtGherkin) {
            txtGherkin.value = r.preview.featureContent;
            setGenerate(`Preparado: ${r.preview.files.length} archivo(s)`, 'ok');
        } else {
            setGenerate('✗ ' + r.error, 'err');
        }
    });

    btnGenerate.addEventListener('click', async () => {
        disableBtn(btnGenerate, '⏳ Generando...');
        if (linkedScenarioData) {
            enableBtn(btnGenerate);
            setGenerate('✗ El modo Enlazar se adaptará en la fase de reutilización de steps.', 'err');
            return;
        }

        const r = await api.generateFwkFiles(buildGenerationRequest());
        enableBtn(btnGenerate);
        if (r.success) {
            const paths = r.generated.files.join(' | ');
            setGenerate('✓ ' + paths, 'ok');
            setStatus('✓ Feature y locators generados', '#00CC00');
        } else {
            setGenerate('✗ ' + r.error, 'err');
        }
    });

    // ─── HIERARCHY VIEWER ────────────────────────────────────────────────────
    function getAttrVal(attrs, name) {
        const m = attrs.match(new RegExp('\\b' + name + '="([^"]*)"'));
        return m ? m[1] : '';
    }

    function parseElements(xml) {
        const elements = [];
        const re = /<([\w.]+)\s([^>]*?)(?:\/>|>)/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
            const tag   = m[1];
            const attrs = m[2];
            let x1, y1, x2, y2;

            // Formato Android: bounds="[x1,y1][x2,y2]"
            const bounds = getAttrVal(attrs, 'bounds');
            if (bounds) {
                const bm = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
                if (bm) {
                    x1 = parseInt(bm[1]); y1 = parseInt(bm[2]);
                    x2 = parseInt(bm[3]); y2 = parseInt(bm[4]);
                }
            }

            // Formato iOS: x="0" y="0" width="120" height="44"
            if (x1 === undefined) {
                const xA = getAttrVal(attrs, 'x');
                const yA = getAttrVal(attrs, 'y');
                const wA = getAttrVal(attrs, 'width');
                const hA = getAttrVal(attrs, 'height');
                if (xA !== '' && yA !== '' && wA !== '' && hA !== '') {
                    x1 = parseInt(xA); y1 = parseInt(yA);
                    x2 = x1 + parseInt(wA); y2 = y1 + parseInt(hA);
                }
            }

            if (x1 === undefined || x2 === undefined) continue;
            if (x2 <= x1 || y2 <= y1) continue;

            const iosName = getAttrVal(attrs, 'name');
            const iosLabel = getAttrVal(attrs, 'label');
            const iosValue = getAttrVal(attrs, 'value');
            const visible = getAttrVal(attrs, 'visible');
            const displayed = getAttrVal(attrs, 'displayed');
            elements.push({
                tag, attrs,
                resourceId:  getAttrVal(attrs, 'resource-id'),
                text:        getAttrVal(attrs, 'text'),
                contentDesc: getAttrVal(attrs, 'content-desc'),
                clickable:   getAttrVal(attrs, 'clickable'),
                focusable:   getAttrVal(attrs, 'focusable'),
                focused:     getAttrVal(attrs, 'focused'),
                enabled:     getAttrVal(attrs, 'enabled'),
                displayed:   getAttrVal(attrs, 'displayed'),
                className:   getAttrVal(attrs, 'class'),
                iosName, iosLabel, iosValue,
                isIos: tag.startsWith('XCUIElementType'),
                isVisible: visible !== 'false' && displayed !== 'false',
                x1, y1, x2, y2
            });
        }
        return elements;
    }

    function findElementAt(px, py) {
        const candidates = parsedElements.filter(el =>
            el.isVisible && px >= el.x1 && px <= el.x2 && py >= el.y1 && py <= el.y2
        );
        // iOS expone muchos XCUIElementTypeOther superpuestos. Preferimos controles
        // que Appium puede accionar, como los botones del permiso del sistema.
        const actionable = candidates.filter(el => el.isIos
            ? (/XCUIElementType(Button|Link|Switch|TextField|SecureTextField|Cell)/.test(el.tag) ||
                getAttrVal(el.attrs, 'accessible') === 'true')
            : el.clickable === 'true'
        );
        const pool = actionable.length ? actionable : candidates;
        let best = null, bestArea = Infinity;
        pool.forEach(el => {
            const area = (el.x2-el.x1) * (el.y2-el.y1);
            if (area < bestArea) { bestArea = area; best = el; }
        });
        return best;
    }

    function drawRect(el, color, fill, lineWidth) {
        const ctx = hierCanvas.getContext('2d');
        const w   = hierCanvas.width;
        const h   = hierCanvas.height;
        const sx  = w / deviceW;
        const sy  = h / deviceH;
        ctx.strokeStyle = color;
        ctx.lineWidth   = lineWidth || 2;
        ctx.fillStyle   = fill;
        ctx.fillRect  (el.x1*sx, el.y1*sy, (el.x2-el.x1)*sx, (el.y2-el.y1)*sy);
        ctx.strokeRect(el.x1*sx, el.y1*sy, (el.x2-el.x1)*sx, (el.y2-el.y1)*sy);
    }

    function syncCanvas() {
        // El canvas debe medir exactamente lo mismo que la captura. El panel puede
        // tener espacio libre debajo de la imagen y no forma parte del dispositivo.
        const width = hierImg.offsetWidth;
        const height = hierImg.offsetHeight;
        hierCanvas.width  = width;
        hierCanvas.height = height;
        hierCanvas.style.width  = width + 'px';
        hierCanvas.style.height = height + 'px';
    }

    function showAttrs(el) {
        if (!el) { hierAttrs.innerHTML = '<span class="hier-hint">Sin elemento</span>'; return; }
        const KEYS = el.isIos
            ? ['type','name','label','value','enabled','visible','accessible','x','y','width','height','index','traits']
            : ['class','resource-id','text','content-desc','clickable','focusable','focused','enabled','displayed','bounds'];
        let html = '';
        KEYS.forEach(k => {
            const v = getAttrVal(el.attrs, k);
            if (!v) return;
            let vc = 'hier-attr-val';
            if (k==='clickable' && v==='true') vc += ' clickable-true';
            if (k==='focused'   && v==='true') vc += ' focused-true';
            html += '<div class="hier-attr-row">' +
                    '<span class="hier-attr-key">' + k + '</span>' +
                    '<span class="' + vc + '">' + v + '</span></div>';
        });
        hierAttrs.innerHTML = html || '<span class="hier-hint">Sin atributos</span>';
    }

    function nodeLabel(el) {
        const short = (el.className || el.tag).split('.').pop();
        const info  = el.iosName ? el.iosName.slice(0, 28)
                    : el.iosLabel ? el.iosLabel.slice(0, 28)
                    : el.iosValue ? el.iosValue.slice(0, 28)
                    : el.resourceId ? (el.resourceId.split('/')[1] || el.resourceId)
                    : el.text       ? el.text.slice(0, 28)
                    : el.contentDesc? el.contentDesc.slice(0, 28) : '';
        return { short, info };
    }

    function showNodeInTree(el) {
        const model = hierarchyNodeByElement.get(el);
        if (!model) return;
        // Al elegir desde la captura, abrir toda la ruta hasta el nodo concreto.
        for (let node = model; node; node = node.parent) {
            if (hierarchyMode === 'xml') xmlExpandedNodes.set(node.id, true);
            else node.expanded = true;
        }
        if (hierarchyMode === 'xml') renderXmlRows();
        else renderTreeRows();
        requestAnimationFrame(() => {
            const row = hierTree.querySelector(`[data-tree-id="${model.id}"]`);
            if (row) row.scrollIntoView({ block: 'nearest' });
        });
    }

    function renderHierarchyTree(xml) {
        hierarchyRoots = [];
        hierarchyNodeByElement = new Map();
        xmlExpandedNodes = new Map();
        let nextElementIndex = 0;
        let documentXml;
        try {
            documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            if (documentXml.querySelector('parsererror')) throw new Error('XML inválido');
        } catch {
            hierTree.innerHTML = '<span class="hier-hint">No se pudo interpretar el árbol XML.</span>';
            return;
        }

        const locateElement = (xmlNode) => {
            const bounds = xmlNode.getAttribute('bounds');
            const isIosNode = xmlNode.tagName.startsWith('XCUIElementType');
            const className = xmlNode.getAttribute('class') || '';
            for (let index = nextElementIndex; index < parsedElements.length; index++) {
                const el = parsedElements[index];
                const androidMatch = bounds && getAttrVal(el.attrs, 'bounds') === bounds &&
                    (!className || el.className === className);
                const iosMatch = isIosNode && el.isIos && el.tag === xmlNode.tagName &&
                    getAttrVal(el.attrs, 'x') === (xmlNode.getAttribute('x') || '') &&
                    getAttrVal(el.attrs, 'y') === (xmlNode.getAttribute('y') || '') &&
                    getAttrVal(el.attrs, 'width') === (xmlNode.getAttribute('width') || '') &&
                    getAttrVal(el.attrs, 'height') === (xmlNode.getAttribute('height') || '');
                if (androidMatch || iosMatch) {
                    nextElementIndex = index + 1;
                    return el;
                }
            }
            return null;
        };

        let treeId = 0;
        const buildNode = (xmlNode, parent = null, depth = 0) => {
            if (xmlNode.nodeType !== Node.ELEMENT_NODE) return;
            // Los nodos ocultos de SpringBoard distorsionan el árbol y no se pueden seleccionar.
            if (xmlNode.getAttribute('visible') === 'false') return;
            const el = locateElement(xmlNode);
            const node = { id: ++treeId, xmlNode, el, parent, depth, children: [], expanded: depth < 3 };
            xmlExpandedNodes.set(node.id, depth < 3);
            if (parent) parent.children.push(node); else hierarchyRoots.push(node);
            if (el) hierarchyNodeByElement.set(el, node);
            Array.from(xmlNode.children).forEach(child => buildNode(child, node, depth + 1));
        };

        activeIosAlert = parsedElements.find(el => el.isIos && el.isVisible && el.tag === 'XCUIElementTypeAlert') || null;
        activeAndroidPermissionButtons = parsedElements.filter(el =>
            !el.isIos && el.isVisible &&
            /^com\.android\.permissioncontroller:id\/permission_(allow|deny)_button$/.test(el.resourceId)
        );
        buildNode(documentXml.documentElement);
        renderTreeRows();
        if (!hierarchyRoots.length) {
            hierTree.innerHTML = '<span class="hier-hint">El XML no contiene nodos visualizables.</span>';
        }
    }

    function renderTreeRows() {
        hierTree.innerHTML = '';
        appendPermissionActions(hierTree);
        if (activeIosAlert) {
            const alertRow = document.createElement('div');
            alertRow.className = 'hier-alert-node';
            alertRow.textContent = `⚠ Alerta iOS activa: ${nodeLabel(activeIosAlert).info || 'sin título'}`;
            alertRow.addEventListener('click', () => selectHierarchyElement(activeIosAlert));
            hierTree.appendChild(alertRow);
        }
        const append = node => {
            const row = document.createElement('div');
            row.className = 'hier-node' + (node.el ? '' : ' hier-node-container') +
                (node.el === selectedHierarchyElement ? ' selected' : '');
            row.dataset.treeId = String(node.id);
            row.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13) + 'px';
            const label = node.el ? nodeLabel(node.el) : {
                short: (node.xmlNode.getAttribute('class') || node.xmlNode.tagName).split('.').pop(), info: ''
            };
            const toggle = document.createElement('button');
            toggle.className = 'hier-toggle';
            toggle.textContent = node.children.length ? (node.expanded ? '▾' : '▸') : '·';
            toggle.disabled = !node.children.length;
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                node.expanded = !node.expanded;
                renderTreeRows();
            });
            const tag = document.createElement('span');
            tag.className = 'node-tag';
            tag.textContent = `<${label.short}>`;
            row.append(toggle, tag);
            if (label.info) {
                const info = document.createElement('span');
                info.className = 'node-id';
                info.textContent = ` ${label.info}`;
                row.appendChild(info);
            }
            if (node.el) {
                row.title = 'Seleccionar y resaltar este elemento';
                row.addEventListener('click', () => selectHierarchyElement(node.el));
            }
            hierTree.appendChild(row);
            if (node.expanded) node.children.forEach(append);
        };
        hierarchyRoots.forEach(append);
    }

    function appendPermissionActions(container) {
        if (!activeAndroidPermissionButtons.length) return;
        const panel = document.createElement('div');
        panel.className = 'hier-permission-actions';
        const title = document.createElement('div');
        title.textContent = '⚠ Permiso Android activo — selecciona una opción';
        panel.appendChild(title);
        activeAndroidPermissionButtons.forEach(buttonEl => {
            const button = document.createElement('button');
            button.className = 'permission-select-btn';
            button.textContent = buttonEl.text || buttonEl.resourceId.split('/').pop();
            button.title = buttonEl.resourceId;
            button.addEventListener('click', () => selectHierarchyElement(buttonEl));
            panel.appendChild(button);
        });
        container.appendChild(panel);
    }

    function xmlNodeText(node, closing = false) {
        if (closing) return `</${node.xmlNode.tagName}>`;
        const attributes = Array.from(node.xmlNode.attributes)
            .map(attr => `${attr.name}="${attr.value}"`).join(' ');
        return `<${node.xmlNode.tagName}${attributes ? ' ' + attributes : ''}${node.children.length ? '>' : '/>'}`;
    }

    function renderXmlRows() {
        hierTree.innerHTML = '';
        appendPermissionActions(hierTree);
        const append = node => {
            const expanded = xmlExpandedNodes.get(node.id) === true;
            // Conserva la semántica XML aunque los nodos invisibles estén ocultos en la vista.
            const hasChildren = node.xmlNode.children.length > 0;
            const row = document.createElement('div');
            row.className = 'hier-xml-row' + (node.el === selectedHierarchyElement ? ' selected' : '');
            row.dataset.treeId = String(node.id);
            row.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13) + 'px';
            const toggle = document.createElement('button');
            toggle.className = 'hier-toggle';
            toggle.textContent = hasChildren ? (expanded ? '▾' : '▸') : '·';
            toggle.disabled = !hasChildren;
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                xmlExpandedNodes.set(node.id, !expanded);
                renderXmlRows();
            });
            const opening = document.createElement('span');
            opening.className = 'xml-tag';
            opening.textContent = xmlNodeText(node);
            opening.title = opening.textContent;
            row.append(toggle, opening);
            if (node.el) row.addEventListener('click', () => selectHierarchyElement(node.el));
            hierTree.appendChild(row);

            if (!hasChildren) return;
            if (!expanded) {
                const collapsed = document.createElement('span');
                collapsed.className = 'xml-collapsed';
                collapsed.textContent = ` … </${node.xmlNode.tagName}>`;
                row.appendChild(collapsed);
                return;
            }
            node.children.forEach(append);
            const closing = document.createElement('div');
            closing.className = 'hier-xml-row xml-close';
            closing.style.paddingLeft = (4 + Math.min(node.depth, 8) * 13 + 18) + 'px';
            closing.textContent = xmlNodeText(node, true);
            hierTree.appendChild(closing);
        };
        hierarchyRoots.forEach(append);
    }

    function hierarchyAsText() {
        if (!currentXml) return '';
        try {
            const documentXml = new DOMParser().parseFromString(currentXml, 'application/xml');
            if (documentXml.querySelector('parsererror')) return '';
            const lines = [];
            const visit = (node, depth) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const className = node.getAttribute('class') || node.tagName;
                const label = node.getAttribute('resource-id') ||
                    node.getAttribute('content-desc') || node.getAttribute('text') || '';
                const bounds = node.getAttribute('bounds') || '';
                lines.push(`${'  '.repeat(depth)}<${className}>${label ? ` ${label}` : ''}${bounds ? ` ${bounds}` : ''}`);
                Array.from(node.children).forEach(child => visit(child, depth + 1));
            };
            visit(documentXml.documentElement, 0);
            return lines.join('\n');
        } catch {
            return '';
        }
    }

    function formatXml(xml) {
        try {
            const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            if (documentXml.querySelector('parsererror')) return xml;
            const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
            const visit = (node, depth) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const attributes = Array.from(node.attributes)
                    .map(attr => `${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`).join(' ');
                const opening = `<${node.tagName}${attributes ? ' ' + attributes : ''}`;
                const children = Array.from(node.children);
                if (!children.length) {
                    lines.push(`${'  '.repeat(depth)}${opening}/>`);
                    return;
                }
                lines.push(`${'  '.repeat(depth)}${opening}>`);
                children.forEach(child => visit(child, depth + 1));
                lines.push(`${'  '.repeat(depth)}</${node.tagName}>`);
            };
            visit(documentXml.documentElement, 0);
            return lines.join('\n');
        } catch {
            return xml;
        }
    }

    function renderHierarchyMode() {
        if (hierarchyMode === 'xml') {
            lblHierarchyMode.textContent = '📋 XML source';
            if (!currentXml) {
                hierTree.innerHTML = '<span class="hier-hint">No hay XML cargado.</span>';
                return;
            }
            renderXmlRows();
            return;
        }
        lblHierarchyMode.textContent = '🌳 Hierarchy';
        renderHierarchyTree(currentXml);
        if (!parsedElements.length) {
            hierTree.innerHTML = '<span class="hier-hint">No se encontraron elementos con bounds.</span>';
        }
    }

    function setLocator(strategy, value) {
        cmbLocatorStrategy.value = strategy;
        txtLocatorValue.value = value;
    }

    function selectedLocator() {
        const value = txtLocatorValue.value.trim();
        const strategy = cmbLocatorStrategy.value;
        if (!value) return '';
        const prefixes = {
            accessibility: '~', id: 'id=', class: 'class=', xpath: '', android: 'android=',
            iosPredicate: 'iosPredicate=', iosClassChain: 'iosClassChain='
        };
        return prefixes[strategy] + value;
    }

    function setLocatorFromExplicit(selector) {
        if (selector.startsWith('~')) return setLocator('accessibility', selector.slice(1));
        if (selector.startsWith('id=')) return setLocator('id', selector.slice(3));
        if (selector.startsWith('class=')) return setLocator('class', selector.slice(6));
        if (selector.startsWith('android=')) return setLocator('android', selector.slice(8));
        if (selector.startsWith('iosPredicate=')) return setLocator('iosPredicate', selector.slice(13));
        if (selector.startsWith('iosClassChain=')) return setLocator('iosClassChain', selector.slice(14));
        setLocator('xpath', selector);
    }

    async function copyHierarchyContent(text, label) {
        if (!text) {
            lblXmlVerify.textContent = '— Primero carga el inspector';
            lblXmlVerify.className = 'verify-result err';
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            lblXmlVerify.textContent = `✓ ${label} copiado al portapapeles`;
            lblXmlVerify.className = 'verify-result ok';
        } catch {
            lblXmlVerify.textContent = `✗ No se pudo copiar el ${label.toLowerCase()}`;
            lblXmlVerify.className = 'verify-result err';
        }
    }

    function selectHierarchyElement(el) {
        if (!el) return;
        selectedHierarchyElement = el;
        syncCanvas();
        const ctx = hierCanvas.getContext('2d');
        ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
        drawRect(el, '#FF6600', 'rgba(255,102,0,0.15)', 2.5);
        showAttrs(el);
        showNodeInTree(el);
        showXpathSuggestions(el);
        lblXmlVerify.textContent = '— Verifica antes de usar';
        lblXmlVerify.className   = 'verify-result';
    }

    function showXpathSuggestions(el) {
        hierXpathSug.innerHTML = '';
        if (!el) return;
        const IGNORED = ['android:id/content','android:id/navigationBarBackground'];
        const suggestions = [];

        if (el.isIos) {
            const name = el.iosName || '';
            const label = el.iosLabel || '';
            const value = el.iosValue || '';
            const identifier = name || label || value;
            const escaped = identifier.replace(/'/g, "\\'");
            const escapedChain = identifier.replace(/"/g, '\\"');
            if (identifier && identifier.trim()) {
                suggestions.push({ label: 'Accessibility ID', selector: '~' + identifier });
                suggestions.push({ label: 'iOS Predicate String', selector: "iosPredicate=name == '" + escaped + "'" });
                suggestions.push({ label: 'iOS Class Chain', selector: 'iosClassChain=**/' + el.tag + '[`name == "' + escapedChain + '"`]' });
                suggestions.push({ label: 'XPath name', selector: '//' + el.tag + '[@name="' + identifier + '"]' });
            }
            if (label && label !== identifier) {
                suggestions.push({ label: 'iOS Predicate label', selector: "iosPredicate=label == '" + label.replace(/'/g, "\\'") + "'" });
            }
            suggestions.push({ label: 'Class Name', selector: 'class=' + el.tag });
            suggestions.push({ label: 'XPath class', selector: '//' + el.tag });
        } else if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            suggestions.push({ label: 'ID', selector: 'id=' + el.resourceId });
            const idOnly = el.resourceId.split('/')[1];
            if (idOnly) suggestions.push({ label: 'XPath id contains', selector: '//*[contains(@resource-id,"' + idOnly + '")]' });
        }
        if (!el.isIos && el.contentDesc) {
            suggestions.push({ label: 'Accessibility ID', selector: '~' + el.contentDesc });
        }
        if (!el.isIos && el.text && el.text.length > 0 && el.text.length < 60) {
            suggestions.push({ label: 'Android UIAutomator text', selector: 'android=new UiSelector().text("' + el.text + '")' });
            suggestions.push({ label: 'XPath text', selector: '//*[@text="' + el.text + '"]' });
            if (el.text.length > 4)
                suggestions.push({ label: 'XPath text contains', selector: '//*[contains(@text,"' + el.text.slice(0,20) + '")]' });
        }
        if (!el.isIos && el.className) {
            suggestions.push({ label: 'Class Name', selector: 'class=' + el.className });
            suggestions.push({ label: 'XPath class', selector: '//' + el.className });
        }

        suggestions.forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'xpath-chip';
            chip.innerHTML = '<span class="chip-label">' + s.label + '</span>' +
                             '<span></span>';
            chip.lastElementChild.textContent = s.selector;
            chip.addEventListener('click', () => {
                setLocatorFromExplicit(s.selector);
                document.querySelectorAll('.xpath-chip').forEach(c => c.style.borderColor = '');
                chip.style.borderColor = '#7030A0';
            });
            hierXpathSug.appendChild(chip);
        });

        if (suggestions.length > 0) setLocatorFromExplicit(suggestions[0].selector);
    }

    // Click en screenshot
    hierScreenWrap.addEventListener('click', e => {
        if (!parsedElements.length) return;
        const rect = hierImg.getBoundingClientRect();
        const px   = Math.round(((e.clientX - rect.left) / rect.width)  * deviceW);
        const py   = Math.round(((e.clientY - rect.top)  / rect.height) * deviceH);
        const el   = findElementAt(px, py);
        if (!el) return;

        selectHierarchyElement(el);
    });

    // Hover en screenshot
    hierScreenWrap.addEventListener('mousemove', e => {
        if (!parsedElements.length) return;
        const rect = hierImg.getBoundingClientRect();
        const px   = Math.round(((e.clientX - rect.left) / rect.width)  * deviceW);
        const py   = Math.round(((e.clientY - rect.top)  / rect.height) * deviceH);
        const el   = findElementAt(px, py);

        syncCanvas();
        const ctx = hierCanvas.getContext('2d');
        ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
        if (el) drawRect(el, 'rgba(0,200,255,0.9)', 'rgba(0,200,255,0.06)', 1.5);
    });

    hierScreenWrap.addEventListener('mouseleave', () => {
        syncCanvas();
        const ctx = hierCanvas.getContext('2d');
        ctx.clearRect(0, 0, hierCanvas.width, hierCanvas.height);
        if (selectedHierarchyElement) {
            drawRect(selectedHierarchyElement, '#FF6600', 'rgba(255,102,0,0.15)', 2.5);
        }
    });

    // Abrir inspector
    btnXmlInspector.addEventListener('click', async () => {
        xmlModal.style.display = 'flex';
        await refreshHierarchy();
    });

    async function refreshHierarchy() {
        hierTree.innerHTML    = '<span class="hier-hint">Cargando...</span>';
        hierAttrs.innerHTML   = '<span class="hier-hint">...</span>';
        hierXpathSug.innerHTML = '';
        selectedHierarchyElement = null;

        const [screenshotR, xmlR] = await Promise.all([
            api.getScreenshot(),
            api.getPageSource()
        ]);

        if (screenshotR.success) {
            hierImg.onload = () => syncCanvas();
            hierImg.src = screenshotR.screenshot;
        }

        if (xmlR.success) {
            currentXml     = xmlR.xml;
            parsedElements = parseElements(currentXml);

            // En iOS hay overlays visibles que reportan bounds fuera del viewport.
            // La aplicación visible es la referencia estable de la captura (393×852 en este caso).
            const visibleElements = parsedElements.filter(el => el.isVisible);
            const iosViewport = visibleElements.find(el =>
                el.isIos && el.tag === 'XCUIElementTypeApplication' && el.x1 === 0 && el.y1 === 0
            );
            const xmlDocument = new DOMParser().parseFromString(currentXml, 'application/xml');
            const hierarchyRoot = xmlDocument.documentElement?.tagName === 'hierarchy'
                ? xmlDocument.documentElement : null;
            const androidWidth = Number(hierarchyRoot?.getAttribute('width'));
            const androidHeight = Number(hierarchyRoot?.getAttribute('height'));
            // UiAutomator declara el viewport completo en <hierarchy>, incluyendo
            // las barras del sistema que aparecen en la captura.
            if (androidWidth > 0 && androidHeight > 0) {
                deviceW = androidWidth;
                deviceH = androidHeight;
            } else {
                deviceW = iosViewport ? iosViewport.x2 : Math.max(...visibleElements.map(el => el.x2), 1);
                deviceH = iosViewport ? iosViewport.y2 : Math.max(...visibleElements.map(el => el.y2), 1);
            }
            renderHierarchyMode();
        } else {
            hierTree.innerHTML = '<span style="color:#CC0000">Error cargando XML: ' + (xmlR.error || 'desconocido') + '</span>';
        }
    }

    btnRefreshXml.addEventListener('click', refreshHierarchy);
    btnCopyXml.addEventListener('click', () => { hierarchyMode = 'xml'; renderHierarchyMode(); });
    btnCopyTree.addEventListener('click', () => { hierarchyMode = 'tree'; renderHierarchyMode(); });
    btnCopyHierarchy.addEventListener('click', () => copyHierarchyContent(
        hierarchyMode === 'xml' ? currentXml : hierarchyAsText(),
        hierarchyMode === 'xml' ? 'XML completo' : 'árbol'
    ));

    btnCloseXml.addEventListener('click', () => {
        xmlModal.style.display = 'none';
        syncCanvas();
        hierCanvas.getContext('2d').clearRect(0, 0, hierCanvas.width, hierCanvas.height);
    });

    btnVerifyXpathM.addEventListener('click', async () => {
        const locator = selectedLocator();
        if (!locator) return;
        lblXmlVerify.textContent = '⏳ Verificando...';
        lblXmlVerify.className   = 'verify-result';
        const r = await api.verifySelector(locator);
        if (r.success) {
            lblXmlVerify.textContent = r.summary;
            lblXmlVerify.className   = 'verify-result ok';
        } else {
            lblXmlVerify.textContent = r.summary;
            lblXmlVerify.className   = 'verify-result err';
        }
    });

    btnUseXpath.addEventListener('click', () => {
        const locator = selectedLocator();
        if (!locator) return;
        txtSelector.value = locator;
        const patterns = [
            /^id=[^/]+\/(.+)$/,
            /^id=(.+)$/,
            /^~(.+)$/,
            /@resource-id="[^"]*\/([^"]+)"/,
            /@resource-id="([^"]+)"/,
            /@content-desc="([^"]+)"/,
            /@text="([^"]+)"/
        ];
        for (const re of patterns) {
            const m = locator.match(re);
            if (m) {
                txtVarName.value = m[1].toLowerCase()
                    .replace(/[^a-z0-9]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                break;
            }
        }
        xmlModal.style.display = 'none';
        setStatus('✓ Selector cargado desde Hierarchy Viewer', '#00CC00');
    });


    // ─── ENLAZAR ─────────────────────────────────────────────────────────────
    const enlazarModal         = document.getElementById('enlazarModal');
    const enlazarStepsList     = document.getElementById('enlazarStepsList');
    const scenarioRowsContainer= document.getElementById('scenarioRows');
    const btnNuevoStep         = document.getElementById('btnNuevoStep');
    const btnCloseEnlazar      = document.getElementById('btnCloseEnlazar');
    const btnConfirmarEscenario= document.getElementById('btnConfirmarEscenario');
    const btnEnlazar           = document.getElementById('btnEnlazar');
    const enlazarHint          = document.getElementById('enlazarHint');

    // Estado del constructor de escenario
    let enlazarSteps      = [];   // copia de recordedSteps al abrir el modal
    let scenarioRows      = [];   // [{ text: string, stepIndices: number[] }]
    let activeRowIndex    = -1;   // fila seleccionada en el constructor
    let linkedScenarioData = null; // { linked, stepTexts } — seteado al confirmar, usado al generar

    const GHERKIN_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'];

    function scenarioRowHtml(row, rowIdx) {
        const assignedHtml = row.stepIndices.length === 0
            ? '<span class="assigned-empty-hint">← Haz click en un step de la izquierda para asignarlo</span>'
            : row.stepIndices.map(si => {
                const s = enlazarSteps[si];
                const label = s ? stepSummary(s) : 'Step #' + si;
                return `<span class="assigned-chip" data-row="${rowIdx}" data-si="${si}">
                    ${label.slice(0, 50)}${label.length > 50 ? '…' : ''}
                    <span class="chip-remove" data-row="${rowIdx}" data-si="${si}">✕</span>
                </span>`;
            }).join('');

        const kwOptions = GHERKIN_KEYWORDS.map(kw =>
            `<option value="${kw}"${row.keyword === kw ? ' selected' : ''}>${kw}</option>`
        ).join('');

        return `<div class="scenario-row${rowIdx === activeRowIndex ? ' active' : ''}" data-row="${rowIdx}">
            <div class="scenario-row-header">
                <span class="row-number">${rowIdx + 1}</span>
                <select class="scenario-kw-select" data-row="${rowIdx}">${kwOptions}</select>
                <input type="text" class="scenario-step-input" placeholder="descripción del step..." value="${row.text.replace(/"/g, '&quot;')}" data-row="${rowIdx}"/>
                <button class="btn-remove-row" data-row="${rowIdx}">✕</button>
            </div>
            <div class="assigned-steps-area${row.stepIndices.length === 0 ? ' empty-area' : ''}" data-row="${rowIdx}">
                ${assignedHtml}
            </div>
        </div>`;
    }

    function renderScenarioRows() {
        if (scenarioRows.length === 0) {
            scenarioRowsContainer.innerHTML =
                '<div class="scenario-empty-hint">Agrega un step con el botón "+ Nuevo Step"<br/>o haz click en un step grabado de la izquierda</div>';
            return;
        }
        scenarioRowsContainer.innerHTML = scenarioRows.map((r, i) => scenarioRowHtml(r, i)).join('');

        // Eventos de las filas
        scenarioRowsContainer.querySelectorAll('.scenario-row').forEach(el => {
            el.addEventListener('click', e => {
                // Ignorar clicks en input, remove-row o chip-remove
                if (e.target.classList.contains('scenario-step-input')) return;
                if (e.target.classList.contains('btn-remove-row')) return;
                if (e.target.classList.contains('chip-remove')) return;
                const ri = parseInt(el.dataset.row);
                activeRowIndex = (activeRowIndex === ri) ? -1 : ri;
                updateEnlazarHint();
                renderScenarioRows();
            });
        });

        // Select: guardar keyword al cambiar
        scenarioRowsContainer.querySelectorAll('.scenario-kw-select').forEach(sel => {
            sel.addEventListener('change', e => {
                const ri = parseInt(sel.dataset.row);
                scenarioRows[ri].keyword = e.target.value;
            });
            sel.addEventListener('click', e => e.stopPropagation());
        });

        // Input: guardar texto al escribir
        scenarioRowsContainer.querySelectorAll('.scenario-step-input').forEach(inp => {
            inp.addEventListener('input', e => {
                const ri = parseInt(inp.dataset.row);
                scenarioRows[ri].text = e.target.value;
            });
            inp.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(inp.dataset.row);
                activeRowIndex = ri;
                updateEnlazarHint();
                renderScenarioRows();
                // Restaurar foco al input
                setTimeout(() => {
                    const freshInp = scenarioRowsContainer.querySelector(`.scenario-step-input[data-row="${ri}"]`);
                    if (freshInp) { freshInp.focus(); freshInp.setSelectionRange(freshInp.value.length, freshInp.value.length); }
                }, 0);
            });
        });

        // Botón eliminar fila
        scenarioRowsContainer.querySelectorAll('.btn-remove-row').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(btn.dataset.row);
                scenarioRows.splice(ri, 1);
                if (activeRowIndex >= scenarioRows.length) activeRowIndex = scenarioRows.length - 1;
                renderScenarioRows();
                renderEnlazarSteps();
            });
        });

        // Botón quitar chip de step asignado
        scenarioRowsContainer.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(btn.dataset.row);
                const si = parseInt(btn.dataset.si);
                scenarioRows[ri].stepIndices = scenarioRows[ri].stepIndices.filter(x => x !== si);
                renderScenarioRows();
                renderEnlazarSteps();
            });
        });
    }

    function renderEnlazarSteps() {
        enlazarStepsList.innerHTML = '';
        if (!enlazarSteps || enlazarSteps.length === 0) {
            enlazarStepsList.innerHTML = '<li class="step-empty">Sin steps grabados</li>';
            return;
        }
        const usedIndices = new Set(scenarioRows.flatMap(r => r.stepIndices));
        enlazarSteps.forEach((s, i) => {
            const li = document.createElement('li');
            li.textContent = (i + 1) + '. ' + stepSummary(s);
            li.dataset.index = i;
            li.classList.add('assignable');
            if (usedIndices.has(i)) li.classList.add('step-used');
            li.addEventListener('click', () => {
                if (activeRowIndex < 0) {
                    // Si no hay fila activa, crear una nueva y asignar
                    const defaultKw = scenarioRows.length === 0 ? 'Given' : 'And';
                    scenarioRows.push({ text: '', keyword: defaultKw, stepIndices: [i] });
                    activeRowIndex = scenarioRows.length - 1;
                } else {
                    // Asignar a la fila activa (si no está ya)
                    if (!scenarioRows[activeRowIndex].stepIndices.includes(i)) {
                        scenarioRows[activeRowIndex].stepIndices.push(i);
                    }
                }
                updateEnlazarHint();
                renderScenarioRows();
                renderEnlazarSteps();
            });
            enlazarStepsList.appendChild(li);
        });
    }

    function updateEnlazarHint() {
        if (activeRowIndex >= 0) {
            enlazarHint.textContent = '🔗 Modo Enlazar — fila ' + (activeRowIndex + 1) + ' activa, haz click en steps de la izquierda';
        } else {
            enlazarHint.textContent = '🔗 Modo Enlazar — asigna steps a cada fila del escenario';
        }
    }

    btnEnlazar.addEventListener('click', async () => {
        // Cargar steps actuales
        const sr = await api.getSteps();
        enlazarSteps = sr.steps || [];
        activeRowIndex = -1;
        updateEnlazarHint();
        renderEnlazarSteps();
        renderScenarioRows();
        enlazarModal.style.display = 'flex';
    });

    btnCloseEnlazar.addEventListener('click', () => {
        enlazarModal.style.display = 'none';
    });

    btnNuevoStep.addEventListener('click', () => {
        const defaultKw = scenarioRows.length === 0 ? 'Given' : 'And';
        scenarioRows.push({ text: '', keyword: defaultKw, stepIndices: [] });
        activeRowIndex = scenarioRows.length - 1;
        updateEnlazarHint();
        renderScenarioRows();
        // Foco en el nuevo input
        setTimeout(() => {
            const inputs = scenarioRowsContainer.querySelectorAll('.scenario-step-input');
            if (inputs.length > 0) inputs[inputs.length - 1].focus();
        }, 0);
    });

    btnConfirmarEscenario.addEventListener('click', () => {
        if (scenarioRows.length === 0) {
            enlazarHint.textContent = '⚠ Agrega al menos un step al escenario';
            enlazarHint.style.color = '#CC0000';
            return;
        }

        // Construir el JSON { "step text": [...steps] }
        const linked = {};
        const stepTexts = [];   // solo los textos, para el .feature se pasa el keyword aparte
        const stepRows  = [];   // { keyword, text } para el .feature
        scenarioRows.forEach(row => {
            const key = row.text.trim() || 'step sin nombre';
            stepTexts.push(key);
            stepRows.push({ keyword: row.keyword || 'And', text: key });
            linked[key] = row.stepIndices.map(si => {
                const s = enlazarSteps[si];
                return {
                    action:       s.action        || '',
                    variableName: s.variableName  || '',
                    selector:     s.selector      || '',
                    value:        s.value         || '',
                    description:  s.description   || ''
                };
            });
        });

        // Guardar en memoria para cuando el usuario haga click en GENERAR
        linkedScenarioData = { linked, stepTexts, stepRows };

        // Construir preview Gherkin y actualizar el textarea de la pantalla principal
        const featureName  = (txtFeature  && txtFeature.value.trim())  || 'Flujo mobile';
        const scenarioName = (txtScenario && txtScenario.value.trim()) || 'Escenario';
        const date = new Date().toLocaleString('es-PE');
        const gherkinLines = [
            `# Generado por Appium Visual Recorder`,
            `# Fecha: ${date}`,
            `# locator-module: global`,
            `# Locators: ./resources/locators/global.locator.json`,
            '',
            `Feature: ${featureName}`,
            '',
            `  Scenario: ${scenarioName}`,
            ...scenarioRows.map(r => `    ${r.keyword} ${r.text.trim() || 'step sin nombre'}`),
            ''
        ];
        if (txtGherkin) txtGherkin.value = gherkinLines.join('\n');

        setStatus('✓ Escenario enlazado — presiona GENERAR para crear los archivos', '#FF9900');
        enlazarModal.style.display = 'none';
    });

    // ─── INIT ────────────────────────────────────────────────────────────────
    screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
    screenRecorder.style.cssText = 'display:none !important';
    await Promise.all([loadFrameworkCatalog(), loadDevices(), loadBsCredentials()]);
});
