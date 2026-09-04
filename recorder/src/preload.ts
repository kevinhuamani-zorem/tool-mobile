import { contextBridge, ipcRenderer } from 'electron';

/**
 * Progreso del pipeline. Los campos por agente llegan del pipeline por capas:
 * Lorem y Zorem pueden reportar `running` a la vez, y cada etapa trae su
 * presupuesto (avisos que informan, nunca recortan) y su contexto real.
 */
interface AutomationProgressPayload {
    stage: string;
    message: string;
    completed: number;
    total: number;
    detail?: string;
    error?: string;
    role?: string;
    agentName?: string;
    sessionName?: string;
    roleState?: 'pending' | 'running' | 'repairing' | 'completed' | 'failed';
    execution?: 'agent' | 'cache' | 'deterministic';
    cacheHit?: boolean;
    contextBytes?: number;
    contextFiles?: number;
    evidenceBytes?: number;
    budgetWarnings?: string[];
    timedOut?: boolean;
    assignedLayers?: string[];
}

contextBridge.exposeInMainWorld('api', {
    // ── Framework ────────────────────────────────────────────────────────────
    scanFramework:       ()                     => ipcRenderer.invoke('scan-framework'),
    selectFrameworkRoot: ()                     => ipcRenderer.invoke('select-framework-root'),
    analyzeStepReuse:    (texts: string[], squad?: string) =>
        ipcRenderer.invoke('analyze-step-reuse', texts, squad),
    analyzeStepImpact:   (texts: string[], squad?: string) =>
        ipcRenderer.invoke('analyze-step-impact', texts, squad),
    getWorkspaceInfo:    () => ipcRenderer.invoke('get-workspace-info'),
    getSquadCatalog:     (squad: string, platform: string, featureScope?: string) =>
        ipcRenderer.invoke('get-squad-catalog', squad, platform, featureScope),
    getExistingScenarios:(squad: string)         => ipcRenderer.invoke('get-existing-scenarios', squad),
    getScenarioCoverage:(scenarioId: string, squad: string) =>
        ipcRenderer.invoke('get-scenario-coverage', scenarioId, squad),
    assignLocatorValue:  (request: any)         => ipcRenderer.invoke('assign-locator-value', request),

    // ── Local ────────────────────────────────────────────────────────────────
    getDevices:          ()                     => ipcRenderer.invoke('get-devices'),
    getForegroundApp:    (udid: string)         => ipcRenderer.invoke('get-foreground-app', udid),
    selectLocalApp:      (platform: string)     => ipcRenderer.invoke('select-local-app', platform),
    startSession:        (config: any)          => ipcRenderer.invoke('start-session', config),

    // ── BrowserStack ─────────────────────────────────────────────────────────
    bsLoadCredentials:   ()                                     => ipcRenderer.invoke('bs-load-credentials'),
    bsSaveCredentials:   (u: string, k: string)                => ipcRenderer.invoke('bs-save-credentials', u, k),
    bsGetDevices:        (u: string, k: string, platform: string) => ipcRenderer.invoke('bs-get-devices', u, k, platform),
    bsGetApps:           (u: string, k: string, platform: string) => ipcRenderer.invoke('bs-get-apps', u, k, platform),
    bsUploadApp:         (u: string, k: string, id: string, platform: string) => ipcRenderer.invoke('bs-upload-app', u, k, id, platform),
    bsStartSession:      (config: any)                         => ipcRenderer.invoke('bs-start-session', config),

    // ── Comunes ───────────────────────────────────────────────────────────────
    getScreenshot:       ()                     => ipcRenderer.invoke('get-screenshot'),
    tapAt:               (x: number, y: number) => ipcRenderer.invoke('tap-at', x, y),
    swipeFromTo:         (sx: number, sy: number, ex: number, ey: number) =>
        ipcRenderer.invoke('swipe-from-to', sx, sy, ex, ey),
    activateInspector:   ()                     => ipcRenderer.invoke('activate-inspector'),
    openInspector:       ()                     => ipcRenderer.invoke('open-inspector'),
    onInspectorConnected:(listener: () => void) => {
        const wrapped = () => listener();
        ipcRenderer.on('embedded-inspector-connected', wrapped);
        return () => ipcRenderer.removeListener('embedded-inspector-connected', wrapped);
    },
    onInspectorError:    (listener: (message: string) => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
        ipcRenderer.on('embedded-inspector-error', wrapped);
        return () => ipcRenderer.removeListener('embedded-inspector-error', wrapped);
    },
    onInspectorElementUsed: (listener: (elementUsed: {
        selector: string;
        strategy: string;
        tag?: string;
        validationWarnings: string[];
        selectorCandidateToken: string;
    }) => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, elementUsed: {
            selector: string;
            strategy: string;
            tag?: string;
            validationWarnings: string[];
            selectorCandidateToken: string;
        }) => listener(elementUsed);
        ipcRenderer.on('embedded-inspector-element-used', wrapped);
        return () => ipcRenderer.removeListener('embedded-inspector-element-used', wrapped);
    },
    onAutomationProgress: (listener: (progress: AutomationProgressPayload) => void) => {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: AutomationProgressPayload) => listener(payload);
        ipcRenderer.on('automation-progress', wrapped);
        return () => ipcRenderer.removeListener('automation-progress', wrapped);
    },
    verifySelector:      (sel: string)          => ipcRenderer.invoke('verify-selector', sel),
    executeStep:         (step: any)            => ipcRenderer.invoke('execute-step', step),
    deleteStep:          (idx: number)          => ipcRenderer.invoke('delete-step', idx),
    moveStep:            (from: number, to: number) => ipcRenderer.invoke('move-step', from, to),
    clearSteps:          ()                     => ipcRenderer.invoke('clear-steps'),
    previewGherkin:      (f: string, s: string) => ipcRenderer.invoke('preview-gherkin', f, s),
    previewFwkFiles:     (request: any)          => ipcRenderer.invoke('preview-fwk-files', request),
    generateFwkFiles:    (request: any, previewToken: string, reviewedContents?: Record<string, string>) =>
        ipcRenderer.invoke('generate-fwk-files', request, previewToken, reviewedContents),
    prepareAutomationPackage: (input: any) => ipcRenderer.invoke('prepare-automation-package', input),
    prepareAutomationRegeneration: (input: any) => ipcRenderer.invoke('prepare-automation-regeneration', input),
    getAutomationModelUsage: () => ipcRenderer.invoke('get-automation-model-usage'),
    launchAutomationAgent: (input?: { mode?: 'manual' | 'automatic'; autorun?: boolean; qaRoastMode?: boolean; inheritDesignReview?: boolean; model?: string; pipeline?: 'layered' | 'deterministic' }) =>
        ipcRenderer.invoke('launch-automation-agent', input),
    importAutomationResponse: (input?: { manualCorrection?: boolean; reviewOnly?: boolean }) =>
        ipcRenderer.invoke('import-automation-response', input),
    revalidateAutomationResponse: (reviewedContents: Record<string, string>) =>
        ipcRenderer.invoke('revalidate-automation-response', reviewedContents),
    getAutomationQaDecisions: () => ipcRenderer.invoke('get-automation-qa-decisions'),
    resolveAutomationQaDecisions: (input: any) => ipcRenderer.invoke('resolve-automation-qa-decisions', input),
    generateAutomationResponse: (previewToken: string, reviewedContents?: Record<string, string>) =>
        ipcRenderer.invoke('generate-automation-response', previewToken, reviewedContents),
    getAutomationMemoryStats: () => ipcRenderer.invoke('get-automation-memory-stats'),
    generateFiles:       (f: string, s: string) => ipcRenderer.invoke('generate-files', f, s),
    // [visual-recorder] Continuar una grabacion existente (p. ej. para agregar el Then que falta).
    resumeRecording:     (i: any)                => ipcRenderer.invoke('resume-recording', i),
    getSteps:            ()                     => ipcRenderer.invoke('get-steps'),
    closeSession:        ()                     => ipcRenderer.invoke('close-session'),
    getPageSource:       ()                     => ipcRenderer.invoke('get-page-source'),
    findElementAt:       (x: number, y: number) => ipcRenderer.invoke('find-element-at', x, y),
    generateLinkedFiles: (f: string, s: string, rows: any[], linked: any) => ipcRenderer.invoke('generate-linked-files', f, s, rows, linked),
});
