import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import {
    GeneratedFileRegistry,
    AutomationMemory,
    AutomationApplier,
    AutomationAgentResponse,
    UnresolvedGap,
    AgentRunStore,
    AutomationApplicationReceipt,
    createAutomationApplicationReceipt,
    requireUnchangedAppliedFiles,
    restoreUpdateBaselinesForCorrection,
    rollbackCorrectionBaselines,
} from '../../../../core/automation';
import { AutomationResponseValidator } from '../../../../core/validation';
import { normalizeJsonUnicode, readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
import { RecorderRuntimeState } from '../runtimeState';
import { AutomationProgressEmitter } from './progress';

export interface ApplyAutomationDependencies {
    state: RecorderRuntimeState;
    automationResponseValidator: AutomationResponseValidator;
    generatedFileRegistry: GeneratedFileRegistry;
    automationApplier: AutomationApplier;
    automationMemory: AutomationMemory;
    emitProgress: AutomationProgressEmitter;
}

/**
 * Aplica sobre el framework la propuesta revisada por QA: revalida con los
 * contenidos editados, exige que los archivos ya aplicados no hayan cambiado,
 * restaura baselines para correcciones, delega la escritura al
 * `AutomationApplier` de core, promueve memoria y deja el recibo de aplicación.
 */
export async function applyReviewedAutomation(
    deps: ApplyAutomationDependencies,
    previewToken: string,
    reviewedContents?: Record<string, string>,
): Promise<Record<string, any>> {
    const {
        state,
        automationResponseValidator,
        generatedFileRegistry,
        automationApplier,
        automationMemory,
        emitProgress: emitAutomationProgress,
    } = deps;
    let runStore: AgentRunStore | undefined;
    let correctionBackups = new Map<string, string>();
    try {
        if (!state.automationPreview || state.automationPreview.token !== previewToken) {
            throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
        }
        emitAutomationProgress('APPLYING', 'Aplicando automatización', 1, 2);
        const { scenario, plan } = state.automationPreview;
        runStore = new AgentRunStore(state.activeAutomationPackage);
        const response: AutomationAgentResponse = normalizeJsonUnicode({
            ...state.automationPreview.response,
            files: state.automationPreview.response.files.map(file => ({
                ...file,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
            })),
        });
        const validatorStarted = process.hrtime.bigint();
        const validation = automationResponseValidator.validate(scenario, plan, response);
        runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        if (!validation.valid) throw new Error(validation.errors.map(item => item.message).join(' | '));
        const preview = automationResponseValidator.toPreview(response);
        // La evaluacion del registro va antes de restaurar baselines de
        // correccion: un archivo ajeno se detecta sin tocar nada.
        const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
        if (managed.conflicts.length) {
            throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        }
        const receiptFile = path.join(state.activeAutomationPackage, 'application-receipt.json');
        if (fs.existsSync(receiptFile)) {
            const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
            requireUnchangedAppliedFiles(
                projectPaths.frameworkRoot,
                receipt,
                scenario.recordingId,
                plan.planId,
            );
            correctionBackups = restoreUpdateBaselinesForCorrection(
                state.activeAutomationPackage,
                projectPaths.frameworkRoot,
                plan,
            );
        }
        // Los `update` se amplían con un patch aditivo en vez de reescribirse:
        // el archivo puede ser ajeno y solo debe recibir los símbolos nuevos.
        // El flujo completo vive en core (`AutomationApplier`), compartido
        // con las pruebas.
        const { generated, patched } = automationApplier.apply(scenario, plan, response, preview);
        // La memoria aprende tambien de los gaps que este caso cerro: con la
        // decision aceptada por elemento, otro recording no vuelve a preguntar.
        const unresolvedFile = path.join(state.activeAutomationPackage, 'unresolved-context.json');
        const memorizedGaps = fs.existsSync(unresolvedFile)
            ? (readJsonUtf8<{ gaps?: UnresolvedGap[] }>(unresolvedFile).gaps || [])
            : [];
        const memoryEntry = automationMemory.promote(scenario, plan, response, validation, memorizedGaps);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'agent-response.json'), response);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'validation.json'), validation);
        const applicationReceipt = createAutomationApplicationReceipt(
            projectPaths.frameworkRoot,
            scenario,
            plan,
            response,
        );
        writeJsonUtf8(
            path.join(state.activeAutomationPackage, 'application-receipt.json'),
            applicationReceipt,
        );
        const statusFile = path.join(state.activeAutomationPackage, 'status.json');
        let status: Record<string, any> = {};
        try { status = readJsonUtf8<Record<string, any>>(statusFile); } catch { status = {}; }
        writeJsonUtf8(statusFile, {
            ...status,
            recordingId: scenario.recordingId,
            planId: plan.planId,
            state: 'generated',
            generatedAt: new Date().toISOString(),
            memoryVersion: memoryEntry.version,
        });
        state.automationPreview = null;
        runStore.mark('generated', true);
        emitAutomationProgress('COMPLETED', 'Automatización aplicada correctamente', 2, 2);
        return { success: true, generated, validation, memoryVersion: memoryEntry.version, patched: patched.outcomes };
    } catch (e: any) {
        if (correctionBackups.size) rollbackCorrectionBaselines(correctionBackups);
        emitAutomationProgress('FAILED', 'No pudimos aplicar la automatización', 0, 2, {
            error: e.message,
        });
        runStore?.mark('generation-failed', true);
        return { success: false, error: e.message };
    }
}
