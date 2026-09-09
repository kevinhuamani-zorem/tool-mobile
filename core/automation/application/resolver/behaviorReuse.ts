import { GenerationRequest, ActionResolution, RecordedStep } from '../../contracts';
import { SquadReuseCatalog, ScreenMethodInfo, BehaviorOperation } from '../../../indexing';
import { matchingStepDefinitions } from '../../../shared';
import { equivalentLocatorAliases, literalStepText, frameworkStepDefinitionsOf } from './stepReuse';

type Row = NonNullable<GenerationRequest['scenarioRows']>[number];

function operationMatches(action: RecordedStep, operation: BehaviorOperation): boolean {
    switch (action.action) {
        case 'CLICK': return operation.kind === 'click';
        case 'SCROLL_DOWN': return operation.kind === 'scroll-down';
        case 'VERIFICAR_EXISTE': return operation.kind === 'exists' || operation.kind === 'visible';
        case 'VERIFICAR_TEXTO': {
            if (operation.kind !== 'text' || action.value !== operation.value) return false;
            // Explicit operators/sources remain contractual; legacy literal checks accept equality.
            const assertion = action.textAssertion;
            return !assertion || (assertion.source === 'element' && assertion.operator === operation.operator);
        }
        case 'ESCRIBIR': return operation.kind === 'write' && action.value === operation.value && !/<[^>]+>/.test(action.value || '');
        default: return false;
    }
}

function bindingsFor(actions: RecordedStep[], method: ScreenMethodInfo, catalog: SquadReuseCatalog, resolutions: ActionResolution[]): Array<{ sequence: number; locatorName?: string }> | undefined {
    const behavior = method.behavior;
    if (!behavior?.complete || behavior.parameters || method.visibility !== 'public' || method.exported === false || actions.length !== behavior.operations.length) return undefined;
    const bindings: Array<{ sequence: number; locatorName?: string }> = [];
    for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        const operation = behavior.operations[index];
        if (!operationMatches(action, operation) || !action.sequence) return undefined;
        if (!operation.locator) { bindings.push({ sequence: action.sequence }); continue; }
        const resolution = resolutions.find(r => r.sequence === action.sequence);
        if (resolution?.resolution !== 'reuse' || !resolution.source || resolution.unspecificSelector) return undefined;
        const recorded = catalog.locators.find(l => l.file === resolution.source!.file && l.name === resolution.locatorName);
        const consumed = catalog.locators.filter(l => l.name === operation.locator && method.locatorFiles.includes(l.file));
        if (!recorded || consumed.length !== 1 || !equivalentLocatorAliases(recorded, consumed[0])) return undefined;
        bindings.push({ sequence: action.sequence, locatorName: consumed[0].name });
    }
    return bindings;
}

/** Covers contiguous recorded actions with proven existing operations; never reorders them. */
export function resolveBehaviorRows(rows: Row[], catalog: SquadReuseCatalog, resolutions: ActionResolution[], targetScreen?: string): Row[] {
    const output: Row[] = [];
    for (let start = 0; start < rows.length;) {
        if (rows[start].status === 'reused' || !rows[start].actions?.length) { output.push(rows[start++]); continue; }
        const candidates: Array<{ end: number; row: Row; bindings: Array<{ sequence: number; locatorName?: string }>; priority: number }> = [];
        for (const method of catalog.screenMethods || []) {
            if (!targetScreen || method.file !== targetScreen || !method.behavior?.complete) continue;
            const actions: RecordedStep[] = [];
            for (let end = start; end < rows.length; end++) {
                const row = rows[end];
                if (row.status === 'reused' || !row.actions?.length || row.dataTable || row.repetitionExecution) break;
                actions.push(...row.actions);
                if (actions.length > method.behavior.operations.length) break;
                const bindings = bindingsFor(actions, method, catalog, resolutions);
                if (!bindings) continue;
                const definitions = catalog.stepDefinitions.filter(definition => {
                    const delegation = definition.delegation;
                    const text = literalStepText(definition.expression);
                    const evidenceText = [...rows.slice(start, end + 1).map(r => r.text), ...actions.map(a => a.value || '')].join(' ');
                    const qualifiers = text?.match(/\d+/g) || [];
                    return text && qualifiers.every(value => new RegExp(`\\b${value}\\b`).test(evidenceText)) && delegation?.method === method.name
                        && definition.screenMethods?.length === 1 && definition.screenMethods[0].file === method.file
                        && (method.behavior!.returnType === 'void' || (method.behavior!.returnType === 'boolean' && delegation.assertsBoolean))
                        && matchingStepDefinitions(text, frameworkStepDefinitionsOf(catalog)).length === 1;
                });
                // Prefer complete Steps; method-only reuse never changes its existing signature.
                const definition = definitions[0];
                if (!definition && (end !== start || !['void', 'boolean'].includes(method.behavior.returnType))) continue;
                candidates.push({ end, bindings, priority: definition ? 2 : 1, row: {
                    ...rows[start], actions: [...actions], text: definition ? literalStepText(definition.expression)! : rows[start].text,
                    status: definition ? 'reused' : 'missing', methodName: method.name,
                    reuse: {
                        kind: definition ? 'step' : 'method', className: method.className, screenFile: method.file, methodName: method.name,
                        signature: method.signature, returnType: method.behavior.returnType as 'void' | 'boolean',
                        sourceHash: method.behavior.sourceHash, dependencies: method.behavior.dependencies, helpers: method.behavior.helpers, stepFile: definition?.file,
                        catalogRevision: catalog.revision, sequences: actions.map(a => a.sequence!),
                        reason: definition ? 'El Step existente cubre las acciones y verificaciones en el mismo orden.'
                            : 'El método existente cubre esta operación; se conserva su firma y no se crea otro método.',
                    },
                } });
            }
        }
        candidates.sort((a, b) => b.priority - a.priority || b.end - a.end);
        const selected = candidates[0];
        if (!selected) { output.push(rows[start++]); continue; }
        for (const binding of selected.bindings) {
            if (!binding.locatorName) continue;
            const resolution = resolutions.find(r => r.sequence === binding.sequence)!;
            resolution.locatorName = binding.locatorName;
            resolution.reason += ` Reutiliza ${selected.row.reuse!.signature} con su clave existente.`;
        }
        selected.row.actions = selected.row.actions!.map(action => ({ ...action,
            variableName: selected.bindings.find(b => b.sequence === action.sequence)?.locatorName || action.variableName,
        }));
        output.push(selected.row);
        start = selected.end + 1;
    }
    return output;
}
