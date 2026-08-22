export async function initializeRecorder() {

    const api = window.api;

    let selectedStepIndex = -1;
    let currentUdid = '';

    // ─── ELEMENTOS CONFIG ────────────────────────────────────────────────────
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
    let activeWorkspace = {
        mode: 'fwk-mobile',
        label: 'fwk-mobile-test',
        root: '',
        integrated: true
    };
    let frameworkCatalog = null;

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
    const lblLocalDeviceName = document.getElementById('lblLocalDeviceName');
    const lblLocalPlatform = document.getElementById('lblLocalPlatform');
    const lblLocalPackage = document.getElementById('lblLocalPackage');

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
    let sessionPlatform = 'android';

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
    const btnInteract     = document.getElementById('btnInteract');
    const lblInspect      = document.getElementById('lblInspectStatus');
    const txtSelector     = document.getElementById('txtSelector');
    const txtVarName      = document.getElementById('txtVarName');
    const txtElementContext = document.getElementById('txtElementContext');
    const locatorCombobox = document.getElementById('locatorCombobox');
    const locatorCatalogDropdown = document.getElementById('locatorCatalogDropdown');
    const lblLocatorCatalog = document.getElementById('lblLocatorCatalog');
    const locatorCoverage = document.getElementById('locatorCoverage');
    const lblLogicalLocator = document.getElementById('lblLogicalLocator');
    const lblActivePlatform = document.getElementById('lblActivePlatform');
    const lblAndroidCoverage = document.getElementById('lblAndroidCoverage');
    const lblIosCoverage = document.getElementById('lblIosCoverage');
    const btnAssignLocator = document.getElementById('btnAssignLocator');
    const btnCopy         = document.getElementById('btnCopy');
    const btnVerify       = document.getElementById('btnVerify');
    const lblVerify       = document.getElementById('lblVerifyResult');
    const cmbAction       = document.getElementById('cmbAction');
    const txtValue        = document.getElementById('txtValue');
    const txtDesc         = document.getElementById('txtDesc');
    const btnExecute      = document.getElementById('btnExecute');
    const lstSteps        = document.getElementById('lstSteps');
    const txtGherkin      = document.getElementById('txtGherkin');
    const cmbPreviewFile  = document.getElementById('cmbPreviewFile');
    const codeReviewWorkspace = document.getElementById('codeReviewWorkspace');
    const codeFileTree = document.getElementById('codeFileTree');
    const lblCodeFileName = document.getElementById('lblCodeFileName');
    const lblCodeFilePath = document.getElementById('lblCodeFilePath');
    const lblCodeFileState = document.getElementById('lblCodeFileState');
    const lblCodeValidation = document.getElementById('lblCodeValidation');
    const btnCopyCode = document.getElementById('btnCopyCode');
    const btnCopyCodePath = document.getElementById('btnCopyCodePath');
    const btnResetCode = document.getElementById('btnResetCode');
    const lblGenerationFileCount = document.getElementById('lblGenerationFileCount');
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
    const btnOpenFinalReview = document.getElementById('btnOpenFinalReview');
    const btnDelete       = document.getElementById('btnDeleteStep');
    const btnClear        = document.getElementById('btnClearSteps');
    const lblStatus       = document.getElementById('lblStatus');
    const lblGenerate     = document.getElementById('lblGenerateResult');
    const scenarioCoveragePanel = document.getElementById('scenarioCoveragePanel');
    const cmbExistingScenario = document.getElementById('cmbExistingScenario');
    const btnAnalyzeScenario = document.getElementById('btnAnalyzeScenario');
    const scenarioCoverageSummary = document.getElementById('scenarioCoverageSummary');
    const scenarioLocatorQueue = document.getElementById('scenarioLocatorQueue');
    const sessionOnboarding = document.getElementById('sessionOnboarding');
    const onboardingPlatform = document.getElementById('onboardingPlatform');
    const btnOnboardingNew = document.getElementById('btnOnboardingNew');
    const btnOnboardingExisting = document.getElementById('btnOnboardingExisting');
    const btnOnboardingRegenerate = document.getElementById('btnOnboardingRegenerate');
    const onboardingExistingFlow = document.getElementById('onboardingExistingFlow');
    const onboardingRegenerateFlow = document.getElementById('onboardingRegenerateFlow');
    const cmbOnboardingScenario = document.getElementById('cmbOnboardingScenario');
    const cmbOnboardingRegeneration = document.getElementById('cmbOnboardingRegeneration');
    const txtRegenerationRefinement = document.getElementById('txtRegenerationRefinement');
    const chkRegenerationClean = document.getElementById('chkRegenerationClean');
    const onboardingScenarioHint = document.getElementById('onboardingScenarioHint');
    const onboardingRegenerationHint = document.getElementById('onboardingRegenerationHint');
    const btnOnboardingBack = document.getElementById('btnOnboardingBack');
    const btnOnboardingAnalyze = document.getElementById('btnOnboardingAnalyze');
    const btnOnboardingRegenerateBack = document.getElementById('btnOnboardingRegenerateBack');
    const btnOnboardingRegeneratePrepare = document.getElementById('btnOnboardingRegeneratePrepare');
    const assignmentTarget = document.getElementById('assignmentTarget');
    const assignmentTargetName = document.getElementById('assignmentTargetName');
    const assignmentTargetPath = document.getElementById('assignmentTargetPath');
    const btnOpenAssignmentInspector = document.getElementById('btnOpenAssignmentInspector');
    const btnCancelAssignment = document.getElementById('btnCancelAssignment');
    const xmlAssignmentTarget = document.getElementById('xmlAssignmentTarget');
    let lastPreviewToken  = '';
    let previewDocuments  = [];
    let activePreviewDocumentIndex = -1;
    let squadCatalog      = { stepDefinitions: [], screenMethods: [], locators: [], features: [] };
    let locatorActiveIndex = -1;
    let selectedCatalogLocator = null;
    let activeScenarioCoverage = null;
    let currentAssignment = null;
    let verifiedSelector = '';
    let advanceAssignmentAfterSave = false;
    let workflowMode = 'new';
    let recordingScenarioCatalog = [];
    const collapsedLocatorGroups = new Set([
        'Botones', 'Campos', 'Textos', 'Imágenes e íconos', 'Listas y contenedores', 'Otros'
    ]);
    const GENERATED_FILES_STORAGE_KEY = 'appiumVisualRecorder.generatedFiles.v1';
    const COVERAGE_PROGRESS_STORAGE_KEY = 'appiumVisualRecorder.coverageProgress.v1';
    const FRAMEWORK_PREFERENCES_STORAGE_KEY = 'appiumVisualRecorder.frameworkPreferences.v1';

    function readFrameworkPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem(FRAMEWORK_PREFERENCES_STORAGE_KEY) || 'null');
            return stored &&
                stored.mode === activeWorkspace.mode &&
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
            activeWorkspace.mode === 'fwk-mobile'
                ? (cmbFrameworkEnv.value || 'Sin ambiente').toUpperCase()
                : activeWorkspace.label;
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

    function syncLocalDeviceSummary() {
        const selected = cmbDevices.options[cmbDevices.selectedIndex];
        if (lblLocalDeviceName) {
            lblLocalDeviceName.textContent = selected?.textContent?.replace(/\s+\(Android.*$/, '') ||
                'Dispositivo local';
        }
        if (lblLocalPlatform) {
            const match = selected?.textContent?.match(/\((Android[^)]*)\)/);
            lblLocalPlatform.textContent = match?.[1] || `Android ${txtPlatformV.value || ''}`.trim();
        }
        if (lblLocalPackage) lblLocalPackage.textContent = txtPackage.value.trim() || 'Sin paquete';
    }

    scenarioLocatorQueue.tabIndex = 0;
    scenarioLocatorQueue.addEventListener('wheel', event => {
        if (scenarioLocatorQueue.scrollHeight <= scenarioLocatorQueue.clientHeight) return;
        event.preventDefault();
        event.stopPropagation();
        scenarioLocatorQueue.scrollTop += event.deltaY;
    }, { passive: false });
    scenarioLocatorQueue.addEventListener('keydown', event => {
        const page = Math.max(120, scenarioLocatorQueue.clientHeight * 0.8);
        if (event.key === 'PageDown') scenarioLocatorQueue.scrollTop += page;
        else if (event.key === 'PageUp') scenarioLocatorQueue.scrollTop -= page;
        else if (event.key === 'Home') scenarioLocatorQueue.scrollTop = 0;
        else if (event.key === 'End') {
            scenarioLocatorQueue.scrollTop = scenarioLocatorQueue.scrollHeight;
        } else {
            return;
        }
        event.preventDefault();
    });

    function rememberGeneratedFiles(files) {
        let history = [];
        try {
            const stored = JSON.parse(localStorage.getItem(GENERATED_FILES_STORAGE_KEY) || '[]');
            if (Array.isArray(stored)) history = stored;
        } catch {
            history = [];
        }
        history.unshift({
            generatedAt: new Date().toISOString(),
            squad: cmbFrameworkSquad.value || 'payment',
            files
        });
        localStorage.setItem(GENERATED_FILES_STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
    }

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
        frameworkCatalog = catalog;
        activeWorkspace = catalog.workspace || activeWorkspace;
        const workspaceName = document.getElementById('lblWorkspaceName');
        if (workspaceName && catalog.workspace) {
            workspaceName.textContent = catalog.workspace.label;
            workspaceName.title = catalog.workspace.root;
        }
        const requiresEnvironment = activeWorkspace.mode === 'fwk-mobile';
        if (frameworkEnvironmentField) {
            frameworkEnvironmentField.style.display = requiresEnvironment ? '' : 'none';
        }
        if (lblDetectedProjectTitle) {
            lblDetectedProjectTitle.textContent = activeWorkspace.integrated
                ? 'Proyecto integrado detectado'
                : 'Workspace de salida';
        }
        if (lblDetectedProject) {
            lblDetectedProject.textContent = `📁 ${activeWorkspace.label}`;
        }
        if (lblDetectedProjectPath) {
            lblDetectedProjectPath.textContent = activeWorkspace.root || '';
            lblDetectedProjectPath.title = activeWorkspace.root || '';
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
        if (!activeWorkspace.integrated) {
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

    async function loadSquadCatalog(platform = sessionPlatform) {
        const squad = cmbFrameworkSquad.value || 'payment';
        if (!api.getSquadCatalog || !squad) return;
        const result = await api.getSquadCatalog(squad, platform, cmbFrameworkFeatureScope?.value || '');
        if (!result.success) {
            squadCatalog = { stepDefinitions: [], screenMethods: [], locators: [], features: [] };
            if (lblLocatorCatalog) lblLocatorCatalog.textContent = '✗ ' + result.error;
            return;
        }
        squadCatalog = result.catalog;
        renderLocatorCatalog();
    }

    function updateFeatureScopeOptions(preferred = '') {
        if (!cmbFrameworkFeatureScope) return;
        const squad = frameworkCatalog?.squads?.find(item => item.name === cmbFrameworkSquad.value);
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

    async function loadExistingScenarios() {
        const squad = cmbFrameworkSquad.value || 'payment';
        const result = await api.getExistingScenarios(squad);
        // La consulta puede terminar después de que el usuario ya eligió y analizó
        // un escenario durante la conexión. Lee la selección al recibir la respuesta,
        // no antes de esperar el IPC, para que una respuesta tardía no la borre.
        const selectedScenarioId =
            activeScenarioCoverage?.scenario?.id ||
            cmbExistingScenario.value ||
            cmbOnboardingScenario.value ||
            '';
        const selectedRegenerationId = cmbOnboardingRegeneration.value || '';
        // Ignora respuestas pertenecientes a un squad que dejó de estar activo.
        if (squad !== (cmbFrameworkSquad.value || 'payment')) return;
        cmbExistingScenario.innerHTML = '<option value="">Selecciona una grabación...</option>';
        cmbOnboardingScenario.innerHTML = '<option value="">Selecciona una grabación...</option>';
        cmbOnboardingRegeneration.innerHTML = '<option value="">Selecciona una grabación...</option>';
        if (!result.success) {
            scenarioCoverageSummary.textContent = '✗ ' + result.error;
            return;
        }
        recordingScenarioCatalog = result.scenarios;
        result.scenarios.forEach(scenario => {
            const option = document.createElement('option');
            const recordedAt = scenario.recordedAt
                ? new Date(scenario.recordedAt).toLocaleString('es-PE')
                : 'fecha desconocida';
            option.value = scenario.id;
            option.textContent =
                `${scenario.caseId ? scenario.caseId + ' · ' : ''}` +
                `${scenario.name.replace(/^(\[[^\]]+\])+/, '').trim()} · ` +
                `${String(scenario.platform || '').toUpperCase()} · ${recordedAt}`;
            option.title = `${scenario.recordingId || scenario.id} · ${scenario.actionCount || 0} acciones`;
            cmbExistingScenario.appendChild(option);
            cmbOnboardingScenario.appendChild(option.cloneNode(true));
            const regenerationOption = option.cloneNode(true);
            regenerationOption.textContent += scenario.canRegenerate
                ? (scenario.regenerationIteration
                    ? ` · refinamiento v${scenario.regenerationIteration}`
                    : ' · generado')
                : ' · pendiente de agente';
            cmbOnboardingRegeneration.appendChild(regenerationOption);
        });
        const scenarioStillExists = result.scenarios.some(
            scenario => scenario.id === selectedScenarioId
        );
        if (scenarioStillExists) {
            cmbExistingScenario.value = selectedScenarioId;
            cmbOnboardingScenario.value = selectedScenarioId;
        } else if (activeScenarioCoverage) {
            activeScenarioCoverage = null;
            currentAssignment = null;
            scenarioLocatorQueue.innerHTML = '';
            renderAssignmentTarget();
        }
        if (result.scenarios.some(scenario => scenario.id === selectedRegenerationId)) {
            cmbOnboardingRegeneration.value = selectedRegenerationId;
        }
        scenarioCoverageSummary.textContent =
            activeScenarioCoverage && scenarioStillExists
                ? scenarioCoverageSummary.textContent
                : `${result.scenarios.length} grabación(es) encontradas en ${squad}`;
        onboardingScenarioHint.textContent =
            `${result.scenarios.length} grabación(es) del ambiente activo en ${squad}`;
        updateRegenerationControls();
    }

    function updateRegenerationControls() {
        const selected = recordingScenarioCatalog.find(
            scenario => scenario.id === cmbOnboardingRegeneration.value
        );
        const clean = Boolean(chkRegenerationClean?.checked);
        const refining = Boolean(selected?.canRegenerate && !clean);
        txtRegenerationRefinement.disabled = !refining;
        btnOnboardingRegeneratePrepare.textContent = refining
            ? 'Preparar refinamiento →'
            : 'Recrear paquete para el agente →';
        if (!selected) {
            onboardingRegenerationHint.textContent = recordingScenarioCatalog.length
                ? `${recordingScenarioCatalog.length} grabación(es) disponibles para reprocesar o refinar.`
                : 'No hay grabaciones disponibles en el ambiente y squad activos.';
        } else if (refining) {
            onboardingRegenerationHint.textContent =
                'Automatización validada al 100%: puedes indicar una mejora y conservar su historial.';
        } else {
            onboardingRegenerationHint.textContent = clean
                ? 'Se eliminará solo el paquete anterior; acciones, XML y capturas se conservarán.'
                : 'Se reconstruirá el paquete Cowork desde las acciones ya grabadas.';
        }
    }

    async function analyzeSelectedScenario() {
        const scenarioId = cmbExistingScenario.value;
        if (!scenarioId) {
            scenarioCoverageSummary.textContent = '⚠ Selecciona una grabación';
            return false;
        }
        if (
            activeScenarioCoverage &&
            activeScenarioCoverage.scenario.id !== scenarioId
        ) {
            currentAssignment = null;
            verifiedSelector = '';
            txtSelector.value = '';
            txtVarName.value = '';
        }
        disableBtn(btnAnalyzeScenario, '⏳ Analizando...');
        const result = await api.getScenarioCoverage(
            scenarioId,
            cmbFrameworkSquad.value || 'payment'
        );
        enableBtn(btnAnalyzeScenario);
        if (!result.success) {
            scenarioCoverageSummary.textContent = '✗ ' + result.error;
            return false;
        }
        activeScenarioCoverage = result.coverage;
        if (advanceAssignmentAfterSave) {
            advanceAssignmentAfterSave = false;
            selectNextPendingAssignment();
        } else {
            restoreCoverageAssignment();
        }
        renderScenarioCoverage();
        renderAssignmentTarget();
        return true;
    }

    function selectNextPendingAssignment() {
        if (!activeScenarioCoverage) return;
        const activeKey = sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
        const orderedLocators = activeScenarioCoverage.steps
            .flatMap(step => step.locators || [])
            .filter((locator, index, items) =>
                items.findIndex(item =>
                    item.file === locator.file && item.name === locator.name
                ) === index
            );
        const next = orderedLocators.find(locator => !locator[activeKey]);
        if (!next) {
            currentAssignment = null;
            persistCoverageProgress();
            return;
        }
        currentAssignment = {
            ...next,
            selector: next[activeKey],
            platform: sessionPlatform,
            scope: 'scenario',
            squad: cmbFrameworkSquad.value || 'payment'
        };
        verifiedSelector = '';
        txtSelector.value = '';
        txtVarName.value = next.name;
        selectedCatalogLocator = null;
        setVerify('— Inspecciona y verifica un selector');
        persistCoverageProgress();
    }

    function restoreCoverageAssignment() {
        if (!activeScenarioCoverage || currentAssignment) return;
        try {
            const stored = JSON.parse(
                localStorage.getItem(COVERAGE_PROGRESS_STORAGE_KEY) || '{}'
            );
            if (
                stored.scenarioId !== activeScenarioCoverage.scenario.id ||
                stored.platform !== sessionPlatform
            ) return;
            const locator = activeScenarioCoverage.locators.find(item =>
                item.name === stored.currentLocator && item.file === stored.currentFile
            );
            if (!locator) return;
            const activeKey = sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
            currentAssignment = {
                ...locator,
                selector: locator[activeKey],
                platform: sessionPlatform,
                scope: 'scenario',
                squad: cmbFrameworkSquad.value || 'payment'
            };
        } catch {
            // El progreso es auxiliar; un valor corrupto no bloquea el análisis.
        }
    }

    function renderScenarioCoverage() {
        scenarioLocatorQueue.innerHTML = '';
        if (!activeScenarioCoverage) return;
        const coverage = activeScenarioCoverage;
        const activeKey = sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
        const complete = coverage.locators.filter(locator => Boolean(locator[activeKey])).length;
        const pending = coverage.locators.length - complete;
        scenarioCoverageSummary.innerHTML =
            `<strong>${coverage.scenario.caseId || 'Caso'}</strong> · ` +
            `${sessionPlatform.toUpperCase()}: ${complete}/${coverage.locators.length} locators` +
            (pending ? ` · <span class="coverage-missing">${pending} pendientes</span>` : ' · ✓ completo') +
            (coverage.unresolvedSteps.length
                ? `<br>⚠ ${coverage.unresolvedSteps.length} steps sin resolver`
                : '');

        coverage.steps.forEach((gherkinStep, stepIndex) => {
            const branch = document.createElement('section');
            branch.className = 'scenario-step-branch' +
                (!gherkinStep.definition ? ' unresolved' : '');

            const header = document.createElement('div');
            header.className = 'scenario-step-node';
            const order = document.createElement('span');
            order.className = 'scenario-step-order';
            order.textContent = String(stepIndex + 1);
            const keyword = document.createElement('span');
            keyword.className = 'scenario-step-keyword';
            keyword.textContent = gherkinStep.keyword;
            const text = document.createElement('span');
            text.className = 'scenario-step-text';
            text.textContent = gherkinStep.text;
            text.title = gherkinStep.text;
            header.append(order, keyword, text);
            branch.appendChild(header);

            const stepLocators = Array.isArray(gherkinStep.locators)
                ? gherkinStep.locators
                : [];
            const children = document.createElement('div');
            children.className = 'scenario-step-locators';
            if (stepLocators.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'scenario-step-empty';
                empty.textContent = gherkinStep.definition
                    ? '└ Sin locator requerido'
                    : '└ Step sin definición encontrada';
                children.appendChild(empty);
            }
            stepLocators.forEach((locator, locatorIndex) => {
                const ready = Boolean(locator[activeKey]);
                const item = document.createElement('div');
                const selected = currentAssignment &&
                    currentAssignment.file === locator.file &&
                    currentAssignment.name === locator.name;
                item.className = 'scenario-locator-item' +
                    (ready ? ' ready' : '') +
                    (selected ? ' selected' : '');
                const name = document.createElement('span');
                name.className = 'scenario-locator-name';
                name.textContent =
                    `${locatorIndex === stepLocators.length - 1 ? '└' : '├'} ` +
                    `${ready ? '✓' : '⚠'} ${locator.name}`;
                const module = document.createElement('span');
                module.className = 'scenario-locator-module';
                module.textContent =
                    `${locator.module} · A:${locator.androidSelector ? '✓' : '—'} ` +
                    `I:${locator.iosSelector ? '✓' : '—'}`;
                item.append(name, module);
                item.addEventListener('click', () => selectCoverageAssignment(locator));
                children.appendChild(item);
            });
            branch.appendChild(children);
            scenarioLocatorQueue.appendChild(branch);
        });
        updateFinalAction();
    }

    function selectCoverageAssignment(locator) {
        currentAssignment = {
            ...locator,
            selector: sessionPlatform === 'ios'
                ? locator.iosSelector
                : locator.androidSelector,
            platform: sessionPlatform,
            scope: 'scenario',
            squad: cmbFrameworkSquad.value || 'payment'
        };
        verifiedSelector = '';
        persistCoverageProgress();
        txtSelector.value = '';
        txtVarName.value = locator.name;
        selectedCatalogLocator = null;
        setVerify('— Inspecciona y verifica un selector');
        scenarioCoveragePanel.classList.add('is-open');
        renderAssignmentTarget();
        renderScenarioCoverage();
    }

    function renderAssignmentTarget() {
        if (!currentAssignment) {
            assignmentTarget.style.display = 'none';
            xmlAssignmentTarget.textContent = '';
            txtVarName.readOnly = false;
            renderSelectedLocatorCoverage();
            return;
        }
        assignmentTarget.style.display = 'flex';
        assignmentTargetName.textContent = currentAssignment.name;
        assignmentTargetPath.textContent =
            `${currentAssignment.module} · completando ${sessionPlatform.toUpperCase()}`;
        xmlAssignmentTarget.textContent = `🎯 Asignando a: ${currentAssignment.name}`;
        txtVarName.value = currentAssignment.name;
        txtVarName.readOnly = true;
        renderSelectedLocatorCoverage();
        updateAssignmentButton();
    }

    function updateAssignmentButton() {
        const selector = txtSelector.value.trim();
        const assignment = currentAssignment || selectedCatalogLocator;
        if (!btnAssignLocator) return;
        btnAssignLocator.disabled = !assignment || !selector;
        if (assignment) {
            const operation = assignment.selector ? 'actualizar' : 'asignar';
            btnAssignLocator.textContent =
                verifiedSelector === selector
                    ? `${assignment.selector ? 'Actualizar' : 'Asignar'} valor ${sessionPlatform.toUpperCase()}`
                    : `Verificar y ${operation} ${sessionPlatform.toUpperCase()}`;
        }
    }

    function persistCoverageProgress() {
        if (!activeScenarioCoverage) return;
        localStorage.setItem(COVERAGE_PROGRESS_STORAGE_KEY, JSON.stringify({
            scenarioId: activeScenarioCoverage.scenario.id,
            squad: cmbFrameworkSquad.value || 'payment',
            platform: sessionPlatform,
            currentLocator: currentAssignment?.name || '',
            currentFile: currentAssignment?.file || ''
        }));
    }

    btnAnalyzeScenario.addEventListener('click', analyzeSelectedScenario);
    btnOpenAssignmentInspector.addEventListener('click', () => btnInspect.click());
    btnCancelAssignment.addEventListener('click', () => {
        currentAssignment = null;
        verifiedSelector = '';
        txtSelector.value = '';
        txtVarName.value = '';
        persistCoverageProgress();
        renderAssignmentTarget();
        renderScenarioCoverage();
        setVerify('— Selecciona un locator de la cola');
    });

    function showSessionOnboarding() {
        onboardingPlatform.textContent =
            sessionPlatform === 'ios' ? '🍎 iOS' : '🤖 Android';
        onboardingExistingFlow.style.display = 'none';
        onboardingRegenerateFlow.style.display = 'none';
        document.querySelector('.onboarding-options').style.display = 'grid';
        if (!activeScenarioCoverage) cmbOnboardingScenario.value = '';
        sessionOnboarding.style.display = 'flex';
    }

    function setRecorderConnecting(connecting) {
        [btnInspect, btnInteract, btnXmlInspector, btnExecute, btnRefreshScr]
            .filter(Boolean)
            .forEach(button => { button.disabled = connecting; });
    }

    btnOnboardingNew.addEventListener('click', () => {
        workflowMode = 'new';
        activeScenarioCoverage = null;
        currentAssignment = null;
        selectedCatalogLocator = null;
        verifiedSelector = '';
        scenarioLocatorQueue.innerHTML = '';
        cmbExistingScenario.value = '';
        cmbOnboardingScenario.value = '';
        cmbOnboardingRegeneration.value = '';
        scenarioCoverageSummary.textContent =
            'Selecciona una grabación para detectar sus locators.';
        txtSelector.value = '';
        txtVarName.value = '';
        txtVarName.readOnly = false;
        setVerify('— Ingresa un selector');
        renderAssignmentTarget();
        screenRecorder.classList.remove('existing-workflow');
        sessionOnboarding.style.display = 'none';
        scenarioCoveragePanel.classList.remove('is-open');
        updateFinalAction();
        setStatus(
            `✨ Caso nuevo · graba las acciones · ${sessionPlatform.toUpperCase()}`,
            '#00CC00'
        );
    });

    btnOnboardingExisting.addEventListener('click', () => {
        document.querySelector('.onboarding-options').style.display = 'none';
        onboardingRegenerateFlow.style.display = 'none';
        onboardingExistingFlow.style.display = 'flex';
        cmbOnboardingScenario.focus();
    });

    btnOnboardingRegenerate.addEventListener('click', () => {
        document.querySelector('.onboarding-options').style.display = 'none';
        onboardingExistingFlow.style.display = 'none';
        onboardingRegenerateFlow.style.display = 'flex';
        cmbOnboardingRegeneration.focus();
        updateRegenerationControls();
    });

    cmbOnboardingRegeneration.addEventListener('change', updateRegenerationControls);
    chkRegenerationClean.addEventListener('change', updateRegenerationControls);

    btnOnboardingBack.addEventListener('click', () => {
        onboardingExistingFlow.style.display = 'none';
        document.querySelector('.onboarding-options').style.display = 'grid';
    });

    btnOnboardingRegenerateBack.addEventListener('click', () => {
        onboardingRegenerateFlow.style.display = 'none';
        document.querySelector('.onboarding-options').style.display = 'grid';
    });

    btnOnboardingRegeneratePrepare.addEventListener('click', async () => {
        const recordingId = cmbOnboardingRegeneration.value;
        const refinement = txtRegenerationRefinement.value.trim();
        const cleanPackage = Boolean(chkRegenerationClean.checked);
        if (!recordingId) {
            onboardingRegenerationHint.textContent = '⚠ Selecciona una grabación.';
            return;
        }
        disableBtn(btnOnboardingRegeneratePrepare, '⏳ Preparando...');
        const result = await api.prepareAutomationRegeneration({
            recordingId,
            squad: cmbFrameworkSquad.value || 'payment',
            refinement,
            cleanPackage
        });
        enableBtn(btnOnboardingRegeneratePrepare);
        if (!result.success) {
            onboardingRegenerationHint.textContent = '✗ ' + result.error;
            return;
        }
        workflowMode = result.mode === 'refinement' ? 'regenerate' : 'reprocess';
        automationWorkflow = true;
        invalidatePreview();
        previewDocuments = [];
        if (automationPackageStatus) {
            automationPackageStatus.textContent =
                result.mode === 'refinement'
                    ? '✓ Iteración preparada. Abre el agente, refina la propuesta e impórtala nuevamente.'
                    : '✓ Paquete reconstruido desde la grabación. Abre el agente e importa su propuesta.';
            automationPackageStatus.className = 'generate-result ok';
        }
        showAutomationHandoff(result.handoff);
        enlazarModal.style.display = 'flex';
        setWizardPage(3);
        sessionOnboarding.style.display = 'none';
        setStatus(
            result.mode === 'refinement'
                ? '♻️ Refinando una automatización existente'
                : '♻️ Reprocesando una grabación existente',
            '#00CC00'
        );
    });

    btnOnboardingAnalyze.addEventListener('click', async () => {
        if (!cmbOnboardingScenario.value) {
            onboardingScenarioHint.textContent = '⚠ Selecciona una grabación';
            return;
        }
        cmbExistingScenario.value = cmbOnboardingScenario.value;
        disableBtn(btnOnboardingAnalyze, '⏳ Analizando...');
        const success = await analyzeSelectedScenario();
        enableBtn(btnOnboardingAnalyze);
        if (!success) {
            onboardingScenarioHint.textContent = scenarioCoverageSummary.textContent;
            return;
        }
        workflowMode = 'existing';
        screenRecorder.classList.add('existing-workflow');
        sessionOnboarding.style.display = 'none';
        scenarioCoveragePanel.classList.add('is-open');
        scenarioCoveragePanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setStatus(
            `🧭 Caso cargado · completando ${sessionPlatform.toUpperCase()}`,
            '#00CC00'
        );
        updateFinalAction();
    });

    function updateFinalAction() {
        if (!btnOpenFinalReview) return;
        if (workflowMode === 'existing') {
            const activeKey = sessionPlatform === 'ios' ? 'iosSelector' : 'androidSelector';
            const pending = activeScenarioCoverage
                ? activeScenarioCoverage.locators.filter(locator => !locator[activeKey]).length
                : 1;
            btnOpenFinalReview.textContent = pending
                ? `Completa ${pending} locator${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}`
                : '✓ Finalizar cobertura';
            btnOpenFinalReview.disabled = pending > 0;
            return;
        }
        const hasSteps = lstSteps && lstSteps.querySelectorAll('li:not(.step-empty)').length > 0;
        btnOpenFinalReview.textContent = 'Revisar y finalizar caso →';
        btnOpenFinalReview.disabled = !hasSteps;
    }

    btnOpenFinalReview.addEventListener('click', () => {
        if (workflowMode === 'existing') {
            setStatus(
                `✓ Cobertura ${sessionPlatform.toUpperCase()} completa para el caso seleccionado`,
                '#00CC00'
            );
            return;
        }
        document.getElementById('btnEnlazar')?.click();
    });

    function renderLocatorCatalog() {
        if (!locatorCatalogDropdown) return;
        const query = txtVarName.value.trim().toLowerCase();
        const filtered = squadCatalog.locators.filter(locator =>
            !query || `${locator.name} ${locator.module} ${locator.scope}`.toLowerCase().includes(query)
        );
        const typeOrder = ['Botones', 'Campos', 'Textos', 'Imágenes e íconos', 'Listas y contenedores', 'Otros'];
        const grouped = new Map(typeOrder.map(type => [type, new Map()]));
        filtered.forEach(locator => {
            const type = locatorTypeGroup(locator);
            const moduleName = locator.module.split('/').pop() || locator.module;
            const modules = grouped.get(type);
            if (!modules.has(moduleName)) modules.set(moduleName, []);
            modules.get(moduleName).push(locator);
        });

        locatorCatalogDropdown.innerHTML = '';
        typeOrder.forEach(type => {
            const modules = grouped.get(type);
            const count = [...modules.values()].reduce((sum, entries) => sum + entries.length, 0);
            if (!count) return;
            const collapsed = !query && collapsedLocatorGroups.has(type);
            const header = document.createElement('div');
            header.className = 'catalog-group-header';
            header.innerHTML = `<span>${collapsed ? '▸' : '▾'} ${type}</span><span>${count}</span>`;
            header.addEventListener('mousedown', event => {
                event.preventDefault();
                collapsedLocatorGroups.has(type)
                    ? collapsedLocatorGroups.delete(type)
                    : collapsedLocatorGroups.add(type);
                renderLocatorCatalog();
            });
            locatorCatalogDropdown.appendChild(header);
            if (collapsed) return;

            [...modules.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([moduleName, locators]) => {
                const moduleHeader = document.createElement('div');
                moduleHeader.className = 'catalog-module-header';
                moduleHeader.textContent = `${moduleName} (${locators.length})`;
                locatorCatalogDropdown.appendChild(moduleHeader);
                locators.sort((a, b) => a.name.localeCompare(b.name)).forEach(locator => {
                    const option = document.createElement('div');
                    option.className = 'catalog-option';
                    option.dataset.locatorName = locator.name;
                    option.dataset.locatorFile = locator.file;
                    option.innerHTML =
                        `<span class="catalog-option-name">${locator.name}</span>` +
                        `<span class="catalog-option-source">` +
                        `${locator.selector ? '✓' : '⚠'} ${locator.scope} · ` +
                        `A:${locator.androidSelector ? '✓' : '—'} I:${locator.iosSelector ? '✓' : '—'}` +
                        `</span>`;
                    option.title = locator.file;
                    option.addEventListener('mousedown', event => {
                        event.preventDefault();
                        selectCatalogLocator(locator);
                    });
                    locatorCatalogDropdown.appendChild(option);
                });
            });
        });
        if (!filtered.length) {
            locatorCatalogDropdown.innerHTML =
                '<div class="catalog-empty">Sin coincidencias. El nombre escrito se usará como locator nuevo.</div>';
        }
        locatorActiveIndex = -1;
        if (lblLocatorCatalog) {
            lblLocatorCatalog.textContent =
                `${squadCatalog.locators.length} locators indexados · ` +
                `${cmbFrameworkSquad.value || 'payment'} → commons → home → global`;
        }
    }

    function locatorTypeGroup(locator) {
        const value =
            `${locator.name} ${locator.androidSelector || ''} ${locator.iosSelector || ''}`.toLowerCase();
        if (/(^|\\W)(btn|button)|widget\\.button|xcuielementtypebutton/.test(value)) return 'Botones';
        if (/(^|\\W)(input|textfield|search|field)|edittext|xcuielementtypetextfield/.test(value)) return 'Campos';
        if (/(^|\\W)(lbl|label|title|text)|textview|statictext/.test(value)) return 'Textos';
        if (/(^|\\W)(img|image|icon)|imageview/.test(value)) return 'Imágenes e íconos';
        if (/(^|\\W)(list|item|card|container)|recyclerview|collectionview|cell/.test(value)) {
            return 'Listas y contenedores';
        }
        return 'Otros';
    }

    function selectCatalogLocator(locator) {
        if (currentAssignment) return;
        clearSelectorChips();
        const capturedSelector = txtSelector.value.trim();
        txtVarName.value = locator.name;
        if (!capturedSelector && locator.selector) {
            txtSelector.value = executableCatalogSelector(locator);
        }
        selectedCatalogLocator = locator;
        locatorCatalogDropdown.classList.remove('open');
        txtVarName.setAttribute('aria-expanded', 'false');
        renderSelectedLocatorCoverage();
        if (lblLocatorCatalog) lblLocatorCatalog.textContent = `🔗 ${locator.scope}: ${locator.file}`;
        setStatus(
            locator.selector
                ? `✓ Locator encontrado en ${locator.file}`
                : `⚠ ${locator.name} no tiene valor ${sessionPlatform.toUpperCase()}`,
            locator.selector ? '#00CC00' : '#FF9900'
        );
    }

    function renderSelectedLocatorCoverage() {
        if (!locatorCoverage) return;
        const locator = currentAssignment || selectedCatalogLocator;
        if (!locator) {
            locatorCoverage.style.display = 'none';
            return;
        }
        locatorCoverage.style.display = 'flex';
        lblLogicalLocator.textContent = locator.name;
        lblActivePlatform.textContent = sessionPlatform;
        const renderState = (element, value) => {
            element.textContent = value ? '✓ Configurado' : '⚠ Sin valor';
            element.className = value ? 'coverage-ready' : 'coverage-missing';
            element.title = value || '';
        };
        renderState(lblAndroidCoverage, locator.androidSelector);
        renderState(lblIosCoverage, locator.iosSelector);
        updateAssignmentButton();
    }

    btnAssignLocator.addEventListener('click', async () => {
        const assignment = currentAssignment || selectedCatalogLocator;
        if (!assignment) return;
        const selector = txtSelector.value.trim();
        if (!selector) {
            setStatus('⚠ Captura o ingresa un selector', '#FF9900');
            return;
        }
        if (verifiedSelector !== selector) {
            disableBtn(btnAssignLocator, '⏳ Verificando...');
            const verification = await api.verifySelector(selector);
            if (!verification.success) {
                verifiedSelector = '';
                setVerify(verification.summary, 'err');
                setStatus('✗ No se actualizó: selector no encontrado', '#CC0000');
                updateAssignmentButton();
                return;
            }
            if (verification.screenshot) updateDeviceScreen(verification.screenshot);
            verifiedSelector = selector;
            setVerify(verification.summary, 'ok');
            setStatus('✓ Selector verificado', '#00CC00');
            updateAssignmentButton();
        }
        const selectedFile = assignment.file;
        const selectedName = assignment.name;
        const currentValue = assignment.selector || '';
        if (
            currentValue && currentValue !== selector &&
            !window.confirm(
                `Se reemplazará el valor ${sessionPlatform.toUpperCase()} de ` +
                `${selectedName}.\n\nActual: ${currentValue}\nNuevo: ${selector}`
            )
        ) {
            updateAssignmentButton();
            return;
        }

        disableBtn(btnAssignLocator, '⏳ Guardando...');
        const result = await api.assignLocatorValue({
            recordingId: activeScenarioCoverage?.scenario?.recordingId || undefined,
            file: selectedFile,
            name: selectedName,
            selector,
            platform: sessionPlatform,
            androidBlock: assignment.androidBlock,
            iosBlock: assignment.iosBlock
        });
        enableBtn(btnAssignLocator);
        if (!result.success) {
            setStatus('✗ ' + result.error, '#CC0000');
            updateAssignmentButton();
            return;
        }
        squadCatalog = result.catalog;
        const updatedCatalogLocator = squadCatalog.locators.find(locator =>
            locator.file === selectedFile && locator.name === selectedName
        );
        renderLocatorCatalog();
        setStatus(
            result.coverageComplete
                ? `✓ Cobertura ${sessionPlatform.toUpperCase()} completa; archivos del framework actualizados`
                : `✓ ${selectedName} actualizado en ${result.block}`,
            '#00CC00'
        );
        verifiedSelector = '';
        if (currentAssignment && activeScenarioCoverage) {
            advanceAssignmentAfterSave = true;
            await analyzeSelectedScenario();
        } else {
            selectedCatalogLocator = updatedCatalogLocator || {
                ...assignment,
                selector: result.selector,
                ...(sessionPlatform === 'ios'
                    ? { iosSelector: result.selector, iosBlock: result.block }
                    : { androidSelector: result.selector, androidBlock: result.block })
            };
            renderSelectedLocatorCoverage();
        }
    });

    function executableCatalogSelector(locator) {
        const selector = String(locator.selector || '').trim();
        if (
            locator.platform === 'android' &&
            (selector.startsWith('new UiSelector(') || selector.startsWith('new UiScrollable('))
        ) {
            return `android=${selector}`;
        }
        if (locator.platform === 'ios' && selector.startsWith('**/')) {
            return `iosClassChain=${selector}`;
        }
        return selector;
    }

    cmbFrameworkSquad.addEventListener('change', () => {
        updateFeatureScopeOptions();
        linkedScenarioData = null;
        activeScenarioCoverage = null;
        currentAssignment = null;
        verifiedSelector = '';
        scenarioLocatorQueue.innerHTML = '';
        cmbExistingScenario.value = '';
        cmbOnboardingScenario.value = '';
        renderAssignmentTarget();
        loadSquadCatalog(sessionPlatform);
        loadExistingScenarios();
        updateSavedFrameworkSummary();
    });
    cmbFrameworkFeatureScope?.addEventListener('change', () => {
        linkedScenarioData = null;
        activeScenarioCoverage = null;
        loadSquadCatalog(sessionPlatform);
        updateSavedFrameworkSummary();
    });
    cmbFrameworkEnv.addEventListener('change', updateSavedFrameworkSummary);

    btnSaveFrameworkConfig.addEventListener('click', async () => {
        const requiresEnvironment = activeWorkspace.mode === 'fwk-mobile';
        if ((requiresEnvironment && !cmbFrameworkEnv.value) || !cmbFrameworkSquad.value) {
            lblFrameworkStatus.textContent = requiresEnvironment
                ? '⚠ Selecciona ambiente y squad'
                : '⚠ Selecciona un squad de salida';
            lblFrameworkStatus.className = 'device-info err';
            return;
        }
        if (chkRememberFramework.checked) {
            localStorage.setItem(FRAMEWORK_PREFERENCES_STORAGE_KEY, JSON.stringify({
                mode: activeWorkspace.mode,
                environment: cmbFrameworkEnv.value,
                squad: cmbFrameworkSquad.value,
                featureScope: cmbFrameworkFeatureScope?.value || '',
                savedAt: new Date().toISOString()
            }));
        } else {
            localStorage.removeItem(FRAMEWORK_PREFERENCES_STORAGE_KEY);
        }
        linkedScenarioData = null;
        activeScenarioCoverage = null;
        await Promise.all([loadSquadCatalog(sessionPlatform), loadExistingScenarios()]);
        closeFrameworkSetup();
    });

    const showFrameworkSetup = () => {
        chkRememberFramework.checked = Boolean(readFrameworkPreferences());
        openFrameworkSetup();
    };
    btnChangeFramework.addEventListener('click', showFrameworkSetup);
    btnChangeFrameworkInline.addEventListener('click', showFrameworkSetup);

    txtVarName.addEventListener('focus', () => {
        if (txtVarName.readOnly) return;
        renderLocatorCatalog();
        locatorCatalogDropdown.classList.add('open');
        txtVarName.setAttribute('aria-expanded', 'true');
    });
    txtVarName.addEventListener('input', () => {
        if (txtVarName.readOnly) return;
        selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
        renderLocatorCatalog();
        locatorCatalogDropdown.classList.add('open');
    });
    txtVarName.addEventListener('keydown', event => {
        const options = [...locatorCatalogDropdown.querySelectorAll('.catalog-option')];
        if (event.key === 'Escape') {
            locatorCatalogDropdown.classList.remove('open');
            txtVarName.setAttribute('aria-expanded', 'false');
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || options.length === 0) return;
        event.preventDefault();
        if (event.key === 'Enter' && locatorActiveIndex >= 0) {
            const locator = squadCatalog.locators.find(
                item =>
                    item.name === options[locatorActiveIndex].dataset.locatorName &&
                    item.file === options[locatorActiveIndex].dataset.locatorFile
            );
            if (locator) selectCatalogLocator(locator);
            return;
        }
        locatorActiveIndex = event.key === 'ArrowDown'
            ? Math.min(locatorActiveIndex + 1, options.length - 1)
            : Math.max(locatorActiveIndex - 1, 0);
        options.forEach((option, index) => option.classList.toggle('active', index === locatorActiveIndex));
        options[locatorActiveIndex]?.scrollIntoView({ block: 'nearest' });
    });
    document.addEventListener('mousedown', event => {
        if (locatorCombobox && !locatorCombobox.contains(event.target)) {
            locatorCatalogDropdown.classList.remove('open');
            txtVarName.setAttribute('aria-expanded', 'false');
        }
    });

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
        const wizardResult = document.getElementById('wizardGenerationResult');
        if (wizardResult) {
            wizardResult.textContent = msg;
            wizardResult.className = 'generate-result' + (type ? ' ' + type : '');
        }
    }

    function buildGenerationRequest() {
        return {
            squad: cmbFrameworkSquad.value,
            featureScope: cmbFrameworkFeatureScope?.value || '',
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

    function buildPreparedGenerationRequest() {
        const request = buildGenerationRequest();
        if (linkedScenarioData) {
            request.examples = linkedScenarioData.examples || {};
            request.scenarioRows = linkedScenarioData.stepRows.map(row => ({
                ...row,
                status: row.status || 'missing',
                actions: linkedScenarioData.linked[row.text] || []
            }));
        }
        return request;
    }

    function invalidatePreview() {
        lastPreviewToken = '';
        previewDocuments = [];
        activePreviewDocumentIndex = -1;
        if (cmbPreviewFile) cmbPreviewFile.style.display = 'none';
        if (codeReviewWorkspace) codeReviewWorkspace.style.display = 'none';
        if (codeFileTree) codeFileTree.innerHTML = '';
    }

    [
        txtFeature, txtScenario, txtCaseId, cmbPathType,
        txtFeatureTag, txtFeatureFile, txtLocatorModule, txtDataName
    ].filter(Boolean).forEach(field => {
        field.addEventListener('input', invalidatePreview);
        field.addEventListener('change', invalidatePreview);
    });

    function previewLayer(document) {
        const file = document.path.split(/[\\/]/).pop() || document.path;
        if (file.endsWith('.feature')) return { key: 'feature', label: '🥒 Feature' };
        if (file.endsWith('.steps.ts')) return { key: 'steps', label: '🔗 Steps' };
        if (file.endsWith('.screen.ts')) return { key: 'screen', label: '📱 Screen Object' };
        if (file.endsWith('.locator.json')) return { key: 'locators', label: '🎯 Locators' };
        if (file.endsWith('.json')) return { key: 'data', label: '🗃 JSON' };
        return { key: 'other', label: '📄 Otros' };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function validatePreviewDocument(document) {
        const file = document.path.toLowerCase();
        const content = document.content;
        if (!content.trim()) return { valid: false, message: '✕ El archivo está vacío' };
        if (file.endsWith('.json')) {
            try {
                JSON.parse(content);
                return { valid: true, message: '✓ JSON válido' };
            } catch (error) {
                return { valid: false, message: `✕ JSON inválido: ${error.message}` };
            }
        }
        if (file.endsWith('.feature')) {
            if (!/^Feature:\s+\S+/m.test(content)) {
                return { valid: false, message: '✕ Falta la declaración Feature' };
            }
            if (!/Scenario(?: Outline)?:\s+\[TC-\d+\]/.test(content)) {
                return { valid: false, message: '✕ Scenario sin identificador TC válido' };
            }
            return { valid: true, message: '✓ Estructura Gherkin válida' };
        }
        if (file.endsWith('.ts')) {
            const pairs = [['{', '}'], ['(', ')'], ['[', ']']];
            const unbalanced = pairs.some(([open, close]) =>
                [...content].filter(char => char === open).length !==
                [...content].filter(char => char === close).length
            );
            return unbalanced
                ? { valid: false, message: '✕ TypeScript contiene delimitadores incompletos' }
                : { valid: true, message: '✓ TypeScript listo para validación final' };
        }
        return { valid: true, message: '✓ Contenido disponible' };
    }

    function updatePreviewDocumentState() {
        const document = previewDocuments[activePreviewDocumentIndex];
        if (!document) return;
        const modified = document.content !== document.originalContent;
        const validation = validatePreviewDocument(document);
        lblCodeFileState.textContent = modified
            ? '✎ Editado'
            : document.generated ? '✓ Generado' : '● Nuevo';
        lblCodeFileState.className =
            `code-file-state${modified ? ' edited' : document.generated ? ' generated' : ''}`;
        lblCodeValidation.textContent = validation.message;
        lblCodeValidation.className = validation.valid ? 'ok' : 'err';
        const button = codeFileTree?.querySelector(
            `[data-preview-index="${activePreviewDocumentIndex}"]`
        );
        if (button) {
            button.classList.toggle('modified', modified);
            button.classList.toggle('invalid', !validation.valid);
            const state = button.querySelector('.code-file-item-state');
            if (state) {
                state.textContent = !validation.valid
                    ? '✕'
                    : modified ? '✎' : document.generated ? '✓' : '●';
            }
        }
    }

    function renderPreviewFileTree() {
        if (!codeFileTree) return;
        codeFileTree.innerHTML = '';
        const groups = new Map();
        previewDocuments.forEach((document, index) => {
            const layer = previewLayer(document);
            if (!groups.has(layer.key)) groups.set(layer.key, { ...layer, documents: [] });
            groups.get(layer.key).documents.push({ document, index });
        });
        groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'code-file-group';
            const title = document.createElement('div');
            title.className = 'code-file-group-title';
            title.textContent = group.label;
            section.appendChild(title);
            group.documents.forEach(({ document: previewDocument, index }) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'code-file-item';
                button.dataset.previewIndex = String(index);
                const fileName = previewDocument.path.split(/[\\/]/).pop();
                button.innerHTML =
                    `<span class="code-file-item-state">●</span>` +
                    `<span><strong>${escapeHtml(fileName)}</strong>` +
                    `<small>${escapeHtml(previewDocument.path)}</small></span>`;
                button.addEventListener('click', () => showPreviewDocument(index));
                section.appendChild(button);
            });
            codeFileTree.appendChild(section);
        });
    }

    function showPreviewDocument(index) {
        const document = previewDocuments[index];
        if (!document || !txtGherkin) return;
        activePreviewDocumentIndex = index;
        cmbPreviewFile.value = String(index);
        txtGherkin.value = document.content;
        lblCodeFileName.textContent = document.path.split(/[\\/]/).pop() || document.path;
        lblCodeFilePath.textContent = document.path;
        lblCodeFilePath.title = document.path;
        codeFileTree?.querySelectorAll('.code-file-item').forEach(item =>
            item.classList.toggle('active', Number(item.dataset.previewIndex) === index)
        );
        updatePreviewDocumentState();
    }

    cmbPreviewFile.addEventListener('change', () => {
        showPreviewDocument(Number(cmbPreviewFile.value));
    });

    txtGherkin.addEventListener('input', () => {
        const document = previewDocuments[activePreviewDocumentIndex];
        if (!document) return;
        document.content = txtGherkin.value;
        updatePreviewDocumentState();
    });

    btnCopyCode?.addEventListener('click', async () => {
        const document = previewDocuments[activePreviewDocumentIndex];
        if (!document) return;
        await navigator.clipboard.writeText(document.content);
        lblCodeValidation.textContent = '✓ Contenido copiado';
        lblCodeValidation.className = 'ok';
    });

    btnCopyCodePath?.addEventListener('click', async () => {
        const document = previewDocuments[activePreviewDocumentIndex];
        if (!document) return;
        await navigator.clipboard.writeText(document.path);
        lblCodeValidation.textContent = '✓ Ruta copiada';
        lblCodeValidation.className = 'ok';
    });

    btnResetCode?.addEventListener('click', () => {
        const document = previewDocuments[activePreviewDocumentIndex];
        if (!document) return;
        document.content = document.originalContent;
        txtGherkin.value = document.content;
        updatePreviewDocumentState();
    });

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
            updateFinalAction();
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
        updateFinalAction();
    }

    function stepSummary(step) {
        const loc = step.contextHint || step.elementIntent || (step.variableName ? '{' + step.variableName + '}' : (step.selector || ''));
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
        clearSelectorChips();
        if (txtSelector) txtSelector.value = '';
        if (txtVarName)  txtVarName.value  = '';
        if (txtElementContext) txtElementContext.value = '';
        selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
        if (txtValue)    txtValue.value    = '';
        if (txtDesc)     txtDesc.value     = '';
        setVerify('— Ingresa un selector');
    }

    // ─── TAB SWITCHER ────────────────────────────────────────────────────────
    function switchTab(mode) {
        activeMode = mode;
        if (mode === 'local') {
            sessionPlatform = 'android';
            tabLocal.classList.add('active');
            tabBS.classList.remove('active');
            localPanel.style.display = 'flex';
            bsPanel.style.display    = 'none';
        } else {
            sessionPlatform = bsPlatform;
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
        sessionPlatform = platform;
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
        if (r.username && r.accessKey) {
            lblBsCreds.textContent = '✓ Credenciales guardadas y cargadas';
        } else {
            document.getElementById('bsAdvanced').open = true;
            lblBsCreds.textContent = 'Configura tus credenciales una sola vez.';
        }
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
        setRecorderConnecting(true);
        sessionPlatform = bsPlatform;
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
                setRecorderConnecting(false);
                sessionPlatform = bsPlatform;
                cmbFrameworkSquad.disabled = true;
                if (cmbFrameworkFeatureScope) cmbFrameworkFeatureScope.disabled = true;
                lblDevice.textContent = '☁️ ' + deviceLabel;
                setStatus('✓ Sesion BrowserStack — ' + deviceLabel, '#00CC00');
                if (result.screenshot) updateDeviceScreen(result.screenshot);
                await loadSquadCatalog(sessionPlatform);
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
        syncLocalDeviceSummary();
    }

    cmbDevices.addEventListener('change', () => {
        currentUdid = cmbDevices.value;
        syncLocalDeviceSummary();
    });
    txtPackage.addEventListener('input', syncLocalDeviceSummary);
    txtPlatformV.addEventListener('input', syncLocalDeviceSummary);
    btnRefreshDev.addEventListener('click', loadDevices);

    btnDetectApp.addEventListener('click', async () => {
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
        setRecorderConnecting(true);
        sessionPlatform = 'android';
        await loadExistingScenarios();
        showSessionOnboarding();

        await new Promise(r => setTimeout(r, 50));

        const config = {
            deviceName, udid, platformVersion: version,
            appPackage: pkg, appActivity: act || '.MainActivity',
            squad: cmbFrameworkSquad.value || 'payment',
            featureScope: cmbFrameworkFeatureScope?.value || '',
            environment: cmbFrameworkEnv.value,
            ...(apk ? { appPath: apk } : {})
        };

        try {
            const result = await api.startSession(config);
            if (result.success) {
                setRecorderConnecting(false);
                sessionPlatform = 'android';
                cmbFrameworkSquad.disabled = true;
                if (cmbFrameworkFeatureScope) cmbFrameworkFeatureScope.disabled = true;
                lblDevice.textContent = deviceName;
                setStatus('✓ Sesion activa — ' + deviceName, '#00CC00');
                if (result.screenshot) updateDeviceScreen(result.screenshot);
                await loadSquadCatalog(sessionPlatform);
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

    // ─── RECORDER ────────────────────────────────────────────────────────────
    btnRefreshScr.addEventListener('click', async () => {
        const r = await api.getScreenshot();
        if (r.success) updateDeviceScreen(r.screenshot);
    });

    btnCloseSession.addEventListener('click', async () => {
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

    // ── Chips de selector (inspector físico) ─────────────────────────────────
    function clearSelectorChips() {
        document.getElementById('selectorChips')?.remove();
    }

    function renderSelectorChips(candidates, suggested) {
        let chipsWrap = document.getElementById('selectorChips');
        if (!chipsWrap) {
            chipsWrap = document.createElement('div');
            chipsWrap.id = 'selectorChips';
            chipsWrap.style.cssText =
                'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding:4px 0';
            const selectorRow = txtSelector.closest('.input-row');
            selectorRow.insertAdjacentElement('afterend', chipsWrap);
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
                verifiedSelector = '';
                const patterns = [
                    /^id=[^/]+\/(.+)$/,
                    /^id=(.+)$/,
                    /^~(.+)$/,
                    /@resource-id="[^"]*\/([^"]+)"/,
                    /@resource-id="([^"]+)"/,
                    /@content-desc="([^"]+)"/,
                    /@text="([^"]+)"/,
                ];
                if (!currentAssignment) {
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
                }
                updateAssignmentButton();
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
    let interactionActive    = false;
    let interactionBusy      = false;
    let interactionDownFn    = null;
    let interactionUpFn      = null;
    let interactionCancelFn  = null;
    let interactionStart     = null;

    /** Genera candidatos explícitos de Appium a partir de un elemento parseado. */
    function buildCandidatesFromEl(el) {
        const IGNORED = ['android:id/content','android:id/navigationBarBackground','android:id/statusBarBackground'];
        const cands = [];
        let p = 1;

        // Android
        if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            const isComposeId = !el.resourceId.includes('/') && !el.resourceId.includes(':');
            cands.push({
                label: isComposeId ? 'Compose resource-id' : 'ID',
                selector: isComposeId
                    ? '//*[@resource-id="' + el.resourceId + '"]'
                    : 'id=' + el.resourceId,
                priority: p++
            });
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
        if (
            /XCUIElementType(TextField|SecureTextField)/.test(el.tag) &&
            !iosName && !iosLabel && el.iosAncestorName
        ) {
            cands.push({
                label: 'iOS campo por contenedor accesible',
                selector: '//' + (el.iosAncestorTag || 'XCUIElementTypeOther') +
                    '[@name="' + el.iosAncestorName.replace(/"/g, '\\"') + '"]//' + el.tag,
                priority: p++
            });
            cands.push({
                label: 'iOS Class Chain editable',
                selector: 'iosClassChain=**/' + el.tag,
                priority: p++
            });
        }

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
        btnInspect.textContent = '🔍 Inspeccionar';
        btnInspect.disabled    = false;
    }

    function exitInteractionMode() {
        interactionActive = false;
        interactionBusy = false;
        imgDevice.classList.remove('manual-interaction', 'busy');
        btnInteract.classList.remove('mode-active');
        btnInteract.textContent = '👆 Interactuar';
        btnInspect.disabled = false;
        interactionStart = null;
        if (interactionDownFn) imgDevice.removeEventListener('pointerdown', interactionDownFn);
        if (interactionUpFn) imgDevice.removeEventListener('pointerup', interactionUpFn);
        if (interactionCancelFn) imgDevice.removeEventListener('pointercancel', interactionCancelFn);
        interactionDownFn = null;
        interactionUpFn = null;
        interactionCancelFn = null;
    }

    async function loadDeviceCoordinateSpace() {
        const xmlR = await api.getPageSource();
        if (!xmlR.success) throw new Error(xmlR.error || 'No se pudo obtener el XML');

        const elements = parseElements(xmlR.xml);
        const coordinateElements = elements.filter(el =>
            Number.isFinite(el.x2) && Number.isFinite(el.y2) && el.x2 > 0 && el.y2 > 0
        );
        const wm = xmlR.xml.match(/width="(\d+)"/);
        const hm = xmlR.xml.match(/height="(\d+)"/);
        inspectorDimW = wm
            ? parseInt(wm[1])
            : Math.max(...coordinateElements.map(el => el.x2), deviceW || 1);
        inspectorDimH = hm
            ? parseInt(hm[1])
            : Math.max(...coordinateElements.map(el => el.y2), deviceH || 1);

        if (!inspectorDimW || !inspectorDimH) {
            throw new Error('No se pudieron determinar las dimensiones del dispositivo');
        }
    }

    btnInteract.addEventListener('click', async () => {
        if (interactionActive) {
            exitInteractionMode();
            setInspect('— Interacción manual desactivada', '');
            setStatus('—', '#888AAA');
            return;
        }

        if (inspectorActive) exitInspectorMode();
        interactionActive = true;
        btnInteract.disabled = true;
        btnInteract.textContent = '⏳ Cargando...';
        setInspect('⏳ Preparando interacción manual...', 'active');

        try {
            await loadDeviceCoordinateSpace();
            if (!interactionActive) return;
            btnInteract.disabled = false;
            btnInteract.textContent = '✕ Salir';
            btnInteract.classList.add('mode-active');
            btnInspect.disabled = true;
            imgDevice.classList.add('manual-interaction');
            setInspect('👆 Clic para tap · arrastra para scroll o swipe', 'ok');
            setStatus('👆 Interacción manual activa', '#21B14B');

            const toDevicePoint = event => {
                const rect = imgDevice.getBoundingClientRect();
                return {
                    x: Math.round(((event.clientX - rect.left) / rect.width) * inspectorDimW),
                    y: Math.round(((event.clientY - rect.top) / rect.height) * inspectorDimH),
                };
            };

            interactionDownFn = event => {
                if (!interactionActive || interactionBusy) return;
                event.preventDefault();
                interactionStart = toDevicePoint(event);
                imgDevice.setPointerCapture?.(event.pointerId);
            };

            interactionUpFn = async event => {
                if (!interactionActive || interactionBusy || !interactionStart) return;
                event.preventDefault();
                const start = interactionStart;
                const end = toDevicePoint(event);
                interactionStart = null;
                interactionBusy = true;
                imgDevice.classList.add('busy');

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const distance = Math.hypot(dx, dy);
                const isDrag = distance >= Math.max(20, Math.min(inspectorDimW, inspectorDimH) * 0.025);
                const gestureName = Math.abs(dy) >= Math.abs(dx) ? 'scroll' : 'swipe';
                setInspect(
                    isDrag
                        ? '⏳ Ejecutando ' + gestureName + '...'
                        : '⏳ Tocando (' + end.x + ', ' + end.y + ')...',
                    'active'
                );

                const result = isDrag
                    ? await api.swipeFromTo(start.x, start.y, end.x, end.y)
                    : await api.tapAt(end.x, end.y);
                if (!interactionActive) return;
                if (result.success) {
                    if (result.screenshot) updateDeviceScreen(result.screenshot);
                    const completed = isDrag
                        ? (gestureName === 'scroll' ? 'Scroll' : 'Swipe')
                        : 'Tap';
                    setInspect('✓ ' + completed + ' ejecutado — puedes seguir interactuando', 'ok');
                    setStatus('✓ ' + completed + ' manual ejecutado', '#00CC00');
                } else {
                    setInspect('✗ No se pudo ejecutar el gesto: ' + (result.error || 'Error desconocido'), 'err');
                    setStatus('✗ Error en gesto manual', '#CC0000');
                }
                interactionBusy = false;
                imgDevice.classList.remove('busy');
            };
            interactionCancelFn = () => { interactionStart = null; };
            imgDevice.addEventListener('pointerdown', interactionDownFn);
            imgDevice.addEventListener('pointerup', interactionUpFn);
            imgDevice.addEventListener('pointercancel', interactionCancelFn);
        } catch (error) {
            exitInteractionMode();
            btnInteract.disabled = false;
            setInspect('✗ ' + error.message, 'err');
            setStatus('✗ No se pudo activar la interacción', '#CC0000');
        }
    });

    btnInspect.addEventListener('click', async () => {
        // Si ya está activo → cancelar
        if (inspectorActive) {
            exitInspectorMode();
            setInspect('— Inspección cancelada', '');
            setStatus('—', '#888AAA');
            return;
        }

        // Activar modo inspección
        if (interactionActive) exitInteractionMode();
        clearSelectorChips();
        selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
        txtSelector.value = '';
        txtVarName.value = currentAssignment?.name || '';
        if (txtElementContext) txtElementContext.value = '';
        verifiedSelector = '';
        setVerify('— Selecciona y verifica un elemento');
        updateAssignmentButton();
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
            clearSelectorChips();
            if (candidates.length === 0) {
                setInspect('⚠ Elemento sin identificadores útiles — elige otro', 'err');
                setStatus('⚠ Sin identificadores', '#FF9900');
                return;
            }

            txtSelector.value = candidates[0].selector;
            txtVarName.value  = currentAssignment?.name || '';
            verifiedSelector = '';
            if (candidates.length > 1) renderSelectorChips(candidates, txtVarName.value);
            renderAssignmentTarget();
            updateAssignmentButton();

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
            verifiedSelector = selector;
            setVerify(result.summary, 'ok');
            setStatus('✓ Verificado', '#00CC00');
        } else {
            verifiedSelector = '';
            setVerify(result.summary, 'err');
            setStatus('✗ No encontrado', '#CC0000');
        }
        updateAssignmentButton();
    });

    txtSelector.addEventListener('input', () => {
        verifiedSelector = '';
        updateAssignmentButton();
    });

    cmbAction.addEventListener('change', () => {
        const action  = cmbAction.value;
        const noSel   = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];
        txtSelector.disabled = noSel.includes(action);
        txtVarName.disabled  = noSel.includes(action);
        if (txtElementContext) txtElementContext.disabled = noSel.includes(action);
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
        const varName  = currentAssignment?.name || selectedCatalogLocator?.name || '';
        const contextHint = txtElementContext?.value.trim() || '';
        const value    = txtValue.value.trim();
        const desc     = txtDesc.value.trim();
        const noSel    = ['ABRIR_APP','SCROLL_DOWN','SCROLL_UP','VOLVER','ESPERAR','SCREENSHOT'];

        if (!noSel.includes(action) && !selector) {
            setStatus('⚠ Ingresa un selector', '#FF6600'); return;
        }
        if (!noSel.includes(action) && !contextHint) {
            setStatus('⚠ Agrega una pista sobre la función del elemento', '#FF6600');
            txtElementContext?.focus();
            return;
        }

        const step = {
            action,
            variableName: varName,
            contextHint,
            selector,
            value,
            description: desc,
            ...(selectedCatalogLocator ? {
                locatorSource: {
                    file: selectedCatalogLocator.file,
                    module: selectedCatalogLocator.module,
                    scope: selectedCatalogLocator.scope
                }
            } : {})
        };
        invalidatePreview();
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
            const pr = await api.previewGherkin(
                txtFeature.value.trim() || 'Flujo mobile',
                txtScenario.value.trim() || 'Escenario'
            );
            if (pr.success && txtGherkin) txtGherkin.value = pr.preview;
        } else {
            setStatus('✗ ' + result.message, '#CC0000');
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (selectedStepIndex < 0) { setStatus('⚠ Selecciona un step', '#FF6600'); return; }
        await api.deleteStep(selectedStepIndex);
        invalidatePreview();
        selectedStepIndex = -1;
        const r = await api.getSteps();
        renderSteps(r.steps);
        setStatus('🗑️ Eliminado', '#FF6600');
    });

    btnClear.addEventListener('click', async () => {
        await api.clearSteps();
        invalidatePreview();
        selectedStepIndex = -1;
        renderSteps([]);
        if (txtGherkin) txtGherkin.value = '';
        setStatus('🧹 Limpiado', '#666888');
    });

    async function refreshGenerationPreview(preserveReviewed = false) {
        const reviewedByPath = preserveReviewed
            ? new Map(previewDocuments.map(document => [document.path, document.content]))
            : new Map();
        const r = await api.previewFwkFiles(buildPreparedGenerationRequest());
        if (r.success && txtGherkin) {
            lastPreviewToken = r.previewToken;
            const proposedDocuments = [
                { path: r.preview.featurePath, content: r.preview.featureContent },
                ...(r.preview.locatorPath
                    ? [{ path: r.preview.locatorPath, content: r.preview.locatorContent }]
                    : []),
                ...(r.preview.stepPath
                    ? [{ path: r.preview.stepPath, content: r.preview.stepContent }]
                    : []),
                ...(r.preview.screenPath
                    ? [{ path: r.preview.screenPath, content: r.preview.screenContent }]
                    : [])
            ];
            previewDocuments = proposedDocuments.map(document => ({
                ...document,
                originalContent: document.content,
                content: reviewedByPath.has(document.path)
                    ? reviewedByPath.get(document.path)
                    : document.content
            }));
            cmbPreviewFile.innerHTML = '';
            previewDocuments.forEach((previewDocument, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = previewDocument.path;
                cmbPreviewFile.appendChild(option);
            });
            cmbPreviewFile.style.display = 'none';
            codeReviewWorkspace.style.display = 'grid';
            renderPreviewFileTree();
            showPreviewDocument(0);
            if (lblGenerationFileCount) {
                const edited = previewDocuments.filter(document =>
                    document.content !== document.originalContent
                ).length;
                lblGenerationFileCount.textContent =
                    `${previewDocuments.length} archivo(s) revisados` +
                    `${edited ? ` · ${edited} editado(s)` : ''}.`;
            }

            const problems = [
                ...r.validation.errors,
                ...r.validation.conflicts.map(file => `Conflicto: ${file}`)
            ];
            if (problems.length > 0) {
                setGenerate('✗ ' + problems.join(' | '), 'err');
            } else {
                const warnings = r.validation.warnings.length
                    ? ` · ${r.validation.warnings.join(' | ')}`
                    : '';
                const updates = r.managedUpdates
                    ? ` · ${r.managedUpdates} archivo(s) administrado(s) se actualizarán`
                    : '';
                setGenerate(`✓ Revisar ${r.preview.files.length} archivo(s)${updates}${warnings}`, 'ok');
            }
        } else {
            setGenerate('✗ ' + r.error, 'err');
        }
        return r;
    }

    btnPreview.addEventListener('click', async () => {
        if (automationWorkflow) await importAutomationResponse(true);
        else await refreshGenerationPreview();
    });

    btnGenerate.addEventListener('click', async () => {
        disableBtn(btnGenerate, '⏳ Generando...');
        if (automationWorkflow) {
            const invalidDocuments = previewDocuments
                .map(document => ({ document, validation: validatePreviewDocument(document) }))
                .filter(item => !item.validation.valid);
            if (invalidDocuments.length) {
                setGenerate('✕ Corrige los archivos inválidos antes de generar.', 'err');
                enableBtn(btnGenerate);
                return;
            }
            const reviewedContents = Object.fromEntries(
                previewDocuments.map(document => [document.path, document.content])
            );
            const result = await api.generateAutomationResponse(lastPreviewToken, reviewedContents);
            enableBtn(btnGenerate);
            if (!result.success) {
                setGenerate('✗ ' + result.error, 'err');
                return;
            }
            rememberGeneratedFiles(result.generated.files);
            setGenerate(
                `✓ ${result.generated.files.length} archivos generados · memoria v${result.memoryVersion} validada al 100%`,
                'ok'
            );
            previewDocuments.forEach(document => {
                document.originalContent = document.content;
                document.generated = true;
            });
            renderPreviewFileTree();
            return;
        }
        // El estado del filesystem puede cambiar después de abrir la revisión.
        // Reconstruye el preview para no conservar conflictos de archivos ya eliminados.
        const currentPreview = await refreshGenerationPreview(true);
        if (
            !currentPreview.success ||
            currentPreview.validation.errors.length > 0 ||
            currentPreview.validation.conflicts.length > 0
        ) {
            enableBtn(btnGenerate);
            return;
        }
        const invalidDocuments = previewDocuments
            .map(document => ({ document, validation: validatePreviewDocument(document) }))
            .filter(item => !item.validation.valid);
        if (invalidDocuments.length > 0) {
            setGenerate(
                '✕ Corrige los archivos inválidos: ' +
                invalidDocuments.map(item => item.document.path.split(/[\\/]/).pop()).join(', '),
                'err'
            );
            enableBtn(btnGenerate);
            return;
        }

        const request = buildPreparedGenerationRequest();
        const reviewedContents = Object.fromEntries(
            previewDocuments.map(document => [document.path, document.content])
        );
        const r = await api.generateFwkFiles(request, lastPreviewToken, reviewedContents);
        enableBtn(btnGenerate);
        if (r.success) {
            const paths = r.generated.files.join(' | ');
            rememberGeneratedFiles(r.generated.files);
            setGenerate('✓ ' + paths, 'ok');
            linkedScenarioData = null;
            previewDocuments.forEach(document => {
                document.originalContent = document.content;
                document.generated = true;
            });
            renderPreviewFileTree();
            showPreviewDocument(Math.max(0, activePreviewDocumentIndex));
            lblCodeFileState.textContent = '✓ Generado';
            lblCodeFileState.className = 'code-file-state generated';
            if (lblGenerationFileCount) {
                lblGenerationFileCount.textContent =
                    `✓ ${previewDocuments.length} archivo(s) generados. ` +
                    'Puedes seleccionarlos y copiar su contenido.';
            }
            await loadSquadCatalog(sessionPlatform);
            renderLocatorCatalog();
            setStatus('✓ Archivos generados · catálogos de Steps y locators actualizados', '#00CC00');
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
        // Algunos TextField de iOS no exponen name/label propios. Conservamos el
        // identificador del ancestro accesible para poder construir un selector estable.
        try {
            const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
            documentXml.querySelectorAll('XCUIElementTypeTextField, XCUIElementTypeSecureTextField')
                .forEach(node => {
                    const x = Number(node.getAttribute('x'));
                    const y = Number(node.getAttribute('y'));
                    const width = Number(node.getAttribute('width'));
                    const height = Number(node.getAttribute('height'));
                    const element = elements.find(candidate =>
                        candidate.tag === node.tagName &&
                        candidate.x1 === x && candidate.y1 === y &&
                        candidate.x2 === x + width && candidate.y2 === y + height
                    );
                    if (!element) return;
                    let ancestor = node.parentElement;
                    while (ancestor && ancestor !== documentXml.documentElement) {
                        const identifier = ancestor.getAttribute('name') || ancestor.getAttribute('label');
                        if (identifier) {
                            element.iosAncestorName = identifier;
                            element.iosAncestorTag = ancestor.tagName;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }
                });
        } catch {
            // El parser principal seguirá ofreciendo selectores por clase.
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
            ? (/XCUIElementType(Button|Link|Switch|TextField|SecureTextField)/.test(el.tag) ||
                getAttrVal(el.attrs, 'accessible') === 'true')
            : el.clickable === 'true'
        );
        let pool = actionable.length ? actionable : candidates;
        if (!actionable.length && candidates.some(el => el.isIos)) {
            const containers = [...candidates].sort((a, b) =>
                ((a.x2-a.x1) * (a.y2-a.y1)) - ((b.x2-b.x1) * (b.y2-b.y1))
            );
            const nearbyEditable = parsedElements.filter(el =>
                el.isIos && el.isVisible &&
                /XCUIElementType(TextField|SecureTextField)/.test(el.tag) &&
                containers.some(container =>
                    el.x1 >= container.x1 && el.x2 <= container.x2 &&
                    el.y1 >= container.y1 && el.y2 <= container.y2
                )
            ).sort((a, b) => {
                const distance = el => {
                    const dx = px < el.x1 ? el.x1-px : px > el.x2 ? px-el.x2 : 0;
                    const dy = py < el.y1 ? el.y1-py : py > el.y2 ? py-el.y2 : 0;
                    return Math.hypot(dx, dy);
                };
                return distance(a) - distance(b);
            });
            if (nearbyEditable.length && (() => {
                const field = nearbyEditable[0];
                const dx = px < field.x1 ? field.x1-px : px > field.x2 ? px-field.x2 : 0;
                const dy = py < field.y1 ? field.y1-py : py > field.y2 ? py-field.y2 : 0;
                return Math.hypot(dx, dy) <= 48;
            })()) {
                pool = [nearbyEditable[0]];
            }
        }
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
            // iOS puede marcar un contenedor como oculto aunque su TextField hijo sea visible.
            // Omitimos el contenedor, pero conservamos sus descendientes seleccionables.
            if (xmlNode.getAttribute('visible') === 'false') {
                Array.from(xmlNode.children).forEach(child => buildNode(child, parent, depth));
                return;
            }
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
        if (el.isIos && el.tag === 'XCUIElementTypeCell') {
            const childControls = parsedElements.filter(candidate =>
                candidate.isIos && candidate.isVisible &&
                /XCUIElementType(Button|Link|Switch|TextField|SecureTextField)/.test(candidate.tag) &&
                candidate.x1 >= el.x1 && candidate.x2 <= el.x2 &&
                candidate.y1 >= el.y1 && candidate.y2 <= el.y2
            ).sort((a, b) =>
                ((a.x2-a.x1) * (a.y2-a.y1)) - ((b.x2-b.x1) * (b.y2-b.y1))
            );
            if (childControls.length > 0) el = childControls[0];
        }
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
            const editable = /XCUIElementType(TextField|SecureTextField)/.test(el.tag);
            if (editable && !identifier && el.iosAncestorName) {
                const ancestorName = el.iosAncestorName.replace(/"/g, '\\"');
                suggestions.push({
                    label: 'XPath campo por contenedor accesible',
                    selector: '//' + (el.iosAncestorTag || 'XCUIElementTypeOther') +
                        '[@name="' + ancestorName + '"]//' + el.tag
                });
            }
            if (identifier && identifier.trim()) {
                suggestions.push({ label: 'Accessibility ID', selector: '~' + identifier });
                suggestions.push({ label: 'iOS Predicate String', selector: "iosPredicate=name == '" + escaped + "'" });
                suggestions.push({ label: 'iOS Class Chain', selector: 'iosClassChain=**/' + el.tag + '[`name == "' + escapedChain + '"`]' });
                suggestions.push({ label: 'XPath name', selector: '//' + el.tag + '[@name="' + identifier + '"]' });
            }
            if (label && label !== identifier) {
                suggestions.push({ label: 'iOS Predicate label', selector: "iosPredicate=label == '" + label.replace(/'/g, "\\'") + "'" });
            }
            if (editable) {
                suggestions.push({ label: 'iOS Class Chain editable', selector: 'iosClassChain=**/' + el.tag });
            }
            suggestions.push({ label: 'Class Name', selector: 'class=' + el.tag });
            suggestions.push({ label: 'XPath class', selector: '//' + el.tag });
        } else if (el.resourceId && !IGNORED.includes(el.resourceId)) {
            const isComposeId = !el.resourceId.includes('/') && !el.resourceId.includes(':');
            suggestions.push({
                label: isComposeId ? 'Compose resource-id' : 'ID',
                selector: isComposeId
                    ? '//*[@resource-id="' + el.resourceId + '"]'
                    : 'id=' + el.resourceId
            });
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
        if (inspectorActive) exitInspectorMode();
        if (interactionActive) exitInteractionMode();
        clearSelectorChips();
        selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
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
        clearSelectorChips();
        selectedCatalogLocator = null;
        renderSelectedLocatorCoverage();
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
        txtVarName.value = currentAssignment?.name || txtVarName.value;
        verifiedSelector = '';
        renderAssignmentTarget();
        updateAssignmentButton();
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
    const wizardPages          = [...document.querySelectorAll('.wizard-page')];
    const wizardSteps          = [...document.querySelectorAll('.wizard-step')];
    const btnWizardBack        = document.getElementById('btnWizardBack');
    const btnWizardNext        = document.getElementById('btnWizardNext');
    const wizardLinkActions    = document.getElementById('wizardLinkActions');
    const wizardLinkRows       = document.getElementById('wizardLinkRows');
    const wizardGherkinHost    = document.getElementById('wizardGherkinHost');
    const txtAutomationObjective = document.getElementById('txtAutomationObjective');
    const txtAutomationAcceptance = document.getElementById('txtAutomationAcceptance');
    const btnPrepareAutomation = document.getElementById('btnPrepareAutomation');
    const btnLaunchAutomation = document.getElementById('btnLaunchAutomation');
    const btnImportAutomation = document.getElementById('btnImportAutomation');
    const automationPackageStatus = document.getElementById('automationPackageStatus');
    const automationAgentHandoff = document.getElementById('automationAgentHandoff');
    const automationAgentPath = document.getElementById('automationAgentPath');
    const automationAgentPrompt = document.getElementById('automationAgentPrompt');
    const btnCopyAgentPrompt = document.getElementById('btnCopyAgentPrompt');
    let wizardPage = 1;
    let automationWorkflow = false;
    [txtAutomationObjective, txtAutomationAcceptance].filter(Boolean).forEach(field => {
        field.addEventListener('input', invalidatePreview);
    });

    // Estado del constructor de escenario
    let enlazarSteps      = [];   // copia de recordedSteps al abrir el modal
    let scenarioRows      = [];   // [{ text: string, stepIndices: number[] }]
    let activeRowIndex    = -1;   // fila seleccionada en el constructor
    let linkedScenarioData = null; // { linked, stepTexts } — seteado al confirmar, usado al generar

    const GHERKIN_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'];

    function setWizardPage(page) {
        wizardPage = Math.max(1, Math.min(5, page));
        wizardPages.forEach(element => {
            element.classList.toggle('active', Number(element.dataset.wizardPage) === wizardPage);
        });
        wizardSteps.forEach((element, index) => {
            element.classList.toggle('active', index + 1 === wizardPage);
            element.classList.toggle('complete', index + 1 < wizardPage);
        });
        btnWizardBack.disabled = wizardPage === 1;
        btnWizardNext.style.display = wizardPage === 5 ? 'none' : '';
        btnConfirmarEscenario.style.display = 'none';
        const labels = [
            'Revisa las acciones grabadas',
            'Define objetivo y resultado esperado',
            'Prepara el plan e importa la propuesta',
            'Revisa los archivos',
            'Genera los archivos'
        ];
        enlazarHint.textContent = `Paso ${wizardPage} de 5 · ${labels[wizardPage - 1]}`;
    }

    async function validateStepImpacts() {
        const texts = scenarioRows.map(row => row.text.trim());
        if (!texts.length || texts.some(text => !text)) return false;
        const response = await api.analyzeStepImpact(texts, cmbFrameworkSquad.value);
        if (!response.success) {
            enlazarHint.textContent = '✗ No se pudo validar el impacto: ' + response.error;
            return false;
        }
        response.steps.forEach((impact, index) => {
            const duplicateRows = texts
                .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(candidate => candidate.candidate === texts[index] && candidate.candidateIndex !== index);
            scenarioRows[index].impact = duplicateRows.length
                ? {
                    ...impact,
                    safe: false,
                    references: [
                        ...impact.references,
                        {
                            squad: cmbFrameworkSquad.value,
                            file: 'Escenario actual',
                            keyword: scenarioRows[index].keyword,
                            expression: texts[index],
                            matchType: 'exact',
                            scenarios: duplicateRows.map(candidate => ({
                                feature: txtFeature.value.trim() || 'Feature actual',
                                scenario: `Línea ${candidate.candidateIndex + 1}`,
                                file: 'Borrador sin generar'
                            }))
                        }
                    ]
                }
                : impact;
        });
        renderScenarioRows();
        return scenarioRows.every(row => row.impact?.safe);
    }

    function renderLinkActions() {
        if (!wizardLinkActions) return;
        wizardLinkActions.innerHTML = '';
        if (!enlazarSteps.length) {
            wizardLinkActions.innerHTML = '<li class="step-empty">Sin acciones grabadas</li>';
            return;
        }
        const usedIndices = new Set(scenarioRows.flatMap(row => row.stepIndices));
        enlazarSteps.forEach((step, index) => {
            const item = document.createElement('li');
            item.className = `assignable${usedIndices.has(index) ? ' step-used' : ''}`;
            item.textContent = `${index + 1}. ${stepSummary(step)}`;
            item.addEventListener('click', () => {
                if (activeRowIndex < 0) {
                    enlazarHint.textContent = 'Selecciona primero una línea Gherkin de la derecha.';
                    return;
                }
                if (!scenarioRows[activeRowIndex].stepIndices.includes(index)) {
                    scenarioRows[activeRowIndex].stepIndices.push(index);
                }
                renderScenarioRows();
                renderLinkActions();
            });
            wizardLinkActions.appendChild(item);
        });
    }

    function scenarioRowHtml(row, rowIdx) {
        row.examples ||= {};
        row.bindings ||= {};
        const parameters = [...new Set(
            [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])
        )];
        const assignedHtml = row.stepIndices.length === 0
            ? '<span class="assigned-empty-hint">← Haz click en un step de la izquierda para asignarlo</span>'
            : row.stepIndices.map(si => {
                const s = enlazarSteps[si];
                const label = s ? stepSummary(s) : 'Step #' + si;
                const supportsValue = s && ['ESCRIBIR', 'VERIFICAR_TEXTO'].includes(s.action);
                const options = [
                    `<option value="">Literal grabado: ${String(s?.value || '').replace(/</g, '&lt;')}</option>`,
                    ...parameters.map(parameter =>
                        `<option value="${parameter}"${row.bindings[si] === parameter ? ' selected' : ''}>Parámetro: &lt;${parameter}&gt;</option>`
                    )
                ].join('');
                return `<div class="assigned-action-config">
                    <span class="assigned-chip" data-row="${rowIdx}" data-si="${si}">
                        ${label.slice(0, 50)}${label.length > 50 ? '…' : ''}
                        <span class="chip-remove" data-row="${rowIdx}" data-si="${si}">✕</span>
                    </span>
                    ${supportsValue && parameters.length
                        ? `<select class="action-param-select" data-row="${rowIdx}" data-si="${si}">${options}</select>`
                        : ''}
                </div>`;
            }).join('');

        const kwOptions = GHERKIN_KEYWORDS.map(kw =>
            `<option value="${kw}"${row.keyword === kw ? ' selected' : ''}>${kw}</option>`
        ).join('');
        const impact = row.impact;
        const impactHtml = !row.text.trim()
            ? '<div class="step-impact neutral">Escribe la definición para validar su alcance.</div>'
            : !impact
                ? '<div class="step-impact neutral">La definición se validará al presionar Continuar.</div>'
                : impact.safe
                    ? '<div class="step-impact safe">✓ Step aislado: no intercepta definiciones existentes.</div>'
                    : `<div class="step-impact warning">
                        <strong>⚠ Puede impactar ${impact.references.length} definición(es)</strong>
                        ${impact.references.map(reference =>
                            `<span>${reference.squad} · ${reference.file}<small>${reference.keyword} /${reference.expression}/</small></span>
                             ${(reference.scenarios || []).map(usage =>
                                `<span class="impact-scenario">↳ ${usage.feature} · ${usage.scenario}<small>${usage.file}</small></span>`
                             ).join('')}`
                        ).join('')}
                        <em>Cambia la redacción para crear un step nuevo y seguro.</em>
                    </div>`;

        return `<div class="scenario-row${rowIdx === activeRowIndex ? ' active' : ''}" data-row="${rowIdx}">
            <div class="scenario-row-header">
                <span class="row-number">${rowIdx + 1}</span>
                <select class="scenario-kw-select" data-row="${rowIdx}">${kwOptions}</select>
                <input type="text" class="scenario-step-input" placeholder="descripción del step..." value="${row.text.replace(/"/g, '&quot;')}" data-row="${rowIdx}"/>
                <button class="btn-remove-row" data-row="${rowIdx}">✕</button>
            </div>
            ${impactHtml}
            ${parameters.length ? `<div class="scenario-params">
                <span class="scenario-params-title">Parámetros:</span>
                ${parameters.map(parameter =>
                    `<label>&lt;${parameter}&gt;
                        <input class="parameter-example-input" data-row="${rowIdx}" data-param="${parameter}"
                               value="${String(row.examples[parameter] || '').replace(/"/g, '&quot;')}"
                               placeholder="valor de ejemplo"/>
                    </label>`
                ).join('')}
            </div>` : ''}
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
                scenarioRows[ri].impact = null;
            });
            inp.addEventListener('blur', () => renderScenarioRows());
            inp.addEventListener('click', e => {
                e.stopPropagation();
                const ri = parseInt(inp.dataset.row);
                activeRowIndex = ri;
                updateEnlazarHint();
                scenarioRowsContainer.querySelectorAll('.scenario-row').forEach(rowElement => {
                    rowElement.classList.toggle(
                        'active',
                        parseInt(rowElement.dataset.row) === ri
                    );
                });
            });
        });

        scenarioRowsContainer.querySelectorAll('.parameter-example-input').forEach(input => {
            input.addEventListener('input', e => {
                e.stopPropagation();
                const ri = parseInt(input.dataset.row);
                scenarioRows[ri].examples ||= {};
                scenarioRows[ri].examples[input.dataset.param] = e.target.value;
            });
            input.addEventListener('click', e => e.stopPropagation());
        });

        scenarioRowsContainer.querySelectorAll('.action-param-select').forEach(select => {
            select.addEventListener('change', e => {
                e.stopPropagation();
                const ri = parseInt(select.dataset.row);
                const si = parseInt(select.dataset.si);
                scenarioRows[ri].bindings ||= {};
                if (select.value) {
                    scenarioRows[ri].bindings[si] = select.value;
                    scenarioRows[ri].examples ||= {};
                    if (!scenarioRows[ri].examples[select.value]) {
                        scenarioRows[ri].examples[select.value] = enlazarSteps[si]?.value || '';
                    }
                } else {
                    delete scenarioRows[ri].bindings[si];
                }
                renderScenarioRows();
            });
            select.addEventListener('click', e => e.stopPropagation());
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
                renderLinkActions();
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
                renderLinkActions();
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
            li.classList.add('recorded-action');
            if (usedIndices.has(i)) li.classList.add('step-used');
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
        automationWorkflow = false;
        invalidatePreview();
        if (automationPackageStatus) {
            automationPackageStatus.textContent = '';
            automationPackageStatus.className = 'generate-result';
        }
        if (btnLaunchAutomation) btnLaunchAutomation.disabled = true;
        if (automationAgentHandoff) automationAgentHandoff.style.display = 'none';
        if (automationAgentPath) automationAgentPath.textContent = '';
        if (automationAgentPrompt) automationAgentPrompt.value = '';
        activeRowIndex = -1;
        updateEnlazarHint();
        renderEnlazarSteps();
        renderScenarioRows();
        enlazarModal.style.display = 'flex';
        setWizardPage(1);
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

    function showAutomationPreview(result, preserveReviewed = false) {
        const reviewedByPath = preserveReviewed
            ? new Map(previewDocuments.map(document => [document.path, document.content]))
            : new Map();
        lastPreviewToken = result.previewToken;
        const proposedDocuments = [
            { path: result.preview.featurePath, content: result.preview.featureContent },
            ...(result.preview.locatorPath ? [{ path: result.preview.locatorPath, content: result.preview.locatorContent }] : []),
            ...(result.preview.stepPath ? [{ path: result.preview.stepPath, content: result.preview.stepContent }] : []),
            ...(result.preview.screenPath ? [{ path: result.preview.screenPath, content: result.preview.screenContent }] : [])
        ];
        previewDocuments = proposedDocuments.map(document => ({
            ...document,
            originalContent: document.content,
            content: reviewedByPath.get(document.path) ?? document.content
        }));
        cmbPreviewFile.innerHTML = '';
        previewDocuments.forEach((previewDocument, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = previewDocument.path;
            cmbPreviewFile.appendChild(option);
        });
        codeReviewWorkspace.style.display = 'grid';
        renderPreviewFileTree();
        showPreviewDocument(0);
        lblGenerationFileCount.textContent = `${previewDocuments.length} archivo(s) validados al 100%.`;
        setGenerate(`✓ Propuesta válida · ${previewDocuments.length} capas · lista para revisión`, 'ok');
    }

    async function importAutomationResponse(preserveReviewed = false) {
        disableBtn(btnImportAutomation, '⏳ Validando...');
        const result = await api.importAutomationResponse();
        enableBtn(btnImportAutomation);
        if (!result.success) {
            if (result.repairAvailable) btnLaunchAutomation.disabled = false;
            automationPackageStatus.textContent = '✗ ' + (result.error || 'Respuesta inválida');
            automationPackageStatus.className = 'generate-result err';
            return result;
        }
        automationWorkflow = true;
        showAutomationPreview(result, preserveReviewed);
        automationPackageStatus.textContent = '✓ agent-response.json importado y validado al 100%';
        automationPackageStatus.className = 'generate-result ok';
        return result;
    }

    function showAutomationHandoff(handoff) {
        if (!handoff) return;
        automationAgentPath.textContent = handoff.packageDirectory || '';
        automationAgentPrompt.value = handoff.prompt || '';
        automationAgentHandoff.style.display = 'block';
        btnLaunchAutomation.disabled = false;
    }

    btnPrepareAutomation?.addEventListener('click', async () => {
        const objective = txtAutomationObjective.value.trim();
        const acceptanceCriteria = txtAutomationAcceptance.value.trim();
        if (!objective || !acceptanceCriteria) {
            automationPackageStatus.textContent = '⚠ Completa el objetivo y el resultado esperado.';
            automationPackageStatus.className = 'generate-result err';
            return;
        }
        disableBtn(btnPrepareAutomation, '⏳ Resolviendo...');
        const result = await api.prepareAutomationPackage({
            request: buildGenerationRequest(),
            objective,
            acceptanceCriteria
        });
        enableBtn(btnPrepareAutomation);
        if (!result.success) {
            automationPackageStatus.textContent = '✗ ' + result.error;
            automationPackageStatus.className = 'generate-result err';
            return;
        }
        automationWorkflow = true;
        showAutomationHandoff(result.handoff);
        const percent = Math.round(result.result.deterministicCoverage * 100);
        automationPackageStatus.textContent = result.result.responseAvailable
            ? `✓ Plan ${percent}% determinista · respuesta disponible`
            : `✓ Plan ${percent}% determinista · ${result.result.unresolvedGaps} gap(s) preparados para el agente`;
        automationPackageStatus.className = 'generate-result ok';
        if (result.result.responseAvailable) await importAutomationResponse();
    });

    btnLaunchAutomation?.addEventListener('click', async () => {
        disableBtn(btnLaunchAutomation, '⏳ Abriendo...');
        const result = await api.launchAutomationAgent();
        enableBtn(btnLaunchAutomation);
        if (result.success) showAutomationHandoff(result.launch);
        automationPackageStatus.textContent = result.success
            ? `✓ Terminal abierta en el paquete. Inicia ${result.launch.provider} y pega el prompt mostrado.`
            : `✗ ${result.error}`;
        automationPackageStatus.className = `generate-result ${result.success ? 'ok' : 'err'}`;
    });

    btnCopyAgentPrompt?.addEventListener('click', async () => {
        const prompt = automationAgentPrompt.value.trim();
        if (!prompt) return;
        try {
            await navigator.clipboard.writeText(prompt);
            const previous = btnCopyAgentPrompt.textContent;
            btnCopyAgentPrompt.textContent = '✓ Prompt copiado';
            setTimeout(() => { btnCopyAgentPrompt.textContent = previous; }, 1500);
        } catch {
            automationAgentPrompt.focus();
            automationAgentPrompt.select();
            automationPackageStatus.textContent = 'Selecciona y copia manualmente el prompt.';
            automationPackageStatus.className = 'generate-result';
        }
    });

    btnImportAutomation?.addEventListener('click', async () => {
        const result = await importAutomationResponse();
        if (result.success) setWizardPage(4);
    });

    btnWizardBack?.addEventListener('click', () => setWizardPage(wizardPage - 1));
    btnWizardNext?.addEventListener('click', async () => {
        if (wizardPage === 1) {
            if (!enlazarSteps.length) {
                enlazarHint.textContent = '⚠ Graba al menos una acción antes de continuar.';
                return;
            }
            setWizardPage(2);
            return;
        }
        if (wizardPage === 2) {
            if (!txtAutomationObjective.value.trim() || !txtAutomationAcceptance.value.trim()) {
                enlazarHint.textContent = '⚠ Completa el objetivo y el resultado esperado.';
                return;
            }
            setWizardPage(3);
            return;
        }
        if (wizardPage === 3) {
            if (!lastPreviewToken) {
                enlazarHint.textContent = '⚠ Prepara el paquete e importa una propuesta válida.';
                return;
            }
            setWizardPage(4);
            return;
        }
        if (wizardPage === 4) {
            if (!lastPreviewToken) {
                enlazarHint.textContent = '⚠ Actualiza y revisa el preview antes de continuar.';
                return;
            }
            setWizardPage(5);
        }
    });

    wizardSteps.forEach((step, index) => {
        step.addEventListener('click', () => {
            if (index + 1 < wizardPage) setWizardPage(index + 1);
        });
    });

    btnConfirmarEscenario.addEventListener('click', async () => {
        if (scenarioRows.length === 0) {
            enlazarHint.textContent = '⚠ Agrega al menos un step al escenario';
            enlazarHint.style.color = '#CC0000';
            return;
        }
        if (scenarioRows.some(row => row.stepIndices.length === 0)) {
            enlazarHint.textContent = '⚠ Cada línea Gherkin debe tener al menos una acción enlazada.';
            enlazarHint.style.color = '#FFB020';
            return;
        }
        // Construir el JSON { "step text": [...steps] }
        const linked = {};
        const stepTexts = [];   // solo los textos, para el .feature se pasa el keyword aparte
        const stepRows  = [];   // { keyword, text } para el .feature
        const examples = {};
        const parameterErrors = [];
        scenarioRows.forEach(row => {
            const key = row.text.trim() || 'step sin nombre';
            const locatorReference = key.match(/\{([^{}]+)\}/)?.[1]?.trim();
            if (locatorReference) {
                parameterErrors.push(
                    `No uses {${locatorReference}} en Gherkin; enlaza la acción o usa ` +
                    `<${locatorReference.replace(/\s+/g, '_')}>`
                );
            }
            stepTexts.push(key);
            stepRows.push({
                keyword: row.keyword || 'And',
                text: key,
                status: 'missing',
                ...(row.methodName ? { methodName: row.methodName } : {})
            });
            const parameters = [...new Set(
                [...key.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])
            )];
            parameters.forEach(parameter => {
                const value = String(row.examples?.[parameter] || '').trim();
                if (!value) parameterErrors.push(`Falta ejemplo para <${parameter}>`);
                if (examples[parameter] && examples[parameter] !== value) {
                    parameterErrors.push(`El parámetro <${parameter}> tiene valores diferentes`);
                }
                examples[parameter] = value;
            });
            linked[key] = row.stepIndices.map(si => {
                const s = enlazarSteps[si];
                const binding = row.bindings?.[si];
                return {
                    action:       s.action        || '',
                    variableName: s.variableName  || '',
                    selector:     s.selector      || '',
                    value:        binding ? `<${binding}>` : (s.value || ''),
                    description:  s.description   || '',
                    ...(s.locatorSource ? { locatorSource: s.locatorSource } : {})
                };
            });
        });
        if (parameterErrors.length > 0) {
            enlazarHint.textContent = '⚠ ' + [...new Set(parameterErrors)].join(' · ');
            enlazarHint.style.color = '#CC0000';
            return;
        }

        // Guardar en memoria para cuando el usuario haga click en GENERAR
        linkedScenarioData = {
            linked,
            stepTexts,
            stepRows,
            examples,
            reuse: stepTexts.map(text => ({ text, status: 'missing' })),
            screenMethods: []
        };

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

        setStatus(`✓ ${stepTexts.length} steps nuevos validados sin impacto`, '#00CC00');
        setWizardPage(4);
        setGenerate(
            'Revisa los nombres sugeridos, completa el TC y presiona Actualizar preview.',
            ''
        );
    });

    // ─── INIT ────────────────────────────────────────────────────────────────
    screenConfig.style.cssText   = 'display:flex !important; flex-direction:column';
    screenRecorder.style.cssText = 'display:none !important';
    await Promise.all([loadFrameworkCatalog(), loadDevices(), loadBsCredentials()]);
}
