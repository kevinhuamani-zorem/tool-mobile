import { completionTarget } from './locatorInspection';
import fs from 'fs';
import path from 'path';
import type { AutomationAgentResponse, AutomationScenario, GenerationPlan } from '../../../automation/contracts';
import { recordedLocator } from '../../../indexing';
import { frameworkContract, projectPaths } from '../../../workspace';
import { screenClassNameFor } from './screenInspection';
import { screenLocatorTypes, ScreenLocatorBinding } from './screenLocatorTypes';
import type { ResponseRuleContext, RuleReport } from './ruleContext';

interface LocatorFinding {
    sequence: number; file: string; getter: string; platform: string;
    expected: string; actual: string; valueMatches: boolean;
    typeStart: number; typeEnd: number;
}

/** Inspect the getter even if its JSON is unchanged or lives in another module. */
export function auditRecordedLocators(scenario: AutomationScenario, plan: GenerationPlan, response: AutomationAgentResponse) {
    const contract = frameworkContract(projectPaths.frameworkRoot);
    const findings: LocatorFinding[] = [];
    const invalidEvidence: Array<{ sequence: number; reason: string }> = [];
    const unverified: Array<{ sequence: number; file: string; getter: string }> = [];
    let checked = 0;
    const readLocators = (file: string, baseline = false): any => {
        // Only framework locator JSON, confined through real paths; never follow an agent supplied arbitrary path.
        if (!/^resources\/locators\/.+\.locator\.json$/.test(file) || file.split('/').includes('..')) return undefined;
        const proposed = !baseline && response.files.find(item => item.layer === 'locators' && item.path === file);
        try {
            if (proposed) return JSON.parse(proposed.content);
            const root = fs.realpathSync(projectPaths.frameworkRoot);
            const absolute = fs.realpathSync(path.join(root, file));
            if (!absolute.startsWith(root + path.sep)) return undefined;
            return JSON.parse(fs.readFileSync(absolute, 'utf8'));
        } catch { return undefined; }
    };
    let baselineTypes: Map<string, Set<string>> | undefined;
    const baselineType = (binding: ScreenLocatorBinding): string | undefined => {
        if (!baselineTypes) {
            baselineTypes = new Map();
            const walk = (directory: string): void => {
                if (!fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink()) return;
                for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                    if (entry.isSymbolicLink()) continue;
                    const file = path.join(directory, entry.name);
                    if (entry.isDirectory()) walk(file);
                    else if (entry.isFile() && entry.name.endsWith('.screen.ts')) {
                        const content = fs.readFileSync(file, 'utf8');
                        const bindings: ScreenLocatorBinding[] = [];
                        screenLocatorTypes(content, contract, screenClassNameFor(content, file, contract.baseScreenClass), bindings);
                        for (const item of bindings) {
                            const key = `${item.file}#${item.platform}#${item.block}#${item.name}`;
                            const types = baselineTypes!.get(key) || new Set<string>();
                            types.add(item.type); baselineTypes!.set(key, types);
                        }
                    }
                }
            };
            walk(projectPaths.screenobjects);
        }
        const types = baselineTypes.get(`${binding.file}#${binding.platform}#${binding.block}#${binding.name}`);
        return types?.size === 1 ? [...types][0] : undefined;
    };
    const screens = response.files.filter(file => file.layer === 'screen').map(screen => {
        const bindings: ScreenLocatorBinding[] = [];
        const getters = new Set<string>();
        screenLocatorTypes(screen.content, contract, screenClassNameFor(screen.content, screen.path, contract.baseScreenClass), bindings, getters);
        return { ...screen, bindings, getters };
    });
    for (const action of scenario.actions || []) {
        if (!action.selector || action.selectorVerified === false) continue;
        const expected = recordedLocator(action, scenario.platform, contract);
        const sequence = action.sequence || scenario.actions.indexOf(action) + 1;
        if (!expected.ok) { invalidEvidence.push({ sequence, reason: expected.reason || 'Locator inconsistente.' }); continue; }
        const resolution = plan.resolutions.find(item => item.sequence === sequence);
        const trace = response.actionTrace?.find(item => item.sequence === sequence);
        if (!resolution?.locatorName || !trace?.locatorName) continue;
        // An explicit adoption is governed by its offered framework contract, not by the old recording.
        if (trace.locatorName !== resolution.locatorName && resolution.reuseCandidates?.some(item => item.name === trace.locatorName)) continue;
        for (const screen of screens) {
            const bindings = screen.bindings.filter(item => item.getter === trace.locatorName && item.platform === scenario.platform);
            if (screen.getters.has(trace.locatorName) && !bindings.length) unverified.push({ sequence, file: screen.path, getter: trace.locatorName });
            for (const binding of bindings) {
                // Respect the exact target module for a reused locator.
                const expectedSource = resolution.source?.file.replace(/\\/g, '/');
                const correctSource = resolution.resolution !== 'reuse' || !expectedSource || binding.file === expectedSource;
                let value = readLocators(binding.file)?.[binding.block]?.[binding.name];
                const completion = response.completions?.find(item => item.sequence === sequence);
                const target = completion && completionTarget(plan, completion);
                if (value === '' && target && target.file === binding.file && target.block === binding.block && target.name === binding.name) value = expected.value;
                // An authorized reuse may replace a weak recorded selector. Verify against the unchanged
                // framework value and its uniquely bound getter type, never against the proposed enum.
                let expectedType: string = expected.type;
                let expectedValue = expected.value;
                if (resolution.resolution === 'reuse' && correctSource && value !== expected.value) {
                    const originalValue = readLocators(binding.file, true)?.[binding.block]?.[binding.name];
                    if (typeof value === 'string' && value && value === originalValue) {
                        const native = recordedLocator({ selector: value }, scenario.platform, contract);
                        const declared = native.ok && native.value === value ? native : recordedLocator({ selector: value, locatorType: baselineType(binding), locatorValue: value }, scenario.platform, contract);
                        if (!declared.ok) { unverified.push({ sequence, file: screen.path, getter: binding.getter }); continue; }
                        expectedType = declared.type; expectedValue = value;
                    }
                }
                checked++;
                if (!correctSource || value !== expectedValue || binding.type !== expectedType) findings.push({ sequence, file: screen.path,
                    getter: binding.getter, platform: binding.platform, expected: expectedType, actual: binding.type,
                    valueMatches: correctSource && value === expectedValue, typeStart: binding.typeStart, typeEnd: binding.typeEnd });
            }
        }
    }
    return { schemaVersion: 1 as const, recordingId: scenario.recordingId, planId: plan.planId, framework: { platformOrder: contract.locatorSignature.platformOrder, composition: contract.locatorComposition },
        checked, matched: checked - findings.length, findings, invalidEvidence, unverified };
}

export function recordedLocatorRules({ scenario, plan, response }: ResponseRuleContext, report: RuleReport): void {
    const audit = auditRecordedLocators(scenario, plan, response);
    for (const entry of audit.invalidEvidence) report.errors.push({ code: 'recorded-locator-conflict',
        message: `Acción ${entry.sequence}: ${entry.reason} Verifica la evidencia original; no cambies la estrategia por inferencia.` });
    for (const entry of audit.unverified) report.errors.push({ code: 'locator-type-unverified', file: entry.file,
        message: `Acción ${entry.sequence}, getter ${entry.getter}: no se pudo verificar el TypeLocator y su referencia. Usa el contrato explícito de getElement.` });
    for (const entry of audit.findings) report.errors.push({ code: 'locator-type-mismatch', file: entry.file,
        message: `Acción ${entry.sequence}, getter ${entry.getter} (${entry.platform}): se esperaba TypeLocator.${entry.expected} y se recibió TypeLocator.${entry.actual}.`
            + (entry.valueMatches ? ' Conserva el valor del locator y corrige el tipo del getter.' : ' El valor del JSON tampoco coincide con el grabado.') });
}

/** Mechanical repair of an unambiguous enum only. Call before QA review, never over reviewed/imported framework edits. */
export function reconcileRecordedLocatorTypes(scenario: AutomationScenario, plan: GenerationPlan, response: AutomationAgentResponse) {
    const audit = auditRecordedLocators(scenario, plan, response);
    const requested = audit.findings.filter(finding => finding.valueMatches && finding.actual !== finding.expected);
    const corrections: LocatorFinding[] = [];
    const files = response.files.map(file => {
        const proposed = requested.filter(item => item.file === file.path);
        const byPosition = new Map<number, typeof proposed>();
        for (const item of proposed) byPosition.set(item.typeStart, [...(byPosition.get(item.typeStart) || []), item]);
        let content = file.content;
        for (const entries of [...byPosition.values()].sort((a, b) => b[0].typeStart - a[0].typeStart)) {
            if (new Set(entries.map(item => item.expected)).size !== 1) continue;
            const edit = entries[0];
            corrections.push(...entries);
            content = content.slice(0, edit.typeStart) + edit.expected + content.slice(edit.typeEnd);
        }
        return content === file.content ? file : { ...file, content };
    });
    return { response: { ...response, files }, audit, corrections,
        changed: files.some((file, index) => file.content !== response.files[index].content) };
}
