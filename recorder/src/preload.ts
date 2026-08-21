import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // ── Framework ────────────────────────────────────────────────────────────
    scanFramework:       ()                     => ipcRenderer.invoke('scan-framework'),
    analyzeStepReuse:    (texts: string[], squad?: string) =>
        ipcRenderer.invoke('analyze-step-reuse', texts, squad),
    analyzeStepImpact:   (texts: string[], squad?: string) =>
        ipcRenderer.invoke('analyze-step-impact', texts, squad),
    getWorkspaceInfo:    () => ipcRenderer.invoke('get-workspace-info'),
    getSquadCatalog:     (squad: string, platform: string) =>
        ipcRenderer.invoke('get-squad-catalog', squad, platform),
    getExistingScenarios:(squad: string)         => ipcRenderer.invoke('get-existing-scenarios', squad),
    getScenarioCoverage:(scenarioId: string, squad: string) =>
        ipcRenderer.invoke('get-scenario-coverage', scenarioId, squad),
    assignLocatorValue:  (request: any)         => ipcRenderer.invoke('assign-locator-value', request),

    // ── Local ────────────────────────────────────────────────────────────────
    getDevices:          ()                     => ipcRenderer.invoke('get-devices'),
    getForegroundApp:    (udid: string)         => ipcRenderer.invoke('get-foreground-app', udid),
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
    verifySelector:      (sel: string)          => ipcRenderer.invoke('verify-selector', sel),
    executeStep:         (step: any)            => ipcRenderer.invoke('execute-step', step),
    deleteStep:          (idx: number)          => ipcRenderer.invoke('delete-step', idx),
    clearSteps:          ()                     => ipcRenderer.invoke('clear-steps'),
    previewGherkin:      (f: string, s: string) => ipcRenderer.invoke('preview-gherkin', f, s),
    previewFwkFiles:     (request: any)          => ipcRenderer.invoke('preview-fwk-files', request),
    generateFwkFiles:    (request: any, previewToken: string, reviewedContents?: Record<string, string>) =>
        ipcRenderer.invoke('generate-fwk-files', request, previewToken, reviewedContents),
    prepareAutomationPackage: (input: any) => ipcRenderer.invoke('prepare-automation-package', input),
    prepareAutomationRegeneration: (input: any) => ipcRenderer.invoke('prepare-automation-regeneration', input),
    launchAutomationAgent: () => ipcRenderer.invoke('launch-automation-agent'),
    importAutomationResponse: () => ipcRenderer.invoke('import-automation-response'),
    generateAutomationResponse: (previewToken: string, reviewedContents?: Record<string, string>) =>
        ipcRenderer.invoke('generate-automation-response', previewToken, reviewedContents),
    getAutomationMemoryStats: () => ipcRenderer.invoke('get-automation-memory-stats'),
    generateFiles:       (f: string, s: string) => ipcRenderer.invoke('generate-files', f, s),
    getSteps:            ()                     => ipcRenderer.invoke('get-steps'),
    closeSession:        ()                     => ipcRenderer.invoke('close-session'),
    getPageSource:       ()                     => ipcRenderer.invoke('get-page-source'),
    findElementAt:       (x: number, y: number) => ipcRenderer.invoke('find-element-at', x, y),
    generateLinkedFiles: (f: string, s: string, rows: any[], linked: any) => ipcRenderer.invoke('generate-linked-files', f, s, rows, linked),
});
