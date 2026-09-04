import { RecorderRuntimeState } from '../runtimeState';

/**
 * Etapas de producto que ve el wizard (Evidencia → Análisis → Generación →
 * Revisión). Son independientes de la pipeline que corra por debajo.
 */
export type ProductStage =
    | 'ANALYZING'
    | 'RESOLVING_CONTEXT'
    | 'RESOLVING_DECISIONS'
    | 'WAITING_FOR_QA'
    | 'GENERATING'
    | 'VALIDATING'
    | 'READY_FOR_REVIEW'
    | 'APPLYING'
    | 'COMPLETED'
    | 'FAILED';

export type AutomationProgressEmitter = (
    stage: ProductStage,
    message: string,
    completed: number,
    total: number,
    meta?: Record<string, unknown>,
) => void;

export function createAutomationProgressEmitter(state: RecorderRuntimeState): AutomationProgressEmitter {
    return (stage, message, completed, total, meta) => {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
        state.mainWindow.webContents.send('automation-progress', {
            stage,
            message,
            completed,
            total,
            ...(meta || {}),
        });
    };
}
