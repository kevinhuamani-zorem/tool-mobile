import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import { readJsonUtf8 } from '../../../../core/shared';
import { AutomationApplier, AutomationHistoryStore, AutomationApplicationReceipt, AutomationScenario, GenerationPlan,
    LayeredGenerationResult, PackagedAutomationScenario, planAgainstApplicationReceipt,
    requireUnchangedAppliedFiles, loadUpdateBaselinesForCorrection } from '../../../../core/automation';
import type { AutomationResponseImporterDependencies } from './responseImport';
import { layeredDraftPreview } from './layeredDraftPreview';
import { FrameworkCompilationValidator, includeFrameworkCompilation } from '../../../../core/validation';

/** Recovery is an export candidate, never a new successful agent response. */
export function prepareRecoveredExport(deps: AutomationResponseImporterDependencies, packageDirectory: string,
    draft: NonNullable<LayeredGenerationResult['draft']>, reviewedContents?: Record<string, string>) {
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
        if (fs.existsSync(receiptFile)) {
            const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
            requireUnchangedAppliedFiles(projectPaths.frameworkRoot, receipt, scenario.recordingId, plan.planId);
            plan = planAgainstApplicationReceipt(plan, receipt);
            correctionBaselines = loadUpdateBaselinesForCorrection(packageDirectory, projectPaths.frameworkRoot, plan);
        }
        for (const [file, content] of Object.entries(reviewedContents || {})) {
            if (typeof content !== 'string' || !draft.files.some(item => path.join(projectPaths.frameworkRoot, item.path) === file)) {
                throw new Error(`Archivo editado fuera del borrador: ${file}`);
            }
        }
        const response = { schemaVersion: 1, recordingId: scenario.recordingId, planId: plan.planId,
            files: draft.files.map(file => ({ layer: file.layer, path: file.path,
                content: reviewedContents?.[path.join(projectPaths.frameworkRoot, file.path)] ?? file.content })), actionTrace: [], resolutions: [] };
        const history = new AutomationHistoryStore(packageDirectory);
        history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
        if (reviewedContents && response.files.some((file, index) => file.content !== draft.files[index].content)) {
            history.capture('recovered-response.json', JSON.stringify(draft), 'recorder', 'draft:before-qa-edit');
            history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId, source: 'qa-edit' }, [
                { name: 'recovered-response.json', content: JSON.stringify(response) },
            ]);
        }
        const prepared = (deps.automationApplier || new AutomationApplier()).prepare(scenario, plan, response,
            deps.automationResponseValidator.toPreview(response), correctionBaselines);
        const recoveredDraft = { ...draft, files: prepared.response.files.map(file => {
            const original = draft.files.find(item => item.layer === file.layer)!;
            return { ...original, ...file, ...(reviewedContents && file.content !== original.content ? { origin: 'qa' as const, pass: undefined } : {}) };
        }) };
        result.preview = { ...layeredDraftPreview(recoveredDraft, projectPaths.frameworkRoot).preview, ...prepared.preview };
        if (reviewedContents) {
            const validation = deps.automationResponseValidator.validate(scenario, plan, prepared.response);
            includeFrameworkCompilation(validation, new FrameworkCompilationValidator().validate(projectPaths.frameworkRoot, prepared.files));
            result.validation = { ...validation, valid: false, errors: [...result.validation.errors, ...validation.errors] };
            history.append({ ...history.identity()!, kind: 'qa-validation-result', origin: 'qa', result: validation.valid ? 'passed' : 'failed' }, [
                { name: 'validation.json', content: JSON.stringify(validation) },
            ]);
        }
        result.exportBlockers = deps.generatedFileRegistry.assess(prepared.preview, scenario.squad, plan.files).conflicts;
        if (!result.exportBlockers.length) {
            result.previewToken = crypto.randomUUID();
            result.exportReady = true;
            deps.state.automationPreview = { token: result.previewToken, scenario, plan, response: prepared.response,
                prepared, correctionBaselines, packageDirectory, generationDiagnostics: draft.diagnostics, recoveredDraft };
        }
    } catch (error: any) { result.exportBlockers.push(error.message); }
    return result;
}
