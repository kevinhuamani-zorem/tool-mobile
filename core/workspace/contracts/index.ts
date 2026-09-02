/**
 * API pública secundaria de `workspace` (ver ADR-0001): tipos puros de
 * configuración del workspace, sin E/S. La resolución concreta contra disco
 * vive en `workspace/infrastructure/projectPaths` y se consume desde la API
 * pública del módulo (`core/workspace`).
 */
export type RecorderMode = 'fwk-mobile';
export type AutomationAgent = 'copilot';

export interface WorkspaceConfiguration {
    mode: RecorderMode;
    targetProject: string;
    source: 'auto' | 'environment' | 'saved' | 'selected';
}
