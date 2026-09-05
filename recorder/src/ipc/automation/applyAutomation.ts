import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
} from '../../../../core/automation';
import { AutomationResponseValidator, FrameworkCompilationValidator, includeFrameworkCompilation } from '../../../../core/validation';
import { normalizeJsonUnicode, readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
import { RecorderRuntimeState } from '../runtimeState';
import { AutomationProgressEmitter } from './progress';
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

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
 * calcula correcciones sin restaurar baselines en disco, delega la escritura al
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
    try {
        if (!state.automationPreview || state.automationPreview.token !== previewToken) {
            throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
        }
        emitAutomationProgress('APPLYING', 'Aplicando automatización', 1, 2);
        const { scenario, plan } = state.automationPreview;
        const originalPrepared = state.automationPreview.prepared;
        if (!originalPrepared) throw new Error('Reimporta la propuesta para preparar el resultado final antes de aplicar.');
        automationApplier.requireUnchanged(originalPrepared);
        const allowed = new Set(originalPrepared.files.map(file => path.join(projectPaths.frameworkRoot, file.path)));
        for (const file of Object.keys(reviewedContents || {})) {
            if (!allowed.has(file)) throw new Error(`El editor intentó modificar un archivo fuera del preview: ${file}`);
        }
        runStore = new AgentRunStore(state.activeAutomationPackage);
        let response: AutomationAgentResponse = normalizeJsonUnicode({
            ...state.automationPreview.response,
            files: state.automationPreview.response.files.map(file => ({
                ...file,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
            })),
        });
        const prepared = automationApplier.prepare(scenario, plan, response,
            automationResponseValidator.toPreview(response), state.automationPreview.correctionBaselines);
        // An edit must not be silently dropped by the additive merge.
        for (const file of prepared.files) {
            const absolute = path.join(projectPaths.frameworkRoot, file.path);
            const reviewed = reviewedContents?.[absolute]
                ?? originalPrepared.files.find(item => item.path === file.path)?.content;
            if (reviewed !== file.content) throw new Error(`El patch cambia el contenido revisado de ${file.path}. Revalida para revisar el resultado final.`);
        }
        response = prepared.response;
        const validatorStarted = process.hrtime.bigint();
        const validation = automationResponseValidator.validate(scenario, plan, response);
        const compilation = new FrameworkCompilationValidator().validate(projectPaths.frameworkRoot, prepared.files);
        includeFrameworkCompilation(validation, compilation);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'framework-compilation.json'), compilation);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'validation.json'), validation);
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
        }
        // Los `update` se amplían con un patch aditivo en vez de reescribirse:
        // el archivo puede ser ajeno y solo debe recibir los símbolos nuevos.
        // El flujo completo vive en core (`AutomationApplier`), compartido
        // con las pruebas.
        // La memoria aprende tambien de los gaps que este caso cerro: con la
        // decision aceptada por elemento, otro recording no vuelve a preguntar.
        const unresolvedFile = path.join(state.activeAutomationPackage, 'unresolved-context.json');
        const memorizedGaps = fs.existsSync(unresolvedFile)
            ? (readJsonUtf8<{ gaps?: UnresolvedGap[] }>(unresolvedFile).gaps || [])
            : [];
        let memoryVersion = 0;
        const metadataFiles = ['agent-response.json', 'validation.json', 'application-receipt.json', 'status.json']
            .map(file => path.join(state.activeAutomationPackage, file));
        const { generated, patched } = automationApplier.commit(prepared, scenario, plan, () => {
        writeJsonUtf8(metadataFiles[0], response);
        writeJsonUtf8(metadataFiles[1], validation);
        const applicationReceipt = createAutomationApplicationReceipt(
            projectPaths.frameworkRoot,
            scenario,
            plan,
            response,
        );
        for (const file of prepared.files) {
            if (!applicationReceipt.files.some(item => item.path === file.path)) {
                applicationReceipt.files.push({ path: file.path, operation: 'update', afterHash: sha256(file.content) });
            }
        }
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
            lastMaterializedAgentResponseHash: sha256(fs.readFileSync(metadataFiles[0], 'utf8')),
        });
        // Last fallible operation: memory has its own rollback and learns only
        // the exact response whose bytes were committed above.
        memoryVersion = automationMemory.promote(scenario, plan, response, validation, memorizedGaps, entry => {
            writeJsonUtf8(statusFile, { ...readJsonUtf8<Record<string, any>>(statusFile), memoryVersion: entry.version });
        }).version;
        }, metadataFiles);
        state.automationPreview = null;
        runStore.mark('generated', true);
        emitAutomationProgress('COMPLETED', 'Automatización aplicada correctamente', 2, 2);
        return { success: true, generated, validation, memoryVersion, patched: patched.outcomes };
    } catch (e: any) {
        emitAutomationProgress('FAILED', 'No pudimos aplicar la automatización', 0, 2, {
            error: e.message,
        });
        runStore?.mark('generation-failed', true);
        return { success: false, error: e.message };
    }
}
