import { ipcMain } from 'electron';
import { RecordedStep, MobilePlatform } from '../../../core/automation';
import { prepareRecordedStep } from '../../../core/automation';
import { roundTrip } from '../../../core/indexing';
import { RecorderRuntimeState } from './runtimeState';

/**
 * Dependencias de interacción con el dispositivo ya conectado: screenshot,
 * page source, tap, swipe, verificación de selector y ejecución/edición de
 * steps grabados. Comparte `state` con `sessionHandlers` (que es quien crea
 * `inspector`/`executor`) e `inspectorHandlers` (que es quien confía los
 * candidatos verificados que aquí se consumen).
 */
export interface InteractionHandlersContext {
    state: RecorderRuntimeState;
    syncRecording: () => void;
}

export function registerInteractionHandlers(context: InteractionHandlersContext): void {
    const { state, syncRecording } = context;

    ipcMain.handle('get-screenshot', async () => {
        if (!state.inspector) return { success: false, error: 'Sin sesion' };
        try {
            const screenshot = await state.inspector.captureScreenshot();
            return { success: true, screenshot };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('tap-at', async (_, x: number, y: number) => {
        if (!state.sessionActive || !state.inspector) {
            return { success: false, error: 'Sin sesion activa' };
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return { success: false, error: 'Coordenadas invalidas' };
        }
        try {
            await state.activeDm.tapAt(x, y);
            // Da tiempo a que termine una transición breve antes de actualizar la vista.
            await new Promise(resolve => setTimeout(resolve, 350));
            const screenshot = await state.inspector.captureScreenshot();
            return { success: true, screenshot };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('swipe-from-to', async (
        _,
        startX: number,
        startY: number,
        endX: number,
        endY: number
    ) => {
        if (!state.sessionActive || !state.inspector) {
            return { success: false, error: 'Sin sesion activa' };
        }
        if (![startX, startY, endX, endY].every(Number.isFinite)) {
            return { success: false, error: 'Coordenadas invalidas' };
        }
        try {
            await state.activeDm.swipeFromTo(startX, startY, endX, endY);
            await new Promise(resolve => setTimeout(resolve, 350));
            const screenshot = await state.inspector.captureScreenshot();
            return { success: true, screenshot };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    /**
     * Verificar el selector grabado no basta: WebdriverIO acepta formas que el
     * framework no sabe componer, y el fallo aparecia recien al correr wdio. Aqui
     * se prueban las dos cosas contra el dispositivo que ya esta delante — el
     * selector tal como se grabo y el que saldra de `TypeLocator.<tipo> + valor` —
     * para que el QA vea el problema en el momento de capturarlo.
     */
    ipcMain.handle('verify-selector', async (_, selector: string) => {
        if (!state.inspector) return { success: false, summary: 'Sin sesion activa' };
        const platform: MobilePlatform = state.recordingPlatform === 'ios' ? 'ios' : 'android';
        let check: ReturnType<typeof roundTrip> | undefined;
        try {
            check = roundTrip(selector, platform);
        } catch {
            check = undefined;
        }

        try {
            const el         = await state.activeDm.findElement(selector);
            await el.waitForDisplayed({ timeout: 5000 });
            const text       = await el.getText().catch(() => '');
            const tag        = await el.getTagName().catch(() => '');
            const screenshot = await state.inspector.captureScreenshot().catch(() => undefined);
            const base       = `✓ Encontrado: <${tag}>${text ? ` "${text}"` : ''}`;

            if (!check) {
                return { success: true, summary: base, screenshot };
            }
            if (!check.ok) {
                return {
                    success: false,
                    locatorType: check.type,
                    locatorValue: check.value,
                    summary: `${base}\n✗ Pero el framework no lo reconstruye: ${check.reason}`,
                    screenshot,
                };
            }
            // El selector compuesto es el que ejecutara el caso generado.
            if (check.composed && check.composed !== selector) {
                try {
                    const composedEl = await state.activeDm.findElement(check.composed);
                    await composedEl.waitForDisplayed({ timeout: 5000 });
                } catch {
                    return {
                        success: false,
                        locatorType: check.type,
                        locatorValue: check.value,
                        summary: `${base}\n✗ Pero TypeLocator.${check.type} + valor produce `
                            + `"${check.composed}", que no encuentra el elemento.`,
                        screenshot,
                    };
                }
            }
            return {
                success: true,
                locatorType: check.type,
                locatorValue: check.value,
                summary: `${base}\n✓ TypeLocator.${check.type} reconstruye el selector.`,
                screenshot,
            };
        } catch {
            return { success: false, summary: `✗ No encontrado: ${selector}` };
        }
    });

    ipcMain.handle('execute-step', async (_, stepData: RecordedStep & { selectorCandidateToken?: string }) => {
        if (!state.executor) return { success: false, message: 'Sin sesion activa' };
        const executableStep = stepData as RecordedStep;
        let preparedStep: RecordedStep;
        let persistedStep: RecordedStep;
        try {
            preparedStep = prepareRecordedStep(
                executableStep,
                state.recordedSteps.length + 1,
                state.recordingPlatform,
                false,
            );
            const selectorCandidateToken = typeof stepData.selectorCandidateToken === 'string'
                ? stepData.selectorCandidateToken
                : '';
            const trustedCandidates =
                preparedStep.selectorVerified === true
                && state.pendingInspectorCandidates
                && selectorCandidateToken === state.pendingInspectorCandidates.token
                && preparedStep.selector === state.pendingInspectorCandidates.selector
                    ? state.pendingInspectorCandidates.candidates
                    : undefined;
            const _untrustedCandidates = preparedStep.selectorVerified === true && Boolean(trustedCandidates)
                ? trustedCandidates
                : undefined;
            persistedStep = prepareRecordedStep(
                {
                    ...preparedStep,
                    elementIntent: preparedStep.elementIntent
                        || preparedStep.description
                        || preparedStep.variableName,
                    selectorVerified: preparedStep.selectorVerified === true,
                    selectorCandidates: _untrustedCandidates,
                },
                state.recordedSteps.length + 1,
                state.recordingPlatform,
            );
            state.pendingInspectorCandidates = null;
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'El step no superó la validación previa',
                totalSteps: state.recordedSteps.length,
            };
        }
        const result = await state.executor.execute(preparedStep);
        if (result.success) {
            state.recordedSteps.push(persistedStep);
            try {
                syncRecording();
            } catch (error) {
                state.recordedSteps.pop();
                return {
                    success: false,
                    message:
                        'La acción se ejecutó, pero no pudo persistirse y se revirtió del recording: '
                        + (error instanceof Error ? error.message : String(error)),
                    totalSteps: state.recordedSteps.length,
                };
            }
            if (preparedStep.variableName && preparedStep.selector) {
                if (!state.locatorManager.exists(preparedStep.variableName)) {
                    state.locatorManager.add(preparedStep.variableName, preparedStep.selector, false);
                }
            }
            const screenshot = await state.inspector?.captureScreenshot().catch(() => undefined);
            return { ...result, totalSteps: state.recordedSteps.length, screenshot };
        }
        return { ...result, totalSteps: state.recordedSteps.length };
    });

    ipcMain.handle('delete-step', async (_, index: number) => {
        if (index >= 0 && index < state.recordedSteps.length) state.recordedSteps.splice(index, 1);
        syncRecording();
        return { success: true, totalSteps: state.recordedSteps.length };
    });

    ipcMain.handle('clear-steps', async () => {
        state.recordedSteps = [];
        syncRecording();
        return { success: true };
    });

    ipcMain.handle('get-steps', async () => ({ steps: state.recordedSteps }));

    ipcMain.handle('get-page-source', async () => {
        try {
            const xml = await state.activeDm.getPageSource();
            return { success: true, xml };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('find-element-at', async (_, x: number, y: number) => {
        try {
            const xml = await state.activeDm.getPageSource();
            return { success: true, xml };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
}
