import { GenerationRequest, ActionResolution, RecordedStep } from '../../contracts';
import { SquadReuseCatalog, ScreenMethodInfo, BehaviorOperation, StepDefinitionInfo } from '../../../indexing';
import { expandExampleRow, matchingStepDefinitions } from '../../../shared';
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

interface MethodBindings {
    actions: Array<{ sequence: number; locatorName?: string }>;
    values: string[];
}

function bindingsFor(actions: RecordedStep[], method: ScreenMethodInfo, catalog: SquadReuseCatalog, resolutions: ActionResolution[]): MethodBindings | undefined {
    const behavior = method.behavior;
    if (!behavior?.complete || method.visibility !== 'public' || method.exported === false || actions.length !== behavior.operations.length) return undefined;
    const bindings: MethodBindings['actions'] = [];
    const values: string[] = [];
    for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        const operation = behavior.operations[index];
        const parameter = operation.valueParameter;
        if (parameter !== undefined) {
            if (!Number.isInteger(parameter) || parameter < 0 || parameter >= behavior.parameters || typeof action.value !== 'string'
                || !['write', 'text'].includes(operation.kind) || (values[parameter] !== undefined && values[parameter] !== action.value)) return undefined;
            values[parameter] = action.value;
        }
        const checked = parameter === undefined ? operation : { ...operation, value: values[parameter] };
        // An explicit placeholder remains a binding, never a literal method implementation.
        const matched = parameter !== undefined && action.action === 'ESCRIBIR'
            ? checked.kind === 'write' : operationMatches(action, checked);
        if (!matched || !action.sequence) return undefined;
        if (!operation.locator) { bindings.push({ sequence: action.sequence }); continue; }
        const resolution = resolutions.find(r => r.sequence === action.sequence);
        if (resolution?.resolution !== 'reuse' || !resolution.source || resolution.unspecificSelector) return undefined;
        const recorded = catalog.locators.find(l => l.file === resolution.source!.file && l.name === resolution.locatorName);
        const consumed = catalog.locators.filter(l => l.name === operation.locator && method.locatorFiles.includes(l.file));
        if (!recorded || consumed.length !== 1 || !equivalentLocatorAliases(recorded, consumed[0])) return undefined;
        bindings.push({ sequence: action.sequence, locatorName: consumed[0].name });
    }
    if (Array.from({ length: behavior.parameters }, (_, index) => index).some(index => values[index] === undefined)) return undefined;
    return { actions: bindings, values };
}

/** Decode only the anchored literal/capture shape emitted by the Recorder. */
function captureParts(expression: string): string[] | undefined {
    if (!expression.startsWith('^') || !expression.endsWith('$')) return undefined;
    const source = expression.slice(1, -1);
    const parts = [''];
    for (let index = 0; index < source.length; index++) {
        const capture = source.slice(index).match(/^\(\.[*+]\)/)?.[0];
        if (capture) { parts.push(''); index += capture.length - 1; continue; }
        const character = source[index];
        if (character === '\\') {
            const escaped = source[++index];
            if (!escaped || !'.*+?^${}()|[]\\/'.includes(escaped)) return undefined;
            parts[parts.length - 1] += escaped;
        } else {
            if ('.*+?^${}()|[]'.includes(character)) return undefined;
            parts[parts.length - 1] += character;
        }
    }
    return parts;
}

function parameterizedStepText(definition: StepDefinitionInfo, values: string[], rows: Row[], examples: Record<string, string>): string | undefined {
    const forward = definition.delegation?.parameterBindings;
    const parts = captureParts(definition.expression);
    if (!forward || !parts || parts.length !== values.length + 1 || forward.length !== values.length
        || new Set(forward).size !== values.length || forward.some(index => !Number.isInteger(index) || index < 0 || index >= values.length)) return undefined;
    const referenced = new Set(rows.flatMap(row => [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])));
    const captures: string[] = [];
    for (let index = 0; index < values.length; index++) {
        let value = values[index];
        const placeholder = value.match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/);
        if (placeholder) {
            if (!Object.prototype.hasOwnProperty.call(examples, placeholder[1])) return undefined;
        } else {
            const columns = [...referenced].filter(column => examples[column] === value);
            if (columns.length > 1) return undefined;
            if (columns.length === 1) value = `<${columns[0]}>`;
            else if (/[<>\r\n|]/.test(value)) return undefined;
        }
        captures[forward[index]] = value;
    }
    const text = parts.map((part, index) => part + (captures[index] ?? '')).join('');
    const expanded = expandExampleRow(text, examples);
    const match = new RegExp(definition.expression).exec(expanded);
    // Greedy captures may swallow delimiters inside data: verify the exact binding Cucumber would pass.
    if (!match || captures.some((value, index) => match[index + 1] !== expandExampleRow(value, examples))) return undefined;
    return text;
}

/** Covers contiguous recorded actions with proven existing operations; never reorders them. */
export function resolveBehaviorRows(rows: Row[], catalog: SquadReuseCatalog, resolutions: ActionResolution[], targetScreen?: string, examples: Record<string, string> = {}): Row[] {
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
                    const text = method.behavior!.parameters
                        ? parameterizedStepText(definition, bindings.values, rows.slice(start, end + 1), examples)
                        : literalStepText(definition.expression);
                    const evidenceText = [...rows.slice(start, end + 1).map(r => r.text), ...actions.map(a => a.value || '')].join(' ');
                    const qualifiers = (method.behavior!.parameters ? captureParts(definition.expression)?.join(' ') : text)?.match(/\d+/g) || [];
                    return text && qualifiers.every(value => new RegExp(`\\b${value}\\b`).test(evidenceText)) && delegation?.method === method.name
                        && definition.screenMethods?.length === 1 && definition.screenMethods[0].file === method.file
                        && (method.behavior!.returnType === 'void' || (method.behavior!.returnType === 'boolean' && delegation.assertsBoolean))
                        && matchingStepDefinitions(expandExampleRow(text, examples), frameworkStepDefinitionsOf(catalog)).length === 1;
                });
                // Prefer complete Steps; method-only reuse never changes its existing signature.
                const definition = definitions[0];
                if (!definition && (method.behavior.parameters || end !== start || !['void', 'boolean'].includes(method.behavior.returnType))) continue;
                candidates.push({ end, bindings: bindings.actions, priority: definition ? 2 : 1, row: {
                    ...rows[start], actions: [...actions], text: definition ? (method.behavior.parameters
                        ? parameterizedStepText(definition, bindings.values, rows.slice(start, end + 1), examples)!
                        : literalStepText(definition.expression)!) : rows[start].text,
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
