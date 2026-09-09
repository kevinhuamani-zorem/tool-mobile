import { loadFrameworkBaseline, planForReconciliation } from '../../../../core/automation';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import { readJsonUtf8 } from '../../../../core/shared';
import { AutomationApplier, AutomationHistoryStore, AutomationApplicationReceipt, AutomationScenario, GenerationPlan,
    LayeredGenerationResult, PackagedAutomationScenario, planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles, loadUpdateBaselinesForCorrection, recoveredResponseMetadata,
    withRecoveredResponseMetadata, recoverDraftMetadata } from '../../../../core/automation';
import type { AutomationResponseImporterDependencies } from './responseImport';
import { layeredDraftPreview } from './layeredDraftPreview';
import { FrameworkCompilationValidator, includeFrameworkCompilation, refreshAssessmentStatic, AutomationValidation } from '../../../../core/validation';

/** Recovery is an export candidate, never a new successful agent response. */
export function prepareRecoveredExport(deps: AutomationResponseImporterDependencies, packageDirectory: string,
    draft: NonNullable<LayeredGenerationResult['draft']>, reviewedContents?: Record<string, string>) {
    const previousPreview = deps.state.automationPreview;
    deps.state.automationPreview = null;
    const result = { ...layeredDraftPreview(draft, projectPaths.frameworkRoot),
        exportReady: false, previewToken: '', exportBlockers: [] as string[] };
    try {
        const scenario = deps.automationPackageBuilder.requireTrustedScenarioPackage(
            readJsonUtf8<AutomationScenario>(path.resolve(packageDirectory, '../..', 'scenario.json')),
            readJsonUtf8<PackagedAutomationScenario>(path.join(packageDirectory, 'scenario.json')), packageDirectory);
        const effective = path.join(packageDirectory, 'effective-generation-plan.json');
        let plan = readJsonUtf8<GenerationPlan>(fs.existsSync(effective) ? effective : path.join(packageDirectory, 'generation-plan.json'));
        const receiptFile = path.join(packageDirectory, 'application-receipt.json');
        let correctionBaselines = new Map<string, string>();
        const frameworkBaseline = loadFrameworkBaseline(packageDirectory, plan);
        if (fs.existsSync(receiptFile) && !frameworkBaseline) {
            const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
            requireUnchangedAppliedFiles(projectPaths.frameworkRoot, receipt, scenario.recordingId, plan.planId);
            plan = planAgainstApplicationReceipt(plan, receipt);
            correctionBaselines = loadUpdateBaselinesForCorrection(packageDirectory, projectPaths.frameworkRoot, plan);
        }
        plan = planForReconciliation(projectPaths.frameworkRoot, plan, frameworkBaseline);
        if (frameworkBaseline && reviewedContents) {
            if (!previousPreview?.prepared || previousPreview.packageDirectory !== packageDirectory) throw new Error('Reimporta antes de editar la propuesta.');
            (deps.automationApplier || new AutomationApplier()).requireUnchanged(previousPreview.prepared);
        }
        for (const [file, content] of Object.entries(reviewedContents || {})) {
            if (typeof content !== 'string' || !draft.files.some(item => path.join(projectPaths.frameworkRoot, item.path) === file)) {
                throw new Error(`Archivo editado fuera del borrador: ${file}`);
            }
        }
        draft = recoverDraftMetadata(packageDirectory, draft, plan);
        const metadata = recoveredResponseMetadata(draft, plan);
        const response = { schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId,
            actionTrace: [], resolutions: [], ...metadata,
            files: draft.files.map(file => ({ layer: file.layer, path: file.path,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content })) };
        const history = new AutomationHistoryStore(packageDirectory);
        history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
        if (reviewedContents && response.files.some((file, index) => file.content !== draft.files[index].content)) {
            history.capture('recovered-response.json', JSON.stringify(draft), 'recorder', 'draft:before-qa-edit');
            history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId, source: 'qa-edit' }, [
                { name: 'recovered-response.json', content: JSON.stringify(response) },
            ]);
        }
        const prepared = (deps.automationApplier || new AutomationApplier()).prepare(scenario, plan, response,
            deps.automationResponseValidator.toPreview(response), correctionBaselines,
            frameworkBaseline ? { baseline: frameworkBaseline, reviewed: Boolean(reviewedContents) } : undefined);
        const recoveredDraft = withRecoveredResponseMetadata({ ...draft, files: prepared.response.files.map(file => {
            const original = draft.files.find(item => item.layer === file.layer)!;
            return { ...original, ...file, ...(reviewedContents && file.content !== original.content ? { origin: 'qa' as const, pass: undefined } : {}) };
        }) }, prepared.response, plan);
        result.preview = { ...layeredDraftPreview(recoveredDraft, projectPaths.frameworkRoot).preview, ...prepared.preview };
        let validation: AutomationValidation;
        try {
            validation = deps.automationResponseValidator.validate(scenario, plan, prepared.response);
            includeFrameworkCompilation(validation, new FrameworkCompilationValidator().validate(projectPaths.frameworkRoot, prepared.files));
        } catch (error: any) {
            // Quality evaluation cannot disable export of bytes already checked by the write contract.
            validation = { valid: false, qualityScore: 0, warnings: [], errors: [
                { code: 'draft-validation', message: `No se pudo completar la validación del borrador: ${error.message}` },
            ] };
        }
        validation.warnings.push(...(prepared.diagnostics || []).map(item => item.message));
        result.validation = { ...validation, valid: validation.valid && !draft.diagnostics.length,
            errors: [...result.validation.errors, ...validation.errors] };
        refreshAssessmentStatic(result.validation);
        history.capture('prepared-response.json', JSON.stringify(prepared.response), 'recorder', 'draft:prepared');
        history.capture('validation.json', JSON.stringify(result.validation), 'recorder', 'draft:prepared-validation');
        if (reviewedContents) {
            history.append({ ...history.identity()!, kind: 'qa-validation-result', origin: 'qa', result: validation.valid ? 'passed' : 'failed' }, [
                { name: 'validation.json', content: JSON.stringify(validation) },
            ]);
        }
        result.exportBlockers = [...(prepared.conflicts || []), ...deps.generatedFileRegistry.assess(prepared.preview, scenario.squad, plan.files).conflicts];
        if (!result.exportBlockers.length) {
            result.previewToken = crypto.randomUUID();
            result.exportReady = true;
        }
        deps.state.automationPreview = { token: result.previewToken, scenario, plan, response: prepared.response,
            prepared, correctionBaselines, packageDirectory, generationDiagnostics: draft.diagnostics, recoveredDraft };
    } catch (error: any) { result.exportBlockers.push(error.message); }
    return result;
}
