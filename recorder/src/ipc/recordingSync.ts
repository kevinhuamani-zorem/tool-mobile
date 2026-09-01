import { AutomationRecordingStore } from '../../../core/automation';
import { RecorderRuntimeState } from './runtimeState';

/**
 * Sincroniza el recording activo con los steps grabados hasta el momento.
 * La usan tanto `interactionHandlers` (al ejecutar/borrar/limpiar un step)
 * como `automationHandlers` (al retomar una grabación existente); vive aquí
 * para que ninguna de las dos familias duplique la lógica ni el estado.
 */
export function createSyncRecording(
    state: RecorderRuntimeState,
    automationRecordingStore: AutomationRecordingStore,
): () => void {
    return function syncRecording(): void {
        if (!state.sessionActive) return;
        automationRecordingStore.replaceActions(state.recordedSteps, {
            squad: state.activeSquad,
            platform: state.recordingPlatform,
            environment: state.activeEnvironment,
        });
    };
}
