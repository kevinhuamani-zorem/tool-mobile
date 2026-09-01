import crypto from 'crypto';
import { ipcMain } from 'electron';
import {
    EmbeddedInspectorElementUsed,
    EmbeddedInspectorHandshake,
    recorderSelectorFromInspector,
} from '../embeddedInspectorProtocol';
import {
    createEmbeddedInspectorWindow,
    embeddedInspectorAssetsAvailable,
    focusEmbeddedInspectorWindow,
    resolveInspectorMode,
    returnToRecorderAfterElementUse,
} from '../embeddedInspectorWindow';
import { EmbeddedInspectorProxy } from '../embeddedInspectorProxy';
import { independentlyVerifySelectorCandidates } from '../../../core/automation';
import { RecorderRuntimeState } from './runtimeState';

/**
 * Un evento v3 puede traer múltiples candidatos, pero el recorder persiste un
 * único selector elegido por QA. Aquí se revalida ese selector contra la
 * sesión activa y se comprueba que el par real `(TypeLocator, valor)` lo
 * reconstruya; si no cumple, la importación se rechaza con diagnóstico.
 */
async function validateEmbeddedInspectorElementUse(
    state: RecorderRuntimeState,
    elementUsed: EmbeddedInspectorElementUsed,
): Promise<void> {
    const generation = ++state.inspectorValidationGeneration;
    state.pendingInspectorCandidates = null;
    try {
        if (!state.sessionActive) throw new Error('La sesión Appium ya no está activa');
        if (!elementUsed.elementId) {
            throw new Error('Inspector no entregó la identidad WebDriver del elemento seleccionado');
        }
        const metadata = state.activeDm.getSessionMetadata();
        const validation = await independentlyVerifySelectorCandidates({
            candidates: elementUsed.candidates,
            selectedElementId: elementUsed.elementId,
            platform: metadata.platform,
            recorderSelector: recorderSelectorFromInspector,
            findElementIds: selector => state.activeDm.findElementIds(selector),
        });
        if (generation !== state.inspectorValidationGeneration) return;
        if (state.activeDm.getSessionMetadata().sessionId !== metadata.sessionId) {
            throw new Error('La sesión Appium cambió durante la validación de candidatos');
        }
        const selectorCandidateToken = crypto.randomUUID();
        state.pendingInspectorCandidates = {
            token: selectorCandidateToken,
            selector: validation.primarySelector,
            candidates: validation.candidates,
        };
        state.mainWindow?.webContents.send('embedded-inspector-element-used', {
            selector: validation.primarySelector,
            strategy: elementUsed.strategy,
            tag: elementUsed.tag,
            validationWarnings: validation.warnings,
            selectorCandidateToken,
        });
        returnToRecorderAfterElementUse(state.embeddedInspectorWindow, state.mainWindow);
    } catch (error) {
        if (generation !== state.inspectorValidationGeneration) return;
        state.pendingInspectorCandidates = null;
        state.mainWindow?.webContents.send(
            'embedded-inspector-error',
            error instanceof Error ? error.message : 'No se pudo validar el selector del Inspector',
        );
    }
}

/**
 * Cierra la ventana del Inspector embebido y detiene su proxy loopback. Es
 * una tarea de limpieza de ciclo de vida — `main.ts` la registra en
 * `RecorderRuntimeLifecycle` antes de `closeOwnedSession` — por eso se
 * exporta en vez de dispararse desde un handler.
 */
export async function closeEmbeddedInspectorResources(
    state: RecorderRuntimeState,
    embeddedInspectorProxy: EmbeddedInspectorProxy,
): Promise<void> {
    const window = state.embeddedInspectorWindow;
    state.embeddedInspectorWindow = null;
    state.embeddedInspectorHandshake = null;
    if (window && !window.isDestroyed()) window.destroy();
    await embeddedInspectorProxy.stop();
}

/**
 * Dependencias del Inspector embebido: apertura/focalización de la ventana
 * aislada, el handshake versión 3 y el proxy loopback efímero. Nunca expone
 * WebDriver ni datos de sesión al renderer principal; solo reenvía el
 * selector ya validado.
 */
export interface InspectorHandlersContext {
    state: RecorderRuntimeState;
    embeddedInspectorProxy: EmbeddedInspectorProxy;
}

export function registerInspectorHandlers(context: InspectorHandlersContext): void {
    const { state, embeddedInspectorProxy } = context;

    ipcMain.on('embedded-inspector-message', (event, data: unknown) => {
        if (!state.embeddedInspectorWindow || event.sender !== state.embeddedInspectorWindow.webContents) return;
        try {
            state.embeddedInspectorHandshake?.handle(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Mensaje inválido del Inspector';
            state.mainWindow?.webContents.send('embedded-inspector-error', message);
        }
    });

    ipcMain.handle('open-inspector', async () => {
        if (!state.sessionActive) return { success: false, error: 'Sin sesión activa' };

        let resolution;
        try {
            resolution = resolveInspectorMode(
                process.env.RECORDER_INSPECTOR,
                embeddedInspectorAssetsAvailable(),
            );
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Configuración de Inspector inválida',
            };
        }

        const metadata = state.activeDm.getSessionMetadata();
        if (resolution.mode === 'legacy' || metadata.provider === 'browserstack') {
            return {
                success: true,
                mode: 'legacy',
                warning: resolution.warning || (
                    metadata.provider === 'browserstack'
                        ? 'El protocolo embebido no transporta credenciales de BrowserStack; se mantiene el inspector legacy.'
                        : undefined
                ),
            };
        }

        if (focusEmbeddedInspectorWindow(state.embeddedInspectorWindow)) {
            return { success: true, mode: 'embedded', focused: true };
        }

        let inspectorServerUrl: string;
        try {
            inspectorServerUrl = await embeddedInspectorProxy.start(metadata.serverUrl, metadata.sessionId);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'No se pudo iniciar el proxy seguro del Inspector',
            };
        }

        state.embeddedInspectorWindow = createEmbeddedInspectorWindow();
        state.embeddedInspectorHandshake = new EmbeddedInspectorHandshake(
            { ...metadata, serverUrl: inspectorServerUrl },
            message => state.embeddedInspectorWindow?.webContents.send(
                'embedded-inspector-connect',
                message,
            ),
            () => state.mainWindow?.webContents.send('embedded-inspector-connected'),
            elementUsed => {
                void validateEmbeddedInspectorElementUse(state, elementUsed);
            },
            error => state.mainWindow?.webContents.send(
                'embedded-inspector-error',
                `${error.code}: ${error.message}`,
            ),
        );
        state.embeddedInspectorWindow.on('closed', () => {
            state.embeddedInspectorWindow = null;
            state.embeddedInspectorHandshake = null;
            embeddedInspectorProxy.stop().catch(error => {
                console.warn('[Inspector] No se pudo cerrar el proxy:', error.message);
            });
        });
        return { success: true, mode: 'embedded', focused: false };
    });

    ipcMain.handle('activate-inspector', async () => {
        if (!state.inspector) return { success: false, error: 'Sin sesion activa' };
        await state.inspector.activate();
        const result = await state.inspector.waitForSelection(30);
        await state.inspector.bringPanelToFront(state.mainWindow);
        if (result && result.candidates.length > 0) {
            const screenshot = await state.inspector.captureScreenshot().catch(() => undefined);
            return {
                success:    true,
                candidates: result.candidates,   // SelectorCandidate[]
                suggested:  result.suggested,    // nombre de variable sugerido
                tag:        result.tag,
                // compatibilidad: el P1 como xpath para código que aún use result.xpath
                xpath:      result.candidates[0].selector,
                screenshot,
            };
        }
        return { success: false, error: 'Cancelado o timeout' };
    });
}
