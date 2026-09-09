import { loadFrameworkBaseline } from '../../../../core/automation';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { projectPaths } from '../../../../core/workspace';
import {
    GeneratedFileRegistry,
    AutomationMemory,
    AutomationApplier,
    AutomationAgentResponse,
    AgentRunStore,
    AutomationHistoryStore,
    AutomationApplicationReceipt,
    createAutomationApplicationReceipt,
    requireUnchangedAppliedFiles,
} from '../../../../core/automation';
import { AutomationResponseValidator, FrameworkCompilationValidator, includeFrameworkCompilation } from '../../../../core/validation';
import { readJsonUtf8, writeJsonUtf8 } from '../../../../core/shared';
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
 * `AutomationApplier` de core y deja el recibo; aplicar no enseña a los agentes.
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
        emitProgress: emitAutomationProgress,
    } = deps;
    let runStore: AgentRunStore | undefined;
    let history: AutomationHistoryStore | undefined;
    try {
        if (!previewToken || !state.automationPreview || state.automationPreview.token !== previewToken) {
            throw new Error('La propuesta cambió. Importa y revisa nuevamente.');
        }
        emitAutomationProgress('APPLYING', 'Aplicando automatización', 1, 2);
        const { scenario, plan, generationDiagnostics = [], packageDirectory } = state.automationPreview;
        if (packageDirectory && packageDirectory !== state.activeAutomationPackage) throw new Error('El paquete cambió después del preview.');
        if (reviewedContents !== undefined && (!reviewedContents || typeof reviewedContents !== 'object' || Array.isArray(reviewedContents)
            || Object.values(reviewedContents).some(content => typeof content !== 'string'))) throw new Error('Contenidos revisados inválidos.');
        const originalPrepared = state.automationPreview.prepared;
        if (!originalPrepared) throw new Error('Reimporta la propuesta para preparar el resultado final antes de aplicar.');
        automationApplier.requireUnchanged(originalPrepared);
        const allowed = new Set(originalPrepared.files.map(file => path.join(projectPaths.frameworkRoot, file.path)));
        for (const file of Object.keys(reviewedContents || {})) {
            if (!allowed.has(file)) throw new Error(`El editor intentó modificar un archivo fuera del preview: ${file}`);
        }
        runStore = new AgentRunStore(state.activeAutomationPackage);
        history = new AutomationHistoryStore(state.activeAutomationPackage);
        history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
        history.capture('preview-response.json', JSON.stringify(state.automationPreview.response), 'recorder', 'apply:before-qa-edit');
        let response: AutomationAgentResponse = {
            ...state.automationPreview.response,
            files: state.automationPreview.response.files.map(file => ({
                ...file,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content,
            })),
        };
        if (response.files.some((file, index) => file.content !== state.automationPreview!.response.files[index].content)) {
            history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId, source: 'qa-edit' }, [
                { name: 'agent-response.json', content: JSON.stringify(response, null, 2) + '\n' },
            ]);
        }
        const frameworkBaseline = loadFrameworkBaseline(state.activeAutomationPackage, plan);
        const edited = response.files.some((file, index) => file.content !== originalPrepared.response.files[index].content);
        const prepared = edited ? automationApplier.prepare(scenario, plan, response,
            automationResponseValidator.toPreview(response), state.automationPreview.correctionBaselines,
            frameworkBaseline ? { baseline: frameworkBaseline, reviewed: true } : undefined) : originalPrepared;
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
        validation.warnings.push(...(prepared.diagnostics || []).map(item => item.message));
        const compilation = new FrameworkCompilationValidator().validate(projectPaths.frameworkRoot, prepared.files);
        includeFrameworkCompilation(validation, compilation);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'framework-compilation.json'), compilation);
        writeJsonUtf8(path.join(state.activeAutomationPackage, 'validation.json'), validation);
        runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validatorStarted) / 1_000_000);
        runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        const preview = automationResponseValidator.toPreview(response);
        // La evaluacion del registro va antes de restaurar baselines de
        // correccion: un archivo ajeno se detecta sin tocar nada.
        const managed = generatedFileRegistry.assess(preview, scenario.squad, plan.files);
        if (managed.conflicts.length) {
            throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        }
        const receiptFile = path.join(state.activeAutomationPackage, 'application-receipt.json');
        if (fs.existsSync(receiptFile) && !frameworkBaseline) {
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
        const metadataFiles = ['agent-response.json', 'validation.json', 'application-receipt.json', 'status.json', 'agent-run.json']
            .map(file => path.join(state.activeAutomationPackage, file));
        let exportStatus: string | undefined;
        const { generated, patched } = automationApplier.commit(prepared, scenario, plan, () => {
        fs.writeFileSync(metadataFiles[0], JSON.stringify(response, null, 2) + '\n', 'utf8');
        writeJsonUtf8(metadataFiles[1], validation);
        const applicationReceipt = createAutomationApplicationReceipt(
            projectPaths.frameworkRoot,
            scenario,
            plan,
            response,
            history!.identity(),
            { prepared, validation, generationDiagnostics },
        );
        exportStatus = applicationReceipt.exportStatus;
        writeJsonUtf8(
            path.join(state.activeAutomationPackage, 'application-receipt.json'),
            applicationReceipt,
        );
        const statusFile = path.join(state.activeAutomationPackage, 'status.json');
        let status: Record<string, any> = {};
        try { status = readJsonUtf8<Record<string, any>>(statusFile); } catch { status = {}; }
        delete status.memoryVersion;
        writeJsonUtf8(statusFile, {
            ...status,
            recordingId: scenario.recordingId,
            planId: plan.planId,
            state: exportStatus,
            exportStatus,
            generatedAt: new Date().toISOString(),
            lastMaterializedAgentResponseHash: sha256(fs.readFileSync(metadataFiles[0], 'utf8')),
        });
        runStore!.recordExport(exportStatus!);
        // Last fallible operation: an export event is committed only after all files/metadata.
        history!.append({ ...history!.identity()!, kind: 'export-result', origin: 'qa', result: exportStatus, stage: 'apply' }, [
            { name: 'application-receipt.json', content: JSON.stringify(applicationReceipt, null, 2) + '\n' },
            { name: 'exported-files.json', content: JSON.stringify(prepared.files, null, 2) + '\n' },
            { name: 'agent-response.json', content: JSON.stringify(response, null, 2) + '\n' },
            { name: 'validation.json', content: JSON.stringify(validation, null, 2) + '\n' },
        ]);
        }, metadataFiles);
        state.automationPreview = null;
        emitAutomationProgress('COMPLETED', 'Archivos exportados; verificación QA pendiente', 2, 2);
        return { success: true, generated, validation, exportStatus, generationDiagnostics,
            missingLayers: plan.files.filter(file => !response.files.some(item => item.layer === file.layer)).map(file => file.layer), patched: patched.outcomes };
    } catch (e: any) {
        emitAutomationProgress('FAILED', 'No pudimos aplicar la automatización', 0, 2, {
            error: e.message,
        });
        try {
            const identity = history?.identity();
            if (identity) history!.append({ ...identity, kind: 'export-result', origin: 'qa', result: 'failed', stage: 'apply' });
            runStore?.recordExport('failed');
        } catch { /* Keep the original application error when recording it also fails. */ }
        return { success: false, error: e.message };
    }
}
