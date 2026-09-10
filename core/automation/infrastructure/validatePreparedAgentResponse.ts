import fs from 'fs';
import path from 'path';
import type { AutomationAgentResponse, AutomationScenario, GenerationPlan, AutomationValidation } from '../contracts';
import { AutomationResponseValidator } from '../../validation';
import { readJsonUtf8 } from '../../shared';
import { projectPaths } from '../../workspace';
import { AutomationApplier } from './automationApplier';
import { AutomationHistoryStore } from './automationHistoryStore';
import { loadFrameworkBaseline, planForReconciliation } from './automationReconciliation';
import { loadUpdateBaselinesForCorrection } from './automationCorrectionBaseline';
import { planAgainstApplicationReceipt, requireUnchangedAppliedFiles, type AutomationApplicationReceipt } from './automationApplicationReceipt';
import { mergeCoverageRepairTargets } from './layered/gapJudgment';
import type { LayeredResponseValidator } from './layered/roles';

/** Same read-only preparation as import, while the automatic repair pass is still available. */
export function validatePreparedAgentResponse(
    packageDirectory: string,
    response: AutomationAgentResponse,
    validator: Pick<AutomationResponseValidator, 'validate' | 'toPreview'> = new AutomationResponseValidator(),
    applier: Pick<AutomationApplier, 'prepare'> = new AutomationApplier(),
    pass?: 1 | 2,
): ReturnType<LayeredResponseValidator> {
    const scenario = readJsonUtf8<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
    const effectivePlan = path.join(packageDirectory, 'effective-generation-plan.json');
    let plan = readJsonUtf8<GenerationPlan>(fs.existsSync(effectivePlan) ? effectivePlan : path.join(packageDirectory, 'generation-plan.json'));
    const errors: AutomationValidation['errors'] = [];
    let qualityScore = 0;
    const history = new AutomationHistoryStore(packageDirectory);
    try {
        const frameworkBaseline = loadFrameworkBaseline(packageDirectory, plan);
        const receiptFile = path.join(packageDirectory, 'application-receipt.json');
        let correctionBaselines = new Map<string, string>();
        if (fs.existsSync(receiptFile) && !frameworkBaseline) {
            const receipt = readJsonUtf8<AutomationApplicationReceipt>(receiptFile);
            requireUnchangedAppliedFiles(projectPaths.frameworkRoot, receipt, scenario.recordingId, plan.planId);
            plan = planAgainstApplicationReceipt(plan, receipt);
            correctionBaselines = loadUpdateBaselinesForCorrection(packageDirectory, projectPaths.frameworkRoot, plan);
        }
        plan = planForReconciliation(projectPaths.frameworkRoot, plan, frameworkBaseline);
        const original = validator.validate(scenario, plan, response);
        if (!original.valid) errors.push(...original.errors);
        qualityScore = original.qualityScore;
        const prepared = applier.prepare(scenario, plan, response, validator.toPreview(response), correctionBaselines,
            frameworkBaseline ? { baseline: frameworkBaseline } : undefined);
        history.capture('prepared-agent-response.json', JSON.stringify(prepared.response), 'recorder', 'integration:prepared', pass);
        const changed = JSON.stringify(prepared.response) !== JSON.stringify(response);
        const validation = changed || frameworkBaseline ? validator.validate(scenario, plan, prepared.response) : original;
        if (!validation.valid) errors.push(...validation.errors);
        qualityScore = Math.min(qualityScore, validation.qualityScore);
        // Discarded edits remain reviewable and exportable, but cannot count as a completed automatic repair.
        errors.push(...(prepared.diagnostics || []).map(issue => ({ code: issue.code, file: issue.file, message: issue.message })));
        for (const conflict of prepared.conflicts || []) errors.push({ code: 'framework-conflict', file: conflict,
            message: `La propuesta tiene un conflicto con el framework en ${conflict}. Revisa los archivos preparados.` });
        history.capture('prepared-agent-validation.json', JSON.stringify({ validation, preparationDiagnostics: prepared.diagnostics || [], conflicts: prepared.conflicts || [] }),
            'recorder', 'integration:prepared-validation', pass);
    } catch (error: any) {
        errors.push({ code: 'preparation', message: `No se pudo preparar la exportación: ${error?.message || error}` });
    }
    const grouped = new Map<string, AutomationValidation['errors'][number]>();
    for (const issue of errors) {
        const key = JSON.stringify([issue.code, issue.file, issue.message]);
        const previous = grouped.get(key);
        const coverageRepairTargets = previous && mergeCoverageRepairTargets(previous.coverageRepairTargets, issue.coverageRepairTargets);
        grouped.set(key, previous ? { ...previous, ...(coverageRepairTargets ? { coverageRepairTargets } : {}) } : issue);
    }
    const unique = [...grouped.values()];
    return { valid: unique.length === 0, qualityScore, errors: unique };
}
